import type { Feature, FeatureCollection } from "geojson";
import { generateId } from "../../importUtils";
import { processPhoto } from "./photoPipeline";
import type { UserPhotoStore } from "./photoStore";
import {
  MAX_PHOTOS_PER_FEATURE,
  MAX_PHOTOS_PER_LAYER,
  PHOTOS_PROPERTY,
  readKmzPhotoDescriptors,
  type FeaturePhotoDescriptor,
} from "./types";

/**
 * Import-side of the KMZ interchange profile: resolve each descriptor's
 * href against the archive (case-insensitively), run the bytes through the
 * standard pipeline (caps enforced, thumbnails regenerated, EXIF stripped
 * again by construction), RE-MINT the ids, rewrite `nsmts:photos` to the
 * internal form, and strip exactly the viewer-facing `<img>` tags whose
 * src points into the photo directory. Missing archive entries and failed
 * decodes drop that descriptor — distinct counts, never silent. capturedAt
 * comes from the descriptor, never re-invented.
 */

const PHOTO_IMG_TAG = /<img[^>]*src="files\/[^"]*"[^>]*\/?>(?:<\/img>)?/gi;

export type KmzRelinkResult = {
  collection: FeatureCollection;
  linked: number;
  missingFromArchive: number;
  undecodable: number;
  /** Left out because a contract cap was reached — a limit, not a failure. */
  capped: number;
};

export async function relinkKmzPhotos(input: {
  layerId: string;
  collection: FeatureCollection;
  assets: ReadonlyMap<string, Uint8Array>;
  store: UserPhotoStore;
  process?: typeof processPhoto;
}): Promise<KmzRelinkResult> {
  const process = input.process ?? processPhoto;
  let linked = 0;
  let missingFromArchive = 0;
  let undecodable = 0;
  let capped = 0;
  const features: Feature[] = [];

  for (const feature of input.collection.features) {
    const descriptors = readKmzPhotoDescriptors(feature.properties);
    if (descriptors.length === 0) {
      features.push(feature);
      continue;
    }
    const internal: FeaturePhotoDescriptor[] = [];
    for (const descriptor of descriptors) {
      if (
        internal.length >= MAX_PHOTOS_PER_FEATURE ||
        linked >= MAX_PHOTOS_PER_LAYER
      ) {
        capped += 1;
        continue;
      }
      const href = (descriptor.href ?? `files/${descriptor.id}.jpg`).toLowerCase();
      const bytes = input.assets.get(href);
      if (!bytes) {
        missingFromArchive += 1;
        continue;
      }
      const sourceName =
        descriptor.sourceName ?? href.slice(href.lastIndexOf("/") + 1);
      try {
        const file = new File([bytes as BlobPart], sourceName, {
          type: "image/jpeg",
        });
        const processed = await process(file);
        const record = {
          id: generateId(),
          layerId: input.layerId,
          addedAt: new Date().toISOString(),
          ...(descriptor.capturedAt ? { capturedAt: descriptor.capturedAt } : {}),
          sourceName,
          width: processed.width,
          height: processed.height,
          fullBytes: processed.full.size,
          thumbBytes: processed.thumb.size,
        };
        await input.store.savePhoto(record, processed.full, processed.thumb);
        internal.push({
          id: record.id,
          ...(record.capturedAt ? { capturedAt: record.capturedAt } : {}),
          sourceName,
          width: record.width,
          height: record.height,
        });
        linked += 1;
      } catch {
        undecodable += 1;
      }
    }
    const properties = { ...(feature.properties ?? {}) } as Record<
      string,
      unknown
    >;
    if (internal.length > 0) {
      properties[PHOTOS_PROPERTY] = internal;
    } else {
      delete properties[PHOTOS_PROPERTY];
    }
    if (typeof properties.description === "string") {
      const stripped = properties.description.replace(PHOTO_IMG_TAG, "").trimEnd();
      if (stripped.length > 0) {
        properties.description = stripped;
      } else {
        delete properties.description;
      }
    }
    features.push({ ...feature, properties });
  }

  return {
    collection: { type: "FeatureCollection", features },
    linked,
    missingFromArchive,
    undecodable,
    capped,
  };
}

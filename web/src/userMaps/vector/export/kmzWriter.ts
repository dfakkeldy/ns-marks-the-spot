import { strToU8, zipSync } from "fflate";
import type { FeatureCollection } from "geojson";
import { FIELD_CAPTURE_SPEC } from "../../../location/captureSpec";
import { readPhotoDescriptors } from "../photos/types";
import { kmlDocumentString } from "./kmlWriter";

/**
 * KMZ per the field-capture interchange profile: `doc.kml`
 * (DEFLATE-compressed) plus one STORED `files/<photoId>.jpg` per attached
 * photo — JPEG is already compressed, so deflating it again would spend CPU
 * to grow the file. Descriptors whose blob cannot be read are dropped from
 * the written document entirely (no Data entry, no img tag): a KMZ must
 * never dangle a photo reference, and the caller reports the count left out.
 */

export type KmzExportResult = {
  blob: Blob;
  photosEmbedded: number;
  photosMissing: number;
};

export function buildKmzBlob(
  layerName: string,
  collection: FeatureCollection,
  photoBytes: ReadonlyMap<string, Uint8Array>,
): KmzExportResult {
  let photosMissing = 0;
  const writable: FeatureCollection = {
    type: "FeatureCollection",
    features: collection.features.map((feature) => {
      const descriptors = readPhotoDescriptors(feature.properties);
      if (descriptors.length === 0) {
        return feature;
      }
      const present = descriptors.filter(({ id }) => photoBytes.has(id));
      photosMissing += descriptors.length - present.length;
      if (present.length === descriptors.length) {
        return feature;
      }
      const properties = { ...(feature.properties ?? {}) } as Record<
        string,
        unknown
      >;
      if (present.length === 0) {
        delete properties["nsmts:photos"];
      } else {
        properties["nsmts:photos"] = present;
      }
      return { ...feature, properties };
    }),
  };

  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    [FIELD_CAPTURE_SPEC.kmz.docEntry]: [
      strToU8(kmlDocumentString(layerName, writable, "kmz")),
      { level: 6 },
    ],
  };
  for (const feature of writable.features) {
    for (const descriptor of readPhotoDescriptors(feature.properties)) {
      const bytes = photoBytes.get(descriptor.id);
      if (bytes) {
        entries[`${FIELD_CAPTURE_SPEC.kmz.photoDir}${descriptor.id}.jpg`] = [
          bytes,
          { level: 0 },
        ];
      }
    }
  }
  const photosEmbedded = Object.keys(entries).length - 1;

  return {
    blob: new Blob([zipSync(entries) as BlobPart], {
      type: "application/vnd.google-earth.kmz",
    }),
    photosEmbedded,
    photosMissing,
  };
}

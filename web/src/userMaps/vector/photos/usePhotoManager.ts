import { useCallback, useEffect, useRef } from "react";
import { requestDurableStorage } from "../../../services/durableStorage";
import { UserMapImportError } from "../../errors";
import { generateId } from "../../importUtils";
import { readPhotoExif } from "./exif";
import { processPhoto } from "./photoPipeline";
import {
  releasePhotoId,
  reservePhotoId,
  UserPhotoStore,
} from "./photoStore";
import {
  MAX_PHOTOS_PER_FEATURE,
  MAX_PHOTOS_PER_LAYER,
  type FeaturePhotoDescriptor,
} from "./types";

export type PhotoAttachOutcome =
  | {
      fileName: string;
      ok: true;
      descriptor: FeaturePhotoDescriptor;
      /**
       * The EXIF geotag, surfaced ONCE at attach time for the "use photo's
       * location" offer. It is never persisted — re-encoding strips EXIF
       * from the stored bytes, so this is the only moment it exists.
       */
      gps: { lon: number; lat: number } | null;
    }
  | { fileName: string; ok: false; message: string };

export type PhotoManagerApi = {
  attachPhotos: (
    layerId: string,
    existingOnFeature: number,
    files: ArrayLike<File>,
  ) => Promise<PhotoAttachOutcome[]>;
  removePhoto: (photoId: string) => Promise<void>;
  /** Object URL from the bounded cache; null when the blob is missing. */
  loadThumbUrl: (photoId: string) => Promise<string | null>;
  loadFullBlob: (photoId: string) => Promise<Blob | null>;
};

const THUMB_URL_CACHE_MAX = 64;

/**
 * App-level owner of the photo store handle and a bounded object-URL cache
 * for thumbnails (revoked on eviction and unmount — object URLs pin their
 * blobs in memory for the page's life otherwise). Closure-injection seams
 * mirror the other stores' test approach.
 */
export function usePhotoManager(
  options: {
    openStore?: () => Promise<UserPhotoStore>;
    process?: typeof processPhoto;
    readExif?: typeof readPhotoExif;
  } = {},
): PhotoManagerApi {
  const openStoreRef = useRef(options.openStore ?? (() => UserPhotoStore.open()));
  const processRef = useRef(options.process ?? processPhoto);
  const exifRef = useRef(options.readExif ?? readPhotoExif);
  const storeRef = useRef<Promise<UserPhotoStore> | null>(null);
  const thumbUrlsRef = useRef(new Map<string, string>());

  const store = useCallback((): Promise<UserPhotoStore> => {
    if (!storeRef.current) {
      const opening = openStoreRef.current();
      // Never cache a rejected open, or one transient IndexedDB failure
      // disables photos for the whole session.
      opening.catch(() => {
        if (storeRef.current === opening) {
          storeRef.current = null;
        }
      });
      storeRef.current = opening;
    }
    return storeRef.current;
  }, []);

  useEffect(() => {
    const urls = thumbUrlsRef.current;
    return () => {
      for (const url of urls.values()) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  const attachPhotos = useCallback(
    async (
      layerId: string,
      existingOnFeature: number,
      files: ArrayLike<File>,
    ): Promise<PhotoAttachOutcome[]> => {
      const outcomes: PhotoAttachOutcome[] = [];
      let onFeature = existingOnFeature;
      let onLayer: number | null = null;
      for (const file of Array.from(files)) {
        try {
          if (onFeature >= MAX_PHOTOS_PER_FEATURE) {
            throw new UserMapImportError(
              "too-large",
              `A feature holds at most ${MAX_PHOTOS_PER_FEATURE} photos.`,
            );
          }
          const opened = await store();
          onLayer ??= (await opened.listLayerPhotos(layerId)).length;
          if (onLayer >= MAX_PHOTOS_PER_LAYER) {
            throw new UserMapImportError(
              "too-large",
              `A layer holds at most ${MAX_PHOTOS_PER_LAYER} photos.`,
            );
          }
          // EXIF first: the pipeline's re-encode destroys it.
          const exif = await exifRef.current(file);
          const processed = await processRef.current(file);
          const record = {
            id: generateId(),
            layerId,
            addedAt: new Date().toISOString(),
            ...(exif.capturedAt ? { capturedAt: exif.capturedAt } : {}),
            ...(file.name ? { sourceName: file.name } : {}),
            width: processed.width,
            height: processed.height,
            fullBytes: processed.full.size,
            thumbBytes: processed.thumb.size,
          };
          // Reserved before it is written: the row lands ahead of the
          // feature that will reference it, and a debounced layer write of an
          // older working copy meanwhile would sweep it as an orphan. The
          // sweep lets the reservation go once a write references the id.
          reservePhotoId(record.id);
          try {
            await opened.savePhoto(record, processed.full, processed.thumb);
          } catch (error) {
            // Nothing was stored, so nothing will ever reference it.
            releasePhotoId(record.id);
            throw error;
          }
          requestDurableStorage();
          onFeature += 1;
          onLayer += 1;
          const descriptor: FeaturePhotoDescriptor = {
            id: record.id,
            ...(record.capturedAt ? { capturedAt: record.capturedAt } : {}),
            ...(record.sourceName ? { sourceName: record.sourceName } : {}),
            width: record.width,
            height: record.height,
          };
          outcomes.push({ fileName: file.name, ok: true, descriptor, gps: exif.gps });
        } catch (error) {
          // Unlike layer saves, a failed photo has nowhere to live but the
          // store — the outcome says it was NOT added, distinctly per cause.
          outcomes.push({
            fileName: file.name,
            ok: false,
            message:
              error instanceof UserMapImportError
                ? error.userMessage
                : "Something went wrong reading this photo. It wasn't added.",
          });
        }
      }
      return outcomes;
    },
    [store],
  );

  const removePhoto = useCallback(
    async (photoId: string) => {
      const cached = thumbUrlsRef.current.get(photoId);
      if (cached) {
        URL.revokeObjectURL(cached);
        thumbUrlsRef.current.delete(photoId);
      }
      try {
        await (await store()).deletePhoto(photoId);
      } catch {
        // The descriptor removal is the user-visible truth; a failed blob
        // delete is a small leak the next sweep retries.
      }
    },
    [store],
  );

  const loadThumbUrl = useCallback(
    async (photoId: string): Promise<string | null> => {
      const cache = thumbUrlsRef.current;
      const cached = cache.get(photoId);
      if (cached) {
        // Touch: Map insertion order is the eviction order.
        cache.delete(photoId);
        cache.set(photoId, cached);
        return cached;
      }
      let blob: Blob | null = null;
      try {
        blob = await (await store()).getThumbBlob(photoId);
      } catch {
        blob = null;
      }
      if (!blob) {
        return null;
      }
      const url = URL.createObjectURL(blob);
      cache.set(photoId, url);
      while (cache.size > THUMB_URL_CACHE_MAX) {
        const oldest = cache.keys().next().value as string;
        URL.revokeObjectURL(cache.get(oldest)!);
        cache.delete(oldest);
      }
      return url;
    },
    [store],
  );

  const loadFullBlob = useCallback(
    async (photoId: string): Promise<Blob | null> => {
      try {
        return await (await store()).getFullBlob(photoId);
      } catch {
        return null;
      }
    },
    [store],
  );

  return { attachPhotos, removePhoto, loadThumbUrl, loadFullBlob };
}

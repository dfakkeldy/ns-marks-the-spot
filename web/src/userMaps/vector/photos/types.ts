/**
 * Photo attachments per the field-capture contract. The portable side is the
 * `nsmts:photos` feature property: an array of descriptors that travels
 * through GeoJSON round trips (and, later, KMZ with an added `href`). The
 * device side is a PhotoRecord row in the `photos` store plus two blobs.
 * Parsers here are strict-but-tolerant the way the contract pins: unknown
 * fields are ignored, missing optionals are fine, and a malformed value is
 * treated as an opaque user attribute — never interpreted as photos.
 */

export const PHOTOS_PROPERTY = "nsmts:photos";

/**
 * Portable descriptor, the value elements of `nsmts:photos`. `href` exists
 * only in the KMZ form (`files/<id>.jpg`): export adds it, import resolves
 * it against the archive and strips it while re-minting ids.
 */
export type FeaturePhotoDescriptor = {
  id: string;
  capturedAt?: string;
  sourceName?: string;
  width?: number;
  height?: number;
  href?: string;
};

/** Device-local metadata row; bytes live out-of-line in `blobs`. */
export type PhotoRecord = {
  id: string;
  layerId: string;
  addedAt: string;
  capturedAt?: string;
  sourceName?: string;
  width: number;
  height: number;
  fullBytes: number;
  thumbBytes: number;
};

/** Contract caps; refusal messages name them. */
export const MAX_PHOTOS_PER_FEATURE = 20;
export const MAX_PHOTOS_PER_LAYER = 500;
export const MAX_PHOTO_FILE_BYTES = 50 * 1024 * 1024;

function asDescriptor(value: unknown): FeaturePhotoDescriptor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    return null;
  }
  const descriptor: FeaturePhotoDescriptor = { id: candidate.id };
  if (typeof candidate.capturedAt === "string") {
    descriptor.capturedAt = candidate.capturedAt;
  }
  if (typeof candidate.sourceName === "string") {
    descriptor.sourceName = candidate.sourceName;
  }
  if (typeof candidate.width === "number" && Number.isFinite(candidate.width)) {
    descriptor.width = candidate.width;
  }
  if (typeof candidate.height === "number" && Number.isFinite(candidate.height)) {
    descriptor.height = candidate.height;
  }
  if (typeof candidate.href === "string") {
    descriptor.href = candidate.href;
  }
  return descriptor;
}

/**
 * The KMZ-side reader: ExtendedData values come back from togeojson as
 * STRINGS, so the property may be a JSON string rather than an array. Same
 * all-or-nothing tolerance; a malformed value stays an opaque attribute.
 */
export function readKmzPhotoDescriptors(
  properties: unknown,
): FeaturePhotoDescriptor[] {
  if (!properties || typeof properties !== "object") {
    return [];
  }
  const raw = (properties as Record<string, unknown>)[PHOTOS_PROPERTY];
  if (typeof raw !== "string") {
    return readPhotoDescriptors(properties);
  }
  try {
    return readPhotoDescriptors({ [PHOTOS_PROPERTY]: JSON.parse(raw) });
  } catch {
    return [];
  }
}

/**
 * The descriptors on a feature, or [] when absent or malformed. All-or-
 * nothing on malformed entries: a half-valid array would attribute the
 * wrong photos to a feature, which is worse than attributing none.
 */
export function readPhotoDescriptors(
  properties: unknown,
): FeaturePhotoDescriptor[] {
  if (!properties || typeof properties !== "object") {
    return [];
  }
  const raw = (properties as Record<string, unknown>)[PHOTOS_PROPERTY];
  if (!Array.isArray(raw)) {
    return [];
  }
  const descriptors: FeaturePhotoDescriptor[] = [];
  for (const entry of raw) {
    const descriptor = asDescriptor(entry);
    if (!descriptor) {
      return [];
    }
    descriptors.push(descriptor);
  }
  return descriptors;
}

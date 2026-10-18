/**
 * Pure classification for the bulk EXIF placement flow. Browsers expose no
 * photo library, so the input is always files the user picked; the geotag
 * decides whether a file can become a point at all, and the viewport only
 * decides the default check state — a photo from outside the current view
 * is still placeable, just not presumed wanted.
 */

export type BulkViewportBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type BulkPhotoCandidate = {
  file: File;
  gps: { lon: number; lat: number } | null;
  capturedAt: string | null;
};

export type BulkPhotoRow = BulkPhotoCandidate & {
  /** null when the photo has no geotag (not placeable). */
  inViewport: boolean | null;
  checkedByDefault: boolean;
};

export function classifyBulkPhotos(
  candidates: readonly BulkPhotoCandidate[],
  bounds: BulkViewportBounds | null,
): BulkPhotoRow[] {
  return candidates.map((candidate) => {
    if (!candidate.gps) {
      return { ...candidate, inViewport: null, checkedByDefault: false };
    }
    const inViewport = bounds
      ? candidate.gps.lon >= bounds.west &&
        candidate.gps.lon <= bounds.east &&
        candidate.gps.lat >= bounds.south &&
        candidate.gps.lat <= bounds.north
      : false;
    return { ...candidate, inViewport, checkedByDefault: inViewport };
  });
}

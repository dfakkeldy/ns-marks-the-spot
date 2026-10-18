import exifr from "exifr";

/**
 * The one file that imports exifr (the single authorized third-party
 * addition for the photo work). Everything runs locally; nothing here has a
 * network path. An unreadable EXIF is not a failure — a photo without a
 * geotag or a capture time is an ordinary photo — so every error collapses
 * to nulls rather than surfacing.
 */

export type PhotoExif = {
  gps: { lon: number; lat: number } | null;
  capturedAt: string | null;
};

export async function readPhotoExif(file: File): Promise<PhotoExif> {
  let gps: PhotoExif["gps"] = null;
  let capturedAt: PhotoExif["capturedAt"] = null;
  try {
    const location = await exifr.gps(file);
    if (
      location &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude) &&
      // (0, 0) is a common camera-bug sentinel, not a fix in the Gulf of
      // Guinea; treat it as absent.
      !(location.latitude === 0 && location.longitude === 0)
    ) {
      gps = { lon: location.longitude, lat: location.latitude };
    }
  } catch {
    gps = null;
  }
  try {
    const parsed = (await exifr.parse(file, {
      pick: ["DateTimeOriginal", "OffsetTimeOriginal"],
    })) as { DateTimeOriginal?: unknown } | undefined;
    const original = parsed?.DateTimeOriginal;
    if (original instanceof Date && !Number.isNaN(original.getTime())) {
      // exifr already folds OffsetTimeOriginal into the Date when present;
      // without an offset the device-local reading is the honest best.
      capturedAt = original.toISOString();
    }
  } catch {
    capturedAt = null;
  }
  return { gps, capturedAt };
}

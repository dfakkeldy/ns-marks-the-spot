import { MARK_MAX_FIX_AGE_MS } from "../location/captureSpec";

export type BrowserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  /** Metres, when the device reported an altitude it stands behind. */
  altitude: number | null;
  /**
   * When the device fixed this position — not when we asked for it. A
   * one-shot may answer from the platform's cache, and dating that from the
   * clock would claim a freshness the fix does not have, in a value that
   * becomes `nsmts:capturedAt` on a saved mark.
   */
  timestampMs: number;
};

/**
 * Why a one-shot request came back with nothing.
 *
 * The browser's three `GeolocationPositionError` codes say different things
 * to a reader: a refusal is not a timeout, and neither is "the device has no
 * position". Collapsing them into "permission was not granted" sends
 * somebody to Settings to fix a signal problem.
 */
export type BrowserLocationFailure =
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported";

export class BrowserLocationError extends Error {
  readonly failure: BrowserLocationFailure;

  constructor(failure: BrowserLocationFailure, message: string) {
    super(message);
    this.name = "BrowserLocationError";
    this.failure = failure;
  }
}

/** The failure a rejection carries, or "unavailable" for anything else. */
export function browserLocationFailure(error: unknown): BrowserLocationFailure {
  return error instanceof BrowserLocationError ? error.failure : "unavailable";
}

export function getBrowserLocation(
  geolocation: Geolocation | undefined = navigator.geolocation,
  options: { maximumAgeMs?: number } = {},
): Promise<BrowserLocation> {
  if (!geolocation) {
    return Promise.reject(
      new BrowserLocationError(
        "unsupported",
        "Location is not available in this browser.",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        const { coords } = position;
        const altitude = coords.altitude;
        const timestamp = position.timestamp;
        if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
          // The specification requires an acquisition time, and this value
          // becomes the mark's `nsmts:capturedAt`. Substituting the clock
          // would date a fix of unknown age to this instant, so a position
          // without a moment is refused instead.
          reject(
            new BrowserLocationError(
              "unavailable",
              "The browser reported a position with no acquisition time.",
            ),
          );
          return;
        }
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          altitude:
            typeof altitude === "number" && Number.isFinite(altitude)
              ? altitude
              : null,
          timestampMs: timestamp,
        });
      },
      (error) => reject(failureOf(error)),
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        // No older than a mark may be. The default used to be 30 seconds,
        // which handed back exactly the cached fix the caller's freshness
        // gate had just refused.
        maximumAge: options.maximumAgeMs ?? MARK_MAX_FIX_AGE_MS,
      },
    );
  });
}

function failureOf(error: GeolocationPositionError | undefined): BrowserLocationError {
  // The message is the browser's own, kept for a log; what the reader is
  // told is chosen from the failure by the caller.
  const message = error?.message || "Your location could not be read.";
  switch (error?.code) {
    case 1:
      return new BrowserLocationError("denied", message);
    case 2:
      return new BrowserLocationError("unavailable", message);
    case 3:
      return new BrowserLocationError("timeout", message);
    default:
      return new BrowserLocationError("unavailable", message);
  }
}

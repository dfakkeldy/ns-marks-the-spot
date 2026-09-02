import {
  MARK_MAX_ACCURACY_M,
  MARK_MAX_FIX_AGE_MS,
} from "./captureSpec";
import type { LiveFix } from "./liveLocation";
import type {
  BrowserLocation,
  BrowserLocationFailure,
} from "../services/browserLocation";

/**
 * What a one-shot request came to: a fix a mark may be built from, or the
 * sentence the reader is told instead.
 *
 * Kept apart from the handler so both halves of the rule — the browser's
 * failure codes and the contract's freshness and accuracy bounds — are
 * testable, and so the wording can be read beside the native app's, which
 * says the same things in the same order.
 */
export type OneShotOutcome =
  | { kind: "fix"; fix: LiveFix }
  | { kind: "refused"; message: string };

/** What each browser failure means for somebody standing there. */
export function markFailureMessage(failure: BrowserLocationFailure): string {
  switch (failure) {
    case "denied":
      return "Location permission was not granted. You can keep using the map.";
    case "timeout":
      return "Your location couldn't be found in time. Try again outdoors.";
    case "unsupported":
      return "Location is not available in this browser.";
    case "unavailable":
      return "Your location couldn't be found. Try again outdoors.";
  }
}

/**
 * The one-shot held to the rule the watch fix was held to.
 *
 * The handler falls back to `getCurrentPosition` only because the live fix
 * was too old or too rough; accepting whatever comes back would save exactly
 * what was just refused. A refusal names which half failed, because a reader
 * can act on one of them and not the other.
 */
export function oneShotMarkFix(
  location: BrowserLocation,
  nowMs: number,
): OneShotOutcome {
  const { accuracy } = location;
  if (!Number.isFinite(accuracy) || accuracy <= 0) {
    // A non-positive accuracy is the platform's "invalid", not "perfect".
    return {
      kind: "refused",
      message: "Your location couldn't be found. Try again outdoors.",
    };
  }
  if (accuracy > MARK_MAX_ACCURACY_M) {
    return {
      kind: "refused",
      message:
        `Your location was found only to within ${Math.round(accuracy)} m, and a mark ` +
        `is saved only within ${MARK_MAX_ACCURACY_M} m. Try again outdoors.`,
    };
  }
  const ageMs = nowMs - location.timestampMs;
  if (ageMs < 0) {
    return {
      kind: "refused",
      message:
        "The only location available carried a time ahead of this device's clock, " +
        "so it wasn't saved. Check the date and time, then try again.",
    };
  }
  if (ageMs > MARK_MAX_FIX_AGE_MS) {
    return {
      kind: "refused",
      message: "The only location available was too old to save. Try again outdoors.",
    };
  }
  return {
    kind: "fix",
    fix: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyM: accuracy,
      altitudeM: location.altitude,
      headingDeg: null,
      speedMps: null,
      // The position's own moment: `nsmts:capturedAt` says when the device
      // fixed it, not when this handler read it.
      timestampMs: location.timestampMs,
    },
  };
}

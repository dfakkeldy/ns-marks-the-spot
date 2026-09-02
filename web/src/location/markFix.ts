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

/**
 * Whether a fix may become a mark: a position on Earth, an accuracy the
 * device stands behind, and a moment neither older than the contract's
 * window nor ahead of this device's clock.
 *
 * One rule for the live watch fix and for the one-shot that replaces it,
 * because they write the same reserved keys onto the same kind of feature.
 */
export function isUsableMarkFix(fix: LiveFix, nowMs: number): boolean {
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) {
    return false;
  }
  if (Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180) {
    return false;
  }
  if (!Number.isFinite(fix.accuracyM) || fix.accuracyM < 0) {
    return false;
  }
  if (fix.accuracyM > MARK_MAX_ACCURACY_M) {
    return false;
  }
  const ageMs = nowMs - fix.timestampMs;
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= MARK_MAX_FIX_AGE_MS;
}

/**
 * An accuracy as a label that never reads tighter than the device reported:
 * one decimal below ten metres, so ±0.4 m is not "±0 m", and whole metres
 * rounded up above. The native app formats the same way.
 */
export function formatAccuracyM(accuracyM: number): string {
  if (!Number.isFinite(accuracyM) || accuracyM < 0) {
    return "?";
  }
  return accuracyM < 10
    ? (Math.ceil(accuracyM * 10) / 10).toFixed(1)
    : String(Math.ceil(accuracyM));
}

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
  if (!Number.isFinite(accuracy) || accuracy < 0) {
    // The Geolocation API defines accuracy as a non-negative radius, so zero
    // is a claim of certainty rather than the "invalid" a negative one is on
    // CoreLocation. Only a negative or non-finite value is refused here, and
    // the live watch path reads it the same way.
    return {
      kind: "refused",
      message: "Your location couldn't be found. Try again outdoors.",
    };
  }
  if (accuracy > MARK_MAX_ACCURACY_M) {
    return {
      kind: "refused",
      message:
        `Your location was found only to within ${formatAccuracyM(accuracy)} m, and a mark ` +
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
  const fix: LiveFix = {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyM: accuracy,
    altitudeM: location.altitude,
    headingDeg: null,
    speedMps: null,
    // The position's own moment: `nsmts:capturedAt` says when the device
    // fixed it, not when this handler read it.
    timestampMs: location.timestampMs,
  };
  // The same rule the watch fix is held to, coordinates included: a pair of
  // numbers off the globe is not a position, whatever its accuracy says.
  if (!isUsableMarkFix(fix, nowMs)) {
    return {
      kind: "refused",
      message: "Your location couldn't be found. Try again outdoors.",
    };
  }
  return { kind: "fix", fix };
}

import { distanceMetres } from "../services/geodesy";
import { FIELD_CAPTURE_SPEC } from "./captureSpec";
import type { LiveFix } from "./liveLocation";

/**
 * The live per-fix pipeline from the field-capture contract, applied in fix
 * order against the last accepted fix: accuracy gate, teleport rejection,
 * exponential smoothing, then adaptive minimum spacing. Every constant comes
 * from FIELD_CAPTURE_SPEC (pinned in the parity fixture) — never restate the
 * numbers here. Pure: the recorder owns the state and threads it through.
 */

/** A vertex the recorder keeps: smoothed position, the fix's own metadata. */
export type TrackPoint = {
  lat: number;
  lng: number;
  altitudeM: number | null;
  accuracyM: number;
  timestampMs: number;
};

export type TrackFilterState = {
  /** Raw position of the last gate-passing fix — the speed check's anchor. */
  lastAcceptedRaw: { lat: number; lng: number; timestampMs: number } | null;
  /** Exponential-smoothing state over accepted fixes. */
  smoothed: { lat: number; lng: number } | null;
  /** Last vertex actually emitted (smoothed position). */
  lastKept: { lat: number; lng: number } | null;
  /**
   * Last accepted (smoothed) point, kept or not — the contract's "final fix
   * on stop is always kept" appends this when a segment closes.
   */
  lastAccepted: TrackPoint | null;
};

export function createTrackFilterState(): TrackFilterState {
  return { lastAcceptedRaw: null, smoothed: null, lastKept: null, lastAccepted: null };
}

/**
 * Why a fix was turned down, when it was. Four different things, and the one
 * the reader is shown decides what they do about it: walk on and wait for the
 * sky to clear, or stop trusting the device's clock. Collapsing them into
 * "too rough" would send someone outdoors over a fix that was already outdoors
 * and simply arrived in the wrong order.
 */
export type FixRejection =
  /** A non-positive accuracy: a broken fix, not a perfect one. */
  | "accuracy-invalid"
  /** Outside the contract's accuracy gate. */
  | "too-rough"
  /** Timestamped at or before the last accepted fix. */
  | "out-of-order"
  /** Further from the last accepted fix than the walk speed allows. */
  | "too-fast";

export type FixResult = {
  next: TrackFilterState;
  /** Non-null when the fix passed the gates (counts as accepted). */
  accepted: TrackPoint | null;
  /** True when the accepted point also became a vertex. */
  kept: boolean;
  /** Why the fix was turned down. Null when it was accepted. */
  rejected: FixRejection | null;
};

export function applyFix(state: TrackFilterState, fix: LiveFix): FixResult {
  const spec = FIELD_CAPTURE_SPEC.trackFilter;

  // Accuracy gate: a non-positive accuracy is a broken fix, not a perfect one.
  if (!(fix.accuracyM > 0)) {
    return { next: state, accepted: null, kept: false, rejected: "accuracy-invalid" };
  }
  if (fix.accuracyM > spec.accuracyGateM) {
    return { next: state, accepted: null, kept: false, rejected: "too-rough" };
  }

  // Teleport rejection against the last accepted RAW position: smoothing must
  // not soften the speed check, and out-of-order timestamps are rejected too.
  if (state.lastAcceptedRaw) {
    const dtSeconds = (fix.timestampMs - state.lastAcceptedRaw.timestampMs) / 1_000;
    if (dtSeconds <= 0) {
      return { next: state, accepted: null, kept: false, rejected: "out-of-order" };
    }
    const metres = distanceMetres(state.lastAcceptedRaw, {
      lat: fix.latitude,
      lng: fix.longitude,
    });
    if (metres / dtSeconds > spec.maxSpeedMps) {
      return { next: state, accepted: null, kept: false, rejected: "too-fast" };
    }
  }

  const smoothed = state.smoothed
    ? {
        lat:
          state.smoothed.lat +
          spec.smoothingAlpha * (fix.latitude - state.smoothed.lat),
        lng:
          state.smoothed.lng +
          spec.smoothingAlpha * (fix.longitude - state.smoothed.lng),
      }
    : { lat: fix.latitude, lng: fix.longitude };

  const accepted: TrackPoint = {
    lat: smoothed.lat,
    lng: smoothed.lng,
    altitudeM: fix.altitudeM,
    accuracyM: fix.accuracyM,
    timestampMs: fix.timestampMs,
  };
  const next: TrackFilterState = {
    lastAcceptedRaw: {
      lat: fix.latitude,
      lng: fix.longitude,
      timestampMs: fix.timestampMs,
    },
    smoothed,
    lastKept: state.lastKept,
    lastAccepted: accepted,
  };

  // Adaptive spacing: movement smaller than half the error radius is noise,
  // with a floor so a stationary pin-drop doesn't accumulate vertices.
  const spacingM = Math.max(
    spec.minSpacingFloorM,
    spec.spacingAccuracyFactor * fix.accuracyM,
  );
  if (state.lastKept && distanceMetres(state.lastKept, smoothed) < spacingM) {
    return { next, accepted, kept: false, rejected: null };
  }
  return { next: { ...next, lastKept: smoothed }, accepted, kept: true, rejected: null };
}

/**
 * Continuous browser location: the watchPosition counterpart to the one-shot
 * services/browserLocation.ts. Framework-free so the map hook, the marker,
 * and (in a later change) the track recorder all share one watch — a second
 * concurrent watch would double the GPS duty cycle for nothing.
 *
 * Position data never leaves the browser: consumers render it or save it to
 * device-local stores, and the print/share guards in MapCanvas keep every
 * location-driven viewport out of share URLs and exports.
 */

export type LiveFix = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  altitudeM: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  timestampMs: number;
};

/**
 * Distinct states stay distinct: a denial, a missing API, and a lost signal
 * mean different things to the user and must never collapse into one
 * "location failed". `signal-lost` keeps the last fix so the marker can dim
 * in place instead of vanishing.
 */
export type LiveLocationSnapshot =
  | { status: "acquiring"; fix: null }
  | { status: "active"; fix: LiveFix }
  | {
      status: "signal-lost";
      fix: LiveFix | null;
      /**
       * Which transient failure this is. The browser keeps trying either
       * way, but a device that has not answered yet and one that cannot
       * place itself are different things to be told.
       */
      reason: "timeout" | "unavailable";
    }
  | { status: "denied"; fix: null }
  | { status: "unavailable"; fix: null };

export type LiveLocationHandle = { stop: () => void };

const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

/**
 * maximumAge 5 s: a marker may show a briefly cached fix. The 20 s timeout
 * turns a silent GPS stall into a visible `signal-lost` instead of an
 * eternal spinner.
 */
const MARKER_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5_000,
  timeout: 20_000,
};

/** A recorded track must never contain cached fixes, hence maximumAge 0. */
export const RECORDING_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20_000,
};

function toLiveFix(position: GeolocationPosition): LiveFix {
  const { coords } = position;
  // Heading and speed are null on desktops and NaN on some mobile browsers
  // when stationary; both mean "not known" and normalize to null.
  const number = (value: number | null): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyM: coords.accuracy,
    altitudeM: number(coords.altitude),
    headingDeg: number(coords.heading),
    speedMps: number(coords.speed),
    timestampMs: position.timestamp,
  };
}

export function startLiveLocation(
  onChange: (snapshot: LiveLocationSnapshot) => void,
  geolocation: Geolocation | undefined = typeof navigator !== "undefined"
    ? navigator.geolocation
    : undefined,
  options: PositionOptions = MARKER_WATCH_OPTIONS,
): LiveLocationHandle {
  if (!geolocation) {
    onChange({ status: "unavailable", fix: null });
    return { stop: () => {} };
  }

  let stopped = false;
  let lastFix: LiveFix | null = null;
  // The error callback can run synchronously inside watchPosition (fakes and
  // some permission-cached browsers), before the watch id exists to clear.
  let watchId: number | null = null;
  let stopRequested = false;

  onChange({ status: "acquiring", fix: null });
  const id = geolocation.watchPosition(
    (position) => {
      if (stopped) {
        return;
      }
      lastFix = toLiveFix(position);
      onChange({ status: "active", fix: lastFix });
    },
    (error) => {
      if (stopped) {
        return;
      }
      if (error.code === PERMISSION_DENIED) {
        // A denial is final for this watch; keep the browser from retrying.
        stopped = true;
        stopRequested = true;
        if (watchId !== null) {
          geolocation.clearWatch(watchId);
        }
        onChange({ status: "denied", fix: null });
        return;
      }
      // Timeout or position-unavailable: the watch keeps trying on its own,
      // and the two are told apart rather than merged.
      onChange({
        status: "signal-lost",
        fix: lastFix,
        reason: error.code === TIMEOUT ? "timeout" : "unavailable",
      });
    },
    options,
  );
  watchId = id;
  if (stopRequested) {
    geolocation.clearWatch(id);
  }

  return {
    stop: () => {
      stopped = true;
      geolocation.clearWatch(id);
    },
  };
}

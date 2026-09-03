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
 * in place instead of vanishing — and a null `fix` there is the state before
 * any position has been delivered on this watch, which is not a signal that
 * was lost. A consumer must never promise there the recovery of something
 * that was never had, and it says something different for each of the two
 * transient reasons: one is still waiting for an answer, the other has been
 * given one. A pre-fix run of the second ends the watch in
 * `position-unavailable`, which is the one state here that is not a report on
 * a watch still running.
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
  /**
   * The device answered, more than once, that it cannot work out where it is,
   * and no position ever arrived. Not `unavailable`: that one is a browser
   * with no Geolocation API at all, and this is a browser that has one and got
   * nowhere. The watch is already cleared when this arrives, so a consumer
   * must take its search off the screen; starting a fresh watch is the
   * consumer's to offer.
   */
  | {
      status: "position-unavailable";
      fix: null;
      /**
       * Why the watch stopped, because the three are different accounts and
       * a consumer must not tell one as another. `repeated` is the device
       * answering that it cannot place itself, over and over. `no-answer` is
       * one such answer and then silence until the deadline — nothing was
       * said several times. `no-fix` is a watch that only ever timed out:
       * the device never said it could not place itself, it just never
       * placed itself.
       */
      reason: "repeated" | "no-answer" | "no-fix";
    }
  | { status: "unavailable"; fix: null };

export type LiveLocationHandle = { stop: () => void };

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

/**
 * How many times, before any position has arrived, the device may report that
 * it cannot place itself before this watch stops. Three is past what a single
 * provider hiccup or one cold start produces, and a device that has said it
 * three times without ever delivering a position is not about to. A timeout
 * does not count towards it: still waiting is not the same answer as cannot.
 */
const PRE_FIX_UNAVAILABLE_LIMIT = 3;

/**
 * And how long the watch has, from its first failure of any kind, to produce
 * a position before it gives up anyway. The API promises no second callback
 * of any sort, so a browser that answers once and then falls silent — or that
 * only ever times out — would leave a pressed toggle over a search that will
 * never end. Thirty seconds is past one full 20-second watch timeout, so a
 * cold start that is genuinely still working is not cut off, and a device
 * indoors gets a second attempt from the toggle rather than an endless first.
 */
const PRE_FIX_DEADLINE_MS = 30_000;

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
  /**
   * Whether a run of pre-fix "position unavailable" reports may end this
   * watch. False while a track is being recorded: the walk's only source of
   * fixes is this watch, and a device struggling at the start of a session has
   * to be given the whole session to produce one rather than have the
   * recording's supply cut off after three replies.
   */
  endsWhenNeverPlaced = true,
): LiveLocationHandle {
  if (!geolocation) {
    onChange({ status: "unavailable", fix: null });
    return { stop: () => {} };
  }

  let stopped = false;
  let lastFix: LiveFix | null = null;
  // Counted only before the first fix, and never reset: `lastFix` stays set
  // once a position arrives, so this is strictly how many times this watch was
  // told the position is unavailable while it had nothing to show.
  let preFixUnavailable = 0;
  let unavailableDeadline: ReturnType<typeof setTimeout> | null = null;
  const clearDeadline = () => {
    if (unavailableDeadline !== null) {
      clearTimeout(unavailableDeadline);
      unavailableDeadline = null;
    }
  };
  // The error callback can run synchronously inside watchPosition (fakes and
  // some permission-cached browsers), before the watch id exists to clear.
  let watchId: number | null = null;
  let stopRequested = false;

  // The browser would go on reporting an unavailable position for as long as
  // the page is open. Stopping the watch is what lets the consumer take down
  // a search that has already failed, and what is passed on is only what the
  // device said: the position is unavailable. Not a refusal, and not a
  // machine without a way to locate itself.
  const giveUp = (reason: "repeated" | "no-answer" | "no-fix") => {
    if (stopped) {
      return;
    }
    stopped = true;
    stopRequested = true;
    clearDeadline();
    if (watchId !== null) {
      geolocation.clearWatch(watchId);
    }
    onChange({ status: "position-unavailable", fix: null, reason });
  };

  onChange({ status: "acquiring", fix: null });
  const id = geolocation.watchPosition(
    (position) => {
      if (stopped) {
        return;
      }
      lastFix = toLiveFix(position);
      // A position arrived, so the deadline below has nothing left to decide.
      clearDeadline();
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
        clearDeadline();
        if (watchId !== null) {
          geolocation.clearWatch(watchId);
        }
        onChange({ status: "denied", fix: null });
        return;
      }
      if (endsWhenNeverPlaced && lastFix === null) {
        // Armed by the first failure of any kind. Counting code 2s alone
        // would wait forever on a browser that reports one and then says
        // nothing more, and on one that only ever times out — neither of
        // which the API forbids.
        unavailableDeadline ??= setTimeout(() => {
          giveUp(preFixUnavailable > 0 ? "no-answer" : "no-fix");
        }, PRE_FIX_DEADLINE_MS);
        if (error.code === POSITION_UNAVAILABLE) {
          preFixUnavailable += 1;
          if (preFixUnavailable >= PRE_FIX_UNAVAILABLE_LIMIT) {
            giveUp("repeated");
            return;
          }
        }
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
      clearDeadline();
      geolocation.clearWatch(id);
    },
  };
}

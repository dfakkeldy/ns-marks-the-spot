import { distanceMetres } from "../services/geodesy";
import {
  applyFix,
  createTrackFilterState,
  type TrackFilterState,
  type TrackPoint,
} from "./trackFilter";
import type { LiveFix } from "./liveLocation";

/**
 * The recording state machine: segments, raw-fix retention, live stats. Pure
 * apart from the injectable clock, so tests script it fix by fix. Pause
 * closes the current segment and resume opens a new one with fresh filter
 * state — no connector is drawn or stored across a gap, and smoothing never
 * drags across time the user wasn't recording. When a segment closes, the
 * last accepted fix is appended if spacing had suppressed it, so the track
 * ends where the user actually stopped (the contract's final-fix rule).
 * `draft()` is that same result at any moment, so an interrupted session can
 * be written to the device and recovered without the recorder ever knowing
 * that storage exists.
 */

export type RecorderStatus = "idle" | "recording" | "paused";

export type StopResult = {
  startedAt: string;
  endedAt: string;
  /** Filtered, smoothed vertices per recording segment. */
  segments: TrackPoint[][];
  /** Every fix received while recording, kept and dropped alike. */
  rawSegments: LiveFix[][];
  rawFixCount: number;
  acceptedFixCount: number;
  distanceM: number;
  recordingMs: number;
};

export type RecorderStats = {
  status: RecorderStatus;
  elapsedMs: number;
  distanceM: number;
  keptVertexCount: number;
};

export type TrackRecorder = {
  status: () => RecorderStatus;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => StopResult | null;
  /**
   * What stop() would return if it were called now, without touching the
   * running recording — the walk so far, in the shape the save path already
   * takes. Null when idle, and null until a fix has arrived: a draft's
   * `endedAt` is the last position received, never a reading off the clock.
   */
  draft: () => StopResult | null;
  addFix: (fix: LiveFix) => boolean;
  stats: () => RecorderStats;
  /** Current vertices for the live trace, one array per segment. */
  liveSegments: () => [number, number][][];
};

export function createTrackRecorder(now: () => number = Date.now): TrackRecorder {
  let status: RecorderStatus = "idle";
  let startedAtMs = 0;
  let recordingMs = 0;
  let resumedAtMs = 0;
  let distanceM = 0;
  let keptCount = 0;
  let acceptedCount = 0;
  let rawCount = 0;
  let filter: TrackFilterState = createTrackFilterState();
  const segments: TrackPoint[][] = [];
  const rawSegments: LiveFix[][] = [];

  const openSegment = () => {
    segments.push([]);
    rawSegments.push([]);
    filter = createTrackFilterState();
  };

  // The last accepted fix when spacing suppressed it: the vertex the
  // contract's final-fix rule appends as a segment closes. The draft reads it
  // too, so a recovered walk ends where a stopped one would.
  const pendingTail = (): TrackPoint | null => {
    const segment = segments[segments.length - 1];
    const last = filter.lastAccepted;
    if (!segment || !last || segment[segment.length - 1] === last) {
      return null;
    }
    return last;
  };

  const closeSegment = () => {
    const last = pendingTail();
    if (!last) {
      return;
    }
    const segment = segments[segments.length - 1];
    const previous = segment[segment.length - 1];
    if (previous) {
      distanceM += distanceMetres(previous, last);
    }
    segment.push(last);
    keptCount += 1;
  };

  return {
    status: () => status,
    start: () => {
      if (status !== "idle") {
        return;
      }
      status = "recording";
      startedAtMs = now();
      resumedAtMs = startedAtMs;
      openSegment();
    },
    pause: () => {
      if (status !== "recording") {
        return;
      }
      closeSegment();
      recordingMs += now() - resumedAtMs;
      status = "paused";
    },
    resume: () => {
      if (status !== "paused") {
        return;
      }
      status = "recording";
      resumedAtMs = now();
      openSegment();
    },
    stop: () => {
      if (status === "idle") {
        return null;
      }
      if (status === "recording") {
        closeSegment();
        recordingMs += now() - resumedAtMs;
      }
      status = "idle";
      return {
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: new Date(now()).toISOString(),
        segments,
        rawSegments,
        rawFixCount: rawCount,
        acceptedFixCount: acceptedCount,
        distanceM,
        recordingMs,
      };
    },
    draft: () => {
      if (status === "idle") {
        return null;
      }
      let lastFix: LiveFix | null = null;
      for (let index = rawSegments.length - 1; index >= 0 && !lastFix; index -= 1) {
        const segment = rawSegments[index];
        lastFix = segment.length > 0 ? segment[segment.length - 1] : null;
      }
      if (!lastFix) {
        return null;
      }
      const tail = pendingTail();
      const openIndex = segments.length - 1;
      const openSegment = segments[openIndex];
      const openEnd = openSegment[openSegment.length - 1];
      return {
        startedAt: new Date(startedAtMs).toISOString(),
        // The last position this device actually recorded — never the clock
        // at the moment of the snapshot, which is a time no fix ever had.
        endedAt: new Date(lastFix.timestampMs).toISOString(),
        segments: segments.map((segment, index) =>
          tail && index === openIndex ? [...segment, tail] : [...segment],
        ),
        rawSegments: rawSegments.map((segment) => [...segment]),
        rawFixCount: rawCount,
        acceptedFixCount: acceptedCount,
        distanceM:
          tail && openEnd ? distanceM + distanceMetres(openEnd, tail) : distanceM,
        recordingMs:
          status === "recording" ? recordingMs + (now() - resumedAtMs) : recordingMs,
      };
    },
    addFix: (fix) => {
      if (status !== "recording") {
        return false;
      }
      rawSegments[rawSegments.length - 1].push(fix);
      rawCount += 1;
      const result = applyFix(filter, fix);
      filter = result.next;
      if (result.accepted) {
        acceptedCount += 1;
      }
      if (result.accepted && result.kept) {
        const segment = segments[segments.length - 1];
        const previous = segment[segment.length - 1];
        if (previous) {
          distanceM += distanceMetres(previous, result.accepted);
        }
        segment.push(result.accepted);
        keptCount += 1;
      }
      return result.kept;
    },
    stats: () => ({
      status,
      elapsedMs:
        status === "recording" ? recordingMs + (now() - resumedAtMs) : recordingMs,
      distanceM,
      keptVertexCount: keptCount,
    }),
    liveSegments: () =>
      segments.map((segment) => segment.map(({ lat, lng }): [number, number] => [lat, lng])),
  };
}

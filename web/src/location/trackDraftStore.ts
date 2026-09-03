import {
  BLOBS,
  isQuotaError,
  openUserContentDatabase,
  request,
  transactionDone,
} from "../userMaps/store/database";
import type { LiveFix } from "./liveLocation";
import type { TrackPoint } from "./trackFilter";
import type { StopResult } from "./trackRecorder";

/**
 * The current recording, kept on this device while a walk runs and again the
 * moment it is stopped, so a reloaded or discarded tab does not take the
 * track with it. One key, overwritten in place: this is the current
 * recording, not a history.
 *
 * The record says which of the two it is. A draft written by the periodic
 * write is mid-walk by construction, and a walk recovered from one ends at
 * the last position stored and may be cut short — which is what the save
 * dialog and the saved record then say. A draft written at Stop is the whole
 * walk and carries no such caveat. Writing nothing at Stop made every
 * recovered draft honestly interrupted, but it also meant a walk stopped
 * inside the first few seconds, and the last few seconds of any walk, existed
 * only in the tab that was about to be reloaded.
 *
 * No schema change: the draft rides the existing `blobs` store as a plain
 * structured-cloneable record, the same out-of-line treatment layer geometry
 * gets. The interval lives here and NOT in captureSpec.ts — it is a
 * device-storage detail, not a field-capture constant the native app is
 * pinned to.
 */
const DRAFT_KEY = "recording:draft";
const DRAFT_VERSION = 1;

/** How far the walk may run ahead of the copy on the device. */
export const TRACK_DRAFT_INTERVAL_MS = 5_000;

/**
 * How long the one-time read may hold Record before the device is called
 * unreadable. An open blocked by another tab's upgrade never answers, and
 * locking the recorder out for the rest of the session would be worse than
 * saying plainly that the device could not be read.
 */
export const TRACK_DRAFT_READ_TIMEOUT_MS = 4_000;

export type TrackDraftFailure = "quota" | "failed";

/**
 * How long any one operation may hold the queue. A hung `open()` — another
 * tab's upgrade never answering, a browser that has taken the store away
 * mid-session — would otherwise sit at the head of the queue for the life of
 * the tab, and every write of the walk behind it would wait there in silence.
 * Shorter than TRACK_DRAFT_READ_TIMEOUT_MS, so the read answers rather than
 * being given up on.
 */
const OPERATION_TIMEOUT_MS = 3_000;

/**
 * What a read found, which is not the same question as what it returned.
 *
 * A store that could not be opened and a store with nothing in it are
 * different evidence: the first may still hold a walk, so nothing may
 * overwrite it and the reader is owed the news. Returning null for both let a
 * blocked store read as "no unsaved recording".
 */
export type TrackDraftRead =
  | { status: "empty" }
  | {
      status: "ready";
      result: StopResult;
      /**
       * True when this was written at Stop rather than by the periodic write,
       * so it is the whole walk. A draft without it ends at the last position
       * the device stored and may be cut short.
       */
      stopped: boolean;
    }
  | { status: "unreadable" };

export type TrackDraftStore = {
  /**
   * Never rejects: a refused write is reported, not thrown mid-walk.
   * `stopped` marks the walk as whole rather than mid-walk, which is what
   * decides whether a recovered copy carries the truncation caveat.
   */
  save: (draft: StopResult, stopped?: boolean) => Promise<TrackDraftFailure | null>;
  read: () => Promise<TrackDraftRead>;
  /** Never rejects; a refused delete is reported so the offer can stand. */
  clear: () => Promise<TrackDraftFailure | null>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The furthest moment either side of the epoch a date can hold. Past it
 * `new Date(ms).toISOString()` throws, and it throws where nothing catches
 * it: the map's save handler builds the track's geometry from these
 * timestamps, and its raw GPX right after, with no catch on either side. A
 * draft carrying one takes the save down instead of being refused here.
 */
const MAX_TIMESTAMP_MS = 8.64e15;

/**
 * null is a real value here; undefined is not. Finiteness is all that can
 * honestly be asked of the number itself: liveLocation has already turned a
 * non-finite reading into null, and none of the three is measured by anything
 * downstream — heading and speed reach nothing at all, and an altitude
 * reaches only the raw GPX, as the device reported it.
 */
function isNullableNumber(value: unknown): boolean {
  return value === null || Number.isFinite(value);
}

/**
 * Metres, milliseconds, and the radius of a fix: a finite measurement, never
 * below zero. Deliberately not the filter's accuracy gate — `rawSegments`
 * holds every fix the device sent, the ones the gate threw out included, and
 * those are the recording's unprocessed evidence. On a raw fix zero is a
 * device claiming certainty; trackFilter.ts reads a non-positive accuracy on
 * a kept vertex as a broken fix and never emits one, so this is only the
 * floor the two share.
 */
function isNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** A tally of fixes: whole, and never below zero. */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * A position on Earth. Nothing else asks: the filter gates accuracy and
 * speed and lets the coordinates through, and its smoothing only ever returns
 * a point between two positions the browser reported. A pair off the globe
 * therefore never came from a walk, and saving it would put a layer where no
 * map can show it. NaN and Infinity fail the comparison rather than pass it.
 */
function isLatitude(value: unknown): boolean {
  return typeof value === "number" && Math.abs(value) <= 90;
}

function isLongitude(value: unknown): boolean {
  return typeof value === "number" && Math.abs(value) <= 180;
}

/** A moment a date can hold, which is what `toISOString` needs of it. */
function isTimestamp(value: unknown): boolean {
  return typeof value === "number" && Math.abs(value) <= MAX_TIMESTAMP_MS;
}

/**
 * The exact string the recorder wrote. The round trip is the test because
 * `Date.parse` on its own reads "March 1" and a good deal else, and the
 * track's record would then carry a start time no clock ever produced — the
 * default track name is built by reading that string back. Nothing here can
 * throw: `Date.parse` answers NaN for a moment outside the range above.
 */
function isInstant(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

function isPoint(value: unknown): value is TrackPoint {
  return (
    isRecord(value) &&
    isLatitude(value.lat) &&
    isLongitude(value.lng) &&
    isNonNegative(value.accuracyM) &&
    isTimestamp(value.timestampMs) &&
    isNullableNumber(value.altitudeM)
  );
}

function isFix(value: unknown): value is LiveFix {
  return (
    isRecord(value) &&
    isLatitude(value.latitude) &&
    isLongitude(value.longitude) &&
    isNonNegative(value.accuracyM) &&
    isTimestamp(value.timestampMs) &&
    // Nullable, never absent: rawTrackGpx.ts tests `fix.altitudeM !== null`,
    // so an undefined would serialize the word "undefined" into the raw GPX
    // that is the recording's unprocessed evidence.
    isNullableNumber(value.altitudeM) &&
    isNullableNumber(value.headingDeg) &&
    isNullableNumber(value.speedMps)
  );
}

function isSegments<T>(
  value: unknown,
  entry: (item: unknown) => item is T,
): value is T[][] {
  return (
    Array.isArray(value) &&
    value.every((segment) => Array.isArray(segment) && segment.every(entry))
  );
}

/**
 * All-or-nothing: a draft that does not parse is not half a walk. Half a walk
 * would reach the save dialog, which measures and simplifies it during
 * render, and one bad vertex there takes the map down.
 *
 * Parsing asks for more than the right shape. Every field has to be something
 * a recording could have produced, because nothing downstream asks again: the
 * vertices become saved geometry, the counts become the record's account of
 * the raw fixes beside them, and a timestamp past what a date can hold throws
 * inside the save dialog rather than anywhere the failure could be reported.
 * Whatever fails lands on `unreadable`, which already means the key is taken
 * by something this build cannot read. No new state is needed for it: the
 * reader does the same thing either way, which is to leave the key alone.
 */
function parseDraft(value: unknown): { result: StopResult; stopped: boolean } | null {
  if (!isRecord(value) || value.version !== DRAFT_VERSION) {
    return null;
  }
  // Absent on every draft written before Stop began writing one, and on every
  // periodic write since. Absent means mid-walk, which is the caveated
  // reading and the safe one to be wrong about.
  if (value.stopped !== undefined && typeof value.stopped !== "boolean") {
    return null;
  }
  const draft = value.result;
  if (
    !isRecord(draft) ||
    !isInstant(draft.startedAt) ||
    !isInstant(draft.endedAt) ||
    !isCount(draft.rawFixCount) ||
    !isCount(draft.acceptedFixCount) ||
    !isNonNegative(draft.distanceM) ||
    !isNonNegative(draft.recordingMs) ||
    !isSegments(draft.segments, isPoint) ||
    !isSegments(draft.rawSegments, isFix)
  ) {
    return null;
  }
  const result = draft as unknown as StopResult;
  const total = (segments: readonly { length: number }[]): number =>
    segments.reduce((count, segment) => count + segment.length, 0);
  // What the recorder does as it records: it opens a segment in both arrays
  // at once, tallies every fix in the same step that stores it, and only ever
  // keeps a vertex it had already accepted. An empty segment is ordinary —
  // resume opens one before a fix has landed in it — but counts that disagree
  // with the arrays beside them describe a walk that did not happen, and they
  // are read back to the user as this recording's own fix count.
  if (
    result.segments.length !== result.rawSegments.length ||
    result.rawFixCount !== total(result.rawSegments) ||
    result.acceptedFixCount > result.rawFixCount ||
    total(result.segments) > result.acceptedFixCount
  ) {
    return null;
  }
  return { result, stopped: value.stopped === true };
}

export function createTrackDraftStore(
  factory: IDBFactory = indexedDB,
): TrackDraftStore {
  // One handle, dropped after any failure: another tab's upgrade closes ours
  // (database.ts sets onversionchange), and a dead handle would fail every
  // remaining write of the walk.
  let open: Promise<IDBDatabase> | null = null;
  const database = () => {
    open ??= openUserContentDatabase(factory);
    // Raced, not awaited outright. The handle itself is kept — a late open
    // still resolves, and the next operation uses it — but this call gives up
    // so the queue behind it moves, and the walk's next write can report a
    // device that is not answering instead of waiting in silence.
    return Promise.race([
      open,
      new Promise<IDBDatabase>((_, reject) => {
        setTimeout(
          () => reject(new Error("The device did not open in time.")),
          OPERATION_TIMEOUT_MS,
        );
      }),
    ]);
  };

  // One key, one order. A clear() asked for after a save() must delete what
  // that save wrote rather than race its transaction — otherwise a walk the
  // user already saved or discarded comes back as "unsaved" on the next load.
  // Every operation below resolves rather than rejects, so the chain cannot
  // break.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work);
    queue = next;
    return next;
  };

  return {
    save: (draft, stopped = false) =>
      enqueue(async () => {
        try {
          const tx = (await database()).transaction(BLOBS, "readwrite");
          // Inside the try: Safari can throw QuotaExceededError synchronously
          // from put() rather than through the abort event.
          tx.objectStore(BLOBS).put(
            // `stopped` is written only when true, so a mid-walk draft keeps
            // the shape every earlier build wrote.
            stopped
              ? { version: DRAFT_VERSION, result: draft, stopped: true }
              : { version: DRAFT_VERSION, result: draft },
            DRAFT_KEY,
          );
          await transactionDone(tx);
          return null;
        } catch (error) {
          open = null;
          return isQuotaError(error) ? "quota" : "failed";
        }
      }),
    read: () =>
      enqueue(async (): Promise<TrackDraftRead> => {
        try {
          const tx = (await database()).transaction(BLOBS, "readonly");
          const stored = await request(
            tx.objectStore(BLOBS).get(DRAFT_KEY) as IDBRequest<unknown>,
          );
          if (stored === undefined) {
            return { status: "empty" };
          }
          const parsed = parseDraft(stored);
          // Something is there and it is not a walk this build can read. Not
          // "empty": the key is taken, and overwriting it would destroy
          // whatever it is.
          return parsed
            ? { status: "ready", result: parsed.result, stopped: parsed.stopped }
            : { status: "unreadable" };
        } catch {
          open = null;
          return { status: "unreadable" };
        }
      }),
    clear: () =>
      enqueue(async () => {
        try {
          const tx = (await database()).transaction(BLOBS, "readwrite");
          tx.objectStore(BLOBS).delete(DRAFT_KEY);
          await transactionDone(tx);
          return null;
        } catch (error) {
          open = null;
          return isQuotaError(error) ? "quota" : "failed";
        }
      }),
  };
}

let shared: TrackDraftStore | null = null;

/** One store for the app; tests build their own. */
export function sharedTrackDraftStore(): TrackDraftStore {
  shared ??= createTrackDraftStore();
  return shared;
}

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
 * The in-progress recording, kept on this device while a walk runs so a
 * reloaded or discarded tab does not take the whole track with it. One key,
 * overwritten in place: this is the current recording, not a history.
 *
 * Nothing is written at Stop. Every stored draft is therefore mid-walk by
 * construction, so a draft that comes back is always a walk that was cut
 * short — which is exactly what the save dialog and the saved record then
 * say. A stopped walk is held in memory by useTrackRecording instead.
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
 * What a read found, which is not the same question as what it returned.
 *
 * A store that could not be opened and a store with nothing in it are
 * different evidence: the first may still hold a walk, so nothing may
 * overwrite it and the reader is owed the news. Returning null for both let a
 * blocked store read as "no unsaved recording".
 */
export type TrackDraftRead =
  | { status: "empty" }
  | { status: "ready"; result: StopResult }
  | { status: "unreadable" };

export type TrackDraftStore = {
  /** Never rejects: a refused write is reported, not thrown mid-walk. */
  save: (draft: StopResult) => Promise<TrackDraftFailure | null>;
  read: () => Promise<TrackDraftRead>;
  /** Never rejects; a refused delete is reported so the offer can stand. */
  clear: () => Promise<TrackDraftFailure | null>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): boolean {
  return Number.isFinite(value);
}

/** null is a real value here; undefined is not. */
function isNullableNumber(value: unknown): boolean {
  return value === null || Number.isFinite(value);
}

function isPoint(value: unknown): value is TrackPoint {
  return (
    isRecord(value) &&
    isNumber(value.lat) &&
    isNumber(value.lng) &&
    isNumber(value.accuracyM) &&
    isNumber(value.timestampMs) &&
    isNullableNumber(value.altitudeM)
  );
}

function isFix(value: unknown): value is LiveFix {
  return (
    isRecord(value) &&
    isNumber(value.latitude) &&
    isNumber(value.longitude) &&
    isNumber(value.accuracyM) &&
    isNumber(value.timestampMs) &&
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
 */
function parseDraft(value: unknown): StopResult | null {
  if (!isRecord(value) || value.version !== DRAFT_VERSION) {
    return null;
  }
  const draft = value.result;
  if (
    !isRecord(draft) ||
    typeof draft.startedAt !== "string" ||
    typeof draft.endedAt !== "string" ||
    !isNumber(draft.rawFixCount) ||
    !isNumber(draft.acceptedFixCount) ||
    !isNumber(draft.distanceM) ||
    !isNumber(draft.recordingMs) ||
    !isSegments(draft.segments, isPoint) ||
    !isSegments(draft.rawSegments, isFix)
  ) {
    return null;
  }
  return draft as unknown as StopResult;
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
    return open;
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
    save: (draft) =>
      enqueue(async () => {
        try {
          const tx = (await database()).transaction(BLOBS, "readwrite");
          // Inside the try: Safari can throw QuotaExceededError synchronously
          // from put() rather than through the abort event.
          tx.objectStore(BLOBS).put(
            { version: DRAFT_VERSION, result: draft },
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
          const result = parseDraft(stored);
          // Something is there and it is not a walk this build can read. Not
          // "empty": the key is taken, and overwriting it would destroy
          // whatever it is.
          return result ? { status: "ready", result } : { status: "unreadable" };
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

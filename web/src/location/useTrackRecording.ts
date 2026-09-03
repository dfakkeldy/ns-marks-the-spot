import { useCallback, useEffect, useRef, useState } from "react";
import { acquireScreenWakeLock, type WakeLockHandle } from "./wakeLock";
import {
  TRACK_DRAFT_INTERVAL_MS,
  sharedTrackDraftStore,
  type TrackDraftFailure,
  type TrackDraftStore,
} from "./trackDraftStore";
import {
  createTrackRecorder,
  type RecorderStats,
  type RecorderStatus,
  type StopResult,
} from "./trackRecorder";
import type { LiveFix } from "./liveLocation";

/** A walk that has been recorded but not yet saved or discarded. */
export type UnsavedRecording = {
  result: StopResult;
  /**
   * True when the recording came back from this device rather than from this
   * session's own Stop: the tab went away mid-walk, so the track ends at the
   * last fix the device stored and may be cut short.
   */
  interrupted: boolean;
};

export type TrackRecordingApi = {
  status: RecorderStatus;
  stats: RecorderStats;
  liveSegments: [number, number][][];
  /** null before the first session; false = show the keep-screen-on hint. */
  wakeLockSupported: boolean | null;
  /**
   * A walk that has not been saved or discarded: either this session's own
   * Stop whose save has not landed, or a recording this device stored before
   * the tab went away. Held in memory, so the offer stands whether or not the
   * device write succeeded.
   */
  unsaved: UnsavedRecording | null;
  /** Set when the device refused the in-progress write, so the HUD says so. */
  draftError: TrackDraftFailure | null;
  /** Forgets both copies — after the track is saved, or discarded. */
  clearUnsaved: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => StopResult | null;
};

/**
 * Below two vertices in one segment there is nothing to recover: that is
 * exactly what buildRecordedTrackFeature refuses (trackFeature.ts) and what
 * the save dialog reports as "Too little movement was recorded to save a
 * track." Such a walk is never written to the device and never offered back.
 */
function worthKeeping(draft: StopResult): boolean {
  return draft.segments.some((segment) => segment.length >= 2);
}

/**
 * Wires live watch fixes into the recorder state machine, owns the wake lock
 * for the session, and keeps the walk on this device while it runs. The
 * recorder itself is pure; this hook feeds it, re-renders on a one-second
 * tick so the HUD's elapsed time moves, and writes the walk so far to the
 * device every few seconds so a discarded or reloaded tab is not the end of
 * the track.
 */
export function useTrackRecording(
  fix: LiveFix | null,
  draftStore: TrackDraftStore = sharedTrackDraftStore(),
): TrackRecordingApi {
  const recorderRef = useRef(createTrackRecorder());
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [wakeLockSupported, setWakeLockSupported] = useState<boolean | null>(null);
  const [unsaved, setUnsaved] = useState<UnsavedRecording | null>(null);
  const [draftError, setDraftError] = useState<TrackDraftFailure | null>(null);
  const draftErrorRef = useRef<TrackDraftFailure | null>(null);
  const draftTimerRef = useRef<number | null>(null);

  // An interrupted recording is on the device, not in this tab: read it once
  // on load and offer it back. Only a found draft touches state — an empty
  // read must not re-render every map that mounts, nor land an update outside
  // act() in every test that renders one.
  useEffect(() => {
    let cancelled = false;
    void draftStore.read().then((result) => {
      if (!cancelled && result) {
        setUnsaved({ result, interrupted: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draftStore]);

  const writeDraft = useCallback(
    (draft: StopResult) => {
      // Only a change is reported. A write that succeeds while nothing was
      // wrong must not re-render the HUD it exists to protect; a write that
      // succeeds after a refusal must take the warning down, because by then
      // the whole walk is on the device again.
      void draftStore.save(draft).then((failure) => {
        if (failure === draftErrorRef.current) {
          return;
        }
        draftErrorRef.current = failure;
        setDraftError(failure);
      });
    },
    [draftStore],
  );

  const cancelDraftWrite = useCallback(() => {
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
  }, []);

  // At most one write per interval, and the last one always lands: per-fix
  // work stays what it was, and the copy on the device is never more than a
  // few seconds behind the walk.
  const scheduleDraftWrite = useCallback(() => {
    if (draftTimerRef.current !== null) {
      return;
    }
    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null;
      const draft = recorderRef.current.draft();
      if (draft && worthKeeping(draft)) {
        writeDraft(draft);
      }
    }, TRACK_DRAFT_INTERVAL_MS);
  }, [writeDraft]);
  // Bumped per consumed fix and per tick; stats and the live trace are
  // derived from the recorder on render rather than duplicated in state.
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((current) => current + 1), []);

  const lastConsumedRef = useRef<LiveFix | null>(null);
  const prevStatusRef = useRef<RecorderStatus>("idle");
  useEffect(() => {
    // The fix sitting in state when recording starts or resumes arrived
    // BEFORE that moment — feeding it in would time-travel a paused-era
    // position into the new segment (and its old timestamp would then make
    // the next real fix look like a teleport). Mark it consumed and wait
    // for the watch to deliver a genuinely new one.
    const enteredRecording =
      prevStatusRef.current !== "recording" && status === "recording";
    prevStatusRef.current = status;
    if (status !== "recording" || !fix) {
      return;
    }
    if (enteredRecording || fix === lastConsumedRef.current) {
      lastConsumedRef.current = fix;
      return;
    }
    lastConsumedRef.current = fix;
    recorderRef.current.addFix(fix);
    bump();
    scheduleDraftWrite();
  }, [bump, fix, scheduleDraftWrite, status]);

  useEffect(() => {
    if (status !== "recording") {
      return;
    }
    const interval = window.setInterval(bump, 1_000);
    return () => window.clearInterval(interval);
  }, [bump, status]);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  // A component unmounting mid-session must not leave the screen pinned on,
  // or a queued draft write pointing at a recorder nobody can reach.
  useEffect(
    () => () => {
      releaseWakeLock();
      cancelDraftWrite();
    },
    [cancelDraftWrite, releaseWakeLock],
  );

  const start = useCallback(() => {
    if (recorderRef.current.status() !== "idle") {
      return;
    }
    recorderRef.current.start();
    const wakeLock = acquireScreenWakeLock();
    wakeLockRef.current = wakeLock;
    setWakeLockSupported(wakeLock.supported);
    draftErrorRef.current = null;
    setDraftError(null);
    setStatus("recording");
  }, []);

  const pause = useCallback(() => {
    recorderRef.current.pause();
    // Nothing will arm a write while paused, so the closed segment goes to
    // the device now rather than waiting for a resume that may never come.
    cancelDraftWrite();
    const draft = recorderRef.current.draft();
    if (draft && worthKeeping(draft)) {
      writeDraft(draft);
    }
    setStatus(recorderRef.current.status());
  }, [cancelDraftWrite, writeDraft]);

  const resume = useCallback(() => {
    recorderRef.current.resume();
    setStatus(recorderRef.current.status());
  }, []);

  const stop = useCallback((): StopResult | null => {
    cancelDraftWrite();
    const result = recorderRef.current.stop();
    releaseWakeLock();
    // Kept until the track is saved or discarded, so a refused save still has
    // the walk. Not written: the device's copy stays mid-walk, which is what
    // makes every recovered draft an honestly interrupted recording.
    if (result && worthKeeping(result)) {
      setUnsaved({ result, interrupted: false });
    }
    // A fresh recorder per session: stop() leaves the old one spent.
    recorderRef.current = createTrackRecorder();
    setStatus("idle");
    return result;
  }, [cancelDraftWrite, releaseWakeLock]);

  const clearUnsaved = useCallback(() => {
    cancelDraftWrite();
    setUnsaved(null);
    void draftStore.clear();
  }, [cancelDraftWrite, draftStore]);

  return {
    status,
    stats: recorderRef.current.stats(),
    liveSegments: recorderRef.current.liveSegments(),
    wakeLockSupported,
    unsaved,
    draftError,
    clearUnsaved,
    start,
    pause,
    resume,
    stop,
  };
}

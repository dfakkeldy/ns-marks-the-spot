import { useCallback, useEffect, useRef, useState } from "react";
import { acquireScreenWakeLock, type WakeLockHandle } from "./wakeLock";
import {
  createTrackRecorder,
  type RecorderStats,
  type RecorderStatus,
  type StopResult,
} from "./trackRecorder";
import type { LiveFix } from "./liveLocation";

export type TrackRecordingApi = {
  status: RecorderStatus;
  stats: RecorderStats;
  liveSegments: [number, number][][];
  /** null before the first session; false = show the keep-screen-on hint. */
  wakeLockSupported: boolean | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => StopResult | null;
};

/**
 * Wires live watch fixes into the recorder state machine and owns the wake
 * lock for the session. The recorder itself is pure; this hook only feeds it
 * and re-renders on a one-second tick so the HUD's elapsed time moves.
 */
export function useTrackRecording(fix: LiveFix | null): TrackRecordingApi {
  const recorderRef = useRef(createTrackRecorder());
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [wakeLockSupported, setWakeLockSupported] = useState<boolean | null>(null);
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
  }, [bump, fix, status]);

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

  // A component unmounting mid-session must not leave the screen pinned on.
  useEffect(() => releaseWakeLock, [releaseWakeLock]);

  const start = useCallback(() => {
    if (recorderRef.current.status() !== "idle") {
      return;
    }
    recorderRef.current.start();
    const wakeLock = acquireScreenWakeLock();
    wakeLockRef.current = wakeLock;
    setWakeLockSupported(wakeLock.supported);
    setStatus("recording");
  }, []);

  const pause = useCallback(() => {
    recorderRef.current.pause();
    setStatus(recorderRef.current.status());
  }, []);

  const resume = useCallback(() => {
    recorderRef.current.resume();
    setStatus(recorderRef.current.status());
  }, []);

  const stop = useCallback((): StopResult | null => {
    const result = recorderRef.current.stop();
    releaseWakeLock();
    // A fresh recorder per session: stop() leaves the old one spent.
    recorderRef.current = createTrackRecorder();
    setStatus("idle");
    return result;
  }, [releaseWakeLock]);

  return {
    status,
    stats: recorderRef.current.stats(),
    liveSegments: recorderRef.current.liveSegments(),
    wakeLockSupported,
    start,
    pause,
    resume,
    stop,
  };
}

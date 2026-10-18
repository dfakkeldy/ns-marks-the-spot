import { useEffect, useState } from "react";
import {
  RECORDING_WATCH_OPTIONS,
  startLiveLocation,
  type LiveFix,
  type LiveLocationSnapshot,
} from "./liveLocation";

export type LiveLocationState =
  | LiveLocationSnapshot
  | { status: "off"; fix: null };

const OFF: LiveLocationState = { status: "off", fix: null };

/**
 * React face of the shared watch. One instance per map: the marker, the
 * follow mode, Mark, and the track recorder all read this state, so exactly
 * one watchPosition runs no matter how many consumers care. Toggling
 * `recording` restarts the watch with maximumAge 0 (the field-capture
 * contract: a recorded track never contains cached fixes).
 */
export function useLiveLocation(
  enabled: boolean,
  recording = false,
): LiveLocationState {
  const [state, setState] = useState<LiveLocationState>(OFF);

  useEffect(() => {
    if (!enabled) {
      setState(OFF);
      return;
    }
    const handle = startLiveLocation(
      setState,
      undefined,
      recording ? RECORDING_WATCH_OPTIONS : undefined,
      // A recording watch never gives up on its own: the walk has no other
      // source of fixes, and cutting it off would end the track rather than
      // report a device that is struggling.
      !recording,
    );
    return () => {
      handle.stop();
      setState(OFF);
    };
  }, [enabled, recording]);

  return state;
}

export type { LiveFix };

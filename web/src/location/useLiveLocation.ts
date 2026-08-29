import { useEffect, useState } from "react";
import {
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
 * follow mode, and Mark all read this state, so exactly one watchPosition
 * runs no matter how many consumers care.
 */
export function useLiveLocation(enabled: boolean): LiveLocationState {
  const [state, setState] = useState<LiveLocationState>(OFF);

  useEffect(() => {
    if (!enabled) {
      setState(OFF);
      return;
    }
    const handle = startLiveLocation(setState);
    return () => {
      handle.stop();
      setState(OFF);
    };
  }, [enabled]);

  return state;
}

export type { LiveFix };

import { useEffect, useState } from "react";

/**
 * A warning, held back until it has lasted, and dropped the moment it ends.
 *
 * Only the arrival waits. A state that has ENDED — the walk paused, the fixes
 * accepted again — is not a state to keep announcing for another four seconds:
 * that would read a present-tense claim that positions are still being
 * rejected over the top of "Paused", which is two states at once and one of
 * them untrue.
 */
export function useSettledWarning(note: string | null, delayMs: number): string | null {
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    if (note === null) {
      setSettled(null);
      return;
    }
    if (note === settled) {
      return;
    }
    const timer = setTimeout(() => setSettled(note), delayMs);
    return () => clearTimeout(timer);
  }, [note, settled, delayMs]);
  return settled;
}

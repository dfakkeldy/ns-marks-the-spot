/**
 * The system's own answer about motion, for the map moves the app issues.
 *
 * The setting is read on each call rather than held in state behind a change
 * listener. Each move is a single one-shot decision, so the only moment the
 * answer matters is the instant a move is issued, and reading it there stays
 * correct when the reader changes the system setting with the page already
 * open — which a value captured at mount would not, since the map outlives
 * every one of these moves. A listener would add a subscription and a
 * re-render in each map controller to reach the answer this read already
 * gives.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

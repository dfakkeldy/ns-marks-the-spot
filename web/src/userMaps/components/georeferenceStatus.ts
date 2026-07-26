import type { GeoreferenceStatus } from "../useGeoreferenceSession";

export function statusMessage(status: GeoreferenceStatus): string {
  switch (status.kind) {
    case "awaiting-map":
      return "Now click the same spot on the map. (Esc to cancel)";
    case "awaiting-scan":
      return "Now click the same spot on the scan. (Esc to cancel)";
    case "need-more":
      return status.remaining === 3
        ? "Place 3 points to see the map drape."
        : `Place ${status.remaining} more point${
            status.remaining === 1 ? "" : "s"
          } to see the map drape.`;
    case "degenerate":
      // Names BOTH sides on purpose. Every refusal shared by both solvers
      // arrives here, and most of them are not a straight line on the scan:
      // a non-finite result, and a solved transform squashing one axis past
      // 50:1 — which is what three map clicks down a meridian produce from an
      // ideal scan triangle. Two coincident TPS control points is a DIFFERENT
      // refusal with an actionable remedy ("delete the duplicate"), so it has
      // its own case below instead of this generic, unactionable message.
      return (
        "These points can't pin the map down — check that neither the scan " +
        "points nor the map points sit on a straight line."
      );
    case "coincident-points":
      // Copy is the maintainer's call (Task 4): specific and actionable,
      // unlike `degenerate`'s message, because unlike every other refusal
      // routed there, this one has a concrete fix.
      return "Two points are on the same spot — move or delete one.";
    case "exact-fit":
      // Three points fit an affine exactly by construction, so every residual
      // is 0. Printing "0 m" would read as perfect accuracy.
      return "Exact fit — add a 4th point to check accuracy.";
    case "solved":
      return `RMS ${Math.round(status.rmsMetres)} m across ${status.count} points`;
  }
}

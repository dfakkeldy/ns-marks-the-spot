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
    case "too-many-points":
      // Copy is the maintainer's call (Task 7b), proposed for review. Two
      // things it must do: NOT read as "add a 4th point", which is what this
      // state used to say at 51 control points, and NOT read as a failure —
      // past MAX_GCPS_FOR_TPS_RESIDUALS only the accuracy CHECK is off, and
      // the drape is exactly as good as it was at 50. Hence the second clause;
      // there is no action for the user to take.
      return "Too many points to check accuracy — the map still draws.";
    case "refit-refused":
      // Copy is the maintainer's call (Task 7b round 2), proposed for review.
      // Three jobs: name the problem, name the remedy (spread them out — this
      // one IS actionable, unlike `too-many-points`), and say the map still
      // draws, because it does and `degenerate`'s "can't pin the map down"
      // would be contradicted by what the user is looking at. Deliberately
      // does not say WHICH side is thin: the refusing subset can be
      // ill-conditioned on the scan or on the map, exactly as `degenerate`
      // names both.
      return (
        "Can't check accuracy — these points sit too close to a straight " +
        "line. Spread them out; the map still draws."
      );
    case "solved":
      return `RMS ${Math.round(status.rmsMetres)} m across ${status.count} points`;
  }
}

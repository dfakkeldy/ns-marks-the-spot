# Evidence review repair — 12 September 2026

PR #435 at `10670c4a7e2a73bf5df0a4dee8b0935d366bed03` failed verification in an isolated checkout because repository paths in the original receipt refer to another worktree. Original verifier SHA-256: `20f0ac322fe1d6949c84f212c574d187c02e7b496fe00d95da3084c7bf4fb901`.

The verifier now resolves repository paths under the specifically recorded `/Users/dfakkeldy/.codex/worktrees/8d5b/ns-marks-the-spot` root against the current checkout. External native/reference/raster paths remain exact. Every receipt hash remains enforced, and parent-input comparisons use the recorded commit on nightly history. No frozen receipt, coordinate, control/check role, score, rejection or image changed.

The repaired packet verifier passes in the isolated checkout. Recorded scores were independently replayed within 0.00001 m. This is an evidence portability repair; geographic rejection and baseline recommendations remain unchanged.

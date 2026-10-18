# Evidence review repair — 12 September 2026

PR #431 at `d13928df565b5c0d534e6e5642375505dc354846` failed verification in an isolated checkout because repository paths in the original receipt refer to another worktree. Original verifier SHA-256: `3a52f5c3a395f0e2dc4ce8b852992ae6bf1c44c3b1f6ad2a8cdca5b72dd3706a`.

The verifier now resolves repository paths under the specifically recorded `/Users/dfakkeldy/.codex/worktrees/8d5b/ns-marks-the-spot` root against the current checkout. External native/reference/raster paths remain exact. Every receipt hash remains enforced, and parent-input comparisons use the recorded commit on nightly history. No frozen receipt, coordinate, control/check role, score, rejection or image changed.

The repaired packet verifier passes in the isolated checkout. Recorded scores were independently replayed within 0.00001 m. This is an evidence portability repair; geographic rejection and baseline recommendations remain unchanged.

# Evidence review repair — 12 September 2026

PR #430 at `b066fd270d24351bfb0d40537f49afd86296d0c9` failed verification in an isolated checkout because repository paths in the original receipt refer to another worktree. Original verifier SHA-256: `d0fd5511f9a7172cc9ef072074f2615b882b7a5f5dbe852f269711a220edf91e`.

The verifier now resolves repository paths under the specifically recorded `/Users/dfakkeldy/.codex/worktrees/8d5b/ns-marks-the-spot` root against the current checkout. External native/reference/raster paths remain exact. Every receipt hash remains enforced, and parent-input comparisons use the recorded commit on nightly history. No frozen receipt, coordinate, control/check role, score, rejection or image changed.

The repaired packet verifier passes in the isolated checkout. Recorded scores were independently replayed within 0.00001 m. This is an evidence portability repair; geographic rejection and baseline recommendations remain unchanged.

# Evidence review repair — 12 September 2026

PR #434 at `402e8e5b057a1ed9ca8c84ba36ca925fc18ce885` failed verification in an isolated checkout because repository paths in the original receipt refer to another worktree. Original verifier SHA-256: `3a1e97d93e2a4b736d6540a030dfcf8ca49e76e5dfa5cb380ef00679c7ec7d87`.

The verifier now resolves repository paths under the specifically recorded `/Users/dfakkeldy/.codex/worktrees/8d5b/ns-marks-the-spot` root against the current checkout. External native/reference/raster paths remain exact. Every receipt hash remains enforced, and parent-input comparisons use the recorded commit on nightly history. No frozen receipt, coordinate, control/check role, score, rejection or image changed.

The repaired packet verifier passes in the isolated checkout. Recorded scores were independently replayed within 0.00001 m. This is an evidence portability repair; geographic rejection and baseline recommendations remain unchanged.

# Evidence review repair — 12 September 2026

PR #437 at `e156614e19c4538929bbbe4e50b49f5a874aa4ae` failed verification in an isolated checkout because repository paths in the original receipt refer to another worktree. Original verifier SHA-256: `5e59a08dcb8ff607b513429402c8786d2e8db3311ccbe8b3d398a8efdb977a08`.

The verifier now resolves repository paths under the specifically recorded `/Users/dfakkeldy/.codex/worktrees/8d5b/ns-marks-the-spot` root against the current checkout. External native/reference/raster paths remain exact. Every receipt hash remains enforced, and parent-input comparisons use the recorded commit on nightly history. No frozen receipt, coordinate, control/check role, score, rejection or image changed.

The repaired packet verifier passes in the isolated checkout. Recorded scores were independently replayed within 0.00001 m. This is an evidence portability repair; geographic rejection and baseline recommendations remain unchanged.

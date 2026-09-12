# Evidence review repair — 12 September 2026

PR #433 at `3b97be0446a423da81dc6d330800004ca8e0adb2` failed verification in an isolated checkout because repository paths in the original receipt refer to another worktree. Original verifier SHA-256: `aabc5b3dffd55cd013dbdd6aed65f5959c764cf65a8d425588f91559bdb6e5f7`.

The verifier now resolves repository paths under the specifically recorded `/Users/dfakkeldy/.codex/worktrees/8d5b/ns-marks-the-spot` root against the current checkout. External native/reference/raster paths remain exact. Every receipt hash remains enforced, and parent-input comparisons use the recorded commit on nightly history. No frozen receipt, coordinate, control/check role, score, rejection or image changed.

The repaired packet verifier passes in the isolated checkout. Recorded scores were independently replayed within 0.00001 m. This is an evidence portability repair; geographic rejection and baseline recommendations remain unchanged.

# Evidence review repair — 12 September 2026

PR #427 at `26a38f10cb5d4a627be2a724b90245b75d0c11c1` passed only while its original worktree remained available. The absolute-path parent comparison skipped the intended Git input checks in an isolated checkout. The same dependency caused missing-file failures in later packets. Original verifier SHA-256: `39bcb68276dbfc74f3dfb5b7735cfa91423c571c425759514edc8e9d1ae10569`.

The verifier now resolves repository paths under the specifically recorded `/Users/dfakkeldy/.codex/worktrees/8d5b/ns-marks-the-spot` root against the current checkout. External native/reference/raster paths remain exact. Every receipt hash remains enforced, and parent-input comparisons use the recorded commit on nightly history. No frozen receipt, coordinate, control/check role, score, rejection or image changed.

The repaired packet verifier passes in the isolated checkout. Recorded scores were independently replayed within 0.00001 m. This is an evidence portability repair; geographic rejection and baseline recommendations remain unchanged.

# Evidence review repair — 12 September 2026

PR #440 at `c86cb7e0e05da1707a4d8401a7233ac7a0cb5d65` passed only while the original worktree remained available. Its absolute-path parent comparison skipped the intended Git input checks from this isolated checkout. The same dependency caused missing-file failures in earlier packets. Original verifier SHA-256: `7e43a828fd2f20229d0dda37e89422a081628a45bbebf48e362eaf29e6634a46`.

The verifier now resolves repository paths under the specifically recorded `/Users/dfakkeldy/.codex/worktrees/8d5b/ns-marks-the-spot` root against the current checkout. External native/reference/raster paths remain exact. Every receipt hash remains enforced, and parent-input comparisons use the recorded commit on nightly history. No frozen receipt, coordinate, control/check role, score, rejection or image changed.

The repaired packet verifier passes in the isolated checkout. Recorded scores were independently replayed within 0.00001 m. This is an evidence portability repair; geographic rejection and baseline recommendations remain unchanged.

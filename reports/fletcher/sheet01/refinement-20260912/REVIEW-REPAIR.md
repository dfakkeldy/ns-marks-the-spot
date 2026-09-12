# Evidence review repair — 12 September 2026

Review of PR #429 at `cefb79606f788260bfe2a4b7d692011602520b71` reproduced a `FileNotFoundError` for the recorded worktree's refinement `reviewed-fit.json`. The verifier depended on the original checkout rather than the packet being reviewed. Original verifier SHA-256: `ee9a170992402b240c74911cf5b9e1bd3e9c109a0d7c255c18dfae84970b9f96`.

The verifier now maps repository paths under the specifically recorded `8d5b/ns-marks-the-spot` root to the current repository. External native/reference/raster paths remain unchanged and every recorded hash is still enforced. This also makes the existing parent-input `git show` comparisons execute in an isolated checkout. Frozen receipts, controls, checks, chronology, rejections, scores and figures remain byte-identical.

Validation: the repaired packet verifier passes from the isolated review checkout; all three recorded score sets replay within 0.00001 m. This repairs evidence portability only. Geographic acceptance remains false and the coastal check remains one correlated locality.

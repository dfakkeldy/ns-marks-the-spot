# Task log: coastal flood raster sampling performance

## 2026-08-27 — fix implemented, package tests green

Done: `PolygonRasterScan` (GeoCore) row-scans ring crossings once per row;
`summarizeRasterAlpha` uses it, checks `Task.isCancelled` per row, and throws
`CancellationError`; fetcher maps that to `.cancelled`;
`containment(_:multiPolygon:)` drops its per-call allocation. 1147 package
tests pass. Bench (4000-vertex ring, 384×384): 190 s → 0.23 s per scenario
debug, 1.55 s → 3.2 ms release.
Next: push `feature/coastal-raster-row-scan`, open PR to `nightly`.
Resume:

```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/elegant-elion-ad23d6,
branch feature/coastal-raster-row-scan. Work is committed; push and open a PR
to nightly if not already open.
```

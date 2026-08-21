# HANDOFF — GeoPDF control-point guard

## 2026-08-20 — guard landed on both surfaces

Done: `Measure` registrations whose `LPTS` were written in page units are now
refused on both surfaces. The check is on where control points land — every one
must sit within the rendered raster grown by half its own width and height —
not on `LPTS` itself, because the rotated USGS quadrangle really does leave the
unit square. Measured: that quadrangle overshoots the raster by 1.6%, a
page-unit file by ~9,900%. Web `validateCandidate` and Swift `validate` both
take the viewport now. Both regression directions are pinned by tests on both
sides. Web: 1386 vitest pass (`scripts/exportSharedData.test.mjs` fails on this
branch already — missing from vite.config's exclude list, unrelated).
NSMarksCore: 986 pass.

Next: decide where this lands. The branch is `claude/ios-web-map-parity-2de228`
plus one commit, because that is the only ref carrying both files —
`NSMarksCore` is not on `nightly`, and this branch's copy of
`geoPdfMetadata.ts` is 30 lines behind `nightly` (PR 217's LGIDict fix). A PR
straight to `nightly` would drag 37 parity commits along and undo 217.

Resume:

```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/elegant-elion-ad23d6,
branch claude/elegant-elion-ad23d6 (= claude/ios-web-map-parity-2de228 + 1).
Next action: fold the control-point guard commit into the iOS-port branch, or
open it as a PR based on claude/ios-web-map-parity-2de228 — not on nightly.
```

# Fletcher neat-line cropping

## 2026-08-31 — Phases 1-4 done through catalogs; package not yet built

Done: half the sheets shipped in `20260828.1` with their paper collars tiled in,
overpainting neighbours. Detected neat-line frames for all 24 (pair-constrained
Hough + 3% skin exclusion; validated against 16 undisputed sheets, median edge
shift 0.21pt). Sheet 12's bottom placed by the owner at row 6300 — the engraved
geology overruns the neat line there, so content below the rule is print spill
and is accepted as lost. Added `-cutline`/`-crop_to_cutline` support to
`tools/fletcher/georeference.py` (+7 tests). Re-warped 12 sheets into
`dan@bazzite:~/nsmarks-crop-20260831/` (retained 56.8-59.5%, all extents inside
their originals) and re-tiled into fresh trees (96,600 -> 56,891 tiles).
Recomputed bounds from the z16 tile trees — derivation verified to reproduce a
known catalog value exactly — and updated `fletcherLayer.ts`,
`FletcherSheets.swift`, the parity fixture, and `EXPECTED_TILE_COUNT` (108,701).
Web: 1,794 tests, lint, build all green. Native is CI-verified only (slot policy).

Next: build the package from the assembled root, upload, verify, then delete the
old revision from R2 (owner-approved, AFTER the new one verifies).

Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch:   claude/fletcher-maps-web-unavailable-2b6951
Host:     dan@100.95.69.48 (MagicDNS name `bazzite` stopped resolving; container
          `nsmarks-gis` stops on its own — `podman start` it before long runs)
Next:     python3 -m tools.fletcher.package_web_tiles \
            ~/nsmarks-crop-20260831/package-root <out> \
            --revision fletcher-direct-rumsey-20260831.1 --source-commit <sha>
          then ~/publish-fletcher-tiles.sh with the revision parameterised.
```

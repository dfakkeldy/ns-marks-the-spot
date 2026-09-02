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

## 2026-09-01 — Package built and verified; awaiting upload

Done: assembled a package root mixing the 12 re-cropped trees with the 12
untouched ones and wrote a manifest describing THAT package (the packager
rightly refused a borrowed July manifest, twice — once on `tile_path`, once on
sheet 17's missing `gcp_path`). Built
`fletcher-direct-rumsey-20260831.1`: 108,701 objects, 7,203,490,882 bytes,
source commit 2054f43a3. Made it host-readable (the container writes it root
owned). Rewrote `~/publish-fletcher-tiles.sh` to take REVISION and PACKAGE_ROOT
as arguments and to refuse when the receipt's revision disagrees.

Next: owner supplies R2 credentials and runs the publish script (~6.7 GiB,
roughly 80 min at observed throughput). Then flip the deploy pin, and only after
the new revision verifies, delete `fletcher-direct-rumsey-20260828.1` from R2
(owner-approved 2026-08-31; sequenced last so the live map never goes dark).

Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch:   claude/fletcher-maps-web-unavailable-2b6951 (commit 2054f43a3)
Host:     dan@100.95.69.48  (MagicDNS `bazzite` stopped resolving)
Next:     ssh dan@100.95.69.48, export R2_ACCOUNT_ID / AWS_ACCESS_KEY_ID /
          AWS_SECRET_ACCESS_KEY, then:
          nohup ~/publish-fletcher-tiles.sh > ~/fletcher-publish-0831.out 2>&1 &
```

## 2026-09-01 — Tiles published; PR open; CI fix pushed

Done: uploaded and verified `fletcher-direct-rumsey-20260831.1` — 108,703
objects / 7,203,505,343 bytes, exact match on count and bytes, `source.json` and
a re-cropped sheet-18 tile both 200 through the public host, CORS applied.
Opened PR #291 into `nightly`. CI caught two real consequences of the crop that
no local gate did, both now fixed in d8dcc55f2: the offline sample area started
4.7km south of cropped sheet 12 (a "download of nothing" bug, moved to
46.095-46.195, exact count 101 -> 86), and `maximumSavedAreaTileCount` (100,000)
is now unreachable because the whole survey at z10-16 fell from 107,961 to
~94,600 tiles — asserted as a fact rather than papered over.

Next: merge #291 once green, let the hourly promotion build the deploy PR, merge
that, verify the live map, then delete the old revision from R2.

Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch:   claude/fletcher-maps-web-unavailable-2b6951 (PR #291 -> nightly)
Host:     dan@100.95.69.48  (MagicDNS `bazzite` stopped resolving)
Next:     After #291 merges, watch KinNoKiLabsSite for the automation deploy PR
          (hourly at :23), merge it, then load
          https://kinnokilabs.com/apps/nsmarksthespot/map/?taxSale=off&mode=current&layers=modern,fletcher&position=45.87,-61.15,13
          and confirm sheet collars are gone. Only then delete the old revision.
```

# Sheet 3 — recovered nine- and ten-control experiments, geographic acceptance blocked

Both whole-sheet experiments remain **unaccepted and unsuitable as a production replacement**. The ten-control trial improves Otter Brook locally, but its upstream check is 281.17 ground metres. A 38.40 m Chain Lake score has an uncertain historical shoreline definition and must not be treated as secure validation. Northern coast, inland tributaries, North Pond, Aspy valley and adjacent-sheet continuity remain unresolved.

This packet preserves an unfinished earlier setup fork byte-for-byte (111 files in `recovered-packet.json`). The continuation personally inspected its native proposals, corrected crosshairs, broad modern context, actual warped rasters and seams, then added eight exact-coordinate review figures, fresh technical audits and delivery documentation. This is **post-score reinspection of historical experiments**, not newly collected fresh validation. Immutable creation-time phrases such as “awaiting inspection” in recovered JSON describe the original record state; current findings are in `post-score-identity-audit.json` and `visual-review-audit.json`. The source worktree was left unchanged.

## Experiments and retained failures

The seven original controls are unchanged in `fit-nine.json`. R10 adds the long northern North Pond island's northern tip, corrected from [9172,2510] to [9187,2507]. R13 adds the westernmost Chain Lake outlet, corrected from [7700,5675] to [7707,5677]. Original proposals and corrections remain available. R11 (Blair) and R12 (South Branch/Polletts) remain rejected without scores because branch hierarchy is not securely equivalent.

| Trial | Checks retained | Raw median / worst ground m | Geographic result |
| --- | --- | --- | --- |
| Nine controls | U01 Otter mouth 839.55; U02 eastern Chain Lake 147.22; U03 island southern tip 216.89 | 216.89 / 839.55 | Failed; U02 lake-group and U03 same-island correlation explicit |
| Ten controls | U04 Otter first eastern tributary 281.17; U06 Chain Lake northern shore 38.40 | 159.78 / 281.17 | Failed; U06 precise extremity is uncertain |

After the first failure, U01 became R14 without moving either pixel or world coordinate; the 839.55 m failure remains in `validation-scores.json`. The recovered freeze timestamps precede their respective check-selection timestamps. U04's old seven-control error was 647.59 m. U06's old 1028.12 m comparison is retained as arithmetic evidence only: the modern selected point lies on a narrow northern protrusion/small shoreline loop not securely represented by the generalized historical rounded shore. No coordinate was adjusted during this post-score audit. U05 MacKenzie mouth remains rejected without a score because the proposed point was on land and the modern centreline and historical banks are not equivalent.

U02/U03 are diagnostic in the ten-control trial. The old Q01/Q02/V01/V02 checks are diagnostic in both trials. Nearby checks do not provide independent whole-sheet coverage. Acceptance limits remain median ≤100 m, worst ≤200 m plus geographic review across the complete sheet; neither trial passes.

## Source, boundary and artifacts

Source: David Rumsey Historical Map Collection, *Province of Nova Scotia (Island of Cape Breton). Sheet no. 3*, `RUMSEY~8~1~2628~280042`. Original unrotated PNG is 10668 × 7613, SHA-256 `1dd5a8cc142b452fc594b6ab53d0eb94de24e1435fed25da61d8f3cf03a9a413`. Parent source receipt records native IIIF-region parity. The manifest has no licence field; the collection's CC BY-NC-SA 3.0 notice and attribution remain applicable as recorded in the parent packet. This report grants no relicensing or deployment clearance.

Frozen baseline inputs come from nightly-history commit `98a34ae2ab2bdec0846a475fc63985d45436a6bf`; see `baseline.json`. NSTDB reference data were retrieved September 11, 2026, in EPSG:4326 longitude/latitude: 6225 water lines, 2504 water polygons, 844 roads, rail returned-empty. Complete source geometry and exact vertices/shared endpoints were checked in `modern-geometry-audit.json`. NRCan Chain Lakes CAGRY identifies locality only. The printed graticule guide and searchable node index are discovery aids, never fitted world coordinates.

Both exact GDAL TPS rasters use EPSG:3857, 5 projected metre cells and the unchanged complete boundary (`3956eff0f13aba1316eed2e8df40d36fb3429138e4e356f3a1a7be10739a547b`). Western sea/legend, North Pond islands/offshore rocks, and the southwestern Fishing Cove/White Capes extension and labels remain included. The boundary is not a control hull or corridor.

External artifacts remain outside Git under `/Users/dfakkeldy/Downloads/fletcher-sheet03/refinement-20260912/`:

| Trial | Relative raster path | Size | SHA-256 |
| --- | --- | --- | --- |
| Nine | `result-nine/sheet-03-full-sheet.tif` | 9803 × 6121 | `25de65fd6844b73eceb8035faca4808f3c5514491400f90e8d6095091c4fb39a` |
| Ten | `result-ten/sheet-03-full-sheet.tif` | 9793 × 6091 | `9a8857e158f231e30dfd742b231d2b7691040e93ff284e5e00fbad31b5b2af9c` |

Fit hashes are `814f03953ecf5bbc10d94842e2dd6aec241248be9ebdff94057ffc9813ef6159` (nine) and `4f096b8ccf363047e5c1bbb523cf3c5b07d0b8bcb5f460637e49ccf5b6301b04` (ten). Each external result directory retains the mapped neatline and render receipt. `join-provenance-audit.json` hashes the actual neighboring baseline rasters: Sheet 1 eight controls, Sheet 2 nine, Sheet 5 eleven, Sheet 6 ten. These are provisional comparisons, not accepted seams or the newer Sheet 5 experiment.

## Verification and use

All 71 packet figures were personally viewed: 37 native/modern crosshair figures, 16 actual raster views, 12 seam figures and six actual browser captures. Full alpha audits find zero transparent interior cells among 50,013,553 (nine) and 49,665,679 (ten), allowing one output-cell boundary tolerance. Both sampled orientation checks have 73,201 negative determinants and no nonnegative samples; this is not a continuous no-fold proof.

The actual web CSV parser and TPS implementation accept the six explicit `sheet-03-nine-*` / `sheet-03-ten-*` files with separated controls, diagnostic review and historical validation review. Semantic round trips pass, with maximum web/GDAL differences below 7.3e-9 projected metres. Original four CSVs are preserved unchanged. Review CSVs never become fitting inputs automatically; U06 remains uncertain despite its unchanged historical row.

The actual My Maps importer was exercised in isolated Playwright desktop/mobile sessions against the local web app. Both full GeoTIFFs render, retain original byte hashes in IndexedDB, and survive reload with enabled state. Browser previews are reduced to 4096 pixels wide; full original bytes remain stored. Both browser error logs are empty. This establishes local technical behavior, not alignment acceptance, hosted CI, merge or deployment.

Run `python3 reports/fletcher/sheet03/refinement-20260912/verify_packet.py` from the repository root to verify receipts, preserved files, geometry, chronological records, control/check isolation, coverage, browser persistence and figure hashes. Technical reruns use `verify_import_audit.ts`, `verify-browser-audit.mjs` and the shared full-sheet renderer/scorer. Original scripts and their original absolute paths are retained as evidence; use the audit browser wrapper on local port 4199. Recovered fit/check files must not be overwritten during a new experiment.

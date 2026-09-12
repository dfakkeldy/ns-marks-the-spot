# Sheet 17 refinement — 12 September 2026

Retain the previous ten-control provisional fit. The eleven-control experiment repairs the Middle Loch Lomond eastern tributary mouth, but a fresh middle-lake island check worsens from 272.828 m to 306.400 m. Neither fit is accepted for the whole sheet. Draft only; no merge or deployment.

The unchanged V03 native pixel `(7798,5697)` and direct NSTDB node J0611 become C16 after personal unrotated close/wide review. Its earlier 162.352702 m failure remains in the parent validation record. All ten existing control records are identical. Bruce Brook barrier gap V05 is excluded from repair after review: contemporary barrier and lagoon morphology do not establish a stable point. Its original 630.289956 m score is preserved, not erased or explained away numerically.

The fit was frozen before selecting new checks. F01 uses the northern extent of a distinct middle-lake island, complete closed NSTDB line 153876, vertex 6. Initial native proposal `(7241,5336)` misread the overview grid and fell on land. The first correction `(7498,5340)` lay just offshore; final `(7506,5347)` lies on the broad northern shore. Every version and exact close/wide frame is preserved. The final native and modern frames were personally inspected before the first score. The modern northern shore is more indented than the historical shape; retain that uncertainty. The point is distinct from older island checks but shares the controlled Loch Lomond system, so it is not independent whole-interior evidence.

F02 remains rejected and unscored: J0607 is an inland pond outlet, not the claimed southern lake connection, and the native proposal falls on land. Earlier rejected C03/C04/C12/C13, Q02, V02 and V04 remain excluded. No failed point was moved after scoring, and no additional control was added after the freeze.

Four reused diagnostics have median 48.944 m and worst 121.479 m; they are not fresh validation. Fresh F01 fails both the 100 m median and 200 m worst-error targets. It was replayed against the old fit only after its selection and review.

The entire mapped inner ring is retained, including open lake, islands, shoreline, terrain and internal labels. The whole scan and four corners were personally inspected; no mapped extension was identified. The external marginal legend remains in the original source. Nine actual warped old/new/standalone regions show remaining displacement at Lochmore, Bruce/Gaspereau, western lake arms, southeast lakes and headwaters. Source-labelled unexplored areas cannot supply invented drainage controls.

Five adjacent-raster comparisons use verified geographic bounds and raster hashes. Sheet 15 is a northwest corner only. Sheet 18's western intervals are predominantly open water and offer no shared stable seam features. Sheet 20's southern windows show gaps and displaced mainland/drainage. Full northern/eastern seam acceptance remains unsupported. Adjacent rasters are themselves provisional.

Source: David Rumsey Historical Map Collection, `RUMSEY~8~1~2642~290010`, 10873 × 7642 pixels. Keep the parent source/reference receipts and collection/Stanford CC BY-NC-SA 3.0 terms; manifest licence remains null. This report grants no deployment clearance or repository relicensing. The archived axis-only graticule observations have a different source hash and are used only as an approximate search guide, never as physical controls.

## Artifacts and verification

- `reviewed-fit.json`, `frozen-fit.json`, and `reviewed-additions.json` preserve the repair and chronology.
- Three editable `sheet-17-*.csv` files deliver 11 controls, 4 reused diagnostics and 1 fresh check. The review CSVs include controls plus their respective check set.
- Original source: `/Users/dfakkeldy/Downloads/fletcher-sheet17/native/sheet17.png`, SHA-256 `a8a3f35cbf6addc45abc8cb2934ddea9a6eec4edc8346efc6de783d35355cd7e`.
- Experimental fit SHA-256: `b41485f0d4b2f691786655eba5815816ed571be49f08c38b83c194dcac6e78c1`.
- Experimental TIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet17/refinement-20260912/sheet-17-full-sheet.tif`, 8610 × 5906, SHA-256 `0f0b675861a12ca5e29b597a431e957fbe2da9b5c151f55ef1f3bb4caa1d391e`.
- Preferred prior provisional TIFF: `/Users/dfakkeldy/Downloads/fletcher-sheet17/regional-ten/sheet-17-full-sheet.tif`, SHA-256 `4e8c2f78df96806aea71da7851220ca2ad44e84a2612604cb1237cb3efc54b5b`.
- Exact GDAL TPS (`-et 0`), EPSG:3857, 5 projected-metre RGBA pixels. All 47,829,147 interior cells covered; zero sampled folds among 71,795 samples.
- Actual web CSV parser round-trip and web/GDAL TPS agreement pass (maximum difference 6.52e-9 projected m). Actual desktop import, desktop reload and mobile reload preserve raster bytes and enabled state; console errors empty. All three browser screenshots personally inspected.
- `verify_packet.py` passes source/fit/reference/neighbour hashes, nightly ancestry, unchanged controls, freeze chronology, exact point frames, direct modern coordinates, parser, coverage, browser persistence and all 31 personally viewed figures. This is technical verification, not geographic acceptance.

Frozen parent inputs are pinned to nightly-history commit `c32c85e917aa8746fa0b98f928f76a366127b7ee`, not a transient PR head. Source and large rasters stay outside Git. No native app or web product source changed; hosted CI is reported separately in the PR.

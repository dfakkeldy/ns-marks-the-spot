# Phase A final-review fix report

Date: 2026-07-26

Branch: `claude/fletcher-maps-georeferencing-a3f272`

Implementation commit:
`be288e65e22572abe976c429231aee928a684244` -
`fix(fletcher): close final-review gaps in feature-led v2 tooling`

Parent (pre-fix) commit:
`1af38106367b2663e1b6e609176dd5fd8ea854ca` -
`test(fletcher): cover marker mismatch and receipt aggregation`

Source findings: four Important + one Minor from a whole-branch review of
Phase A of the feature-led v2 georeferencing tooling.

## Status

All four Important findings and the one Minor finding are implemented, each
with focused regression coverage written and shown RED before the fix, then
GREEN after. Both full-suite discovers (`tools/fletcher`, `tools/church`) are
green with no new failures. No branch was pushed and no pull request was
opened (not requested).

## Fix receipt

| Finding | File(s) | Fix | Test evidence |
|---|---|---|---|
| 1. `feature_qa` had no CLI | `tools/fletcher/feature_qa.py` | Added an argparse CLI with `crops`/`overlays` subcommands and `main(argv=None) -> int`, following the sibling pattern in `feature_georeference.py`/`feature_report.py`. `crops` reads a points JSON, computes a clamped `crop_window` per entry from caller-supplied `--width`/`--height` (never invokes `gdalinfo`), shifts each polyline into crop-local coordinates, and calls `render_scan_crop`. `overlays` reads a centers JSON, builds a `(mx-h, my+h, mx+h, my-h)` projwin per entry, and calls `render_overlay`. Unknown/missing subcommand raises via argparse (`SystemExit`, nonzero code) instead of the previous silent exit-0 no-op. | `tools/fletcher/tests/test_feature_qa.py::CliTests` (5 new tests): unknown subcommand exits nonzero, missing subcommand exits nonzero, `crops` (via `mock.patch` on the module-level `render_scan_crop`) receives the exact clamped window and crop-local-shifted polylines, `overlays` (via `mock.patch` on `render_overlay`) receives the exact projwin and forwarded polylines, and `--size` defaults to 1400. |
| 2. `fit()`'s warp lacked `-dstalpha` | `tools/fletcher/feature_georeference.py` | Added `_ensure_dstalpha(command)`, which splices `-dstalpha` in immediately before the warp's `[source, output]` tail unless already present (idempotent). `fit()` now calls `_ensure_dstalpha(warp_command(...))` before recording/running it, so `fit.json` records the exact augmented command and every fit warp gets a real alpha band instead of tiling empty corners as opaque black. | `test_feature_georeference.py::FitTests::test_fit_invokes_translate_then_warp_and_writes_receipt` extended to assert `-dstalpha` is present and sits immediately before the `controls.vrt` source path in the recorded warp command. |
| 3. Privacy guard gaps in `feature_observation` | `tools/fletcher/feature_observation.py` | (a) `_scan_private`'s dict branch now also matches each string **key** against `_PRIVATE_VALUE` (previously only value strings and a fixed forbidden-key-name set were checked, so `{"regions": {"pid-50319672-...": ...}}` passed). (b) Regex changed from `r"pid[-_]?\d{5,}"` to `r"(?<![a-z])pid[-_ ]?\d{5,}"` with `re.IGNORECASE`: adds space as a separator and case-insensitivity (catches `"PID-50319672"`, `"pid 50319672"`), and adds a negative lookbehind so a preceding letter (e.g. the "ra" in "ra**pid**") blocks the match, keeping `"rapid 50319 descent"` a false-positive-free pass. A comment documents the lookbehind's purpose. | `test_feature_observation.py::ValidateTests` (4 new tests): region-label key with pid-digits rejected, uppercase `"PID-50319672"` value rejected, space-separated `"pid 50319672"` value rejected, `"rapid 50319 descent"` accepted (no raise). |
| 4. Receipts/RESULTS.md bypass the privacy scan | `tools/fletcher/feature_observation.py`, `tools/fletcher/feature_report.py` | Exported a public `assert_no_private_markers(node) -> None` wrapper around `_scan_private` in `feature_observation.py`; `validate_observation` now calls it instead of calling `_scan_private` directly. `feature_report.build_receipt` imports `assert_no_private_markers` and runs it over the fully assembled receipt dict (including the free-text `--reason`) before returning it, so a receipt naming a parcel is rejected before it is ever written to disk or folded into `RESULTS.md`. | `test_feature_observation.py::AssertNoPrivateMarkersTests` (2 new tests) exercise the wrapper directly. `test_feature_report.py::BuildReceiptPrivacyTests` (2 new tests): a receipt with reason `"near pid 50319672"` raises `ValueError` (message contains "private"); a clean reason passes through unchanged. |
| Minor: `score()`'s VRT name collided with `fit()`'s | `tools/fletcher/feature_georeference.py` | `score()` wrote `out_path.parent / "controls.vrt"`, identical to the filename `fit()` writes into `out_dir` - pointing `score` at the same directory as a `fit` run would silently overwrite that fit's provenance VRT. Renamed to `out_path.parent / "score-controls.vrt"`, with a comment explaining why. | `test_feature_georeference.py::ScoreTests::test_score_groups_per_region_metrics` extended to assert the translate command's target path is `score-controls.vrt`. |

## RED then GREEN evidence

For each finding, the new/extended test was written first and confirmed to
fail for the right reason, then the implementation was added and the same
test confirmed green.

- **Finding 3** (privacy guard) - RED:
  ```
  ImportError: cannot import name 'assert_no_private_markers' from
  'tools.fletcher.feature_observation'
  ```
  GREEN: `tools.fletcher.tests.test_feature_observation` - 15/15 tests OK
  (was 10 before this task).

- **Finding 4** (receipt scan) - RED:
  ```
  test_reason_with_private_marker_raises ... FAIL
  AssertionError: ValueError not raised
  ```
  GREEN: `tools.fletcher.tests.test_feature_report` - 14/14 tests OK
  (was 12 before this task).

- **Finding 2** (`-dstalpha`) - RED:
  ```
  AssertionError: '-dstalpha' not found in ['gdalwarp', '-r', 'bilinear',
  '-t_srs', 'EPSG:3857', '-tps', '-co', 'COMPRESS=DEFLATE', '-co',
  'TILED=YES', '-co', 'BIGTIFF=IF_SAFER', '.../controls.vrt',
  '.../warped-3857.tif']
  ```
  GREEN: `tools.fletcher.tests.test_feature_georeference.FitTests` - 2/2 OK;
  full module 15/15 OK.

- **Finding 1** (CLI) - RED:
  ```
  ImportError: cannot import name 'main' from 'tools.fletcher.feature_qa'
  ```
  GREEN: `tools.fletcher.tests.test_feature_qa.CliTests` - 5/5 OK; full
  module 22/22 OK (was 17 before this task).

- **Minor** (VRT rename) - covered by the existing
  `ScoreTests::test_score_groups_per_region_metrics`, extended with one new
  assertion; passes GREEN alongside the rest of `ScoreTests` (4/4 OK).

## Full-suite verification (post-fix)

```
$ python3 -m unittest discover -s tools/fletcher/tests -t .
...
Ran 219 tests in 0.920s

OK
```

```
$ python3 -m unittest discover -s tools/church/tests -t .
...
Ran 425 tests in 0.072s

OK
```

Baseline (immediately before this task's changes, same worktree, same
commit `1af38106`): `tools/fletcher` 206 tests OK, `tools/church` 425 tests
OK. This task added exactly 13 new fletcher tests (6 in
`test_feature_observation.py`, 2 in `test_feature_report.py`, 5 in
`test_feature_qa.py`, plus 0 new test methods but 2 extended assertions in
`test_feature_georeference.py`) and 219 - 206 = 13, confirming no test was
silently dropped or duplicated. `tools/church` is untouched (425 -> 425,
unchanged).

Both runs are pristine except for pre-existing `print()` output from
`feature_report.main`'s `record` command and `tools.church`'s comparison
tool under test (identical output before and after this task's changes -
not a regression).

Module-import check (cv2/numpy simulated absent, matching CI): confirmed
`tools.fletcher.feature_qa` still imports and its CLI still runs `--help`
successfully with a fake `sys.meta_path` blocker raising `ImportError` for
`cv2`/`numpy` - lazy imports inside `render_scan_crop`/`render_overlay` are
untouched by the new CLI code, which never imports either package.

## Files touched

- `tools/fletcher/feature_qa.py` - new CLI (`run_crops`, `run_overlays`,
  `_build_parser`, `main`, `_load_json_list`, `_shift_polylines_to_crop`).
- `tools/fletcher/feature_georeference.py` - `_ensure_dstalpha`, `fit()`
  and `score()` updates.
- `tools/fletcher/feature_observation.py` - regex fix, key-scan fix,
  `assert_no_private_markers` export.
- `tools/fletcher/feature_report.py` - `build_receipt` privacy scan.
- `tools/fletcher/tests/test_feature_qa.py`,
  `tools/fletcher/tests/test_feature_georeference.py`,
  `tools/fletcher/tests/test_feature_observation.py`,
  `tools/fletcher/tests/test_feature_report.py` - new/extended tests.

## Concerns / follow-ups

- None blocking. `render_scan_crop`/`render_overlay` themselves (the actual
  GDAL/cv2 rendering) remain untested in CI by design (per the existing
  module docstring) and are only exercised on the remote GIS host in Phase
  B - the new CLI tests instead lock down the pure argument-shaping logic
  (window clamping, polyline coordinate shifts, projwin construction) via
  `unittest.mock.patch` on the module-level render functions, which is what
  the finding asked for.
- The CLI's `--width`/`--height` for `crops` must be supplied by the Phase B
  caller (e.g. from the observation's `source_receipt`); the CLI
  deliberately never shells out to `gdalinfo` to discover them, per the
  finding's instruction to keep the module GDAL-free except through the
  injectable runner.

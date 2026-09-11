# Sheet 9 — regional support and failed fresh validation

**Provisional; not accepted for tiles or production labels.** Eight reviewed
additions bring the trial to 24 controls. The two fresh local checks score
3.981 m at the Jim Campbells lake inlet and **501.415 m at the Gallant side-fork**.
The latter exceeds the unchanged 200 m worst-error criterion. Neither result
establishes whole-sheet accuracy. Canonical progress is `../status.json`.

`reviewed-fit.json` is the editable current input. Its physical inputs are
identical to the frozen `regional-fit.json`; only C19's mistaken name and the
status text were corrected after review. `annotation-correction.json` records
both hashes. Original scores, proposals, failed checks and fit are preserved.
**C19 is the unnamed tributary immediately north of Mink Brook, not Mink.**
The printed Mink stream is farther south and partly clipped by this neatline;
modern Mink is J1527/OBJECTID 272245. No point was moved for this name correction.

## Correspondences and limits

- C17–C19 follow lower Gallant's northwestern junction and two eastern tributaries.
  Native crosshair review corrected C18 from the dip-symbol vicinity to the
  actual tributary junction before fitting. The original proposal remains.
- C20/C21 identify the major northern Jim Campbells arm and the southern outlet
  of its distinctive headwater lake. Shoreline shape, northeast inlet, separate
  eastern drainage and downstream fork order support the correspondence.
- C22–C24 identify Rocky Brook's river-bank entry, western tributary and larger
  northeastern tributary. C22 was corrected from the river interior to the bank
  before fitting. The broad gorge/main-river sequence is in `context/`.
- All previous C01–C16 inputs are unchanged, including Stewart C10 [8231,6494].
  Stewart Q01 remains unresolved and failed; no diagnostic became a control.

`freeze.json` records the 24-control freeze before selecting V01/V02. V02's
initial crosshair was corrected onto the visible fork **before** its first
score; both placements remain in the proposal and final review. After the
failure, inspection of the warped Gallant arm confirmed a substantial mismatch
between the historical near-northward reach and the modern eastward reach.
The exact side-fork identity/generalization remains unresolved. It was not
converted to a control or moved to satisfy the model. V01 is a close local lake
check, not independent regional coverage. Both checks remain excluded.

| Frozen experiment | Median / worst ground metres |
|---|---:|
| Previous 16 controls, same five diagnostics | 122.746 / 449.949 |
| New 24 controls, same five diagnostics | 127.939 / 442.189 |
| New 24 controls, two fresh local checks | 252.698 / 501.415 |

The diagnostic set still includes uncertain Stewart Q01; western coast Q04
scores 212.384 m. This trial adds regional support but does not claim an overall
accuracy improvement. The separate 100 m median and 200 m worst goals remain.

## Artifact and verification

The complete inner-neatline RGBA GeoTIFF is
`/Users/dfakkeldy/Downloads/fletcher-sheet09/completion-20260911/sheet-09-full-sheet.tif`.
It is 8370 × 5414, EPSG:3857, with 5 projected-metre output cells. Its hash is
`4b6057df3d3ad73269cce9cbf43dedf72a0cb73a5f9974a794b31c70d3722180`.
`regional-scores.json` records bounds and transform inputs; `handoff.json`
describes source-pixel projection for **provisional** digitization. Native CSV
pixels refer to the original 10762 × 7642 scan, never the resampled GeoTIFF.
Controls, diagnostic review and validation review are separate CSVs.

- Independent alpha verification: 43,531,655 interior cells, zero holes with a
  one-cell boundary tolerance. The full neatline was retained.
- 70,928 orientation samples at a 25-pixel step: no sign reversals. This finite
  check does not prove a continuously fold-free surface.
- Actual warped imagery was inspected in ten regions. Coastal mouths and
  supported junctions align locally; upper tributaries and southwestern side
  valleys remain displaced. `warped-review/` uses the actual output raster.
- `sheet11-feature-join/` compares both actual rasters with modern water and roads
  in three sectors. Gallant crosses each edge near the modern main channel, but
  the intervening coverage and tributaries are not continuous. Western interior
  and Margaree banks remain displaced. The sector originally labelled
  `west-coast` is east of the shoreline and tests the western interior only;
  a complete coastline join is still outstanding. No edge was stretched.
- The real application CSV parser round-trips 24 controls/five diagnostics and
  the web TPS agrees with GDAL below 0.001 projected m. See `import-verification.json`.
- The actual GeoTIFF imported, rendered and reloaded in an isolated Chromium
  profile on the current checkout. The stored hash, enabled state and transparent
  preview pixels survived. Desktop and phone screenshots were inspected; zero
  console/page errors. `browser-verification.json` records the local evidence.
  This tests the embedded-GeoTIFF path, not the raw-scan browser TPS mesh.

Reproduce rendering with `../../full-sheets/render.py`, `regional-fit.json`,
`diagnostic-checks.json`, `../expansion-20260910/boundary.json` and the native scan.
Use the benchmark Python environment with `/opt/local/bin` on PATH. Replay
validation with `../../full-sheets/score.py`. The annotation-corrected fit and
`reviewed-*-checks.json` produce identical predictions. `verify_import.ts`
bundles with `web/node_modules/.bin/rolldown --platform node --format esm` and runs
from the repository root. `review_join.py` regenerates the adjacent raster views.

Next investigation: Gallant V02 topology, Stewart Q01 identity, and western coast
support. After any repair, freeze again and obtain fresh distributed checks.
This sheet's completion PR remains a draft while work proceeds on Sheet 11.

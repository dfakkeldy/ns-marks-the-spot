# Church distributed correspondence review — 13 September 2026

This sequential continuation adds five new physical checks, corrects Inverness north’s First Fork source placement, establishes a first three-control Cape Breton physical trial, and audits the south’s historical check definitions. **No new whole-panel geographic acceptance was established.** Accepted July south inputs, every previous observation/result, and both selected review rasters remain unchanged.

Working objective: ≤250 m independent horizontal RMS; stretch ≤200 m. Historical gates are unchanged. None of these sparse new phases establishes distributed whole-panel accuracy.

| Panel | Phase | n | RMS m | Median m | Empirical P95 m | Max m | Mean E / N m |
|---|---|---:|---:|---:|---:|---:|---:|
| [Richmond](richmond/README.md) | Fresh inland region | 2 | 462.56 | 456.89 | 521.89 | 529.11 | -323.72 / 271.42 |
| [Inverness north](inverness-north/README.md) | Fresh Second Fork | 1 | 353.06 | 353.06 | 353.06 | 353.06 | -116.67 / -333.23 |
| [Victoria northwest](victoria-northwest/README.md) | Fresh White Point | 1 | 441.86 | 441.86 | 441.86 | 441.86 | -441.54 / 16.80 |
| [Victoria main](victoria-main/README.md) | Fresh Indian Brook | 1 | 235.92 | 235.92 | 235.92 | 235.92 | -0.77 / 235.92 |
| [Cape Breton main](cape-breton/README.md) | First reserved Hay check | 1 | 522.63 | 522.63 | 522.63 | 522.63 | 228.38 / 470.09 |
| [Inverness south](inverness-south/README.md) | Audited historical diagnostics | 6 | 141.16 | 130.01 | 211.81 | 223.71 | -17.79 / 77.96 |

Residuals are warped minus reference, in ground metres using the preserved mean-latitude equirectangular convention and 6,371,008.8 m sphere. P95 is NumPy linear empirical interpolation, not confidence. For n=1 the distribution columns are the same single discrepancy. `accuracy-summary.json` retains all individual residuals and scatter. Separate phases and panels must not be pooled into fresh validation.

## Decisions and remaining geography

- **Richmond:** unchanged ten-control v4 TPS. New McDonald and Rocky Lake centroids reveal additional interior discrepancies; they occupy one region. Reservoir history rules out assuming unchanged Landrie/Little River basins in the southwest. Southwestern mainland and broader interior/edge checks remain missing.
- **Inverness north:** correct I10 from (7347, 25733) to (7948, 25473) at the actual First Fork north-bank junction. Pleasant Bay’s retained diagnostic improves from 167.24 to 125.73 m. I12’s old northern-side-branch source pixel conflicts with its modern southern-fork definition; its original 1813.63 m result is preserved and the pair is withheld from valid new comparisons. The corrected affine still fails fresh I13 at 353.06 m outside its hull. Northern and intervening interior support remain weak.
- **Victoria northwest:** retain the four-control affine. White Point adds a new northeastern coastal check but fails at 441.86 m outside the hull. Freshwater Lake and Duncan Brook definitions remain unresolved; northern tips, interior, southern edge and seam coverage remain insufficient.
- **Victoria main:** retain the corrected graticule and four-control physical affine. The Indian Brook branch confluence is within 250 m at one northern-interior point; it does not overcome the existing 603.46 m diagnostic RMS. Coffin/Double Island definitions were withheld. Southeastern shore, western mapped extensions and seams remain unsupported.
- **Cape Breton main:** Gillis Lake/Scotch Lake stream junctions supply two mainland controls alongside Scatarie, enabling a first physical affine. The reserved Hay Island check fails at 522.63 m. There is no redundant control or mainland validation, so no usable raster was produced. Approximate search coordinates and the township mesh never enter this fit. Full mainland/edge support remains incomplete.
- **Inverness south:** accepted July baseline and separate physical affine unchanged. IS06’s connected historical hook versus modern detached islet prevents a defensible new centroid. A separate six-check audit with Cow Island retraced scores 141.16 m RMS; five checks remain approximate hand points. No fresh mainland check was adopted. The older eleven/seven-check histories and Lake Ainslie’s first result are untouched.

## Reproduction and evidence

`verify_reports.py` replays eleven current comparison sets, checks nine source-frame observations and their editable rows, checks saved reference vertices/rings, and verifies the previous two physical-review directories, south production inputs, corrected Victoria graticule and panel definitions against the nightly-history squash commit `d2cb82040e10f68d50e805702f71d33f7e2148db`. The previous seven-set verifier also replays unchanged. All 428 Church tests pass locally.

`verify_import.ts` round-trips all nine editable CSVs through the current production parser. Six affine check-bearing inventories agree with GDAL within 0.001 projected metre. Richmond’s CSV is a parser roundtrip; no new TPS browser mesh assertion is made. These are computational checks, not geographic acceptance.

`review_rasters.py` verifies both selected raster hashes and generates four actual-raster windows with directly projected NSTDB lines: the two Richmond inland basins, Cow Island, Mabou and Whycocomagh. New observations are not taken from those warped windows. Full-content alpha/distortion and browser receipts remain in the previous reports for the unchanged rasters. No new browser rendering claim, warp, tiles, catalog activation or deployment.

```bash
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/distributed-review-20260913/verify_reports.py
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/physical-review-20260913/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
# Bundle only the current report/parser sources:
cd web
npm ci
node_modules/.bin/rolldown ../reports/church/distributed-review-20260913/verify_import.ts --platform node --format esm --file /tmp/church-distributed-import.mjs
cd ..
node /tmp/church-distributed-import.mjs
```

The first verification draft used Richmond’s disabled production cutline and rejected existing control C01. The validator now uses the exact audited `content-boundary.json` recorded by the selected v4 raster. No control or boundary was changed to satisfy that check. `coverage-summary.json` distinguishes the actual review boundary, source-hull membership and geometric hull overlap from validated geography.

`status.json` is the current resumption record. Each panel README names its selected fit, failed experiments and unresolved areas. Native source frames, original and corrected observations, matched feature IDs, uncertainties, frozen controls, first scores and exclusions are retained alongside the figures. The 20–30 distributed-check ambition remains unmet. `reference-provenance.json` links the reused original NSTDB extracts and the new 2,434-feature southwestern Richmond query. Large scans/GeoTIFFs remain outside Git.

Source-derived figures retain David Rumsey Map Collection / Stanford Libraries credit and the previously recorded CC BY-NC-SA 3.0 terms, separate from the repository licence. This pass reinforces the existing skill requirements for broad topology, native crosshair review and phase isolation; no new general procedure or accuracy threshold was inferred.

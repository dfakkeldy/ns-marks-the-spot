# Richmond — affine improves the initial fresh regional sample

A fourteen-control **affine**, using the exact same coordinates as the failed fourteen-control TPS, is frozen as a separate provisional candidate. Its first six independent post-selection checks measure **199.87 m horizontal ground RMS**, median **188.09 m**, empirical P95 **261.30 m**, maximum **266.81 m**, bias **44.28 m east / 41.47 m north** (warped minus reference). These results support continued validation, not whole-panel acceptance. v4 remains the retained baseline. No tuning followed this affine freeze.

| Fresh check | Physical definition | Affine14 | v4 TPS | Failed TPS14 | Inside source hull |
| --- | --- | ---: | ---: | ---: | --- |
| R38 | Main fork inland from Melford Creek | 266.81 m | 433.09 m | 579.69 m | No |
| R39 | Basin labelled Neils Lake north of Arichat | 186.38 m | 183.41 m | 103.49 m | Yes |
| R40 | Mainland point east of McKinnon Harbour's forked inlet | 244.77 m | 174.56 m | 126.06 m | No |
| R41 | Rounded basin west of Grand River | 157.94 m | 140.69 m | 106.58 m | Yes |
| R42 | Basin west of the coastal road north of Capelin Cove | 189.80 m | 116.98 m | 107.83 m | Yes |
| R44 | Eastern tip of Fourchu Point | 113.49 m | 179.57 m | 69.73 m | No |

The same-six v4 RMS is **230.00 m**, median **177.06 m**, P95 **370.67 m**, maximum **433.09 m**, bias **20.00 m east / 55.53 m north**. TPS14 measures **255.11 m RMS**, median **107.20 m**, P95 **466.28 m**, maximum **579.69 m**. The affine reduces the regional tail and RMS, while several individual checks and the median favour v4 or TPS. All comparisons and original failures are retained. Six geographically spread observations are still a sparse sample; no pooled diagnostic score is described as fresh.

The selected fit is in `affine14-controls.csv` and its dated selection/freeze receipt is `affine14-freeze.json`. The six fresh points live in `affine14-fresh/`, with individual immutable first results and separate three- and six-check summaries. `affine14-fresh-validation.csv` contains only those six and the frozen fourteen controls. Observation uncertainties of 110–160 m are retained, not subtracted. R40 has the broadest tip and greatest stated along-shore uncertainty. Empirical P95 is a sample percentile, not a confidence guarantee.

Before selecting the affine, this pass measured R36, the northern tip of the Malagawatch hook, and R37, the eastern Mill Brook branch entry at River Inhabitants. The then-frozen TPS14 scored **71.85 m** and **557.78 m** respectively; v4 scored **79.82 m** and **293.97 m**. Their original observations and first results remain in the parent directory. The pronounced southwest failure justified auditing the already supported affine/polynomial2/TPS alternatives using unchanged controls and coordinates.

| Diagnostic phase used for model selection | Affine14 RMS / max | Polynomial2 RMS / max | TPS14 RMS / max |
| --- | ---: | ---: | ---: |
| Same twenty earlier diagnostics | 225.61 / 486.69 m | 313.11 / 952.44 m | 194.08 / 361.02 m |
| Same eight later TPS observations, R30–R37 | 172.90 / 296.11 m | 212.40 / 368.58 m | 321.69 / 557.78 m |
| All twenty-eight, diagnostic only | 211.90 / 486.69 m | 287.95 / 952.44 m | 237.64 / 557.78 m |

These 28 points are now explicitly diagnostic for the affine selection. The eight later observations are not reused as its fresh validation. The original four- and six-check TPS phases in the September 13 report remain byte-preserved, including Barren Lake's 542.50 m failure. None of R30–R44 was promoted to a control. Earlier R21/R26/H03/G01 promotions and all their first failures remain intact in their prior reports.

The source/reference definitions are preserved alongside native crosshairs. R38 uses the actual first main stream fork after the Melford estuary, excluding the tide-dependent basin head. R39, R41 and R42 trace complete outer shores, excluding continuing streams, road lines and the graticule. R40 uses a particular local outer mainland extremum, rather than nearest-coast distance. R44 uses the complete eastern coastal tip before the printed frame, excluding harbour wharves and roads. Reference coordinates are exact original NSTDB vertices or centroids of recorded original outer rings; none comes from terrain-screen or search-guide pixels.

`affine14-fresh/R40-context-erratum.json` corrects one corroborating feature's classification: the nearby G06 feature is a coastal pond west of Hector Point, not an island. The original R40 observation and first score remain unchanged; source pixel, reference vertex, uncertainty and role did not change. The primary outer-headland correspondence remains the same.

`withheld-searches.json` records the unsuccessful candidates. Island Lake lacks an established complete source boundary. The apparent Ferguson Lake enclosure follows roads and cannot supply a shoreline centroid. The northern McKinnon inlet mouth has unresolved tributary correspondence. The Kelpy Cove outline is an inland pond; its modern eastern extent/connections are insufficiently comparable for a whole-basin centroid. The larger Upper Marie Joseph complex remains unresolved. No point or score was manufactured for these cases, and no prior failed observation was deleted.

The full expanded-content render is `richmond-affine14-20m.tif`, **6,532 × 4,513**, EPSG:3857, 20 projected-metre cells, bilinear, exact transformation (`-et 0`). It encodes the frozen forward affine explicitly as a GeoTransform, following the previously verified south-render repair. SHA-256: `c44fd27bf527f468a779a7b37218ab402b5bf306c9a3b9cae5bb8769eba15fd0`. The source, control and boundary hashes are in `affine14-artifact-receipt.json`. The local file is `/Users/dfakkeldy/Downloads/church-coverage-20260914/richmond-affine14/richmond-affine14-20m.tif`; the independent remote workspace is `/var/home/dan/nsmarks-church-20260914/`.

Alpha verification finds **zero holes in 20,839,213 expected interior cells**, using the original expanded boundary and a one-cell inset. All six source-observation locations have nonzero alpha, and the actual raster/reference windows in `warped-review/` were inspected. The Fourchu tip remains visible close to the eastern cutline. The constant affine determinant is −15.25154 and anisotropy is **1.0328**. Nonsingularity proves the affine has no folds; it does not establish accuracy or validate a provisional content boundary.

The 10×/55° terrain preview shows the improved Barren Lake placement and the remaining Melford Creek offset. It uses exact raster-image corners and a geometry-checked union of two original NSTDB extracts (18,054 unique features). The current web terrain modules load without observed console errors in Brave. This separate inspection page is not main-app importer/raw-scan mesh acceptance. `prepare_terrain_preview.py` reproduces its ignored local assets; `render_check_windows.py` reproduces the direct raster/reference figures.

Remaining work: expand toward 20–30 identifiable distributed fresh checks where feasible, including additional western/intervening interior, southern mapped content, northern and coastal intervals; verify shared-feature seams and the complete browser delivery path. Keep the affine frozen during this validation and retain every first failure. The sample meets the working numeric RMS objective, but whole-panel geographic acceptance remains unproven. No v4 replacement, catalog activation, tile generation or deployment.

Figures derive from David Rumsey Map Collection / Stanford Libraries imagery under the recorded CC BY-NC-SA 3.0 terms. Original NSTDB reference provenance and exact hashes are in `terrain-preview-inputs.json`, per-observation IDs and the predecessor receipts. Source frames, extents, display sizes and image hashes are preserved in `context-frames.json`.

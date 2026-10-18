# Church sequential physical review — 13 September 2026

The queue was reviewed in order through Inverness south. Best provisional results and rejected trials are preserved. **No new whole-panel geographic acceptance was established.** Inverness south's July acceptance and artifact remain intact. No catalog activation, tiles or deployment.

Working target: ≤250 m independent horizontal RMS; stretch ≤200 m. Existing experiment gates and first results are unchanged. Small or clustered diagnostic passes do not satisfy the geographic objective.

| Panel | Check phase | n | RMS m | Median m | Empirical P95 m | Max m | Mean E / N m |
|---|---|---:|---:|---:|---:|---:|---:|
| Richmond | regional diagnostics | 9 | 275.48 | 164.79 | 488.99 | 511.51 | 26.81 / 143.26 |
| Inverness north | fresh inland check | 1 | 1813.63 | 1813.63 | 1813.63 | 1813.63 | 1699.26 / 633.86 |
| Victoria northwest | North Pond diagnostics | 2 | 360.17 | 359.85 | 373.42 | 374.93 | 3.94 / 357.18 |
| Victoria main | physical diagnostics | 4 | 603.46 | 514.68 | 891.59 | 931.12 | 138.82 / -213.87 |
| Inverness south | historical baseline replay | 11 | 332.91 | 291.79 | 465.35 | 467.74 | -47.88 / 250.81 |
| Inverness south | physical diagnostics | 7 | 131.05 | 107.55 | 209.43 | 223.71 | -13.44 / 76.84 |
| Inverness south | fresh inland check | 1 | 290.70 | 290.70 | 290.70 | 290.70 | -166.85 / 238.05 |
| Cape Breton | Reserved check; no transform | 0 scored | — | — | — | — | — |

Ground distances use radius 6,371,008.8 m and cosine at mean latitude, warped minus reference. P95 is linear empirical interpolation, not confidence. The south historical record remains 333.29 m RMS / 468.28 m P95; its replay uses the current distance/percentile convention. Counts across phases must not be pooled into fresh validation. `accuracy-summary.json` contains individual residuals and scatter; `coverage-summary.json` records source-hull membership and orientation limits.

## Coverage and outcomes

- [Richmond](richmond/README.md): ten-control v4 retained. Three inland observations supplement six regional checks; 22 features exist across diagnostic phases. The McMillan-control trial regresses. Southwestern mainland, intervening interior and edge validation remain incomplete; western island checks are correlated.
- [Inverness north](inverness-north/README.md): four-control trial improves one coast diagnostic, then fails the fresh interior check outside its hull by 1.81 km. Middle interior and northern/edge support remain inadequate. No usable raster.
- [Victoria northwest](victoria-northwest/README.md): four-control provisional affine, two correlated North Pond diagnostics, zero fresh post-refinement checks. Northern tips, coastal intervals and interior/seam checks remain missing.
- [Victoria main](victoria-main/README.md): native label audit fixes a 10-minute longitude anchor-index error. Original graticule RMS was 13.29 km on the same four checks; corrected graticule is 784 m, but physical fits still fail. An additional McLeod control regresses. Northern extensions, interior, southeast shore and seams remain unvalidated.
- [Cape Breton](cape-breton/README.md): one prospective Scatarie control and one nearby Hay Island check; no transform justified. Reservoir change and unresolved mainland lake identities are documented. Repaired content cutline, southern extensions and inset exclusions preserved.
- [Inverness south](inverness-south/README.md): accepted baseline retained. Four separately remeasured controls give 131 m RMS on seven old diagnostics. The fresh inland outlet is 291 m outside the hull. Hand-point uncertainty, clustering and missing western/interior checks prevent expanded acceptance. The full-content 20 m review GeoTIFF passes alpha and browser checks, with remaining geographic differences visible in actual-raster/reference windows.

## Evidence and delivery

The south review raster stays outside Git: `/Users/dfakkeldy/Downloads/church-review-20260913/south-rendered/south-explicit-affine-20m.tif`. Its exact source/fit/output receipt is `inverness-south/final-artifact-receipt.json`. Native-frame control CSVs, separate diagnostic/fresh files, correspondence crosshairs, uncertainty and first failed trials are versioned. The GeoTIFF carries its own registration; native CSV pixels belong to the original scan.

`verify_reports.py` replays seven active metric sets and verifies unchanged accepted-south input bytes. `verify_import.ts` exercises the real web parser and affine solver: seven inventories round-trip and south agrees with GDAL within 0.001 projected metre. All 428 Church tests pass, including the native-label regression. The correction checkpoint passed hosted web/core/native/build-gate CI; final-head CI and merge status are reported at delivery.

The initial south GCP raster had 411,163 missing interior cells. Encoding the same forward affine explicitly fixes coverage without changing source, controls, cutline or resolution: zero holes across 22,718,783 expected interior cells. The failed raster and aborted native-level probe remain disclosed. Browser import/reload and zoom 9/12 rendering succeeded with no captured console/page errors; this is not raw-scan mesh or geographic acceptance.

`prior-status.json` preserves the previous handoff, while `status.json` records this completed review pass and unresolved geographic work. `reference-provenance.json` links original and new NSTDB receipts. Source-derived imagery retains Rumsey/Stanford provenance and recorded CC BY-NC-SA 3.0 scan terms, separate from code licensing. The georeferencing skill's Church reference now records the verified label-index and affine-raster coverage lessons, including their limits.

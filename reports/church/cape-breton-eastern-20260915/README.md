# Cape Breton eastern validation — 15 September 2026

The unchanged eleven-control TPS now has eight fresh physical checks, with **588.21 m horizontal ground RMS**. It fails the 250 m working target. The same eight checks on the original three-control affine give 903.41 m. Neither result establishes whole-panel accuracy. The selected TPS11 controls, raster, content boundary and previous results remain unchanged.

| Fresh phase | Count | RMS m | Median m | Empirical P95 m | Maximum m | Mean east / north m |
|---|---:|---:|---:|---:|---:|---:|
| Previous CB18–CB23 | 6 | 467.19 | 286.64 | 795.03 | 867.77 | −146.56 / +74.46 |
| New CB24–CB25 | 2 | 853.92 | 837.48 | 987.56 | 1,004.24 | −358.69 / +306.97 |
| Cumulative CB18–CB25 | 8 | 588.21 | 481.64 | 956.48 | 1,004.24 | −199.60 / +132.59 |

The cumulative scatter about the mean residual is 537.19 m. Distances use the existing mean-latitude equirectangular ground calculation; residual direction is warped minus reference. P95 is the NumPy linear sample percentile, not a confidence guarantee. No uncertainty allowance is subtracted. CB24 is outside the source control hull; CB25 is inside it. The two selection diagnostics CB04 and CB13 remain separate. No new check has been promoted or used to select a different fit.

## New observations

- **CB24, Cape Breton headland:** 1,004.24 m, mostly northward (+990.98 m). The actual engraved coast turns back toward Baleine Cove south of Convict Point. The recorded native crosshair is on that coast, beside the large label, not on an offshore engraving ring. Modern reference is original NSTDB WACO20 12931 vertex 114. The 150 m observation uncertainty reflects the generalized tip and small modern indentations. This is the physical promontory, not the county or a name-label centre.
- **CB25, Morrisons Lake:** 670.71 m, west/south (−554.71 / −377.03 m). The named basin west of Stewarts Lake and its northeastern connecting neighbourhood establish identity. A 54-vertex source outer-shore trace is compared with the complete modern exterior, 989 vertices from WALK20 135716/135717. Both use the outer-polygon **area centroid**, ignoring internal islands. The historic basin proportions and island arrangement differ substantially; no individual island match or full-outline agreement is claimed. Stated uncertainty is 200 m.

The initial **unscored** Morrisons search file accidentally labelled an exterior-line centroid as `centroid_lonlat`. Its exact bytes are retained in `morrisons-reference-unscored-search.json`. The corrected search record retains that old field and adds the explicitly named outer-area centroid. CB25 used translated shoelace arithmetic checked against Shapely's outer polygon, agreeing within 1e−12 degrees, before scoring. No control, check score or first result used the search line centroid.

See `observations/` for the original scan frames, native crosshairs, reference plots, source hashes, identities and definitions. `CB24-first.json` and `CB25-first.json` preserve the first scores after visual adoption. `names-receipt.json` records the exact public-name query; name points establish identity only. NSTDB source provenance remains in [the physical-review receipt](../physical-review-20260913/cape-breton/reference-receipt.json).

## Raster and terrain review

The selected artifact is still [the regional TPS11 raster](../cape-breton-regional-20260915/README.md), SHA-256 `4ee6ced679c11474ff54bf8e65f428ccb9f9a0bf8d8b15b689b238e3532e1d36`. It was not regenerated. Two new actual-raster/reference windows show the headland north of its reference and the Morrisons basin west/south of its modern outer shore. Both inspected source positions have nonzero raster alpha. The prior full-content alpha and distortion checks remain applicable to these unchanged bytes; they do not establish geographic accuracy.

The existing imported GeoTIFF was restored after navigation and was the only active My Maps raster, at 70% opacity. Both locations were inspected in 2D and **10× terrain at 50° tilt, north up**, following the user's suggestion. Exaggeration makes basin margins and surrounding relief easier to see, including the lake drawing crossing modern basin margins. The headland discrepancy also remains visible. Terrain is a context aid; no source or reference coordinates were measured from this perspective view. The console returned no errors. Screenshots and DOM state receipts are in `browser-review.json`; large browser captures remain in the local Downloads cache. Previous importer/reload/decoder validation is preserved in the regional report; this pass did not repeat file import or claim raw-scan browser mesh acceptance.

## Coverage, limitations and next panel

Eight checks remain short of the requested 20–30 sampling ambition and are weighted toward eastern/southern water features. The new observations add a mainland promontory and another eastern interior basin, not broad new western or southern-extension coverage. Stewarts Lake, South Head, Gaspereaux Lake and these two new checks retain their failures. Changed/generalized lake shapes limit how confidently their discrepancies can guide a warp correction. A uniform shift is contradicted by the opposing residual directions and existing better checks. No new evidence here justifies changing the frozen fit.

Retain TPS11 as a **provisional review**, preserve the original affine and all failed experiments, and continue next to **Inverness south**, as requested when defensible refinement stalls. Cape Breton remains unfinished: western/interior distribution, southern extensions, unresolved precise coastline correspondences, shared-feature seams and the above geographic failures need further work. Its unsupported catalog entry remains closed; no tiles, activation, publication or deployment occurred.

## Reproduction

From the repository root:

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/cape-breton-eastern-20260915/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

All 428 Church unit tests passed. Eight measurement sets replayed, source/reference frames and frozen hashes passed, and all three editable inventories round-tripped. The maximum web/GDAL TPS difference was below 0.001 projected metre.

`verify_import.ts` exercises the production CSV parser, serialization and TPS solver against GDAL at the fresh checks and content-boundary vertices. `controls.csv`, `new-checks.csv` and `cumulative-fresh.csv` keep the identical controls with distinct review phases. Frozen inputs are pinned to nightly ancestry commit `506aed8ba512b31c868bc02eb2e9a6f01ff66e90`; previous reports and first results are preserved in place.

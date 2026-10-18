# Richmond: southern and interior coverage continuation

The unchanged 14-control affine now has **14 fresh checks: 233.52 m horizontal RMS**, median 202.39 m, empirical P95 348.20 m and maximum 378.33 m. Mean residual is **71.16 m west / 54.99 m north**. The same features on retained v4 TPS give 309.81 m RMS and 601.57 m maximum; its median, 202.00 m, is slightly smaller. These results support further provisional use, not whole-panel geographic acceptance.

The first six checks remain frozen in the predecessor report (199.87 m RMS). The **eight added checks alone give 255.87 m RMS**, exceeding the 250 m working target. All individual first results and eight cumulative snapshots are retained. No control, source coordinate or transform was tuned following these checks. The previous 28 model-selection checks remain diagnostic and are excluded from the fresh count.

| New check | Physical definition | Affine error, ground m |
|---|---|---:|
| R45 | Ragged Head southern outer shore | 214.98 |
| R46 | Cape Argos eastern extremum | 127.19 |
| R48 | Murray Lake eastern principal basin | 310.64 |
| R49 | Northern Crawley Lake basin | 331.98 |
| R50 | Horseshoe basin north of Cranberry Lake | 291.11 |
| R51 | Northern interior kidney basin | 378.33 |
| R52 | Northern stream junction at McLeod Lake neck | 137.99 |
| R53 | L’Ardoise Head southern extremum | 87.98 |

Murray, Crawley and the horseshoe basin are a cluster, not three widely distributed regions. The new northern basin failure remains in every subsequent phase. Shoreline generalization, rounded extrema and engraving ambiguity are recorded as uncertainty; none is subtracted from errors. Paddys Lake (R47) and the apparent island near L’Ardoise were withheld before scoring because geometry/connectivity was unresolved. Search outcomes include blank, inset and nondepicted areas; a broad content cutline does not mean every modern lake is engraved. No weak matches were added to reach a 20-check quota.

## Retained artifacts and coverage

The candidate is the existing explicit-affine 20 m GeoTIFF, SHA-256 `c44fd27bf527f468a779a7b37218ab402b5bf306c9a3b9cae5bb8769eba15fd0`, at `/Users/dfakkeldy/Downloads/church-coverage-20260914/richmond-affine14/richmond-affine14-20m.tif`. Its 14 controls and freeze come from nightly commit `8b876cf44f8ab57719bbfcb8167d7ee590d09c58`. Ten-control v4 remains the retained baseline; failed TPS14, all earlier reports and the July accepted Inverness south inputs are unchanged.

The expanded full-content raster previously passed 20,839,213 interior cells with zero transparent holes. All eight new actual-raster/reference windows were inspected and their source observations have nonzero alpha. The nonsingular affine has constant anisotropy 1.03280 and no affine folds. Raster coverage and transform regularity do not establish accuracy in unsampled areas or at adjacent-panel seams.

The actual web app imported this GeoTIFF, retained its 6532 × 4513 source metadata through reload and displayed it in 2D and **3D at 10× terrain exaggeration**. The imported display preview is 4096 × 2830. The real decoder and embedded projection lattice were also replayed: 81 mesh nodes differ from the original GeoTransform by less than 0.001 projected metre. The Node probe stubs only PNG writing; the separate CUA importer verification exercised the actual preview and persistence. This is not a raw-scan GCP mesh test. Terrain helps interpret basin placement but does not supply measured horizontal coordinates. Browser records completed after the previous PR freeze are preserved under `browser-proof/`.

## Evidence and continuation

- `richmond/observations/`: source frames, outlines/points, exact original reference IDs and paired reviews.
- `richmond/first-results/`: immutable first scores and phase snapshots.
- `richmond/cumulative-validation.csv`: 14 controls and 14 separate checks, editable through the production parser.
- `richmond/reference-receipt.json`: southern NSTDB extract, 2,088 complete original features, exact query/hash and unchanged overlap.
- `richmond/search-outcomes.json`: search abstentions and the next work boundary.
- `richmond/Breeches-name-erratum.json`: name-only correction to earlier G05/R44 context; original measurements preserved.
- `accuracy-summary.json`, `coverage-summary.json`, `status.json`: current metrics and geographic limitations.

This Richmond pass pauses provisionally: defensible additional coverage has become sparse, several interior discrepancies remain and seams are unverified. Continue **Inverness north → Victoria northwest → Victoria main → Cape Breton main → Inverness south**. Revisit Richmond with new identifiable interior/coastal features or seam evidence. Full georeferencing remains incomplete. No tiles, catalog activation or deployment occurred.

## Verification

48 numerical replays passed; eight new native/reference measurements, every historical phase hash and eight rendered windows were checked. Both CSV inventories round-tripped through the production web parser; browser/GDAL affine agreement at checks and content vertices was below 0.001 projected metre. The embedded GeoTIFF decoder/mesh probe passed. All 428 Church tests passed.

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/coverage-continuation-20260914/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
web/node_modules/.bin/rolldown reports/church/coverage-continuation-20260914/verify_import.ts --platform node --format esm --file /tmp/church-continuation-import.mjs
node /tmp/church-continuation-import.mjs
web/node_modules/.bin/rolldown reports/church/coverage-continuation-20260914/browser-proof/verify-embedded-import.ts --platform node --format esm --dir /tmp/church-continuation-embedded
printf '%s\n' '{"type":"module"}' > /tmp/church-continuation-embedded/package.json
node /tmp/church-continuation-embedded/verify-embedded-import.js
```

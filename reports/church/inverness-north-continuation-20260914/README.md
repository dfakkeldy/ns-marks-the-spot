# Inverness north: northern support and terrain review

A new original-scan headland check exposed a **1,656.92 m** northern error in the corrected four-control affine. A separately frozen five-control TPS now includes that unchanged northern observation. It improves the same two diagnostics from 265.01 m to 245.26 m RMS, but its first fresh Presquile check still fails at **416.61 m**. The TPS is the best provisional trial in this pass; it is **not geographically accepted**.

## Measurements and roles

I14 is the western of the paired northern headland tips north of Lowland Cove. The original scan and modern coast preserve the paired tips, western steep turn, descending southeast shore and nearby brook entry. Native pixel `(14346, 920)` maps to original NSTDB coast feature 10488, vertex 93. Its first four-control residual is 1,058.24 m west / 1,274.97 m south. It lies 5,484.58 native pixels outside that control hull. The marked original observation and first failure remain unchanged after promotion.

The five-control trial adds I14 without moving any previous control. I14 and its aliases are excluded from checks. N03 (Pleasant Bay) and I13 (Second Fork Brook) are diagnostic for this model comparison; their previous first phases remain in the predecessor reports. The mismatched I12 pair remains excluded, with its original 1,813.63 m result preserved.

| Model on identical N03 / I13 diagnostics | Count | RMS, ground m | Maximum, ground m |
|---|---:|---:|---:|
| Corrected four-control affine | 2 | 265.01 | 353.06 |
| Five-control affine — rejected | 2 | 533.77 | 635.26 |
| Five-control TPS — provisional | 2 | 245.26 | 345.29 |

After the TPS freeze, I15 was selected at Presquile’s western outer shore, separate from the road and elongated lagoon. Original pixel `(5149, 16391.666666666668)` corresponds to the westernmost vertex of coast 9882, vertex 161. Its TPS residual is **311.59 m west / 276.55 m south**, versus 454.49 m total error on the old affine. For this **one fresh check**, RMS, median, empirical P95 and maximum are all 416.61 m. It is inside the five-control hull. The 160 m observation uncertainty is retained, not subtracted. No tuning followed this failure. The broad shoreline extremum is a coarse landform check, not a claim of an immutable surveyed bank.

`north-tip-trial/fresh-validation.csv` has five controls and one fresh check. `diagnostic-review.csv` has the same five controls and the two diagnostics. `role-changes.json`, `first-results/I14.json`, `I15-first.json` and `freeze.json` preserve the sequence and hashes. The four-control fitting RMS of 109.05 m is separately labelled a fitting diagnostic, not accuracy.

## Raster and browser evidence

The review GeoTIFF is `/Users/dfakkeldy/Downloads/church-north-continuation-20260914/tps5-rendered/inverness-north-tps5-review-20m.tif`, SHA-256 `8856e0fdd99f3ce01774f4ee22d182755728369961de9113f76af4cc047b62e8`. It is 3,310 × 5,438 pixels in EPSG:3857, at 20 projected-metre resolution, rendered with GDAL TPS and `-et 0`.

The complete panel cutline is densified every 250 native pixels through the same TPS. Its **10,084,453 expected interior cells have zero transparent holes**, using the recorded one-cell boundary tolerance. Four actual-raster/reference windows were inspected: I14 is visibly labelled a control; I15 is fresh; N03 and I13 are diagnostic. All four source observations have nonzero raster alpha. A 14,611-point orientation audit found no nonnegative determinants; sampled anisotropy spans 1.00187–1.14958. These finite samples do not prove the continuous TPS surface or geographic accuracy between observations.

The actual web app imported the GeoTIFF, restored its metadata and selection through reload, displayed the full panel at zoom 9 and Presquile at zoom 14, and draped the northern region at **10× terrain exaggeration / 50° tilt**. The final views had no console errors. The production GeoTIFF decoder and embedded projection lattice were replayed separately. The Node probe stubs PNG writing; actual browser import and display cover that path. Editable inventories also round-trip through the production parser, with TPS/GDAL agreement at checks and content vertices below 0.001 projected metre. No raw-scan GCP mesh acceptance is claimed.

## Source audit and unresolved work

The original JP2 hash was rechecked against the predecessor source. Four native windows—northern headland, Blair, Presquile and Corney—match the working TIFF’s decoded arrays exactly. This is local evidence, **not whole-TIFF parity**. The earlier one-third-resolution original/working JPEG previews differed and are retained as a counterexample. All source frames and hashes remain attached to their observations.

A direct original-JP2-to-JPEG attempt was terminated after more than 17 minutes with a zero-byte output. A MEM intermediate with two decoder threads completed the broad reduced crop in 81 seconds; subsequent native windows completed in roughly 9–17 seconds. Two changes were made together, so the cause was not isolated. Separately, Presquile’s worker completed while its SSH session stayed open; completed files and the remote receipt established completion, so only the dangling connection was stopped. The crop was not rerun in response to an observation timeout.

Blair’s upstream fork correspondence remains unresolved. At Corney, the first modern proposal was a bank closure about 60 m upstream of the coast; the actual coast junction was then identified, but the source mouth is obscured among broken coast/road lines and canyon hatching. An engraved southern fork could not be assigned confidently to the modern South Branch rather than a smaller tributary. These proposals were never scored or fitted. Lowland Cove connectivity also remains unresolved. Search records are retained under `unscored-proposals/` and `search-outcomes.json`.

Pause this north refinement provisionally and continue **Victoria northwest → Victoria main → Cape Breton main → Inverness south**. Additional defensible coast intervals, interior checks, edges and seams are needed. Neither two diagnostics nor one fresh check establishes full-panel accuracy. All previous observations, failed trials, accepted south inputs and production tools remain unchanged. No catalog activation, tiles or deployment occurred. Historical imagery retains David Rumsey / Stanford credit and recorded CC BY-NC-SA 3.0 terms; the reference is original NSTDB geometry.

## Reproduction

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/inverness-north-continuation-20260914/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
web/node_modules/.bin/rolldown reports/church/inverness-north-continuation-20260914/verify_import.ts --platform node --format esm --file /tmp/church-north-import.mjs
node /tmp/church-north-import.mjs
web/node_modules/.bin/rolldown reports/church/inverness-north-continuation-20260914/north-tip-trial/verify_embedded.ts --platform node --format esm --dir /tmp/church-north-embedded
printf '%s\n' '{"type":"module"}' > /tmp/church-north-embedded/package.json
node /tmp/church-north-embedded/verify_embedded.js
```

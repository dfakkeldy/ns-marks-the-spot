# Richmond / Inverness south: first paired seam review

**The two frozen fits place Cranberry Island's centroid 209.98 m apart and southwestern Crammond Island's centroid 17.08 m apart.** These are local seam measurements, not whole-seam acceptance. Crammond is already a south control, so its near agreement supplies no fresh independent south validation. Neither fit, control inventory, source observation nor raster was adjusted.

Two independently traced Richmond observations are added to its frozen affine14 validation. Richmond now has **sixteen fresh checks, 220.70 m horizontal ground RMS**. South retains its original three fresh checks and **132.18 m RMS**. The 20–30 identifiable-check ambition and broader geographic coverage remain unmet; no whole-panel acceptance follows.

| Shared feature | Richmond role / error m | South role / error m | Between-sheet separation m |
|---|---|---|---:|
| Cranberry Island | R54 fresh / 124.99 | IS35 fresh / 98.47 | 209.98 |
| Southwestern Crammond | R55 fresh / 16.21 | IS11 control / 1.05 against common reference | 17.08 |

At Cranberry, Richmond is about 10 m west / 125 m south of the modern centroid; south is about 70 m east / 70 m north. Their errors therefore differ rather than cancel in the seam comparison. At Crammond, south still interpolates its unchanged original control target. The newly computed original-geometry centroid differs from that old target by **1.05 m**, recorded separately without attributing an unproven cause or changing either target.

The two-pair descriptive seam RMS is 148.97 m. It mixes a fresh/fresh pair with a fresh/control pair and is not an independent geographic RMS or a new acceptance gate. All separations use the existing 6,371,008.8 m sphere and mean-latitude cosine convention. Direction is Richmond minus south for seam vectors, and warped minus modern reference for geographic errors.

## Fresh Richmond phase and preserved history

The new-two geographic RMS is 89.12 m, median 70.60 m, empirical P95 119.55 m, maximum 124.99 m, bias -2.52 m east / -69.94 m north, and scatter 55.18 m. Both source points lie outside the Richmond control hull. Their judged observation uncertainty is 150 m each; it is not subtracted. A 16 m computed discrepancy does not establish 16 m cartographic precision.

The cumulative sixteen have median **188.09 m**, empirical P95 **343.57 m**, maximum **378.33 m**, bias **-62.58 m east / +39.37 m north**, and scatter **207.95 m RMS**. The retained v4 baseline gives 292.97 m RMS on the same sixteen. P95 is a linear sample percentile, not a confidence guarantee.

The [preceding Richmond phase](../coverage-continuation-20260914/README.md) preserves its fourteen first results. Its previous six/eight phases and 28 selection diagnostics remain unchanged. No new check was promoted or used to tune a fit. The [south first validation](../south-tps13-validation-20260915/README.md) remains three points; IS35 is reused here with its original source coordinates and first 98.47 m result. IS11 remains a control. The July south acceptance and Richmond v4 baseline are preserved.

`freeze.json` pins both selected fits, source observation inputs and prior inventories to nightly ancestry commit `f10c2875b773115f226573d7f25af81ef5985ad8`. `baseline-inputs.json` protects the retained baseline and earlier phase results. `R54-first.json`, `R55-first.json` and `seam-first.json` retain the first scores.

## Native correspondence and reference geometry

The hash-verified original Richmond TIFF is **35,735 × 30,429**. Measurements come from unrotated native crops, with origin, extent and display frame recorded in each observation. Inverse-fit coordinates in `search-evidence/search-packets.json` locate search windows only; none was adopted as an observation.

**R54 / IS35:** The small triangular island has a westward nose, northern edge and southeastern corner, with a detached small island immediately west. Boom Island lies south, Martins Cove northwest and the larger Round Island northeast. This topology identifies Cranberry even though the Richmond label nearby reads ROUND ID for the neighbouring context. Neither label position supplies a coordinate. Original coastal-island features WACOIS10 **23467 and 23468** form the common exterior. The neighbouring C01 control is a different, larger island and is not an alias of this feature.

**R55 / IS11:** The southwest member of the Crammond pair is elongated north–south, with a broad southern body and a narrow eastern bite beside its small lobe. A narrow strait separates it from the northeast member. The complete southwest exterior, WACOIS10 **23429**, is measured; the larger island, intervening water and nearby ponds are excluded. Native outlines and modern ring segments are retained. Centroids use coordinates translated near the origin for stable area calculation.

The preliminary raster-footprint check found no Richmond alpha at Cameron Island. That result only excluded it from this seam sampling; it is not a claim that the geographic feature is absent. The two adopted locations have actual mapped content on both rasters. They sample two separated locations, with intervening shoreline still unverified.

## Actual rasters, terrain and limitations

Four actual-raster/reference windows and two paired figures are in `warped-review/`. All inspected source positions have nonzero alpha. The two Crammond centroids nearly coincide, while both drawings differ from parts of the modern shoreline. Cranberry shows the north–south seam gap directly. Thus centroid agreement and complete coastline agreement remain distinct claims.

Both existing 20 projected-metre GeoTIFFs are byte-identical:

- Richmond affine14: `c44fd27bf527f468a779a7b37218ab402b5bf306c9a3b9cae5bb8769eba15fd0`.
- Inverness south TPS13: `b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040`.

Their earlier full-content alpha and distortion receipts still apply to those exact bytes; no new whole raster was rendered. The actual browser review switches between the persisted rasters at each feature, with only one active at a time at 70% opacity. Both ordinary 2D and 10× terrain at 50° tilt/north up were inspected. Terrain supplies landscape context; native pixels and numerical seam measurements do not come from perspective screenshots. No new import or raw-scan mesh acceptance is claimed. `browser-review.json` indexes the local captures and DOM states.

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/richmond-south-seam-20260915/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays first geographic scores, cumulative phases and both seam pairs, audits native frames and original exterior segments, and checks frozen input/raster and browser receipts. Three editable Richmond inventories round-trip through the production parser and compare the affine with GDAL at checks and content-boundary vertices. Computational and rendering verification does not establish geographic acceptance.

All eight geographic metric replays, both seam-pair replays and all 428 Church tests passed. The three parser/affine comparisons remained below 0.001 projected metre, and the browser returned no console errors. These local results remain separate from hosted CI and geographic acceptance.

Continue independent checks and shared-feature coverage without tuning to these results. No activation, tiles, publication or deployment follows. Source-derived figures retain David Rumsey Map Collection / Stanford Libraries attribution and recorded CC BY-NC-SA 3.0 terms; modern geometry retains provincial provenance and browser terrain retains Mapzen/source attribution.

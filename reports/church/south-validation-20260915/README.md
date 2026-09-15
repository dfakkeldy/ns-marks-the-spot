# Inverness south: frozen-fit distributed validation

The unchanged four-control physical affine has **ten fresh checks, IS20–IS29**, with **337.00 m horizontal ground RMS**. The same ten on the preserved accepted-baseline TPS give **391.31 m**. The 250 m working target is not met, and this southwest-heavy sample does not establish whole-panel accuracy. No new fit, promotion, coordinate adjustment or model-selection trial followed these scores. The [northern expansion](northern-expansion/README.md) adds IS25/IS26; the [road expansion](road-expansion/README.md) adds IS27–IS29. The original first-five and first-seven phases remain preserved.

| Check | Physical feature | Affine4 error m | Accepted-baseline TPS error m | Stated uncertainty m |
|---|---|---:|---:|---:|
| IS20 | MacNeil Point western corner, engraved Ragged Point | 282.43 | 588.84 | 150 |
| IS21 | Long Point western shoreline extremum | 70.21 | 244.81 | 200 |
| IS22 | Brileys Lake outer-shore area centroid | 331.14 | 268.88 | 180 |
| IS23 | Lake Murray western lake/stream connection | 285.69 | 32.40 | 150 |
| IS24 | Horton Lake outer-shore area centroid | 385.89 | 98.93 | 150 |
| IS25 | Sheas Brook / Mull River junction | 353.94 | 524.91 | 150 |
| IS26 | First Lake O’Law outer-shore area centroid | 400.94 | 472.52 | 180 |
| IS27 | Doyle’s Bridge north-approach road junction | 511.89 | 498.53 | 150 |
| IS28 | West Lake Ainslie Road / Highway 395 junction | 112.00 | 190.34 | 150 |
| IS29 | Glencoe Road / Whycocomagh Port Hood Road junction | 387.60 | 507.81 | 150 |

All ten source points lie **outside the retained control hull**. The fresh sample's median is **342.54 m**, empirical P95 **461.96 m**, maximum **511.89 m**, mean residual **+84.63 m east / −151.74 m north**, and scatter about the mean **288.76 m RMS**. Ground distances retain the existing 6,371,008.8 m sphere and mean-latitude cosine convention; direction is warped minus reference. P95 is a linear sample percentile, not a confidence guarantee. Observation uncertainty is not subtracted.

Within the original southwest group, the two coast checks give 205.78 m RMS on affine4 versus 450.92 m on the accepted baseline; the three southwest lake features give 336.74 m versus 166.47 m. These tiny regional groups expose differing error patterns rather than establish regional acceptance or justify a model change. Full individual residuals are in `accuracy-summary.json`, `regional-summary.json` and the ten `ISxx-first.json` files.

## Frozen phase and preserved history

`freeze.json` records the unchanged retained controls, source-branch ancestry and raster before these observations were adopted or scored. The original first results remain untouched. `snapshots/first-five-accuracy.json` preserves the byte-exact first-five aggregate for later expansion of this batch.

The previous IS15/IS18/IS19 phase was consumed by explicit refinement comparisons in [the south continuation](../inverness-south-continuation-20260915/README.md). Those observations remain diagnostics and are not pooled here. The unselected five-, six- and seven-control trials were not evaluated on this new batch. The three road checks have their own 376.30 m RMS phase; no uncertainty allowance is subtracted and no road check was promoted. The July controls, eleven checks, original acceptance gates, results and artifact remain unchanged. No claim about the historical acceptance is revised.

Continue collecting distributed checks against this frozen fit without tuning during collection. The 20–30 identifiable-check ambition remains unmet; do not fill it with unresolved matches or reset the fresh phase by repeatedly promoting every failure.

## Original-source correspondence evidence

Each `observations/ISxx.json` contains the original JP2 identity/hash, native source coordinates, crop origin/extent/display frame, source crosshair or outline, modern geometry, uncertainty and identity evidence. The original scan is 34,427 × 34,543 pixels; these editable coordinates belong to that scan, not the reduced review GeoTIFF.

- **IS20:** The engraved cape's northern coast approach ends at a western corner, returns east and then trends south toward Little Judique Harbour. This identifies the western of the modern coast's two small noses, WACO20 10783 v2. Gazetteer MacNeil Point CAXAH identifies locality only. The historical label does not establish a documented renaming.
- **IS21:** The explicitly labelled Long Point is a projecting mainland turn. The modern western extremum, WACO20 10434 v16, is broader and rounder than the engraving; its 200 m uncertainty acknowledges that weaker point definition. The 70 m result is retained without overstating its precision.
- **IS22:** Native enlargement resolves the unlabelled Brileys Lake north of Queensville: a small northeastern lobe, larger western basin, indentation and a southern stream that first bends west and then southeast. The modern Brileys Lake CAFCO and original stream 212551 have the same topology. The initial overview was insufficient; the enlarged measured outline is preserved. Short ink gaps and southern lettering limit tracing precision. No exact full-shoreline agreement is claimed.
- **IS23:** The labelled Lake Murray tapers to a western neck and a stream bending west/south. Its original reference node is shared by WALK20 135963 v83 / 135964 v0 and WARV50 210025 v0. The source crosshair is at the lake/stream neck, excluding the nearby dashed road and large label.
- **IS24:** Horton Lake's label, northwest water connection, sloping northern shore, southwest indentation, eastern hook and southern stream match the original reference basin west of Dorton Bridge and south of Lake Murray. The traced polygon excludes adjoining streams and the dashed road northwest of the lake.

The two area centroids use complete outer-shore polygons, with internal islands ignored symmetrically. Coordinates were translated before shoelace arithmetic and independently compared with Shapely. `lake-exterior-audit.json` verifies every original exterior edge: Brileys has 211 edges from WALK20 124540/124541; Horton has 542 edges from WALK20 140453/140521/140522/140523/140524. The broader search ID lists include streams that only touch shore endpoints; these are distinguished from the actual exterior lines. No mainland pond is substituted for an island.

The displayed Brileys native context was resized by the image viewer. Measurement instead used an explicitly generated 1000 × 1240 crop with its own original-scan frame. Lake Murray's enlarged measurement crop likewise records its derived frame. `crop-provenance.json` retains both parent images/hashes and frame conversions. `withheld.json` preserves the unscored Red Lake search: the modern polygon is available, but no corresponding source outline was established. This does not assert historical absence.

## Reference coverage, actual raster and browser

The earlier extracts leave a southwest reference gap. `reference-receipt.json` records a fresh original NSTDB extract for `-61.65,45.65,-61.30,46.02`: **2,406 unique features**, paged in OBJECTID order and checked against a separate complete ID query. Original geometry is retained without clipping or simplification. Every observation cites its exact feature/vertex or exterior and the extract hash. Public name points identify features, not measurement coordinates.

The selected `south-explicit-affine-20m.tif` remains byte-identical, SHA-256 `f3036573572ccadc3a50b87a9e13e82036d7ff3698a6ea4602cbd4fd03d4f176`. Its earlier explicit-affine correction and zero-hole result over 22,718,783 expected interior cells remain applicable to these unchanged bytes. No new full raster was generated. The old accepted July artifact remains separate.

The five original actual-raster/reference windows in `warped-review/` two windows in `northern-expansion/warped-review/` and three in `road-expansion/warped-review/` show the coast and lake discrepancies directly. Each inspected source position has nonzero raster alpha. Long Point is close; MacNeil Point is north of its reference, while the lake features are south or southeast. A contact sheet summarizes the original five windows; the northern and road windows are preserved separately. These figures are actual raster pixels with original reference vectors, not inverse search guides.

The previously imported GeoTIFF remains the only active My Maps raster, at 70% opacity, after navigation/reload. Browser review compares 2D with **10× terrain, north up and 50° tilt** at MacNeil Point, Long Point, Brileys Lake and the Lake Murray/Horton area. Terrain clarifies relief and basin context but does not supply observation coordinates. Large screenshots and DOM receipts remain in the local cache, indexed by `browser-review.json`. The expansion adds Sheas–Mull and First Lake O’Law, including a 0° tilt view where exaggerated slopes hide the lake bottom; its receipts are in `northern-expansion/browser-review.json`. Road-junction terrain review and its separate transport-layer provenance are in `road-expansion/`. No raw-scan mesh acceptance, new import or new artifact-decoder claim is made by these passes.

## Verification and remaining coverage

From the repository root:

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-validation-20260915/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

All 428 Church unit tests passed. The report verifier replayed 34 metric sets, checked three derived crop frames and three original lake exteriors, and confirmed unchanged accepted inputs and raster bytes.

`verify_import.ts` round-trips the retained controls and fresh-validation CSV through the production parser and compares the affine with GDAL at the checks and content-boundary vertices. Verification of solvers and rendering does not establish geographic acceptance. Acquisition/crop scripts are historical recipes; use the verifier to replay the frozen report without refreshing its inputs.

Further checks should balance this southwest group with central/northern interiors, eastern reaches and shared-feature seams. Coverage remains insufficient even where points lie inside the content boundary. The current ten fail the working RMS target. No whole-panel acceptance, catalog activation, tiles, publication or deployment follows. Source-derived imagery retains David Rumsey Map Collection / Stanford Libraries credit and recorded CC BY-NC-SA 3.0 terms; modern geometry retains provincial provenance.

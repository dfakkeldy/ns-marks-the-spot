# Richmond: western-interior junction validation

**Seventeen fresh checks give 217.70 m horizontal ground RMS on the unchanged Richmond affine14 fit.** New R56, Buchanan Lake's northwestern lake/stream junction, gives **162.34 m** error. Retained v4 TPS is better at this individual feature, **114.59 m**, and that comparison remains preserved. No fitting or coordinate adjustment followed the first score.

The cumulative median is **186.38 m**, empirical P95 **341.25 m**, maximum **378.33 m**, bias **−49.43 m east / +35.82 m north**, and scatter **208.97 m RMS** about the mean. The same seventeen on v4 give **285.58 m RMS**. Distances retain the 6,371,008.8 m sphere, mean-latitude cosine and warped-minus-reference convention. P95 is a linear sample percentile, not a confidence guarantee. R56's judged uncertainty is 180 m and is not subtracted.

## Physical observation

The long east-west Buchanan basin has separate northwest and west water connections, further northern/eastern tributaries, and a road along its north side. That sequence distinguishes it from McIntyre Lake and the earlier R31 junction to the west. The new point is the upper-west lake/stream transition, not the lower western connection, a namepoint or a whole-basin centroid.

Display **[527,543]** in the unrotated 1600×1600 native crop at origin **[8800,14900]** gives source **[9327,15443]**. Enlarged inspection resolves the northwest approach and upper-west shoreline turn, with a short ink gap at their convergence. The matching original node is **WARV50 196884 v0 / WALK20 124547 v0 / WALK20 124549 v31**, **[−61.10795839728032,45.648694522043]**. Both the native crosshair and marked exact-reference node were reviewed before scoring.

The first residual is **+160.97 m east / −21.04 m north**. R56 lies inside the control hull, which does not guarantee local accuracy. It is a distinct physical feature near already studied western-interior lakes, so it supplies a limited spatial-coverage increment rather than a new widely separated region. Source pixels, original reference IDs, frames and hashes remain in `observations/R56.json`.

## Preserved searches and inputs

The Black River and Rae Brook candidates did not yield securely identified source-side junctions; no points or scores were adopted. False Bay Lake's drawn outline also did not establish a secure modern basin correspondence. A bounded original-water query returned **104 features**, with its IDs independently checked against the service. All were already in the earlier cache with unchanged geometry. This rules out a newly filled cache gap for that query, not the existence of water or a possible historical change. Query parameters, hashes, source crops and abstentions are retained under `search-evidence/`.

The original 35,735×30,429 Richmond TIFF was re-hashed during this continuation and matched **462194ca1ca810d88416d7cd344f17c5f37acf20c8e43381dc3064668010a5f7**. `freeze.json` pins the selected controls, preceding sixteen-check inventory/summary, selection freeze, v4 controls and existing diagnostics to nightly ancestry commit **5b2c963867bb2bd628ec5e5433a66e6a0ef1c68a**. The [preceding seam report](../richmond-south-seam-20260915/README.md), earlier failures, 28 selection diagnostics and retained baselines are unchanged. The cumulative CSV preserves the exact prior byte prefix.

## Actual raster and browser

The existing 6,532×4,513 EPSG:3857 review raster remains byte-identical, SHA-256 **c44fd27bf527f468a779a7b37218ab402b5bf306c9a3b9cae5bb8769eba15fd0**. Its actual raster/reference window shows the eastward discrepancy, and the measured source position has nonzero alpha. Prior full-content alpha and constant-affine distortion receipts remain applicable to these bytes. No whole raster was regenerated.

The persisted affine14 raster was selected as the sole active historical layer at 70% opacity for 2D and **10× terrain** inspection. `browser-review.json` records the actual views and local capture hashes. Terrain supplies basin context; measurement coordinates come from the native scan and original vector geometry. No new import or raw-scan mesh acceptance is claimed.

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/richmond-interior-validation-20260916/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays the first check, cumulative seventeen and preserved sixteen against both fits. It checks original lake/stream vertices, native frames, frozen input/raster hashes, the bounded cache audit and browser evidence. Three editable inventories round-trip through the production parser and compare affine predictions with GDAL at checks and content vertices. All six metric sets replayed, all three parser/affine inventories passed, and all 428 Church tests passed. Browser console inspection returned no errors. Use frozen caches; acquisition/adoption scripts are archival recipes.

Additional defensible coverage remains sparse, and the 20–30-check ambition and whole-panel/seam acceptance remain unmet. Retain the provisional affine and continue **Inverness north → Victoria northwest → Victoria main → Cape Breton main → Inverness south**, revisiting Richmond with new identifiable features or shared-sheet evidence. No weak quota matches, catalog activation, tiles or deployment follows. Source-derived figures retain David Rumsey / Stanford attribution and recorded CC BY-NC-SA 3.0 terms; provincial reference and Mapzen terrain provenance remain intact.

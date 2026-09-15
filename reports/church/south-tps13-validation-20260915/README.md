# Inverness south: frozen TPS13 validation

**Five fresh physical checks give 144.60 m horizontal ground RMS.** No tuning, promotion or coordinate adjustment followed these first scores. The result supports only these local observations; it does not establish the 250 m whole-panel target. Northern, intervening-area, broader coastal and seam coverage remain insufficient.

| Check | Physical feature | TPS13 error m | Accepted-baseline TPS error m | Judged uncertainty m |
|---|---|---:|---:|---:|
| IS34 | MacPhail Brook / River Denys confluence | 195.89 | 209.01 | 150 |
| IS35 | Cranberry Island outer-shore centroid | 98.47 | 360.11 | 180 |
| IS36 | MacGregors Lake / engraved Beaver Dam Lake outer-shore centroid | 65.93 | 35.51 | 180 |
| IS37 | Port Hood Island western Susannah Point | 192.46 | 318.87 | 150 |
| IS38 | Henry Island eastern Fishery Point corner | 122.83 | 537.98 | 180 |

The five-check median is **122.83 m**, empirical P95 **195.20 m**, maximum **195.89 m**, bias **+38.12 m east / -48.45 m north**, and scatter **130.80 m RMS** about that mean. The accepted baseline on the same five gives **336.37 m RMS**. Ground distances use the existing 6,371,008.8 m sphere and mean-latitude cosine, warped minus reference. P95 is a linear sample percentile, not a confidence guarantee. Observation uncertainty is not subtracted.

The original three-check phase remains preserved at **132.18 m RMS** in `snapshots/first-three-accuracy-summary.json`. The [western expansion](western-expansion/README.md) adds two checks at **161.44 m RMS** without tuning, promotion or changing the first three. All first files and the original freeze remain unchanged.

IS34 and IS36 lie inside the control hull; IS35, IS37 and IS38 lie outside. MacPhail is approximately 1.4 km from the prior McLennan diagnostic on the same river. It adds a separate water junction, but little independent regional coverage. The two western checks are on adjacent islands, about 3 km apart. All five remain in the southern half. The aim of 20–30 defensible distributed checks remains unmet.

## Frozen inputs and identity evidence

`freeze.json` pins the selected TPS13 controls, original selection freeze and raster to nightly ancestry commit `55e441cae34682f224789632a6876022dc964804`. The [distributed-fit report](../south-distributed-refinement-20260915/README.md) preserves every comparison and promotion. Its fourteen diagnostic scores are not pooled with these three fresh results. The original accepted July controls, eleven checks, gates and artifact remain unchanged.

- **IS34:** The northern MacPhail tributary joins the east-west River Denys reach above a westward bend and a southward turn toward Chisholm Bridge. That branch order distinguishes it from McLennan downstream. Three original WARV50 lines share the exact reference node: 266451 v523, 266452 v0 and 274779 v488. The native crosshair is on the drawn water junction, away from road ink.
- **IS35:** The named triangular island lies between Martins Cove and the Boom peninsula, with a small detached islet immediately west and Round Island northeast. The traced exterior excludes the satellite and follows the coast beside the initial C of the label. Original WACOIS10 23467 and 23468 close the modern exterior. A coastline-only search initially found no closed polygon because the island uses the separate coastal-island class; no substituted pond polygon was used. The earlier Round/Cranberry naming ambiguity concerned different eastern candidates, which remain withheld (`historical-alias-audit.json`).
- **IS36:** The engraved lake's narrow northern lobe, broad southern basin, western recess beside the northwest stream and southern outlet agree with MacGregors Lake. The surrounding Lake Murray/Horton sequence and river/road context support the identity. This is a physical correspondence, not a documented renaming. WALK20 136538, 136645 and 136646 supply the original exterior; incoming and outgoing stream lengths are excluded. Gazetteer CAWLJ identifies locality only.

- **IS37:** The westernmost corner of the southwest shoulder is cleanly visible below the north-coast property labels on Smith’s / Port Hood Island. The broad northern cap, west-side concavity and long southern Portsmouth spit establish identity. Original WACOIS10 20913 v32 supplies the western longitude extremum.
- **IS38:** Henry Island’s visible eastern coast ends in an upper eastward corner above a small southeast recess. That corner, beside engraved Fishery Point, matches the unique eastern longitude extremum, WACOIS10 22576 v5. The western coast is obscured by the printed panel edge, so no missing shoreline or whole-island source centroid is inferred.

All source coordinates belong to the original 34,427 × 34,543 Inverness JP2. Crop frames, hashes, traced rings and crosshair images are preserved in `observations/`. Centroids use translated coordinate frames for stable area calculations. Native line thickness, faint gaps and historical shoreline generalization limit precision. The judged uncertainty values are not independently measured error bounds.

A new unresized crop of the lower Lake O’Law area clarified its banks but did not establish an exact shared lake-mouth/bridge point. It remains unscored. The earlier withholding and new source detail are preserved in `search-evidence/`; no quota-driven point is added.

## Actual artifact and terrain review

The unchanged raster is:

`/Users/dfakkeldy/Downloads/church-south-distributed-refinement-20260915/rendered/inverness-south-tps13-review-20m.tif`

SHA-256: `b849ad07dd0d61dcb8484e257090bc19721cb995fa608c41874f4c13ee237040`.

The original three actual-raster/reference windows show MacPhail displaced mainly south, Cranberry northeast, and the lake slightly west. Two added windows in `western-expansion/warped-review/` show Susannah Point southeast and Fishery Point northeast of their references. All inspected source positions have nonzero alpha. Earlier full-content coverage remains applicable to these exact raster bytes: zero holes across 22,702,159 interior cells and no sampled orientation reversals in 36,615 samples. Those are rendering/distortion checks, not geographic acceptance or continuous-surface proof.

The persisted browser map remains the sole active My Maps raster among sixteen records, at 70% opacity and the expected 4,751 × 6,488 source dimensions. The original three areas and the two added western points were inspected in 2D and with terrain at 10×, north up and 50° tilt. Terrain clarifies the southwestern basin and valley setting; flat island water and exaggerated slopes still require the ordinary 2D comparison. No source pixels or reference coordinates were measured from a perspective view. Local captures and DOM receipts are indexed in `browser-review.json` and `western-expansion/browser-review.json`. No new raster import or raw-scan mesh acceptance is claimed.

## Verification and next work

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/south-tps13-validation-20260915/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
```

The verifier replays ten first scores, the cumulative five, the preserved first-three phase and the western two, checks original exterior segments and confluence vertices, confirms frozen input/raster hashes, and audits the rendered evidence. Three editable inventories round-trip through the production parser and compare TPS with GDAL at the new checks and content vertices. This verifies computation and import compatibility, not whole-panel geography.

All sixteen expanded report metric replays and all 428 Church tests passed. The original first-three verification receipt remains preserved. The browser returned no console errors; the parser/TPS comparisons stayed below 0.001 projected metre. These are local verification results, separate from hosted CI and geographic acceptance.

Continue this frozen validation phase across northern/intervening areas, western coast and shared-feature seams. Preserve first failures and do not retune to each new check. No whole-panel acceptance, catalog activation, tiles or deployment follows from this batch. Source imagery retains David Rumsey Map Collection / Stanford Libraries attribution and recorded CC BY-NC-SA 3.0 terms; reference geometry retains provincial provenance and browser terrain retains Mapzen/source attribution.

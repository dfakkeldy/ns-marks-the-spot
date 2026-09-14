# Church target refinement — active work

The full georeferencing goal remains **active and incomplete**. Work resumes from the merged distributed-review report (`09e3adf467b6d684934303fae2306cbbcd390263`, on nightly history). Previous accepted baselines, observations and failed results are unchanged. `status.json` records current work and external caches.

Richmond currently has a separate fourteen-control TPS candidate, not a replacement for v4. Three isolated R26/R27 support trials and a distributed-support trial are preserved in `richmond/`. The candidate adds unchanged R21, R26, H03 and G01 as controls; all aliases are removed from the subsequent diagnostic set. The old first validation phases remain historical evidence and are now diagnostic for this refinement.

On the same 20 retained diagnostics, v4 has 186.96 m RMS / 529.11 m maximum; candidate14 has 194.08 m RMS / 361.02 m maximum. Median and P95 worsen, so this is a tradeoff, not a uniform accuracy improvement. Candidate14 outperforms the other supported fourteen-control affine/polynomial2 models. Finite derivative sampling finds zero orientation reversals in 37,159 samples; maximum sampled anisotropy is 1.241. This is not a proof between samples.

The frozen candidate's full-content 20 projected-metre raster has zero transparent cells in 20,831,588 expected interior cells with one-cell boundary tolerance. It is 6,637 × 4,522, EPSG:3857, SHA-256 `10e22efaf4d64e93c7ef21594a62c5ae947a7f494f1387a6a158c6d5c852614d`. The source/cutline/control receipts and renderer are in `richmond/`; the large GeoTIFF stays in the external cache.

Six new post-freeze checks now score **292.00 m RMS** (v4 on the same six: **270.59 m**). Candidate14 is rejected as a replacement; v4 remains unchanged. Barren Lake R35 fails at 542.50 m, while the eastern church-adjacent pond R34 is 123.17 m. Their first results and the earlier four-check phase are preserved separately. No tuning followed. All six lie inside the source control hull, but sparse and partly correlated coverage does not establish whole-panel accuracy. Northern extension, southwestern mainland, intervening interior and seams remain unfinished. See [Richmond's report](richmond/README.md) for all metrics, definitions and limitations.

The user proposed viewing the sheet on the recently added 3D terrain at high exaggeration. The local comparison page uses the web map's current MapLibre runtime and Mapzen terrain style, exact EPSG:3857 raster-image bounds, and original NSTDB water lines. Both v4 and candidate14 have been visually inspected at 10× exaggeration and 55° tilt. It makes basin/network displacement easier to inspect; native scan and original reference coordinates still define observations. This separate preview is not the main-app importer/mesh path. The main app imported v4 in the in-app browser, but that browser's capture clipped the viewport. Brave's file-chooser permission and the locked Mac prevented a native-picker run; the separate preview works without those permissions. No security setting was changed.

Full georeferencing, fresh distributed validation, seams and geographic acceptance remain unfinished. No tiles, catalog activation or deployment. Source-derived imagery: David Rumsey Map Collection / Stanford Libraries, recorded CC BY-NC-SA 3.0. Reference: original official NSTDB; terrain: the web map's credited Mapzen sources. Height exaggeration is a viewing transform, not measured vertical accuracy.


Reproduction from the repository root, using the recorded external caches:

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/target-refinement-20260913/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
web/node_modules/.bin/rolldown reports/church/target-refinement-20260913/verify_import.ts --platform node --format esm --file /tmp/church-target-import.mjs
node /tmp/church-target-import.mjs
```

The new audit replays 34 numerical comparisons and six source/reference observations, verifies landed frozen inputs, exact source-frame conversions, original reference vertices/rings, control/check isolation, hashes and both frozen fresh phases. All 428 Church tests pass. Six inventories round-trip through the current production web parser. These checks do not establish browser mesh accuracy or geographic acceptance. The other panels retain the landed distributed-review states and sequential order.

# Church coverage continuation — provisional Richmond affine

The full georeferencing goal remains **active and incomplete**. A simpler fourteen-control affine is now the preferred Richmond candidate for continued validation. On **six new post-freeze physical checks**, it measures **199.87 m horizontal ground RMS**, median **188.09 m**, empirical P95 **261.30 m**, maximum **266.81 m**, and mean residual **44.28 m east / 41.47 m north**. Unchanged v4 on those same six measures **230.00 m RMS** and **433.09 m maximum**. The affine's median is slightly worse than v4's 177.06 m; this is not a uniform improvement.

This initial sample covers a southwestern mainland creek, Isle Madame interior, northern extension, central interior, eastern interior and the Fourchu edge. Three points are outside the source control hull. Six checks do not establish the requested whole-panel coverage or replace the aim for 20–30 identifiable distributed checks. Southern mapped content, intervening interior and coastal intervals remain sparse, and seams remain unverified. No new geographic acceptance, catalog activation, tiles or deployment. The retained v4 baseline and accepted Inverness south inputs are unchanged.

The [Richmond report](richmond/README.md) records model selection, fresh phases, source definitions, exclusions and raster evidence. The fourteen fitting coordinates never changed. All 28 features used to select the affine remain diagnostic; its six fresh checks are separate. Original TPS failures and every earlier phase remain preserved. Predecessor inputs are pinned to landed nightly commit `683ec77ce970db6f1a997795008c8694ce305b8d` (PR #476), not a deleted PR-branch commit.

The affine GeoTIFF uses the full expanded review content boundary, exact transformation and 20 projected-metre cells. It has zero transparent holes across 20,839,213 expected interior cells, with a one-cell boundary tolerance. All six observed source locations are present in the actual raster, including the Fourchu tip close to the cutline. Six raster/reference windows were inspected. A nonsingular affine has no folds; that mathematical property does not establish geographic accuracy. Source-cutline review and seams still bound what can be claimed.

The local terrain comparison shows v4, failed TPS14 and provisional affine14 over the web map's current terrain modules. The affine Barren Lake and Melford Creek views were inspected at 10× exaggeration and 55° tilt, with no console errors. It makes the positional tradeoffs visible; observations still come from native pixels and original reference geometry. This separate preview does not verify the main-app importer or raw-scan mesh.

Verification: **37 numerical comparisons** replay; **eight new source/reference observations** verify; **428 Church tests** pass; **four editable inventories** round-trip through the production web parser. The web affine solver agrees with GDAL to less than 0.001 projected metre at checks and the full content vertices. The prior target-refinement report also replays. Tests and receipts are not substitutes for independent geographic coverage.

Run from the repository root with the recorded external caches:

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/coverage-20260914/verify_reports.py
python3 -m unittest discover -s tools/church/tests -t .
web/node_modules/.bin/rolldown reports/church/coverage-20260914/verify_import.ts --platform node --format esm --file /tmp/church-coverage-import.mjs
node /tmp/church-coverage-import.mjs
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/coverage-20260914/richmond/prepare_terrain_preview.py
```

The last command prepares ignored local assets; run Vite from `web/` and open `/__church_coverage_assets/`. The current working preview is `http://127.0.0.1:49370/__church_coverage_assets/index.html`. Large source scans, GeoTIFFs and preview PNGs remain outside Git. `status.json` carries the full objective and panel order: Richmond, Inverness north, Victoria northwest, Victoria main, Cape Breton main, then Inverness south. Other panels retain their last landed states.

Source-derived figures: David Rumsey Map Collection / Stanford Libraries, recorded CC BY-NC-SA 3.0. Reference geometry: original official NSTDB, with exact input hashes and feature/vertex IDs. Terrain: the web map's credited Mapzen/CDEM/SRTM sources. Height exaggeration supplies no measured vertical accuracy.

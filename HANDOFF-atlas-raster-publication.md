# Handoff: publishing the rendered Atlas tiles for iOS

Written 2026-09-06. The iOS app now opens on the NS Marks Atlas and reads it
from rendered tiles at `https://tiles.kinnokilabs.com/atlas-raster/
atlas-raster-20260907.1/…` (`AtlasRaster.tileRevision`). That revision has
been rendered and verified locally but **not published**: the object host
answers 404 for the prefix, so a build from this branch draws the Atlas only
when `ATLAS_TILE_BASE_URL` points at a local server. Publishing is the owner's
explicit step, as it is for the Fletcher sheets.

## What exists

- Package: `~/nsmarks-atlas-raster-20260907/atlas-raster-20260907.1/` on
  this Mac (2.7 GB, 38,303 files: 12,758 tiles per style × 3, 27 ocean
  stand-ins, `source.json`, `coverage.json`). Rendered from the worktree at
  `a82e22a6a` plus this branch's uncommitted script changes, with MapLibre
  6.7.0 in headless Chromium (Metal) from the pinned archive
  `ns-728ab9c9b5d20199.pmtiles`; the receipt records style hashes, the
  OpenFreeMap fetch and per-zoom sizes. Review PNGs (three z13 metatiles and
  three seam checks) sit beside it.
- Publisher: `tools/publish-atlas-raster.sh` (also copied to
  `dan@bazzite:~/publish-atlas-raster.sh`, beside the Fletcher one). It needs
  `R2_ACCOUNT_ID`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` with Object
  Read & Write on `ns-marks-fletcher-tiles`, canaries `source.json` first,
  syncs to `atlas-raster/<revision>/`, then verifies object count, bytes,
  the receipt, ocean stand-ins and a Judique tile in each style through the
  public host.

## Steps

1. Get the package to wherever the aws CLI and token live (bazzite:
   `rsync -a ~/nsmarks-atlas-raster-20260907/ dan@100.95.69.48:~/nsmarks-atlas-raster-20260907/`).
2. `~/publish-atlas-raster.sh atlas-raster-20260907.1 ~/nsmarks-atlas-raster-20260907 ~/nsmarks-fletcher-20260725/deploy/.r2-upload-venv/bin/aws`
   with the three variables exported. Resumable.
3. Point a build at the public host (the default) and see it draw: open the
   app, confirm the strip reads "NS Marks Atlas", pick Atlas Fletcher, zoom
   into Judique. `log stream --level debug --predicate 'subsystem ==
   "com.danfakkeldy.nsmarksthespot" AND category == "AtlasBaseOverlay"'`
   lists any square that failed.
4. Merge. Until step 2 is done, a nightly TestFlight build from this branch
   opens on an Atlas that cannot load (MapKit retries; the panel reports the
   ground failed) — pick OpenStreetMap from Background Maps as the workaround.

## Known limits to carry forward

- Fletcher tiles average 150–200 KB (paper grain at WebP 0.9); Day and Night
  30–70 KB. A lower Fletcher quality or a second revision is a render
  decision, not an app change.
- The Atlas is not part of saved offline areas; only Fletcher sheets are.
- Apple's own place labels still draw over every base-replacing overlay
  (OpenStreetMap included); that predates this work.
- Label placement is per 4×4 metatile, so a label within half a tile of a
  metatile edge can differ between neighbours. None were seen in review.

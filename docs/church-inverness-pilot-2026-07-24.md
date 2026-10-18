# Inverness Church-map georeferencing pilot — 2026-07-24

## Outcome

**Rejected. No web tiles were generated or published.**

The first panel-aware pilot proved that the Rumsey scan can be fetched and
processed with the project pipeline, but the available bootstrap controls do
not support a defensible web overlay. The south thin-plate-spline warp folds
and stretches between sparse controls. The north inverse transform produces
only 43 non-transparent pixels in its bounded output.

The `church-inverness` catalog entry therefore remains unavailable. A
successful GDAL exit code and exact interpolation at control points are not
acceptance evidence.

## Reproducible inputs

- Source: David Rumsey Map Collection item
  `RUMSEY~8~1~353591~90120835`
- Full scan: 34,427 × 34,543 RGB JPEG 2000
- Source SHA-256:
  `37021ed086f7bbce542b519e9a74242acc5b53ed1944880468f6f91d6234a7f8`
- Control/check coordinates: official Canadian Geographical Names Database
  positions paired with visually confirmed labels on the main map
- Visual reference: Nova Scotia Topographic Database primary roads and major
  water polygons
- Compute host: Bazzite over SSH, using the existing `nsmarks-gis` container
- Toolchain: GDAL 3.12.4, GRASS GIS 8.4.2, QGIS 3.44.12
- Warp: independent north/south crops, thin-plate spline, EPSG:3857, 5 metre
  output pixels

The place-label checks below are useful rejection evidence, but they are not
the physical shoreline, river-mouth, and road-junction checks required for
acceptance. A future attempt must add those independent checks rather than
promoting failed checks into fit controls.

## Held-out results

| Panel | Controls | Checks | Affine distortion RMS | TPS check RMS | TPS check P95 | TPS check maximum |
|---|---:|---:|---:|---:|---:|---:|
| North | 4 | 1 | 2,151.6 m | 1,596.6 m | 1,596.6 m | 1,596.6 m |
| South | 11 | 3 | 2,934.8 m | 4,879.4 m | 6,777.4 m | 6,777.4 m |

Per-check south errors:

- Glendyer: 1,789.0 m
- River Denys: 6,777.4 m
- Creignish: 4,721.4 m

The north Grand Étang check error is 1,596.6 m.

## Raster and visual checks

GRASS confirmed the south raster has 5 metre cells and a 25,603 × 27,231
grid. Its alpha histogram reports 461,504,396 non-transparent pixels out of
697,195,293 (66.194422%).

The north raster is 20,038 × 25,971, but its alpha histogram reports only 43
non-transparent pixels out of 520,406,898 (0.000008263%). The north controls
are too sparse and nearly coastal/collinear for a stable inverse TPS surface.

Headless QGIS overlays found:

- kilometre-scale disagreement between the historical raster and modern water
  geometry;
- severe curved fan-shaped stretching in the south panel;
- title art, inset material, and neighbouring-panel content entering the
  rectangular crops; and
- effectively no usable north-panel raster coverage.

These are transform failures, not styling defects. Clipping the output would
hide some artifacts but would not repair positional error.

## Next attempt

1. Trace explicit source-pixel cutlines for the two geographic panels so title
   art, insets, and the neighbouring panel never enter a warp.
2. Capture a distributed control mesh across each panel. Prior published work
   suggests hundreds of anchors may be required for a Church county sheet.
3. Preserve independent physical-feature checks throughout iteration.
4. Require acceptable held-out RMS/P95, usable alpha coverage, and QGIS
   shoreline/road/label alignment before mosaicking.
5. Generate XYZ or PMTiles output only from accepted panel rasters, then choose
   stable tile hosting before enabling the catalog entry.

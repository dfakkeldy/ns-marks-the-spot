# Inverness Church-map georeferencing — second attempt, 2026-07-24

## Outcome

**Not accepted. No tiles were generated. The `church-inverness` layer remains
unavailable.**

This is a large, measured advance on the rejected first pilot, and the north
panel's coastline now registers to a median of about 100 m. It is *not* an
acceptance, for three specific reasons recorded under
[Why this is not an acceptance](#why-this-is-not-an-acceptance).

Nothing here was rejected for folding or for unusable coverage. Both of those
failure modes from the first pilot are gone.

## What changed since the first pilot

| | Pilot (rejected) | This attempt |
|---|---|---|
| Panel geometry | two overlapping axis-aligned rectangles | measured non-rectangular cutlines, no shared pixel |
| North controls | 4 place-label centres | 30 printed-graticule intersections |
| Control provenance | CGNDB coordinates paired to label centres | 5′ graticule, anchor verified against two engraved labels |
| North affine RMS | 2,151.6 m | **98.5 m** |
| North alpha coverage | 43 px (0.000008 %) | **33.65 %** of target box (the whole panel) |
| North held-out error | 1,596.6 m at one label | coastline median **99.9 m** (see caveats) |

### The defect that mattered most

The pilot's controls were place-label centres. A cartographer sets the word
beside the settlement, not on it. Measured on this sheet, the drawn
"CHETICAMP" label sits about **3.7 km** from the CGNDB village coordinate the
pilot paired it with. That error was baked into the controls; a thin-plate
spline then interpolated it exactly and fanned it out in between.

The graticule mesh predicts the CGNDB Chéticamp position inside the drawn
village cluster, which is where it belongs.

## Method

Panels are cut with explicit polygons — see
[`church-inverness-cutlines-2026-07-24.md`](church-inverness-cutlines-2026-07-24.md).

Controls come from the sheet's **printed 5-arcminute graticule**, detected by
`tools/church/detect_graticule.py`:

1. block-minimum reduce by 4 inside the panel cutline, eroded 9 px so the
   panel's own bounding rules never enter;
2. threshold at < 140, then **isolate thin structures** — a 5×5 morphological
   opening keeps the dense coastal hachure mass, and subtracting it leaves only
   1–3 px linework. Without this step the Hough transform fits long straight
   lines through the hachure band along the coast and reports a false family at
   105°;
3. probabilistic Hough, min length 500 (reduced px), max gap 30;
4. angles pinned to 84.5° / 174.5°, measured from a labelled intersection;
5. collinear segments merged and refitted by SVD;
6. `tools/church/fit_lattice.py` fits a regular 1-D lattice per family, which
   rejects roads that happened to look straight, merges duplicate detections,
   and names each line's lattice index.

### North panel lattice

| Family | Lines | Angle | Spacing | Lattice fit RMS |
|---|---:|---:|---:|---:|
| meridians | 5 | 84.5° | 2,332.2 px | 25.8 px |
| parallels | 6 | 174.5° | 3,413.5 px | 15.9 px |

No missing rules; 5 × 6 = **30 intersections**.

### Anchoring — verified, not inferred

Two degree/minute labels were read directly off the scan:

- **60°40′W × 47°00′N** at ≈(12388, 3188). The fitted meridian A0 passes
  through x = 12,389 at that y — a 1 px agreement — and the 47°00′ parallel
  lies 2.005 lattice steps north of parallel index 0.
- **60°50′W** at ≈(9526, 28276). Meridian A2 was *predicted* at x = 9,521
  before the crop was taken; measured 9,526. **5 px.**

Two labels ten arcminutes apart, two lattice steps apart, fixes the step at
**5 arcminutes** and rules out the 10′ alternative. Independently, 10′ spacing
would place meridian A4 offshore at 61°20′W, whereas A4 falls inland of the
coast — consistent only with 5′.

Implied scan resolution ≈ **2.71 m per source pixel**, consistent across both
families.

Anchor: meridian index 0 = 60°40′W, parallel index 0 = 46°50′N, step 5′.

## Exact transformation settings

```
gdal_translate -q -of VRT -a_srs EPSG:3857 \
  -srcwin 1050 780 14734 28360 -gcp <30 control points> \
  inverness-master.tif inverness-north-gcp.vrt

gdalwarp -r bilinear -t_srs EPSG:3857 -tps \
  -cutline inverness-north-cutline-3857.geojson \
  -te_srs EPSG:4326 -te -61.35 46.30 -60.45 47.10 \
  -dstalpha -tr 5 5 \
  -co COMPRESS=DEFLATE -co TILED=YES -co BIGTIFF=IF_SAFER \
  inverness-north-gcp.vrt inverness-north-3857.tif
```

The cutline is pushed through the **same** thin-plate spline as the imagery
(`gdaltransform -tps` on the GCP-bearing VRT), densified every 250 source
pixels first — a TPS bends straight edges, and transforming only the corners
would cut straight chords across a curved warp and shave real content off the
panel edge. `-crop_to_cutline` is deliberately not used, so the output extent
stays pinned to the panel's declared bounds and successive runs stay
comparable.

Output: 20,038 × 25,971 at 5 m, EPSG:3857.

### Accuracy of the fit to its own controls

```json
{"affine_rms_m": 98.52, "control_count": 30, "check_count": 0}
```

98.5 m is the residual of a plain 6-parameter **affine** against the 30
graticule intersections — that is, the graticule is very nearly an affine
image of true coordinates, which is exactly what a carefully drawn projection
frame over 40 × 77 km should be. It is a distortion index for the frame, not
the accuracy of the delivered layer, and it says nothing about the topography
drawn inside that frame.

## Measured agreement with modern data

Reference: Nova Scotia Topographic Database water polygons (`nstdb-major-water`,
102 features, "Coast Water Area polygon" and inland classes).

The metric is the distance from every modern water-edge pixel inside the
clipped panel to the nearest historical ink, sampled at 20 m. It is a **lower
bound** — any ink counts, so dense hachuring or lettering near a shore can
flatter it — but it is reproducible and it covers the whole panel instead of a
handful of hand-picked spots.

### North panel, clipped

| | All water | Coastal water only |
|---|---:|---:|
| samples | 31,580 | 11,491 |
| median | 175.8 m | **99.9 m** |
| mean | 332.0 m | 317.3 m |
| RMS | 550.6 m | 678.1 m |
| P90 | 823.6 m | 875.7 m |
| P95 | 1,043.3 m | 1,544.0 m |
| P99 | 2,500.2 m | 3,236.1 m |
| max | 3,455.2 m | 3,455.2 m |
| within 250 m | 58.5 % | **72.5 %** |
| within 500 m | 76.7 % | **84.3 %** |

### Spatial distribution (coastal, panel top → bottom)

| Band | RMS | Samples |
|---|---:|---:|
| 1 (north tip) | 347.8 m | 1,847 |
| 2 | **1,090.7 m** | 4,115 |
| 3 | 187.9 m | 3,653 |
| 4 (Margaree) | 137.2 m | 1,876 |

The error heat map shows the coastline itself almost uniformly at the low end
of the scale, with the high values concentrated in compact inland clusters.

Band 2 was inspected directly. Its excess is substantially **not**
misregistration: Church drew the interior highland plateau as blank, labelled
only "Barren", while the modern data carries the Chéticamp Lake / Lake of
Islands complex there. The metric measures distance to the nearest ink, so
absence of drawn data reads as large error. Adjacent Victoria County coastline
falling inside the north panel's clip contributes similarly. The Pleasant Bay
shoreline through the same band tracks the modern shoreline within roughly
100–200 m.

Alpha coverage: 50.69 % unclipped, **33.65 %** clipped. The panel is a diagonal
strip inside a rectangular target extent, so a third of the box is the correct
order of magnitude. No folding was observed at any inspection scale.

## Why this is not an acceptance

1. **No held-out physical check set.** The requirement is an independent set of
   named physical features — river mouths, harbour entrances, island tips —
   never entering the fitted transform, reported as RMS / P95 / maximum. That
   set has not been captured. The shoreline distance field above is a useful
   proxy and covers far more of the panel, but it is a lower bound and it is
   not the required measurement. `check_count` is 0.
2. **The south panel has not been attempted with this method.** Its cutline is
   registered and guarded, but no graticule mesh, warp, or measurement exists
   for it. The gate requires both panels to pass; one panel cannot be
   mosaicked or published alone.
3. **The coastal tail is only partly explained.** Band 2's excess is
   attributed to undrawn interior barrens and adjacent-county coastline, and
   that attribution is supported by direct inspection, but it has not been
   isolated numerically. Until it is, a P95 of 1.5 km stands unexplained in
   part, and that is kilometre-scale disagreement.

Consequently: **no mosaic, no tiles, no catalog change, no hosting decision.**

## Smallest credible next step

1. Capture roughly 15 named physical check points per panel — harbour
   entrances, river mouths, island tips, bridges, road junctions — as
   `role=check` rows. Source pixel positions from the scan; modern
   coordinates from NSTDB geometry rather than place-name databases. Run the
   existing `georeference` measurement path to get held-out RMS / P95 / max.
2. Restrict the shoreline metric to the outer sea/land boundary and exclude
   area outside the county Church actually mapped, so the tail becomes
   interpretable.
3. Run the same detect → fit → anchor → warp sequence on the south panel. Its
   graticule angles will differ; pin them from a printed label as was done for
   the north.

Only if both panels then clear the gate does mosaicking become appropriate —
and hosting remains a separate decision after that.

## Reproducibility

- Compute host: Bazzite over SSH, `nsmarks-gis` container
- GDAL 3.12.4, GRASS GIS 8.4.2, QGIS 3.44.12, OpenCV 4.13.0, NumPy 2.4.6
- Versioned inputs: `tools/church/panels.py` (cutlines),
  `tools/church/gcps/inverness-north.csv` (30 controls),
  `tools/church/graticule.py`, `tools/church/cutline_warp.py`
- Generated scans, GeoTIFFs, previews, and tile trees stay out of Git.
- `python3 -m unittest discover -s tools/church/tests -t .` — 113 tests,
  run locally and inside the Bazzite container.

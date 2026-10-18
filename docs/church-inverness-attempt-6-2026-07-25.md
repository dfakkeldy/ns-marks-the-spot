# Inverness Church-map georeferencing — sixth attempt, 2026-07-25

## Outcome

**SOUTH PASSES. NORTH REMAINS UNMEASURABLE AND REJECTED. The combined
`church-inverness` layer remains REJECTED: no mosaic, no tiles, no catalog
change, no hosting decision, and no source URL.**

The acceptance bounds did not move:

| Panel | n | held-out RMS | P95 | max | Verdict |
|---|---:|---:|---:|---:|---|
| Tolerance | — | **≤ 400 m** | **≤ 900 m** | **≤ 1,500 m** | |
| South, attempt 5 | 11 | 457.8 m | 798.4 m | 798.4 m | Failed RMS |
| South, externally corrected | 11 | **333.3 m** | **468.3 m** | **468.3 m** | **PASS** |
| North | 0 usable set | — | — | — | **Unmeasurable / REJECTED** |

The south correction is non-circular. A second Church sheet — Richmond, 1885,
1:84,269 — was independently georeferenced and measured first. Its eight frozen
held-out island centroids put the drawing **367 m east** of modern truth, or
**16.99 arcseconds of longitude**. Only then was a rounded −17″ longitude
correction applied to the Inverness south controls and tested against the same
eleven Inverness checks used in attempts 4 and 5.

The correction consumes no Inverness check point. It therefore supplies the
off-sample evidence attempt 5 required.

## 1. North feature-class probe

Attempt 5 left two honest routes: find a different physical feature class, or
accept that the north panel is not measurable. The cheap modern-side probe was
run before any new drawn-side detector was built.

### Lakes

Already rejected in attempt 5. Thirteen modern highland lakes lie inside the
north cutline, but Church left that terrain as labelled **Barren** and drew no
matching lake population.

### Roads

Rejected before implementation. A modern junction cannot be assumed to be an
1884 junction, and the engraving confounds roads with lot lines, property
boundaries, graticule rules, and hachure. No stable two-sided rule was found
that could identify the same physical junction without using the transform's
prediction to choose it.

### River mouths

This was the only plausible cheap alternative. The official Nova Scotia
Hydrographic Network service was live and non-degenerate:

- service:
  `WTR_NSHN_UT83/MapServer`, layers 9 and 11;
- filter: `LEVELPRIOR = 1 AND FLOWDIR = 1`;
- north bounds: −61.17, 46.35, −60.55, 47.10;
- 23,851 directed edges;
- 168 terminal endpoints within 500 m of the NSTDB `WACO40` marine boundary;
- 66 mouths after coalescing endpoints within 750 m;
- 7 mouths with at least 10 km of upstream primary flow.

The seven largest were Chéticamp River (49.9 km), Margaree River (30.6 km),
MacKenzies River (24.5 km), Fishing Cove River (14.7 km), Farm Brook
(12.3 km), Corney Brook (11.3 km), and Polletts Cove River (11.2 km).
The machine-readable supply is
[`reports/church/north-river-mouth-supply.json`](../reports/church/north-river-mouth-supply.json).

The unchanged-transform contact sheet then answered the historical-side
question. Margaree is clearly drawn. Chéticamp and Fishing Cove might support
a specialised line-class detector. MacKenzies, Farm, Corney, and Polletts do
not show an unambiguous river–sea junction at the predicted search tiles;
roads, lot lines, hachure, and coast linework compete with every apparent
mouth.

That is at most two or three plausible reads, not a meaningful held-out set.
No river-mouth detector was built and no predicted crosshair was recorded as a
point.

**Recommendation: route (b). Treat the north panel as unmeasurable.** The
modern river supply exists, but the 1884 engraving does not carry enough
unambiguous two-sided junctions to validate a panel. Building a detector would
automate ambiguity rather than remove it.

## 2. Why Richmond was the off-sample sheet

Rumsey provides both Victoria and Richmond. Richmond was chosen because the
relevant geography is one continuous main field, while Victoria repeats the
multi-panel composition problem. Richmond also changes both year and scale:

- Inverness: 1884, 1:63,360;
- Richmond: 1885, 1:84,269;
- Rumsey item: `RUMSEY~8~1~373669~90140407`;
- full scan: 35,735 × 30,429 pixels.

The measurement band is the explicit full-sheet rectangle from
(1,000, 8,500) to (32,400, 21,900). It lies below the reference-map/title
material and above the Arichat inset while retaining:

- seven meridians, 61°20′W through 60°20′W;
- two parallels, 45°40′N and 45°30′N;
- 14 graticule-intersection controls.

The anchor is read from the engraved 60°50′W, 45°40′N, and 45°30′N labels. The
control mesh is generated from
[`tools/church/detections/richmond-main.json`](../tools/church/detections/richmond-main.json)
into
[`tools/church/gcps/richmond-main.csv`](../tools/church/gcps/richmond-main.csv).

### A lattice indexing defect caught before measurement

The first generated CSV attached 45°40′ to the southern rule and 45°30′ to the
northern one. A 0.10° tilt left the parallel normal with a tiny positive x
component and a dominant negative y component; `perpendicular_offsets` oriented
it by x first and indexed south-to-north.

The generic invariant is now explicit: orient by the normal's **dominant axis**
— increasing x for meridians, increasing y for parallels. A regression test
holds a nearly horizontal family and requires its offsets to increase down the
sheet. The corrected CSV places 45°40′ at y≈14,673 and 45°30′ at y≈21,309,
matching the engraved labels.

### Why the Richmond island reader is different

Richmond's islands carry names, hachure, roads, and property linework. The
attempt-5 ink-outline reader accepted only 1 of the first 24 candidates and
none of the next 60 smaller islands because internal engraving joins the
shoreline into a dense ink blob.

The Richmond reader instead fills the **paper enclosed by the shoreline** and
traces that paper region's outer boundary. Internal ink becomes a hole and
does not alter the coast-facing boundary. The modern and historical sides are
still the same physical rule: shoelace centroid of the island outline.

Selection remains anti-circular:

- the TPS prediction only defines a 500 px search neighbourhood;
- modern-vs-drawn enclosed area decides;
- multiple size matches are refused;
- duplicate modern candidates resolving to one drawing are both refused;
- the QA sheet is mandatory.

The initial paper-region probe used an area-ratio band of 0.35–1.90. Visual QA,
before any residual was calculated, identified a 0.45 match as an incomplete
island fragment and a 0.49 match as a road/label enclosure. The fixed band is
therefore 0.50–1.50. Eight correct unique outlines fall at 0.51–1.29.

Tightening after visual QA can flatter error even when the rejection is
independent of residual. The Richmond result is therefore an **optimistic
off-sample bound**, not production acceptance for Richmond.

The frozen inputs and scan-derived output are:

- [`tools/church/checks/richmond-main-candidates.csv`](../tools/church/checks/richmond-main-candidates.csv)
- [`tools/church/checks/richmond-main.csv`](../tools/church/checks/richmond-main.csv)
- [`reports/church/drawn-richmond.json`](../reports/church/drawn-richmond.json)

## 3. Richmond's longitude result

Residual convention below is modern coordinate minus the TPS coordinate of the
drawn centroid. Negative dE means the graticule transform places the drawing
east of truth.

| Richmond island | dE (m) | dN (m) | dist (m) |
|---|---:|---:|---:|
| 45.715 N, 60.768 W | −317 | −424 | 530 |
| 45.709 N, 60.762 W | −284 | −448 | 530 |
| 45.555 N, 61.153 W | −25 | −210 | 211 |
| 45.621 N, 60.490 W | −446 | −300 | 538 |
| 45.643 N, 60.492 W | −629 | −504 | 806 |
| 45.614 N, 61.022 W | −310 | −361 | 476 |
| 45.610 N, 60.958 W | −336 | −420 | 538 |
| 45.576 N, 60.652 W | −591 | −874 | 1,055 |

```
mean             dE = −367 m   dN = −443 m      |mean| = 575 m
scatter about it sd_E = 179 m  sd_N = 184 m
longitude component = −16.990 arcseconds = −1.133 seconds of time
```

The full vector report is
[`reports/church/richmond-offset.json`](../reports/church/richmond-offset.json).

Inverness south's independently diagnosed longitude component was −318 m,
about −14.8″. The two sheets differ by only **49 m / 2.2″** in longitude.
That is the cross-sheet evidence attempt 5 required. Latitude does not agree
closely enough to calibrate, so no latitude correction is applied.

## 4. Applying the correction to Inverness south

The code preserves two distinct facts:

1. `anchor` is the nominal longitude read from Inverness's engraved labels;
2. `longitude_correction_arcseconds = -17.0` is the rounded Richmond result.

`control_anchor` applies the second only when emitting GCP coordinates. The
generated CSV records both the nominal anchor and correction evidence. This
prevents a future reader from mistaking a calibration for what Church printed.

The same eleven Inverness south checks then give:

| Statistic | Before | After −17″ | Bound |
|---|---:|---:|---:|
| RMS | 457.8 m | **333.3 m** | ≤ 400 m |
| P95 | 798.4 m | **468.3 m** | ≤ 900 m |
| max | 798.4 m | **468.3 m** | ≤ 1,500 m |

After correction:

```
mean             dE = +48 m    dN = −251 m      |mean| = 256 m
scatter about it sd_E = 173 m  sd_N = 126 m
```

The east–west systematic component has been removed by another sheet. The
north–south component is unchanged and remains part of the measured 333.3 m
RMS. No Inverness check was moved, removed, or used to choose the correction.
The per-point evidence is
[`reports/church/inverness-south-corrected.json`](../reports/church/inverness-south-corrected.json).

**South passes.**

## 5. Visual QA and the publication boundary

The corrected, unmasked south warp was overlaid against NSTDB water. Through
the mapped body, Church's engraved coast follows the modern shoreline at the
scale implied by the held-out result. The unmasked view also exposes town-plan
insets, blank output, and material outside the south cutline; those are expected
and are why production would require the existing polygon cutline.

The Richmond detector QA sheet was also inspected at full resolution. The eight
frozen outlines are the intended islands; canal/parcel, road/settlement,
ambiguous, duplicate, and incomplete regions remain refused.

Generated scans, VRTs, GeoTIFFs, overlays, contact sheets, and tile trees stay
out of Git. Bazzite scratch evidence:

- Richmond scan:
  `/home/dan/nsmarks-church-richmond-20260725/work/richmond/richmond.tif`;
- corrected south warp:
  `/home/dan/nsmarks-church-inverness-20260724b/work/corrected/inverness/`;
- Richmond QA:
  `/home/dan/nsmarks-church-richmond-20260725/work/richmond-main-qa.png`;
- corrected south overlay:
  `/home/dan/nsmarks-church-inverness-20260724b/work/qa2/south-corrected-overlay.png`;
- north river-mouth QA:
  `/home/dan/nsmarks-church-inverness-20260724b/work/qa2/river-mouths-north.png`.

The publication rule remains panel-complete: both Inverness panels must pass.
North cannot be validated, so **no tiles were generated and the layer remains
unavailable**. A passing south panel is not permission to publish half a sheet
or to describe the combined layer as accepted.

## What is versioned from this attempt

- Richmond panel, detection settings, graticule anchor, and 14 generated GCPs;
- dominant-axis lattice indexing and its regression test;
- enclosed-paper island reading and anti-circular area selection;
- eight frozen Richmond candidate rules, scan-derived checks, and audit;
- Richmond vector-offset report;
- external longitude calibration kept separate from the engraved anchor;
- regenerated Inverness south GCPs carrying the −17″ evidence;
- corrected south per-point accuracy report;
- north NSHN river-mouth supply report;
- this attempt record and the standing Church status.

No web or native layer catalog changed.

## Reproducibility

- Local pipeline tests:
  `python3 -m unittest discover -s tools/church/tests -t .`
- Compute host: Bazzite over SSH, `nsmarks-gis` distrobox
- GIS stack: GDAL 3.12.4, OpenCV 4.13.0, NumPy 2.4.6, Python 3.14
- Inverness source:
  `/home/dan/nsmarks-church-inverness-20260724b/work/inverness-master.tif`
- Richmond source fetched from the Rumsey IIIF item above
- Inverness acceptance thresholds fixed before this attempt:
  RMS ≤400 m, P95 ≤900 m, max ≤1,500 m
- No tiles generated

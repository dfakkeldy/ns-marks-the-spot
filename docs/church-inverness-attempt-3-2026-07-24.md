# Inverness Church-map georeferencing — third attempt, 2026-07-24

## Outcome

**Not accepted. No mosaic, no tiles, no catalog change, no hosting decision.
The `church-inverness` layer remains unavailable.**

Both panels are now detected, fitted, anchored and warped, and both look
right. Neither has the held-out physical-feature measurement the gate
requires, so neither passes. One blocker of the three carried over from
[attempt 2](church-inverness-attempt-2-2026-07-24.md) is closed, one is
closed with a correction, and one remains open.

| Blocker from attempt 2 | State |
|---|---|
| 1. `check_count` is 0 | **Open.** Machinery built and committed; the measurement itself is not captured. |
| 2. South panel never attempted | **Closed.** Detected, anchored on four read labels, warped, inspected. |
| 3. Coastal tail only partly explained | **Closed** — see [The error tail](#the-error-tail). |

## The defect that had to be fixed first

Attempt 2 shipped docs and code citing eight `tools/church/*.py` analysis
scripts that were never committed. They existed only on the compute host, so
the measured cutlines, the 30-point mesh, and the control CSV could not be
re-derived or challenged by anyone reading the repository.

All eight are recovered. The recovery splits them along the one seam that
matters: only detection — finding straight segments in the scan — needs OpenCV
and the 180 MB archival JP2. Everything after it is arithmetic.

```
detections/*.json  ->  lattice fit  ->  intersections  ->  gcps/*.csv
```

The detected-lines artifact is now committed, so that arithmetic is pure
stdlib, carries tests, and runs in CI. `emit_gcps --check` asserts in CI that
the checked-in control points still match the linework they claim to come
from, which also catches a hand-edited CSV.

Verified end to end on the compute host: `detect_graticule` followed by
`emit_gcps --check`, with no command-line flags at all, regenerates the
committed CSV byte-for-byte from the archival scan. Source JP2 SHA-256
verified as `37021ed086f7bbce542b519e9a74242acc5b53ed1944880468f6f91d6234a7f8`
before use.

### Three defects found while recovering

* **The anchor was a rounded decimal.** The control CSV was emitted with its
  anchor latitude typed as `46.833333` rather than exactly 46°50′, and every
  coordinate inherited the rounding. The anchor is now an exact versioned value
  on the panel. Pixel positions are unchanged.
* **Detection parameters lived only on a command line.** Re-running the north
  panel at the tool's own default minimum length of 600 reduced pixels instead
  of the 500 actually used finds four of the six parallels and silently emits a
  20-point mesh instead of a 30-point one. Now versioned as `DetectionSettings`.
* **Family directions were averaged without sign normalisation.** A line fit
  returns an axis of arbitrary sign; exactly one line in each north family came
  back flipped, tilting the family mean by about 0.14°.

## The south panel

Its graticule is a **10-arcminute** lattice, not the north panel's 5. Four
printed degree/minute labels were read directly off the scan to pin it:

| Label | Where, in full-sheet pixels |
|---|---|
| `61 10'` | ~(25055, 850), the rule passing between the "61" and the "10'" |
| `61 00'` | ~(29678, 850), likewise |
| `46 00` | sitting on its rule at y ≈ 17146 |
| `45 50` | sitting on its rule at y ≈ 23880 |

The fitted pitches — 4,714.9 px across, 6,814.4 px down — agree with the label
separations (4,623 px and 6,734 px) to within 2 %, and the fitted rules land
within 30 px of the longitude labels and 22 px of the latitude labels.

The step is confirmed independently by the other panel. North parallels are
3,413.7 px per 5′ = 682.7 px per arcminute; south parallels are 6,814.4 px per
10′ = 681.4 px per arcminute. At 1,852 m per arcminute both give **2.718 m per
source pixel**. The same engraving, drawn with two different graticule steps.

Two problems had to be solved. Auto-detected angles are useless here — the
orientation histogram picks 88.5° / 119.5° and finds no parallels at all,
because the dense coastal hachure outvotes them; the angles are now pinned from
the read labels. And the two families need different extent thresholds, because
the south roads run north–south along the coast and so impersonate meridians
but not parallels: at 3,500 px the meridian family fits a nonsense 967 px pitch
through a bundle of roads, while the 15,000 px needed to exclude them would
discard three of the four real parallels.

### A latent defect this exposed

Lattice index direction was inherited from the direction canonicalisation,
which flips at exactly 90°. The north meridians stand at 84.5° and the south at
90.1°, so index 0 landed on opposite sides of the sheet and the south
longitudes came out **reversed**. Anchoring around that would have encoded a bug
as a constant. Family normals are now oriented along increasing pixel x, so
index 0 is always the westernmost or northernmost rule, and `GraticuleAnchor`
counts longitude eastward to match. The north panel's control points are
unchanged as a set; only their emission order flips.

## Warps

Both panels warped clipped and unclipped. The unclipped copies are kept so
clipping can never conceal a transform error.

| | North | South |
|---|---:|---:|
| Controls | 30 | 12 |
| Affine RMS over controls | 98.51 m | 86.94 m |
| Check points | **0** | **0** |
| Alpha coverage, clipped | 33.77 % | 52.11 % |
| Alpha coverage, unclipped | 50.82 % | 68.70 % |
| Folding | none observed | none observed |
| Output | 20,038 × 25,971 @ 5 m | 25,603 × 27,231 @ 5 m |

The affine RMS is a **distortion index for the printed frame**, not the
accuracy of the delivered layer. It says the graticule is very nearly an affine
image of true coordinates, which is what a carefully drawn projection frame
should be, and says nothing about the topography drawn inside it.

## Visual verification

Headless overlays of each clipped warp against NSTDB water, modern water tinted
and its edge drawn in red, inspected at full panel and at the edges and seams.

**North.** The drawn coastline hugs the modern line down the entire Gulf shore,
from the far north through Pleasant Bay, Chéticamp and Grand Étang to Margaree.
The panel is a clean diagonal strip; the title-block notch falls over open
water as intended. The conspicuous failures are all interior: modern lakes
outlined in red over blank paper where Church drew only "Barren".

**South.** The coastline tracks the modern line down the whole western shore —
Mabou, Port Hood, Judique, Creignish — which matters because that stretch lies
**outside the meridian control hull** and depends on extrapolation. Lake
Ainslie, Whycocomagh Bay and the St Patrick Channel arms align with the modern
water. The West Bay, Port Hood and bottom-row inset notches are correctly
excluded. No folding at any inspection scale.

### Extrapolation is not degenerate

The south panel's 12 controls span x 20,258–29,718 of a panel running
9,225–33,500, so roughly the western third is extrapolated. Measured through the
north panel's warp, scale is preserved to within 1.0–1.6 % across every pair
tested, from a 0.25 km baseline to a 26 km one, including pairs outside the
control hull. Combined with the south overlay, extrapolation is behaving.

This corrected an initial misreading. Three "capes" appeared to collapse onto
one another in a contact sheet, which looked like extrapolation failure; the
numbers showed the candidate **boxes** for Cape St Lawrence, Cape North and Meat
Cove had been drawn adjacent and all selected essentially the same headland
vertex, 0.25 km apart rather than the 25 km intended. The transform was fine;
the candidate definition was not. That is exactly why each box is committed
beside its answer.

## The error tail — isolated, and it is real

Attempt 2 left a coastal P95 of about 1.5 km "only partly explained" and
attributed the worst band to interior highland plateau that Church drew blank
and lettered "Barren". The isolation asked for has now been run. **It does not
support that attribution, and the tail should be reported as real error.**

The metric is the distance from every modern water-edge pixel inside the
clipped panel to the nearest historical ink, sampled at 20 m. It is a **lower
bound** — any ink counts, so hachure or lettering near a shore flatters it — and
it is not the accuracy figure. Held-out check points are.

Restricting the reference to the outer sea/land boundary
(`FEAT_DESC = 'Coast Water Area polygon'`) removes every inland lake from the
reference, which is exactly the isolation the undrawn-barrens hypothesis
predicts will remove the tail.

| North panel | All water | Outer sea/land only |
|---|---:|---:|
| samples | 31,580 | 10,353 |
| median | 175.8 m | **107.9 m** |
| P95 | 1,043.0 m | **1,679.4 m** |
| max | 3,455.2 m | 3,455.2 m |
| within 250 m | 58.5 % | 69.5 % |
| within 500 m | 76.7 % | 82.6 % |

Removing the lakes **improves the median and makes the tail worse**. If the
tail were undrawn interior lakes it would have largely disappeared; instead P95
rises by 61 %. The lakes were depressing the median, not producing the tail.
The tail lives in the coastal samples themselves, so on the evidence available
it is **real registration error on the coast**, not an artefact of what Church
chose to draw.

This is the opposite of the conclusion attempt 2 reached by inspection, and it
is why the gate asked for it to be isolated numerically rather than argued.

### It is one band, not the whole coast

Per-band RMS, outer sea/land boundary only, in quarters from the top of each
panel down:

| Band | North | South |
|---|---:|---:|
| 0 (top) | 348 m | 489 m |
| 1 | **1,091 m** | 331 m |
| 2 | 188 m | 239 m |
| 3 (bottom) | 197 m | 274 m |

Every band on both panels sits between 188 m and 489 m except one. The north
panel's second quarter — the Pleasant Bay to Cape Rouge stretch — is at
1,091 m, three to six times its neighbours, and it holds 4,115 of the 10,353
coastal samples. That single band is the whole tail.

The value reproduces attempt 2's band figure of 1,090.7 m to the metre, on the
same 4,115 samples. So this is not a new defect; it is the old one, now
isolated to one quarter of one panel and no longer attributable to undrawn
interior.

### The south panel outperforms the north

| | North (all water) | South (all water) |
|---|---:|---:|
| samples | 31,580 | 56,949 |
| median | 175.8 m | **107.9 m** |
| P95 | 1,043.0 m | **607.3 m** |
| max | 3,455.2 m | **2,270.0 m** |
| within 250 m | 58.5 % | **74.3 %** |
| within 500 m | 76.7 % | **91.7 %** |

| | North (coast only) | South (coast only) |
|---|---:|---:|
| samples | 10,353 | 40,026 |
| median | 107.9 m | 140.0 m |
| P95 | **1,679.4 m** | **647.9 m** |
| max | **3,455.2 m** | **1,491.8 m** |
| within 500 m | 82.6 % | **90.0 %** |

Twelve controls on the south panel are outperforming thirty on the north, and
the south panel's worst coastal sample anywhere is 1,491.8 m — below the north
panel's P95. That inversion is worth understanding before either panel ships,
and it is another reason not to accept on a proxy metric. The likely reading is
that control count matters less than whether the drawn topography in a given
stretch was surveyed or sketched, but that is a hypothesis, not a measurement.

The north "all water" figures reproduce attempt 2's published numbers exactly
(31,580 samples, median 175.8 m, P95 1,043.0 m, max 3,455.2 m), and the coastal
per-band sample counts match to the sample (1,847 / 4,115 / 3,653 / …). That is
independent confirmation that the recovered pipeline is the one that produced
the published figures.

Full distributions and per-band breakdowns are committed in
`reports/church/sl-{north,south}-{all,coast}.json`.

## Why this is still not an acceptance

**`check_count` is 0 on both panels.** The gate requires an independent set of
named physical features — harbour entrances, river mouths, island tips, bridges,
lake outlets — that never enter the fitted transform, reported as RMS, P95 and
maximum against a tolerance justified in advance. That set is not captured.

The shoreline distance field is a useful second opinion and covers far more of
the panel than any hand-picked set could, but it is a lower bound and it is not
the required measurement. A layer must not ship on a proxy.

What exists now, and did not before:

* `landmarks.py` derives modern coordinates by an objective rule from NSTDB
  geometry — "the westernmost vertex of the coastline inside this box", or an
  island centroid — never from a place-name gazetteer. A settlement has no
  single true coordinate; pairing the drawn word "CHETICAMP" with a gazetteer
  point is what baked 3.7 km of error into the pilot's controls.
* `checks/inverness-*-candidates.csv` holds 14 north and 16 south candidates,
  each with the rule and the box that produced it, so the choice is
  reproducible and can be disagreed with.
* `checksheet.py` renders a contact sheet of kilometres-wide tiles at the
  predicted location of each candidate. The crosshair is a place to look and
  never an answer — adopting it would make the measurement circular.

## Smallest credible next step

1. Read the two contact sheets and record the **pixel** position of each
   feature as `role=check` rows in `tools/church/checks/inverness-*.csv`. This
   is the only remaining manual step, and it is now a bounded one: two images,
   about fifteen features each.
2. Fix the three north candidate boxes that overlap onto one headland
   (`cape-st-lawrence`, `cape-north`, `meat-cove`) and drop the candidates whose
   tiles show blank paper or an inset, which are outside what the panel draws.
3. Run the existing `georeference` measurement path to get held-out RMS / P95 /
   maximum, and judge both panels against a tolerance stated in advance.
4. Investigate the north panel's band 1 specifically. It is one quarter of one
   panel carrying the entire tail, and it is a bounded question: either that
   stretch of coast was drawn less accurately, or a control near it is wrong.

Proposed tolerance, to be agreed **before** the numbers are looked at: for a
county wall sheet compiled for legibility of resident names at roughly
1:126,720, a held-out RMS of **≤ 400 m** with P95 **≤ 900 m** and maximum
**≤ 1,500 m** is a defensible standard — about 3 mm, 7 mm and 12 mm at sheet
scale. Anything looser is not a georeferenced layer, it is a picture.

Only if both panels then clear the gate does mosaicking become appropriate, and
hosting remains a separate decision after that.

## Reproducibility

- Compute host: Bazzite over SSH, `nsmarks-gis` container
- GDAL 3.12.4, GRASS GIS 8.4.2, QGIS 3.44.12, OpenCV 4.13.0, NumPy 2.4.6
- Versioned inputs: `tools/church/detections/inverness-{north,south}.json`,
  `tools/church/gcps/inverness-{north,south}.csv`,
  `tools/church/checks/inverness-*-candidates.csv`, `tools/church/panels.py`,
  `reports/church/sl-*.json`
- Generated scans, GeoTIFFs, previews, and tile trees stay out of Git
- `python3 -m unittest discover -s tools/church/tests -t .` — 242 tests, run
  locally and inside the Bazzite container
- `python3 -m tools.church.emit_gcps inverness {north,south} --out … --check`
  runs in CI

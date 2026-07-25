# Inverness sheet panel cutlines — derivation, 2026-07-24

Every coordinate in `tools/church/panels.py` was measured from the archival
scan, not estimated from a preview. This file records how, so the numbers can
be re-derived or challenged.

## Source

- David Rumsey item `RUMSEY~8~1~353591~90120835`
- `inverness.jp2`, 180,699,794 bytes, 34,427 × 34,543 RGB
- SHA-256 `37021ed086f7bbce542b519e9a74242acc5b53ed1944880468f6f91d6234a7f8`
  (verified on the compute host before use)
- Working master: `inverness-master.tif`, a tiled 512×512 DEFLATE GeoTIFF
  transcoded once from the JP2. JPEG 2000 has no cheap random access at this
  size — every crop re-decoded the whole image, at roughly 60 s each. After
  transcoding, the same crop takes 0.6 s. The GeoTIFF is derived and
  disposable; the JP2 remains the provenance artifact.

## Why the 2026-07-24 pilot's windows could not work

The pilot registered two axis-aligned rectangles:

| Panel | x | y | width | height |
|---|---:|---:|---:|---:|
| north | 0 | 0 | 14,500 | 32,200 |
| south | 12,500 | 0 | 21,500 | 33,500 |

They overlap across x 12,500–14,500. The sheet is not split vertically: a
single engraved divider runs *diagonally* across it. Any axis-aligned box
around one panel necessarily swallows a large triangular wedge of the other,
so the thin-plate spline was fitted on one panel's controls and then applied
to the neighbouring panel's pixels. That is sufficient on its own to produce
the "severe curved fan-shaped stretching" the pilot observed.

## How the rules were detected

`tools/church/detect_rules.py`:

1. block-**minimum** reduce by 4 (averaging erases thin engraved rules; taking
   the darkest pixel in each block preserves any rule that touches it),
2. threshold at < 110 (the neat lines, divider, and inset boxes are the
   darkest marks on the sheet),
3. morphological close 3×3 to bridge fold damage and label crossings,
4. probabilistic Hough transform, θ resolution 0.1°, min length 250 (reduced
   px), max gap 12.

1,455 segments were returned; the longest was 31,328 px.

## The divider is a polyline, not a line

Segments cluster into two angular families, both far too long and too straight
to be topography:

| Family | Angle | Longest segment | Fitted line |
|---|---:|---:|---|
| upper | 99.8–100.0° | 15,840 px | `x(y) = 15852 − 0.175874·(y − 732)` |
| lower | 114.9–115.1° | 6,469 px | `x(y) = 11776 − 0.466540·(y − 23924)` |

They intersect at **(11773, 23928)** — the bend. A native-resolution crop at
the foot confirms the geometry independently: the divider meets the "NORTHERN
SECTION" bottom rule at (9340, 29180) and continues to (9180, 29550) where the
bottom inset row begins.

Each panel's cutline is offset **60 px to its own side** of this centreline, so
the roughly 30 px engraved rule is warped into neither panel and the two
cutlines cannot share a pixel.

## Detected decoration and inset boxes

All from the same segment set, clustered into horizontal and vertical runs:

| Feature | x range | y range |
|---|---|---|
| Map field (innermost neat line) | 1,070 → 33,560 | 740 → 33,840 |
| "NORTHERN SECTION" bottom rule | 712 → 9,352 | ≈ 29,160 |
| Engraved vignette | 17,128 → 19,948 | 1,650 → ≈3,400 |
| West Bay inset | 30,440 → 33,560 | 9,920 → 14,040 |
| Port Hood inset | 30,188 → 33,568 | 28,160 → 33,844 |
| Port Hawkesbury inset | ≈700 → 7,720 | 29,560 → 33,840 |
| Whycocomagh inset | 7,640 → 12,520 | 29,560 → 33,844 |
| Mabou inset | 12,720 → 16,880 | 30,480 → 33,860 |
| Margaree inset | 22,680 → 25,320 | 30,956 → 33,856 |
| Port Hastings inset | 25,640 → 29,984 | 30,372 → 33,856 |

The title cartouche, compass rose, and imprint are not ruled, so their
exclusion box (x ≤ 8,850, y ≤ 9,200) was set visually. It sits entirely over
open Gulf of St Lawrence water — the nearest drawn coastline in that latitude
band is at x ≈ 9,900 — so excluding it costs no map content.

## Result

| Panel | Vertices | Bounding window | Cutline area vs its box |
|---|---:|---|---:|
| north | 7 | (1050, 780) 14,734 × 28,360 | 66.4 % |
| south | 23 | (9225, 780) 24,275 × 32,970 | 74.0 % |

A rectangular crop would therefore have swept in 34 % (north) and 26 % (south)
of material that is not that panel's map.

Guarded by `tools/church/tests/test_panels.py`, which asserts the two cutlines
never overlap, that each excludes at least 10 % of its bounding box, and that
neither contains any of nine sampled decoration points. `test_cutlines.py`
covers the polygon primitives, including the case that shared edges between
adjacent panels must not count as overlap.

## Verified visually

`qa/cutlines.png` renders both cutlines over the reduced sheet. The divider is
followed exactly through its bend, and the title block, vignette, and all seven
town-plan insets fall outside both polygons.

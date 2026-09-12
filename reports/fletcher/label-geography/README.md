# Fletcher lettering geography — Highway 19 corridor

889 reviewed annotations have been processed using the active full-sheet fits
from explicit per-sheet revisions. Judique and Hawkesbury remain frozen at
PR #380 merge `a6619d96ba8fa8279ea6a8027654a92b15942b9d`; Mabou was reprocessed
through the 36-control Glendyer refinement in [PR #385](https://github.com/dfakkeldy/ns-marks-the-spot/pull/385),
frozen at its nightly squash merge `249b2be0b378adec894abc34520f83b009dbf8fd`
(re-pinned on 2026-09-10 from the PR-branch commit `ca59a267`, which GitHub
deleted with the branch; the frozen inputs are byte-identical at both). The output locates
**printed lettering**. It does not identify the corresponding mill wheel,
church symbol, mine opening, road alignment, feature footprint or modern site.
Existing feature placement and the placement pilot remain unchanged.

| Sheet | Annotations | Source boxes | Derived box centres | Complete GeoJSON records |
| --- | ---: | ---: | ---: | ---: |
| 19 — Judique | 166 | 225 | 225 | 166 |
| 16 — Port Hood / Mabou | 256 | 297 | 292 | 251 |
| 22 — Port Hawkesbury | 301 | 436 | 435 | 300 |
| 14 — Cape Mabou / Broad Cove | 166 | 204 | 204 | 166 |
| Total | 889 | 1162 | 1156 | 883 |

## Original scan frames confirmed

The original scans, finalized extraction inventories, extraction manifests,
active fits and neatline masks agree on SHA256 and native dimensions:

| Sheet | Native width × height | Native PNG SHA256 |
| --- | --- | --- |
| 19 | 10815 × 7549 | `8a6588e2029c433ac85e190c9e10d1b4cda7dbba555f7824cfe6c5960163d724` |
| 16 | 10822 × 7531 | `d9a4c9a7c6f4e7057e32b57dcb26f6425e9b52015d360498e98e8e2de9a27f94` |
| 22 | 10790 × 7687 | `b2dd6efed654eba240b0db7077c760577154ed049e86ce001573c1bb41b10ed9` |

All **110 production crops** were opened, hashed and compared pixel-for-pixel
against their recorded rectangles in the native scan: 35 Judique, 40 Mabou and
35 Hawkesbury. All matched. No crop was resized or rotated. Each
`sheet-N-frame-audit.json` records its source origin, dimensions, crop hash and
comparison result. Every one of the 958 retained box centres is in the native
frame, lies in at least one checked production crop, and passes the
crop-local → native coordinate roundtrip.

The finalized inventories already store **full-scan** `source_label_boxes_xywh`.
Therefore the mapping into fitting controls is scale **(1,1)**, translation
**(0,0)**, rotation **0°**. Adding a packet origin again, scaling by a preview
size, or using the cropped/resampled GeoTIFF dimensions would be wrong.
For a resized unrotated excerpt, the general mapping is
`native = crop_origin + displayed_coordinate × native_crop_extent / displayed_extent`.
The frame review figures explicitly record their display scaling separately.

Coordinates use continuous pixel edges, origin at the scan's upper-left,
x right and y down. Each box anchor is `(x + width/2, y + height/2)`, passed
unchanged to the same GDAL GCP convention used by the full-sheet renderer.
There is no additional 0.5-pixel adjustment. The neatline is a support mask,
not a crop offset applied to the source points.

## Outputs and provenance

- [Judique GeoJSON](sheet-19-labels.geojson), [Mabou GeoJSON](sheet-16-labels.geojson),
  [Hawkesbury GeoJSON](sheet-22-labels.geojson).
- [Judique frame review](sheet-19-frame-review.jpg), [Mabou frame review](sheet-16-frame-review.jpg),
  [Hawkesbury frame review](sheet-22-frame-review.jpg). These 36 representative
  first-box excerpts were visually inspected, including the six neatline
  holdbacks, the Judique church, Chisholm Brook mill labels and gold-mine label
  F19-JUD-094. The magenta boxes and crosses land on their original lettering.
  This is frame verification, not a fresh transcription audit of all 723 labels.
- `sheet-N-review-frames.json` retains exact native crop frames, rendered sizes,
  display offsets and figure hashes. Vertical and multipart lettering retains
  its original orientation; only the first box is shown in each review tile.

Every GeoJSON feature preserves every original annotation field under
`properties`, including source boxes, IDs, uncertainty, review notes, source
links, null feature `geometry` and deferred feature `placement_status`.
`label_anchors` adds a separate source pixel and geographic position per box.
Feature-level GeoJSON `geometry` is a **MultiPoint of lettering centres**, even
for one box. Multipart names are never collapsed into a possibly misplaced
single feature pin. `projected_xy_m` is EPSG:3857; `lonlat` and GeoJSON geometry
use longitude then latitude, in degrees (OGC:CRS84).

Each record carries `fit_revision` and `fit_sha256`. Collection provenance also
retains the fit path, pinned commit revision, input inventory and manifest hashes,
editable control CSV hash, boundary hash and frozen check evidence hashes.
The active fits are Judique `revised-fit.json` (44 controls), Mabou
[northern `fit.json`](../mabou-full-sheet/north-audit-20260909/candidate36/fit.json) (36), and Hawkesbury **`boundary-fit.json` (28)**. CSV control
coordinates match the fits exactly. Checks are never fitted.

Six anchors fall outside the active native neatline and retain null derived
coordinates with status `outside-fit-neatline`:

- Sheet 16: F16-PHM-146 Intricate Channel, 147 Henry Point, 149 90 FT.,
  197 HENRY Iᵈ., 200 Justaucorps Point.
- Sheet 22: F22-HAW-181 Rapids.

All six annotations remain in the output with null GeoJSON geometry. The
program also leaves a multipart record's geometry null if any anchor lacks
support, while preserving any supported individual anchors. It does not extend
the accepted mask or silently extrapolate these edge labels.

Within the complete neatlines, 16 Judique, 94 Mabou and 77 Hawkesbury derived
anchors lie outside the control hull. They are individually flagged by
`inside_control_hull: false`: full-sheet coverage is broader than the controls'
convex hull. These are approximate review coordinates, not accuracy guarantees.
The [full-sheet limitations](../full-sheets/README.md) still apply, including
nonuniform check errors and imperfect joins. This processing makes no new
geographic acceptance claim.

## Verification and reproduction

The generator reuses the full-sheet renderer's **GDAL TPS in EPSG:3857** and
inverse spherical Mercator. All 106 fitting controls reproduce within
0.00000001 projected metre. Frozen predictions at three Judique fresh checks,
three Mabou fresh checks and 17 Hawkesbury diagnostics reproduce within
0.000000003 projected metre. These tiny differences verify computation only;
they are not real-world positional errors. GDAL version is recorded in each
output. Original sources, inventories, fits, CSVs and masks are unmodified.

From the repository root, with GDAL on PATH and Python 3.11+ with Pillow:

```bash
python -m tools.fletcher.project_labels --sheet 19 \
  --source /path/to/native/sheet19.png \
  --packets /path/to/sheet-19/packets \
  --out reports/fletcher/label-geography
python reports/fletcher/label-geography/build_frame_review.py --sheet 19 \
  --source /path/to/native/sheet19.png
python -m unittest tools.fletcher.tests.test_project_labels -v
```

Repeat for sheets 14, 16 and 22 using their native scans and packet folders.
`--gdaltransform` may name an explicit GDAL executable. Omitting both `--source`
and `--packets` reproduces geography without re-auditing local imagery; it does
not create a new frame-audit receipt. Mismatched hashes, dimensions, editable
controls, out-of-frame boxes or altered pinned inputs fail closed. A future fit
revision requires explicit reprocessing and a new revision record. Pin only a
commit on `nightly`'s own history, normally the squash merge that landed the
frozen inputs: a PR-branch commit disappears with its branch after the squash
merge, so land the inputs first and pin them in a follow-up change. The test
suite checks that every pin is already on `origin/nightly`.

The tests cover source preservation, crop scaling and offsets, axis order,
invalid boxes, neatline holdbacks and frozen evidence hashes. The GDAL replay
test additionally checks regeneration locally; it is skipped where GDAL is not
installed. The crop equality and visual inspections require the native imagery
and are separately recorded evidence, not work repeated by stdlib CI.

Historical attribution: David Rumsey Map Collection / David Rumsey Map Center,
Stanford University Libraries, CC BY-NC-SA 3.0, with the existing project
permission receipts retained. Source-specific manifests and licence links
remain in each derivative. No production layer or deployment is changed.

The Mabou update preserves all 256 annotations, original lettering boxes and
source-pixel anchors. It recomputes 292 supported anchors and retains the five
Mabou neatline holdbacks. Source frame/crop audits above remain the original
audits: source imagery and extraction coordinates did not change. See the
[reprojection receipt](../mabou-full-sheet/north-audit-20260909/candidate36/label-reprojection.json).

## Sheet 14 completion — September 12, 2026

Sheet 14 uses the merged 26-control Hay-topology fit from PR #385, pinned to
`249b2be0b378adec894abc34520f83b009dbf8fd`. Open refinement drafts were inspected
but are not adopted. Its native scan is **10852 × 7622**, SHA256
`907ebc260018055cfc9da780a88f127db13834c0f7e831be7bf395c600a6854c`.

[Sheet 14 lettering](sheet-14-labels.geojson) preserves all 166 source records
and 204 original boxes. All 204 anchors are inside the neatline; 43 lie outside
the control hull and retain that warning. All 35 production crops matched the
original pixels, bringing the audited corridor total to 145 crops.
[Frame audit](sheet-14-frame-audit.json) records equality and transforms;
[frame review](sheet-14-frame-review.jpg) and
[display frames](sheet-14-review-frames.json) preserve 12 visually inspected
first-box excerpts. The boxes land on their lettering, including vertical and
multipart names. This is a frame check, not feature-symbol association.

All 26 fitting controls and 13 excluded diagnostic predictions reproduce within
0.00000001 projected metre. These are computational differences, not accuracy.
The fit's 112 m median / 241 m worst diagnostics and imperfect Mabou join remain
limitations. Previous derivatives and pilot placements are unchanged.

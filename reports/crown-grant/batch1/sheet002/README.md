# Sheet 002 — provisional, not accepted

Official Digby and Yarmouth Counties scan: 5731 × 3919 pixels, embedded JPEG,
150 dpi, last-updated stamp March 2009. All imagery is private in the ignored
`.crown-grant-local/` directory. Public records contain no scan/screenshot pixels.

The main map's frozen affine-03 fit has six controls. Four subsequently selected
physical checks measure **72.70 ground-metre RMS**, median 73.66, empirical P95
96.70, maximum 99.76. Signed warped-minus-reference bias is +55.36 m east and
+23.75 m north. It fails the fixed RMS/median/P95 gates and geographic coverage
requirement. The four checks are insufficient for whole-sheet certification.
Six reused diagnostic checks separately measure 78.20 m RMS; do not pool them
with the fresh set or describe them as blind validation.

## Audit trail

- Search guide: coarse coastal ties for correspondence discovery only.
- Affine-01: four reviewed coast/Churchill controls. Eight candidate checks gave
  434 m RMS, but this includes an incorrect northern correspondence; it is an
  original failed candidate audit, not a defensible geographic accuracy figure.
- Native crosshair review corrected C01/C03 placements before fitting. Original
  proposals and revisions remain available. C04 was rejected: its source point
  was initially on a road and then on an unresolved outer line rather than the
  Cedar Lake prong. It never entered a fit.
- Q11 (Cedar Lake southwest corner) became C06 after the first failed trial.
  Replayed checks became diagnostics. Q11 is absent from all subsequent checks.
- Northern Q02 was paired with the wrong coastal notch. Complete modern road
  topology identified the landing: its north-margin and south-running road
  connections agree with the historical context. The original source pixel
  remains unchanged; the original modern OBJECTID 2827 became 314003. Both
  scores against the same affine-02 fit are retained (original 428 m RMS;
  corrected reference audit 121 m RMS).
- Corrected Q02 became C07 for affine-03. Q02 is excluded thereafter. No change
  was made after scoring the four fresh checks (V01,V02,V03,V05).
- V04 matched a tiny unrelated waterbody and was rejected before scoring. V06
  resolves the earlier Cedar prong identity, but is not called fresh because
  that modern feature had already been examined. Neither is used in a fit.

Controls, original proposals, corrections, rejected candidates, fresh/diagnostic
checks and each affine matrix are in separate versioned JSON files. Coordinates
remain in the original scan's pixel frame. Paired native crosshair review images
are private `002-C*`, `002-Q*`, and `002-V*` files. Modern reference marker
positions in these figures are explicitly search-guide coordinates; longitude
and latitude in the records are the authoritative modern coordinates.

## Coverage and rendering

The full main neatline is retained, with the printed inset removed from its
original ocean position and rendered separately. The entire inset box is kept,
including captions, so no guessed shoreline clipping removes mapped content.
Its placement uses the printed join to Sheet 2 and a recorded native offset
(+1320,-673). **This is an unsupported seam estimate, not a validated inset
georeference. Full-sheet geographic completion is not claimed.**

The affine determinant is negative (x-right/y-down image convention), so this
model has no affine folds; that does not prove its geography. GDAL renders the
actual alpha-masked raster to EPSG:3857 with exact transformation calculations
and 8 projected-metre cells. Output resolution is not ground accuracy.
`render-receipt.json` records original/fit/component hashes, bounds, dimensions,
mask counts and output hashes. The native masks cover the complete selected
neatline and inset boxes; independent output-edge alpha comparison is outstanding.

The real Leaflet raster path was inspected in the local Codex browser. Both
images loaded at their recorded dimensions; opacity and modern-only comparison
worked, the original scan was accessible, and console inspection reported no
errors/warnings. See `browser-verification.json`. This is local browser evidence,
not deployment or production acceptance. Northern inset and eastern interior
support remain incomplete; no claim of complete accepted coverage is made.

## Reproduce locally

Use MacPorts Python 3.12 with GDAL, NumPy, Pillow and pyproj:

```sh
/opt/local/bin/python3.12 tools/crown-grant/score.py \
  reports/crown-grant/batch1/sheet002/fit-affine-03.json \
  reports/crown-grant/batch1/sheet002/fresh-checks-affine-03.json \
  /private/tmp/crown-002-fresh-replay.json
/opt/local/bin/python3.12 tools/crown-grant/render_sheet.py \
  .crown-grant-local/002-000.jpg \
  reports/crown-grant/batch1/sheet002/fit-affine-03.json \
  reports/crown-grant/batch1/sheet002/components.json \
  .crown-grant-local/sheet002
```

The reference is contemporary NSTDB hydrography, not surveyed checkpoints.
Source generalization, shoreline changes and point definitions contribute to
observed errors. No claim of grant-boundary accuracy or present ownership follows.

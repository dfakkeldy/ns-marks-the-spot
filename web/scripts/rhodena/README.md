# Rhodena factual extracts

`inputs.json` records published turbine/receptor coordinates and selected drawing
traces, including full-page pixel coordinates. `parcels.json` is the extracted
80-row Table 3.1 classification, with no owner names. The generated feature,
parcel and validation files are under `src/rhodena/`.

Run from `web/`:

```
node scripts/buildRhodena.mjs --sources
node scripts/buildRhodena.mjs --check
node scripts/buildRhodenaTerrain.mjs
node scripts/buildRhodenaTerrain.mjs --check
```

The first command needs Poppler's `pdftotext`, downloads the five original PDFs
into ignored `scripts/.rhodena-cache/`, and rejects a changed PDF checksum. It
re-extracts Table 3.1; coordinate/table and trace edits require source review.
Without `--sources`, generation uses the committed factual inputs and performs
coordinate and registration checks. The source PDFs are not distributed.

For visual reconstruction, render the infrastructure PDF's indicated one-based
page to the `width` specified in each sheet record, preserving the complete
page, top-left origin. A shape-preserving similarity fit uses NAD83 / UTM 20N
turbine controls. All six coordinates are cross-checked against Appendix J's
published latitude/longitude. The overview's worst held-out turbine error is
13.1 m, Drawing 2.3A's is 3.6 m. Drawing 2.3B has only two controls, so its zero
fit residual is not accuracy evidence: its substation symbol was checked
against the independent overview (9.9 m difference). These checks test symbol
registration, not survey accuracy. Display caveats conservatively allow at
least 50 m at overview scale and 15 m for detailed traces; these are not
statistical error bounds.

The study polygon is a simplified outline, omitting fine detail and holes. It
must not support parcel inclusion or area calculations. Roads are approximate
centrelines; widths, complete project/assessment footprints and temporary works
are not inferred. The infrastructure substation and the noise model's distinct
coordinate are both retained, with their discrepancy visible. Neither is final
design evidence. April shadow / August noise model inputs differ slightly from
July consultation turbine positions (about 1–2 m); they remain individually
dated, with no older 18/15-turbine layout mixed in.

The original report (printed p. 136) withholds the potential WSS IDs to protect
sensitive species. Do not reverse-identify or republish these sites from symbols
in companion drawings. No sensitive species or archaeology coordinates are
extracted. Official existing water/forest layers retain their own scope and
licence conditions; blank coverage is not absence.

## Terrain visibility

The terrain generator mosaics a fixed 49-tile Mapzen Terrarium z12 region.
Each input tile hash and the output `terrain.bin` hash are recorded in
`public/rhodena/terrain.json`. Cached input bytes make regeneration reproducible;
changing the source set requires comparing receipts. It decodes Terrarium RGB
to signed little-endian int16 decimetres (rounding <=0.05 m), retains source
pixel spacing (~27 m locally), and rejects unexpected missing cells. Terrain
resolution, dates, vertical accuracy and datum have not been locally validated.
It is independent of Judique's contour-derived display terrain.

The same pure `visibilityFromPoint` algorithm powers selected viewpoint results
and worker-generated combined/individual overlays. The default combines all six:
green when any result is potentially visible; grey only when all six are
terrain-screened; amber when at least one is near threshold and none is
potentially visible. Missing coverage/range prevents an all-screened result.
Known potential visibility remains useful even if another turbine is unassessed. It bilinearly samples the terrain at
no more than one source pixel along the line, uses DEM ground at both endpoints,
1.7 m observer height and a 200 m maximum turbine tip. Hub comparisons use the
2024 model's 118 m hub. Curvature uses R=6,371,000 m and assumed refraction k=0.13.
Overview cells span four DEM pixels (~106 m); point checks use the chosen
coordinate without snapping it to the overview cell. Range is bounded to 20 km.
No-data and outside-range cases remain unassessed, not screened.

The target-height threshold is the maximum height needed to clear intervening
terrain. Results within 20 m of the selected 200 m tip are labelled near the
threshold: a sensitivity band, not a confidence interval. Trees, buildings,
weather and blade motion are excluded. The screen does not prove visibility or
invisibility from a house. The fixed terrain files load from the app's own host;
no selected coordinate is sent to an elevation provider, saved, or shared.
The current turbine selection and viewpoint are session controls; a shared or
custom layer setup reopens the combined view of all six turbines.

Original assessment reports, cartography and imagery retain their rights and
are not redistributed or assigned the code licence. The small factual extracts
and independently traced annotations preserve attribution. Terrain data retains
Mapzen and underlying provider terms: see `public/rhodena/LICENCE.txt`.

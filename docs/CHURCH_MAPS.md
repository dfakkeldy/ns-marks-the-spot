# A.F. Church County Maps

Ambrose F. Church was commissioned by the Nova Scotia legislature in 1864 to
produce a topographical township map for each of the province's 18 counties.
The sheets name the resident of each building and, for prominent townsfolk,
their occupation — which makes them unusually useful for historical property
research. Publication of many sheets slipped into the 1870s and 1880s for
financial reasons, so the survey date and the publication date differ.

## Status in this project

Four Cape Breton Island counties are **catalogued but not rendered**. They
appear in `web/src/layers/layerCatalog.ts` and
`ns-marks-the-spot/Layers/LayerCatalog.swift` with full metadata and
attribution, but no tiles have been produced, so:

- the web rail shows them as disabled rows under "Church (1860s–80s)";
- the iOS catalog carries `sourceURL: nil` and installs no layer.

The full four-county run was **frozen and rejected on 2026-07-26**. Inverness
south passed, but Inverness north was unmeasurable; Richmond failed its fixed
held-out RMS and P95 gates; Victoria could not supply enough accepted held-out
checks; and Cape Breton was stopped before any transform after its numbered
mesh proved not to be a geographic graticule. No tiles were generated and
nothing was deployed. The exact source hashes, panel results, and do-not-resume
boundary are recorded in
[`church-four-county-freeze-2026-07-26.md`](church-four-county-freeze-2026-07-26.md).

The first panel-aware Inverness attempt was rejected on 2026-07-24. Its
held-out errors, raster-coverage failure, QGIS findings, and next requirements
are recorded in
[`church-inverness-pilot-2026-07-24.md`](church-inverness-pilot-2026-07-24.md).
No tiles were generated from that attempt.

A second attempt on 2026-07-24 replaced the overlapping rectangular windows
with measured non-rectangular cutlines and replaced the place-label controls
with the sheet's printed 5-arcminute graticule. It is a large measured advance
— north-panel affine RMS fell from 2,151.6 m to 98.5 m, alpha coverage rose
from 43 pixels to a third of the target extent, and the north coastline now
registers to a median of about 100 m against NSTDB water — but it is **not an
acceptance**: no held-out physical check set was captured, and the south panel
was not attempted. Still no tiles. See
[`church-inverness-attempt-2-2026-07-24.md`](church-inverness-attempt-2-2026-07-24.md)
and [`church-inverness-cutlines-2026-07-24.md`](church-inverness-cutlines-2026-07-24.md).

A third attempt on 2026-07-24 recovered eight analysis scripts that had been
cited but never committed, georeferenced the south panel on its own
10-arcminute lattice, and built the check-point machinery. Still not an
acceptance — `check_count` remained 0 on both panels. See
[`church-inverness-attempt-3-2026-07-24.md`](church-inverness-attempt-3-2026-07-24.md).

A fourth attempt on 2026-07-24 captured held-out check points and **rejected
both panels**. The south panel measures 457.8 m RMS over 11 held-out islands
against an agreed 400 m bound; the north panel yielded only 2 usable points and
so cannot be judged at all. Two corrections came out of it: most of attempt 3's
candidate definitions were not physical features but artifacts of where their
boxes were drawn, and the north panel's long-investigated "error tail" was the
reference extract's tile seams being counted as shoreline — the coastline in
that band is the best-registered on the panel. Still no tiles. See
[`church-inverness-attempt-4-2026-07-24.md`](church-inverness-attempt-4-2026-07-24.md).

A fifth attempt on 2026-07-25 **rejected both panels again**, on the same
numbers, and that is its first result: the check points were re-derived
programmatically — threshold the ink, trace the closed outline, shoelace the
centroid, the same rule already applied to the modern island — and the offset
survived. It is a property of the sheet, not of whoever read the contact sheets.

The south error then resolved into **one uniform translation plus ordinary
scatter**: all eleven residuals share both signs, the mean is 404 m north-east,
and the scatter about it is 213 m RMS — inside tolerance. Of the three candidate
causes, rule-centre bias is ruled out by measuring the rules (7–16 px, so at most
43 m, against 404 m observed) and a mis-set anchor by arithmetic (404 m is 2.2 %
of a lattice step). What survives is that the 1884 graticule does not sit where
WGS84 says it does, dominated by a ~15″ longitude component that **reproduces on
both panels** — about one second of time, unremarkable for an 1884 compilation.

That constant cannot be removed using the held-out points without making the
measurement circular, so the next step is to measure it on a *different* Cape
Breton sheet.

It also **corrected attempt 4 on why the north panel cannot be measured**. That
attempt blamed the modern coastline for being too generalised to resolve the
coves Church drew. Measured directly, the reference carries **1,969 vertices at
3.6 m median spacing** across the stretch in question — it is not generalised at
all. What defeats the search is the *rule*: the coast trends 0.689 m east per
metre north, and an extremal rule on a trending coast returns whichever latitude
bound the box cut, exactly as `emit_candidates._refuse_if_truncated` already
warns. Detrending surfaces the coves immediately. North needs a trend-immune
candidate rule, not a new dataset. CanVec 50K was fetched and tested as the
suspected fix and is **coarser** here (533 vertices against 2,139); it is not
adopted and no licence claim is made for it. Still no tiles. See
[`church-inverness-attempt-5-2026-07-25.md`](church-inverness-attempt-5-2026-07-25.md).

The trend-immune rule was then built on both sides — `chords.py` for the modern
vector data and `headlands.py` for the engraving, which finds the drawn shoreline
by filling the PAPER rather than tracing the ink, and selects on **prominence**
exactly as the island detector selects on enclosed area. It traces these
shorelines correctly, and it still yields **no north check points**, for a reason
that is now measured rather than guessed: every one of the nine surviving north
candidates has a rival feature on its own stretch of coast at **85–99 % of its
own prominence**, so prominence cannot say which one Church drew. Three of them
duly resolved to the same engraved hook at Chéticamp Point. That degeneracy is
now enforced as `HEADLAND_MAX_RIVAL_SHARE`, which refuses all nine on the modern
side before any drawn point is read.

So the north panel is not blocked on the reference, and not on the detector —
northern Inverness is a fjorded shore of repeated similar coves, and at 1:63,360
it does not carry identifiable check features. **Both panels remain REJECTED**;
the tolerance was never adjusted and the prominence band was never widened.

A sixth attempt on 2026-07-25 resolved the south blocker without consuming the
Inverness checks. The independent 1885 Richmond sheet was georeferenced on 14
graticule controls and measured at eight frozen island centroids. Its mean
longitude residual is −367 m / −16.99″, only 49 m from Inverness south's
previously diagnosed −318 m / ~−14.8″. A rounded −17″ correction, recorded
separately from Inverness's engraved anchor, gives the unchanged eleven south
checks **333.3 m RMS, 468.3 m P95, and 468.3 m max** against fixed bounds of
400/900/1,500 m. **South now passes.**

North did not. An official NSHN river-mouth probe found seven modern mouths with
at least 10 km of upstream primary flow, but visual QA found only one clearly
drawn junction and at most two more plausible ones; roads, lot lines, hachure,
and coastline compete with the rest. Roads have no stable 1884-to-modern
junction rule, and lakes were already absent. No detector was built for an
insufficient supply. North is therefore recorded **unmeasurable / REJECTED**,
and the combined Inverness layer remains unavailable. No tiles, catalog change,
hosting decision, or source URL. See
[`church-inverness-attempt-6-2026-07-25.md`](church-inverness-attempt-6-2026-07-25.md).

## Wired counties

| County | Layer id | Published | Scale | Rumsey item |
|---|---|---|---|---|
| Inverness | `church-inverness` | 1884 | 1:63,360 | `RUMSEY~8~1~353591~90120835` |
| Victoria | `church-victoria` | 1884 | 1:63,360 | `RUMSEY~8~1~374820~90141224` |
| Richmond | `church-richmond` | 1885 | 1:84,269 | `RUMSEY~8~1~373669~90140407` |
| Cape Breton | `church-cape-breton` | 1884 | 1:63,360 | `RUMSEY~8~1~374821~90141223` |

Rumsey's "Date" field on these items reads 1864 — that is the copyright and
survey date. The publication dates above come from each item's Note field.

## Also in Rumsey, not yet wired

| County | Published | Scale | Rumsey item | Note |
|---|---|---|---|---|
| Cumberland | 1873 | 1:42,240 | `RUMSEY~8~1~372500~90139420` | |
| Kings | 1872 | 1:63,360 | `RUMSEY~8~1~372851~90139591` | |
| Lunenburg | 1883 | 1:63,360 | `RUMSEY~8~1~200267~3000165` | Georeferenced upstream (79% adequate control points) |
| Halifax | 1865 | 1:99,000 | `RUMSEY~8~1~351990~90119171` | Drawn by H.F. Walling, who originated the series |

These are outside the Cape Breton tax-sale focus area. Adding one is a
catalog entry plus a `LayerID` case — the same shape as the four above.

## Counties missing from Rumsey

Rumsey holds 8 of the 18 sheets. Absent: Pictou, Antigonish, Guysborough,
Colchester, Hants, **Annapolis**, Digby, Yarmouth, Shelburne, Queens.

**Annapolis** was requested for a tax sale and specifically checked on
2026-07-24: Rumsey returns no Church Annapolis sheet. The only Rumsey map of
the county is Roe Brothers 1878 "Counties of Annapolis and Queens"
(`RUMSEY~8~1~33063~1170426`), a 1:443,520 general atlas sheet with no
parcel or owner detail — not a substitute. Non-Rumsey sources are dead ends
for now: NS Archives has only an Annapolis fragment online (the old
`/churchmaps/` exhibit is a dead soft-404) and DNR sells paper
reproductions only. Those carry Crown copyright rather than the Rumsey
licence, so sourcing one is tracked as separate work.

## Licensing

- **Credit line (required):** David Rumsey Map Collection, David Rumsey Map
  Center, Stanford Libraries
- **Terms:** https://www.davidrumsey.com/about/copyright-and-permissions
- Rumsey's copyright page currently states **CC BY-NC-SA 3.0**. (An earlier
  brief for this work said 4.0; the live page is authoritative.) The version
  is deliberately not hardcoded in either codebase — only the credit line and
  the URL are. The four Church sheets carry the full credit line ("David
  Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries") plus
  the licence URL. The older Fletcher entry predates this convention and
  still uses a short provider string with no licence URL at all.
- The original maps (1864–1885) are public domain by age. The *scans* are what
  the Creative Commons terms cover.
- This project is non-commercial and MIT-licensed, which fits BY-NC-SA.

## Why these maps need panel-aware thin-plate splines

The four-corner affine recipe in `docs/FLETCHER_GEOREFERENCING.md` does **not**
work here. Fletcher sheets are systematic grid surveys with true rectangular
latitude/longitude bounds. Church county maps were compiled for legibility of
resident names, and their internal geometry is correspondingly loose:

- StFX's Eigg Mountain GIS project found the Church map's geography "is so
  distorted that it is impossible to georeference to the modern base map in
  ArcView."
- GANS needed 300–500 anchor points per county to succeed.

The Rumsey Inverness scan is also a wall-map composition, not one continuous
map image. It contains separate northern and southern geographic panels plus
town insets and decoration. Victoria likewise contains separate main map
panels. A single whole-sheet transform would mix unrelated image coordinate
spaces and is forbidden.

Each geographic panel is therefore an independent production unit:

1. define an explicit pixel cutline that excludes insets, title art, and the
   neighbouring panel;
2. capture distributed `control` points and independent `check` points;
3. warp the panel with `gdalwarp -tps`;
4. measure held-out RMS and P95 error and visually inspect labels, roads,
   shorelines, and panel edges;
5. accept, rework, or reject the panel before mosaicking accepted panels.

The cutline must be a **polygon, not a rectangle**. On the Inverness sheet a
single engraved divider runs diagonally (and bends), so any axis-aligned box
around one panel swallows a wedge of the other. `tools/church/cutlines.py`
carries the polygon primitives and `tools/church/panels.py` the measured
vertices; `tools/church/detect_rules.py` derives them from the scan's heavy
engraved rules rather than by eye.

## Controls: prefer the printed graticule

Place-label centres are weak evidence and should only ever bootstrap. On the
Inverness sheet the drawn "CHETICAMP" label sits about 3.7 km from the CGNDB
coordinate for the village — error that goes straight into the warp, because a
thin-plate spline interpolates its controls exactly.

The sheets carry a **printed lat/lon graticule** (5 arcminutes on the Inverness
north panel). Its intersections are exact by construction, regularly spaced,
and spread across the panel. `tools/church/detect_graticule.py` finds the
lines, `tools/church/fit_lattice.py` fits them as a regular lattice, and
`tools/church/graticule.py` turns lattice indices into coordinates once an
anchor has been read off a printed degree/minute label.

Fitting the graticule recovers the cartographer's *projection frame*. It does
not certify the topography drawn inside it — only independent physical
features can do that, which is why every graticule point is `control` and
every check point is a shoreline, river mouth, or junction.

## Accuracy reporting

Two numbers appear in each layer's `metadata.json`, and they mean different
things:

- **`affine_rms_m`** — how badly a plain affine fits the control points. A
  distortion index, not the delivered layer's accuracy.
- **`check_rms_m` and `check_p95_m`** — error of the delivered TPS warp at
  points held out of the warp entirely. These are the honest accuracy figures
  shown to users.

A thin-plate spline interpolates control points exactly, so error measured at
those points is always approximately zero regardless of quality. Only held-out
checks provide an independent measurement. Historical survey distortion also
remains distinct from modern georeferencing error.

## Producing Inverness

Generated source rasters, warped GeoTIFFs, and tiles stay out of Git. The
versioned inputs are panel definitions, GCP CSVs, pipeline code, validation
reports, and provenance/checksum manifests.

```bash
# 1. Fetch the full source scan over IIIF.
python3 -m tools.church.fetch_rumsey inverness --output build/church

# 2. Crop each declared panel and capture controls/checks against an
#    authoritative modern reference in QGIS.

# 3. Warp and validate every panel independently. Pixel coordinates in both
#    CSVs remain relative to the complete archival scan; the tool applies each
#    registered crop and shifts them automatically.
python3 -m tools.church.georeference inverness \
  --panel north \
  --source build/church/inverness/inverness.tif \
  --gcps tools/church/gcps/inverness-north.csv \
  --output build/church

python3 -m tools.church.georeference inverness \
  --panel south \
  --source build/church/inverness/inverness.tif \
  --gcps tools/church/gcps/inverness-south.csv \
  --output build/church

# 4. Clip out the title art and town-plan insets, then mosaic only accepted
#    panel outputs. Generate XYZ tiles from that reviewed mosaic.
python3 -m tools.church.make_tiles inverness \
  --warped build/church/inverness/inverness-3857.tif \
  --output tiles/church-inverness \
  --source-url "https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~353591~90120835" \
  --retrieved 2026-07-24
```

The Fletcher scrape shortcut (`docs/tile_downloader.py`) is not used. The
Church pyramid is independently generated from the Rumsey source scan and its
versioned control evidence.

Do not commit the tile tree. `Tiles/Fletcher` is already roughly 311 MB of plain
Git blobs, and a packaged GitHub Release asset is not itself an XYZ tile host.
Choose stable object storage or a packaged range-readable format such as
PMTiles before changing `serviceUrl` / `sourceURL` or marking the layer
available.

Tests:

```bash
python3 -m unittest discover -s tools/church/tests -t . -v
```

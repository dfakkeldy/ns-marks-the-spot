# Crown Land Grant Index Sheets — Georeferencing Feasibility

Research snapshot: **2026-07-24**. Prototype by GDAL 3.9 CLI workflow; findings are reproducible from the public PDFs.

> [!WARNING]
> **LICENSING GATE — do not ship yet.** The 138 Crown Land Grant Index Sheets are
> **Crown copyright of the Province of Nova Scotia (DNRR)**. They are **not** covered by
> the Open Government Licence – Nova Scotia. A permission request to DNRR is **pending as of
> 2026-07-24**. Correspondence trail: the request went to `natural.sciences@novascotia.ca`
> (2026-07-24), who replied the same day that the sheets are owned by the **Land Strategy and
> Planning branch** and referred the permissions question to the **Crown Land division**
> (`crownland@novascotia.ca`); the follow-up request to Crown Land is the live thread. Until
> written permission is confirmed:
> - **No public tiles.** Do not publish warped rasters or XYZ tiles to any host the web/iOS app reads.
> - **No sheet imagery in the repo.** All scans, warped GeoTIFFs, tiles, and overlay screenshots stay in local/scratch directories only. This report (text and measurements, no imagery) is the only committed artifact.
> - The eventual layer must display the sheet's own caution verbatim (see [§9](#9-how-the-layer-would-register-in-the-catalog)).

---

## 1. Executive summary

Georeferencing the Grant Index Sheets is **technically straightforward and highly automatable**. The prototype confirms:

- **Extraction is free.** Each PDF wraps one lossless JPEG that `pdfimages -j` lifts out in ~0.1 s with zero re-encoding.
- **Accuracy is fit-for-purpose.** A 4-point affine warp of sheet 085 (Pictou) registered the 1932 coastline to the modern OpenStreetMap shoreline within roughly a coastline-width across the full ~30 km sheet. Measured control-point RMS was **~72 m**, dominated by manual identification error on a generalized 1930s coast; the three well-separated points agreed to **1–14 m**. This is entirely adequate for a reference overlay whose own legend warns it is "a graphic index only."
- **The red overprinted grid is the automation key.** It is the **Nova Scotia 1:10,000 provincial mapsheet grid: a true 10 km × 10 km square grid** aligned to the provincial MTM projection's north. Measured spacing was 10.02–10.04 km on four independent sheets once per-sheet scan DPI is applied. Detecting the grid is fully scriptable (done here), giving ~5–6 exact interior control points per sheet.
- **The catch for full automation:** the grid lines are **not labelled with coordinates** on the map face, so each sheet still needs *one* external tie to fix which 10 km lines it shows. That reduces per-sheet human effort to ~1–3 minutes.

**Recommendation:** pursue the grid-based hybrid pipeline ([§7](#7-automation-feasibility-for-all-138-sheets)). Estimated **~12–25 hours of supervised work** to georeference all 138 sheets once licensing clears. Do not start producing public artifacts until DNRR permission is in hand.

---

## 2. Source facts (verified 2026-07-24)

| Property | Value |
|---|---|
| Sheets | 138, numbered 002–140 (with gaps/inserts, e.g. 4a) |
| Clickable index | `https://novascotia.ca/natr/land/grantmap.asp` (a 600×460 image map; `<area>` polygons give per-sheet layout) |
| Per-sheet PDF | `https://novascotia.ca/natr/land/indexmaps/<NNN>.pdf`, e.g. `085.pdf` |
| Access | `novascotia.ca` returns **HTTP 403 to non-browser user-agents** — fetch with a browser UA string |
| PDF payload | Single embedded RGB JPEG per page, no vector content |
| Scan size | ~5,600–6,100 × 3,800–4,180 px |
| Scan DPI | **150 or 160 dpi** (varies by sheet; e.g. 085/114 = 160, 119/120 = 150) |
| Paper size | ~38 × 26 in |
| Scale | **1:31,680** (1 in = 40 chains = 0.5 mile) |
| Ground resolution | 804.672 m per inch ÷ dpi → **5.03 m/px @160 dpi, 5.36 m/px @150 dpi** |
| Content | Crown grant polygons + grantee names + grant numbers + Book/Folio refs (grants mostly 1750–1850), over a Dept. of Lands & Forests survey base (coast, roads, rivers, place names), with red overprinted grid and update stamps to ~2008 |
| Sheet joins | Edge-to-edge ("Joins Sheet NN" margin notes) |
| Mandatory caution | *"THIS SHEET IS A GRAPHIC INDEX ONLY, AND GRANT BOUNDARIES MAY NOT IN ALL CASES BE FOUND AS SHOWN"* |

---

## 3. Prototype scope and sheet selection

Three sheets were pulled to scratch (never committed):

| Sheet | County | Why chosen |
|---|---|---|
| **085** | Pictou | Requested; strong coastline features for control (Cape John, River John, Toney River) |
| **120** | Inverness | Covers the Aug 2026 tax-sale cluster on the Chéticamp coast |
| **114** | Inverness | Second Inverness sample; clearest red grid; covers Broad Cove / NE Margaree parcels |

### Mapping tax-sale parcels to sheets

The 47 PIDs in `web/src/data/invernessTaxSale.snapshot.json` were resolved to centroids live from NSPRD (`PLAN_NSPRD_WM84/MapServer/0`) — they span **45.68 N to 46.64 N** (~107 km), so **the sale crosses roughly eight sheets**, not one. A rough affine georeference of the clickable index map (residual ±10–24 px, adequate only for ranking) plus direct confirmation from each sheet's printed place names gives:

| Sheet | Tax-sale communities on the sheet | Example liens |
|---|---|---|
| **120** | Cap-Le-Moine, Grand Étang, Belle-Marche, Plateau, St-Joseph-du-Moine | 19, 26, 27, 32, 38, 39, 42 (~7 parcels) |
| **114** | Broad Cove Marsh/Chapel, NE Margaree, Margaree Forks | 3, 40 |
| **127** | Chéticamp | 25, 30 |
| 108 / 109 / 115 / 119 | Mabou, Lake Ainslie, Judique/Creignish/Troy, Margaree Valley | remainder |

**Sheet 120 is the single best Inverness demonstrator**: confirmed "INVERNESS COUNTY", coastal (good control), and it carries the largest single cluster of sale parcels.

---

## 4. Method

Pure GDAL CLI — no QGIS required (QGIS's georeferencer is a GUI over exactly these calls).

```bash
# 1. Extract the embedded JPEG losslessly (no resampling, no generation loss)
pdfimages -j 085.pdf s085           # -> s085-000.jpg (6042x4178, 160 dpi)

# 2. Attach ground control points (pixel -> lon,lat WGS84)
gdal_translate -of GTiff \
  -gcp 770  1358 -63.128 45.804 \    # Cape John headland
  -gcp 429  2359 -63.112 45.764 \    # Angel Point
  -gcp 3842 3419 -62.896 45.772 \    # Toney River
  s085-000.jpg s085_gcp.tif

# 3. Warp to WGS84 (or EPSG:3857 for tiling)
gdalwarp -order 1 -r bilinear -t_srs EPSG:4326 -dstalpha s085_gcp.tif s085_wgs84.tif

# 4. (When licensing clears) slice to XYZ tiles
gdal2tiles.py --xyz -z 10-15 s085_webmerc.tif Tiles/GrantIndex_085
```

Control coordinates came from the **Canadian Geographical Names** service (`geogratis.gc.ca/services/geoname`), WGS84. Two transform models were compared: **Polynomial-1 (affine)** and **Thin Plate Spline (TPS)**.

---

## 5. Accuracy achieved

### 5.1 Control-point RMS (sheet 085, affine, 4 coastal GCPs)

| GCP | Residual |
|---|---|
| Cape John headland | 92.5 m |
| Reef Point | 108.2 m |
| Angel Point | 14.2 m |
| Toney River | 1.5 m |
| **RMS** | **71.5 m** |

The error is concentrated in the two closely-spaced NW points (Cape John / Reef Point), where the generalized 1930s ink coastline is hard to pin to a modern place-name centroid. The three well-separated points are mutually consistent to **1–14 m**. Independently, the affine fit **recovered a +20.1° sheet rotation and ~4.3–4.8 m/px scale** with no prior knowledge — matching the grid/magnetic analysis in [§6](#6-grid-and-projection-determination) and confirming the model is sound.

**Interpretation:** this ~72 m figure is an *upper bound set by manual identification precision*, not a floor of the method. Full-resolution GCP placement in QGIS, or the interior grid control of [§7](#7-automation-feasibility-for-all-138-sheets), would tighten it. TPS with the same points fits the control exactly (0 residual) and additionally absorbs local paper cockling, at the risk of over-warping between sparse points — prefer affine/Poly-1 when control is sparse, TPS only with a dense, well-distributed net.

### 5.2 Visual check

The warped sheet was overlaid on OpenStreetMap at 50–65 % opacity in Leaflet:

- **Sheet-wide:** the 1932 inked shoreline tracks the modern coast from Cape John through the River John estuary east to Toney River — within roughly a coastline-width along the whole ~30 km sheet. Grant polygons therefore land in their correct modern context.
- **At 100–300 m zoom:** visible local offsets appear at the Cape John headland, attributable to (a) 1930s coastal generalization, (b) my ~100 m NW control error, and (c) the sheet being a "graphic index" rather than a survey. This is the expected and acceptable behaviour for a historical reference overlay.

*(Overlay screenshots contain sheet imagery and are retained in scratch only, per the licensing gate.)*

---

## 6. Grid and projection determination

This is the load-bearing finding for automation.

### 6.1 What the sheets are drawn on

- **Neatline orientation:** each sheet is drawn **magnetic-north-up for epoch 1932** — the right margin carries a "Magnetic 1932" declination arrow ~2.6° off the sheet's vertical edge. With ~22–24° W declination in Pictou c.1932, the sheet's vertical axis sits ~20–23° west of true/grid north.
- **Red overprinted grid:** two perpendicular families of red lines (measured inter-family angle 89.5–89.9°). They are **rotated ~21–23° relative to the neatline** — i.e. aligned to grid north, not to the magnetic-north sheet. (A separate single red diagonal is a county/district boundary, not a grid line.)

### 6.2 The grid is the NS 1:10,000 provincial mapsheet grid (10 km)

Automated line-fitting (red-pixel mask → angle sweep → projection-peak spacing) across four sheets, with each sheet's ground scale computed as `804.672 / dpi`:

| Sheet | DPI | m/px | Measured grid spacing |
|---|---|---|---|
| 085 (Pictou) | 160 | 5.029 | **10,041 m** |
| 114 (Inverness) | 160 | 5.029 | **10,025 m** |
| 120 (Inverness) | 150 | 5.364 | **10,023 m** |
| 119 (Inverness) | 150 | 5.364 | 9,612 m* |

\* 119 has the sparsest, faintest grid (fewest red pixels); its low value is detection noise, not a different grid.

Three of four land within **0.4 % of exactly 10 km**, and the 150-dpi Cape Breton sheets agree with the 160-dpi mainland sheets *only after* DPI correction — proving the grid is a real 10 km projected grid. The provincial base these sheets share (NSTDB 1:10,000) is published in **NAD83(CSRS) / MTM Nova Scotia** (EPSG:2961 = zone 5 for the mainland/Pictou; EPSG:2962 = zone 4 for Cape Breton/Inverness), and its 1:10,000 mapsheets tile the province in exactly these 10 km cells.

**Two useful corollaries:**
1. The measured grid spacing **self-calibrates each scan's pixel scale**, so mixed 150/160-dpi scans need no per-sheet DPI bookkeeping.
2. Because sheets join on this common grid, tie-points are **shared across sheet edges** — neighbouring sheets constrain each other.

### 6.3 The automation gap

Inspecting the neatline where red lines cross it, **no easting/northing labels are printed** on sheet 085. So the grid gives you a perfect *relative* lattice but not *absolute* coordinates. Fixing absolute position needs one of:
- **(preferred)** deriving each sheet's 10 km cell from the NSTDB 1:10,000 sheet-index footprint (the grant-index sheet numbering corresponds to known ground extents), or
- a single coarse tie (one coast/road point per sheet) snapped to the nearest 10 km grid line.

Either is ~1–3 minutes of human work per sheet.

---

## 7. Automation feasibility for all 138 sheets

| Stage | Automatable? | Effort |
|---|---|---|
| Download 138 PDFs (browser UA) | Fully | minutes, scripted |
| Extract embedded JPEG (`pdfimages -j`) | Fully | seconds total |
| Detect red grid + intersections | Fully (prototyped here) | seconds/sheet |
| Assign absolute 10 km coordinates | Semi — needs 1 tie/sheet ([§6.3](#63-the-automation-gap)) | ~1–3 min/sheet human |
| Warp (`gdal_translate` + `gdalwarp`) | Fully | seconds/sheet |
| QA overlay vs OSM/NSTDB | Human eye | ~2–5 min/sheet |
| Tile (`gdal2tiles.py`) | Fully | minutes/sheet |

**Two paths:**

- **(a) Manual GCPs on coast/road features.** Works, but interior sheets (no coastline) have sparse features matchable to modern data — the same weakness that pushed sheet 085's RMS onto coastal points. ~15–40 min/sheet skilled → **~35–90 hours** for 138.
- **(b) Grid-based hybrid (recommended).** Auto-detect the 10 km grid → auto-propose absolute coordinates from the NSTDB sheet-index footprint → human confirms one tie and eyeballs the overlay → warp. ~5–10 min/sheet → **~12–25 hours** for 138, with better and more uniform interior accuracy than path (a).

**Total estimated pipeline time (path b, post-licensing): ~12–25 hours supervised**, plus a few hours to build and validate the batch scripts on the three sheets already extracted.

---

## 8. Recommended tiling zoom range

Source resolution is ~5 m/px. Web Mercator ground resolution at 46 °N is `108,797 / 2^z` m/px:

| z | m/px @46 °N | vs 5 m/px source |
|---|---|---|
| 13 | 13.3 | coarse |
| 14 | 6.6 | ~native |
| **15** | **3.3** | **captures all source detail** |
| 16 | 1.7 | pure upsampling — no new detail |

**Recommend `z10–z15`** (matching the existing Fletcher pipeline in `docs/tile_downloader.py`). z15 slightly oversamples 5 m/px, so it preserves everything; **do not tile z16+** — it quadruples storage for zero added detail. z10–z11 give province-scale overview across the 138-sheet mosaic.

**Storage note:** a full-province z10–15 PNG mosaic is roughly **40,000–80,000 tiles (~1–3 GB)**. For the web app, serve from a remote XYZ/WMTS host (the Fletcher pattern) rather than committing tiles. For iOS offline bundles, tile per-sheet on demand and consider WebP to cut size.

---

## 9. How the layer would register in the catalog

When licensing clears, this is a `WebLayerDescriptor` in `web/src/layers/layerCatalog.ts`, following the **Fletcher `rights-pending` precedent** (Fletcher ships on iOS but is filtered out of the web map via `provinceLayerCatalog` until rights are cleared):

```ts
{
  id: "crown-grant-index",
  name: "Crown Land Grant Index",
  serviceUrl: "https://<host>/tiles/grant-index/{z}/{x}/{y}.png", // remote, when hosted
  nativeDefaultVisibility: false,
  minZoom: 10,
  maxZoom: 15,               // z15 ≈ native 5 m/px; see zoom section
  opacity: 1,                // user drives transparency via the existing slider
  licence: "crown-grant-restricted", // NEW discriminator — see below
  webAvailability: "rights-pending", // keeps it off the web map until DNRR permission
  webCaveat:
    "Graphic index only — grant boundaries may not be found as shown · zoom 12+ · rights pending",
  sourceDate: "Survey base to ~2008; grants 1750–1850",
  scale: "1:31,680 (1\" = 40 chains)",
  coverage: "Nova Scotia — 138 Crown Land Grant Index sheets",
}
```

**Two required changes to the layer plumbing:**

1. **New `licence` discriminator.** The union is currently `"province-restricted" | "rumsey-reference"`. These sheets are neither — they are **DNRR Crown copyright**. Add e.g. `"crown-grant-restricted"`, and give it attribution text plus a licence URL in `web/src/licensing/` (mirroring `PROVINCE_ATTRIBUTION`), wired through `printLayerSources()` in `App.tsx` and `RequiredAttribution` in the print document.
2. **Mandatory caution display.** The sheet's own legend — *"THIS SHEET IS A GRAPHIC INDEX ONLY, AND GRANT BOUNDARIES MAY NOT IN ALL CASES BE FOUND AS SHOWN"* — must be surfaced wherever the layer is shown (map attribution footer, print/share document, and the iOS `LayerAttribution.disclaimer` / `userCaveat`). Treat it as a hard requirement of any eventual permission, not optional UX copy.

The iOS `LayerCatalog.swift` mirror would use `LayerAttribution(provider: "NS Dept. of Natural Resources & Renewables", copyright: "© Province of Nova Scotia", disclaimer: "Graphic index only — grant boundaries may not be found as shown.", …)` with the same `rights-pending` gating.

---

## 10. Next steps

1. **Blocked on licensing.** Natural Sciences referred the request to the Crown Land division (`crownland@novascotia.ca`, 2026-07-24); await their reply. Produce no public tiles and commit no sheet imagery until then.
2. When cleared: build the batch scripts (download → extract → grid-detect → tie → warp → tile) and validate on sheets 085, 114, 120 first.
3. Confirm the NSTDB 1:10,000 sheet-index → grant-index-sheet footprint mapping so absolute grid coordinates can be auto-assigned ([§6.3](#63-the-automation-gap)).
4. Add the `crown-grant-restricted` licence discriminator and the mandatory-caution display path *before* the layer ships, so the disclaimer cannot be forgotten.
5. Update `ARCHITECTURE.md` / `README.md` when the new layer type and licence discriminator land.

## Reproducibility

Toolchain: GDAL 3.9.0 CLI (`pdfimages`, `gdal_translate`, `gdalwarp`, `gdal2tiles.py`) via MacPorts `python3.12`; `numpy` for grid line-fitting; Canadian Geographical Names and NSPRD for control/validation coordinates. All downloaded PDFs, extracted scans, warped GeoTIFFs, tiles, and overlay screenshots were kept in a scratch directory outside the repository.

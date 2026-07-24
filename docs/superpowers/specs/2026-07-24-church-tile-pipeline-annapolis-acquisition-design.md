# Church Tile Pipeline + Annapolis Acquisition — Design

**Date:** 2026-07-24
**Status:** Design (awaiting spec review)
**Author:** Claude (with Dan Fakkeldy)
**Supersedes nothing.** Complements `2026-07-24-church-county-map-layers-design.md`,
which designed *catalog wiring with tiles deferred*. This spec designs the
*deferred half*: the tile pipeline itself, proven on one county.

## Goal

Two tracks, one change:

1. **Unblock Annapolis.** The 1876 A.F. Church Annapolis sheet has no free
   full-resolution scan anywhere. Produce a ready-to-send Library and Archives
   Canada (LAC) enquiry that settles both rights and digitization cost.
2. **Retire the georeferencing risk before paying for it.** Build a reusable
   Church georeference-and-tile pipeline and prove it end-to-end on **Inverness**,
   which Rumsey serves free and keyless today. When the Annapolis scan arrives,
   wiring it is mechanical rather than exploratory.

## Why this order

The expensive input (Annapolis: fees, weeks of lead time, uncertain rights) and
the risky unknown (can a Church county map be warped to Web Mercator usefully at
all?) are *separable*. The unknown is county-independent, so it should be
tested against the cheapest county available, not the costliest.

That risk is real and documented, not hypothetical:

- StFX's Eigg Mountain GIS project: "Unlike the Geological Survey Map, the
  geography of the Church Map is so distorted that it is impossible to
  georeference to the modern base map in ArcView."
- The Genealogical Association of Nova Scotia's A.F. Church Maps Project
  georeferenced Antigonish, Hants and Halifax using **300–500 anchor points per
  county**.

Both point the same way: the 4-corner affine warp in
`docs/FLETCHER_GEOREFERENCING.md` will not work here. Fletcher sheets are
systematic grid surveys with true rectangular lat/lon bounds; Church county maps
are *compiled* maps drawn for legibility of resident names, with rubber internal
geometry.

## Sourcing findings (verified 2026-07-24)

### Annapolis: no free full-resolution scan exists

| Source | Verified result |
|---|---|
| David Rumsey | Zero hits for a Church Annapolis map (verified previously) |
| NS Archives `maps/archives/?ID=942` | **Fragment only.** Downloaded and inspected: 1786 × 2661 px, 841 KB |
| NS Archives full map search | Only insets/fragments for *all* Church counties |
| GANS A.F. Church Maps Project | Digitized: Antigonish, Cumberland, Halifax, Hants, Lunenburg, Queens, Shelburne, Guysborough. **Annapolis absent** |
| MIRCS (`mircs.ca`) | Domain dead (NXDOMAIN). Wayback holds working papers, no county scans |
| DNR/NRR library | Paper only, $19.35/county, 2 sheets ≈ 36″ × 60″ |
| Internet Archive | 7 hits, none relevant |
| HantsGenWeb / Rootsweb | Dead (returns `{}`) |
| Library and Archives Canada | Record exists (IdNumber 4000751); site behind a Cloudflare bot challenge, **not bypassed** — needs a human or a reprography request |

The NS Archives image was inspected directly: it is a photographic copy print of
only the **southeast (Lunenburg-boundary) corner**, ruler and hole-punches in
frame, heavy shadowing along the diagonal, carrying the Clements Port inset and
several community directories. At 1786 × 2661 px against Rumsey's typical
34,427 × 34,543 px it is roughly **1/20th the linear resolution**, covering
perhaps a quarter of the county. It is not a viable source at any zoom useful
for parcel work, and it is Crown copyright © Province of Nova Scotia.

### Inverness (the proxy) is genuinely obtainable

Verified live against the Rumsey LUNA API and IIIF manifest:

| Property | Value |
|---|---|
| Rumsey ID | `RUMSEY~8~1~353591~90120835` |
| Full resolution | **34,427 × 34,543 px** (confirmed via IIIF manifest canvas) |
| Physical | 141 × 143 cm, 4-sheet lithographic wall map |
| Scale | 1:63,360 → approx. **2.6 m/px** at full resolution |
| Date field vs. actual | Field says 1864 (survey/copyright); note says **published 1884** |
| Publisher | Canada Bank Note Co., Montreal |
| IIIF service | `https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~353591~90120835` |
| IIIF profile | `level1` |
| Preview fetch | HTTP 200, 1531 × 1536, 1.7 MB — keyless |

**Two corrections to the prior spec**, both verified:

1. `iiif.davidrumsey.com` **does not resolve** (NXDOMAIN). The working IIIF host
   is `www.davidrumsey.com/luna/servlet/iiif/`.
2. The profile is **level1**, not "Level-2". Region requests work, which is what
   tiled fetching needs, but arbitrary-size requests should not be assumed.

## Architecture

### Track 1 — `docs/annapolis-church-lac-enquiry.md` (new)

A ready-to-send enquiry to `reproduction@bac-lac.gc.ca` (613-996-5115; order
form at `reproduction.bac-lac.gc.ca`, which offers "Art, maps or photographs
(digital copies)"). It cites LAC **IdNumber 4000751** and asks for exactly four
things:

1. Written confirmation of the copyright status of both the 1876 original and
   LAC's reproduction of it.
2. A quote for high-resolution digitization, target **≥ 20,000 px on the long
   edge** (to land near Rumsey's ~2.6 m/px for the series).
3. Explicit permission to publish **derived Web Mercator tiles** in an
   MIT-licensed open-source application.
4. The exact credit line LAC requires.

Fees and available dpi are not published, so the enquiry asks rather than
assumes. **The maintainer sends it**; this repo only drafts it.

### Track 2 — `tools/church/` (new)

Four small pieces rather than one script, so each is testable alone and the
GCP files stay reviewable as plain text:

| File | Responsibility | Depends on |
|---|---|---|
| `fetch_rumsey.py` | Pull full-res image via IIIF region requests, assemble to TIFF, write provenance | network, IIIF |
| `georeference.py` | GCPs → `gdal_translate` → `gdalwarp -tps` → EPSG:3857; **emit residuals** | GDAL CLI |
| `make_tiles.py` | `gdal2tiles --xyz` → XYZ pyramid + `metadata.json` | GDAL CLI |
| `gcps/<county>.csv` | Ground control points, version-controlled | — (human authored) |

**Warp method: thin-plate spline (`gdalwarp -tps`), not affine.** This is the
core technical decision and the reason to build rather than reuse the Fletcher
recipe. See "Why this order" above.

**The pipeline reports its own error.** `georeference.py` emits per-GCP
residuals and an overall RMS figure into `metadata.json`, and that number flows
into the layer's user-facing caveat. A Church layer *will not* align perfectly;
shipping the error alongside the layer is the honest posture, and it matches the
existing accuracy-aware idiom in this repo (the NS well logs layer and its
`GEOREF_A` accuracy bands, commit `0257839a2`).

**GCP capture workflow:** QGIS Georeferencer GUI, exported as a `.points` file
and converted to the CSV. Automated feature matching against a modern basemap is
not credible on an 1876 compiled map with distorted geometry. Seed with roughly
20 points to prove the pipeline end-to-end, then densify toward the 300–500
range GANS found necessary.

**Local toolchain gap:** GDAL 3.9.0 CLI is present (`gdalinfo`,
`gdal_translate`, `gdalwarp`) but **`gdal2tiles.py` and the Python `osgeo`
bindings are not installed**. Installing them is a prerequisite step, not a
blocker.

### Track 3 — tile storage: GitHub Release assets

`Tiles/` is already **311 MB** of committed PNGs, with no Git LFS and nothing
gitignored, and there is an open roadmap item to stop bundling it. Adding
Church counties compounds that immediately, so this change settles it.

**Decision:** generated tiles are **gitignored**; the pipeline packages a
versioned tarball per county and uploads it as a **GitHub Release asset**. The
iOS build step and the web deploy step each fetch what they need.

Rationale: clone size stays flat, no Git LFS billing on a public repo, each
county tarball is immutable and independently versioned, and the existing
`Tiles/Fletcher` blob gains a migration path rather than a second precedent.
Cost: both builds gain a fetch step.

**A Release asset is a tarball, not a tile server** — so each surface unpacks it
differently, and the two `serviceUrl` values are *not* the same:

| Surface | Mechanism | Resulting source URL |
|---|---|---|
| iOS | Build step downloads + unpacks the tarball into the bundled tile directory | Local bundled tiles (same shape as `Tiles/Fletcher` today) |
| Web | Deploy step downloads + unpacks into the static output tree | Site-relative `/(tiles)/church-inverness/{z}/{x}/{y}.png` |

This means the web layer only renders once the deploy step is in place. Until
then the web entry stays `webAvailability: "rights-pending"` — the same disable
mechanism Fletcher already uses — so a half-wired layer never reaches the map.
Flipping it to `"available"` is the last step of Track 4, gated on the deploy
step actually serving the unpacked tiles.

The exact release tag and asset naming convention (`church-inverness-v1.tar.gz`
against a `tiles/` tag series) is an implementation detail to settle in the
plan, not a design decision.

### Track 4 — layer wiring (Inverness only)

Scope is deliberately **one county**. Inverness exercises every pipeline stage;
the other three Cape Breton counties become mechanical repeats afterwards.
One county keeps this change reviewable.

**Web — `web/src/layers/layerCatalog.ts`**

Mirrors the existing Fletcher entry shape (`id`, `name`, `serviceUrl`,
`nativeDefaultVisibility`, `minZoom`, `maxZoom`, `opacity`, `licence`,
`webAvailability`, `webCaveat`, `sourceDate`, `scale`, `coverage`). Introduce
`RumseyReferenceLayerId` so Church ids are excluded from the province-licensed
renderable set exactly as `"fletcher"` is today (`Exclude<NativeLayerId, ...>`
at lines 16 and 480), plus a `churchLayerCatalog` selector.

`web/src/licensing/rumseyLicense.ts` (new) holds the attribution and licence URL
as constants, following the `provinceLicense.ts` pattern. No CC version string
is hardcoded; the version nuance lives in `docs/CHURCH_MAPS.md`.

**iOS — `Layers/LayerDescriptor.swift`, `Layers/LayerCatalog.swift`,
`App/AppContainer.swift`**

Add a `churchInverness = "church-inverness"` case, a `LayerDescriptor` mirroring
the Fletcher descriptor (`sourceKind: .remoteXYZTemplate`, `renderingRole:
.overlay`, `defaultVisibility: false`, `attribution:` a `LayerAttribution` naming
the David Rumsey Map Collection), and a matching arm in the exhaustive
`makeLayer(from:)` switch.

`offlinePolicy` is `.onlineOnly` for now — saved-area download depends on the
Release-asset fetch landing first, and is out of scope here.

**Caveat text carries the measured accuracy**, e.g.
`"A.F. Church county map (published 1884); georeferenced ±<RMS> m — historical reference, not for navigation."`

### Track 5 — `docs/CHURCH_MAPS.md` (new)

This file does not exist yet on any branch. It records: all 18 counties with
Rumsey IDs where they exist; the publication-date-vs-copyright-date distinction
(the Rumsey `Date` field is the 1864 survey date, the `Note` gives true
publication); per-source rights (Rumsey CC BY-NC-SA, NS Archives/DNR Crown
copyright, LAC pending); the Annapolis sourcing dossier above; and the pipeline
recipe.

**Annapolis stays on the gap list here.** It moves to "wired" only when tiles
exist — its acquisition status is tracked in the same file.

## Premise corrections recorded

Two assumptions in the originating task were checked and are false:

1. **The four Cape Breton Church counties are not wired in this repo.** Only the
   design spec exists, on unmerged branch `claude/fervent-burnell-185acc`
   (commit `9c278d991`). There are no Church entries in `layerCatalog.ts` or
   `LayerCatalog.swift`, and `docs/CHURCH_MAPS.md` exists on no branch — so
   there is no "gap list" to move Annapolis off of yet.
2. **That prior spec deferred all tile production.** Whichever county lands
   first will be the *first* Church county with real tiles, not a match to an
   established pattern. This spec makes that county Inverness.

## Testing

- **Pipeline:** unit-test the GCP CSV parser and the residual computation
  against a synthetic known-good warp (a small affine-transformed fixture where
  the correct answer is computable). Assert `metadata.json` carries provenance
  (source URL, Rumsey id, bbox, zoom range, retrieval date, licence) and a
  numeric RMS. Do **not** hit the network in tests — record a small IIIF
  fixture.
- **Web** (`layerCatalog.test.ts`): assert the Inverness entry's id, name,
  licence `"rumsey-reference"`, caveat containing the published year, exclusion
  from `provinceLayerCatalog`, and presence in `churchLayerCatalog`. New
  `rumseyLicense.test.ts` pins the constants.
- **iOS** (`LayerCatalogTests`): assert the descriptor's id, attribution
  provider contains "David Rumsey", caveat contains the published year,
  `offlinePolicy == .onlineOnly`, `defaultVisibility == false`.
- **Manual gate:** visual overlay check of the warped Inverness raster against
  the modern basemap before the layer is enabled — the RMS figure alone does not
  prove the warp is *useful*, only that it is *consistent*.

## Out of scope

- The other three Cape Breton counties (mechanical repeat once Inverness lands).
- Densifying GCPs to the 300–500 range — the coarse pass proves the pipeline;
  refinement is its own iteration.
- Anything Annapolis beyond the enquiry draft, pending LAC's reply.
- Migrating the existing `Tiles/Fletcher` blob to Release assets — this spec
  establishes the mechanism; the migration is a follow-up.
- Saved-area offline download for Church layers.

## Branch / PR

Feature branch → PR into `nightly`, per the promotion ladder. Rebase onto
`origin/nightly` before implementation.

## Open questions

1. **Does the warp actually produce a useful overlay?** This spec is structured
   so that question is answered cheaply and early. If the coarse Inverness pass
   shows the map is unusable even with TPS, that is a legitimate outcome — and
   it arrives *before* any money is spent on Annapolis.
2. **LAC's rights answer.** If LAC confirms copyright expired and permits
   derived tiles, Annapolis proceeds on this pipeline. If not, the fallback is
   the NS Archives/DNR Crown-copyright path with a separate permission request.

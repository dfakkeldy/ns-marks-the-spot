# A.F. Church County Map Layers — Design

**Date:** 2026-07-24
**Status:** Design (awaiting spec review)
**Author:** Claude (with Dan Fakkeldy)

## Goal

Add A.F. Church "Topographical township map" county layers (1864–1888 series;
resident names on buildings, occupations of prominent townsfolk) to
NS Marks The Spot, sourced from the David Rumsey Map Collection — the same
source and licensing model already used for the existing **Fletcher** layer.

Phase 1 covers the **four Cape Breton Island counties** (matching the tax-sale
focus area). The layers are wired end-to-end into both the iOS app and the web
companion, mirroring exactly how Fletcher is registered, but **tile production
is deferred** — the layers ship as registered-but-not-rendering entries with a
clean seam to drop real tiles in later.

## Scope decisions (locked with maintainer 2026-07-24)

| Decision | Choice | Rationale |
|---|---|---|
| **Surface** | Both iOS + web | Full Fletcher parity; Fletcher exists in both catalogs. |
| **Tiles** | Wire now, tiles deferred | No API key available to scrape; georeferencing gigapixel scans is a separate heavy step; repo is actively trying to *stop* bundling tile binaries. |
| **Web posture** | Disabled "rights-pending" rows like Fletcher | The project keeps Rumsey historical layers off the web until they are backed by hosted tiles; reuses the existing disable mechanism. |
| **Annapolis** | Out of scope; tracked as follow-up | The Church Annapolis sheet is **not in Rumsey** and not cleanly available elsewhere (see "Annapolis gap"). |
| **Stretch four** (Cumberland, Kings, Lunenburg, Halifax) | Documented, not wired live | Trivial to add later (data-driven), but they clutter the layer list with counties outside the tax-sale focus area. |

## Background: how Fletcher is actually wired (the template to mirror)

Verified against the codebase 2026-07-24. Two findings shape this design:

1. **Fletcher does not render on the web.** Its `web/src/layers/layerCatalog.ts`
   entry is a deliberately disabled, greyed-out row. It carries
   `licence: "rumsey-reference"` + `webAvailability: "rights-pending"`, and is
   excluded from the renderable set at the type level via
   `Exclude<NativeLayerId, "fletcher">` (lines 16 and 480). The runtime filter is
   `licence === "province-restricted"` in `provinceLayerCatalog`, which Fletcher
   fails, so it never reaches the map.

2. **There is no tile deploy pipeline.** Fletcher's tiles are ~311 MB of plain
   PNG blobs committed under `Tiles/Fletcher/` (no Git LFS) and bundled into the
   iOS app via an Xcode *folder reference*. KinNoKi Labs deploys the web
   *artifact* only, never tiles. `docs/tile_downloader.py` scraped Fletcher's
   tiles from OldMapsOnline's WMTS, which now requires `OLDMAPSONLINE_API_KEY`
   (not present in the repo, CI, or env — Fletcher's own live tiles currently
   return `{"error":"Missing key parameter"}`). There is an open, unchecked
   roadmap item to stop bundling `Tiles/` entirely.

Because of (1) and (2), "replicate the Fletcher pipeline" for a *tiles-deferred*
Church series means: register catalog entries + metadata + attribution in both
apps, disabled on web exactly like Fletcher, with **no new binaries**.

## Verified source data (David Rumsey LUNA API, 2026-07-24)

All Rumsey IDs resolved exactly. Publication dates are read from each item's
Note field — Rumsey's "Date" field is the 1864 copyright/survey date, but the
notes give the true publication date.

### Phase 1 — Cape Breton Island (wired live)

| County | web id | iOS `LayerID` | Published | Scale | Rumsey ID | Author |
|---|---|---|---|---|---|---|
| Inverness | `church-inverness` | `.churchInverness` | 1884 | 1:63,360 | `RUMSEY~8~1~353591~90120835` | A.F. Church |
| Victoria | `church-victoria` | `.churchVictoria` | 1884 | 1:63,360 | `RUMSEY~8~1~374820~90141224` | A.F. Church |
| Richmond | `church-richmond` | `.churchRichmond` | 1885 | 1:84,269 | `RUMSEY~8~1~373669~90140407` | A.F. Church + Harold A. Church |
| Cape Breton | `church-cape-breton` | `.churchCapeBreton` | 1884 | 1:63,360 | `RUMSEY~8~1~374821~90141223` | A.F. Church |

### Stretch (documented in `docs/CHURCH_MAPS.md`, not wired live)

| County | Published | Scale | Rumsey ID | Note |
|---|---|---|---|---|
| Cumberland | 1873 | 1:42,240 | `RUMSEY~8~1~372500~90139420` | |
| Kings | 1872 | 1:63,360 | `RUMSEY~8~1~372851~90139591` | |
| Lunenburg | 1883 | 1:63,360 | `RUMSEY~8~1~200267~3000165` | Georeferenced upstream (79% adequate control points) |
| Halifax | 1865 | 1:99,000 | `RUMSEY~8~1~351990~90119171` | **H.F. Walling** (series originator), not Church |

Rumsey offers keyless full JP2/MrSID downloads and a keyless IIIF Level-2 image
API (e.g. Inverness is 34,427 × 34,543 px) — image-space only, not
web-mercator XYZ. Producing slippy tiles requires the georeferencing pipeline
(see "Deferred: tile generation").

## Architecture

### Web (`web/`)

**`web/src/layers/layerCatalog.ts`**

- Add the Church county id type and fold it into the Rumsey-reference exclusion
  so Church never leaks into the province-licensed / renderable set:
  ```ts
  export type ChurchCountyLayerId =
    | "church-inverness"
    | "church-victoria"
    | "church-richmond"
    | "church-cape-breton";

  export type NativeLayerId =
    | "fletcher"
    | ChurchCountyLayerId
    | "ns-aerial" | "nsprd" | "crown-lands" | "flood-risk"
    | "waterfalls" | "water-features" | "roads";

  // New: names the "catalogued but web-disabled Rumsey historical" set.
  export type RumseyReferenceLayerId = "fletcher" | ChurchCountyLayerId;

  export type ProvinceLayerId =
    | Exclude<NativeLayerId, RumseyReferenceLayerId>
    | WebOnlyProvinceLayerId;
  ```
  The `provinceLayerCatalog` predicate (currently
  `Exclude<NativeLayerId, "fletcher">`) becomes
  `Exclude<NativeLayerId, RumseyReferenceLayerId>`.

- Add four entries to `nativeLayerCatalog`, mirroring the Fletcher entry:
  `licence: "rumsey-reference"`, `webAvailability: "rights-pending"`
  (the exact disable mechanism), honest per-county caveats carrying the date
  (e.g. `"Published 1884 · web view pending tiles"`), `serviceUrl` = the
  county's Rumsey/Georeferencer source reference, and `sourceDate` / `scale` /
  `coverage` filled from the verified table.

- Add a `churchLayerCatalog` selector helper (filter of `nativeLayerCatalog`
  by the four Church ids) for group rendering and tests.

**`web/src/licensing/rumseyLicense.ts` (new)** — following the
`provinceLicense.ts` / `PVSC_OPEN_DATA_ATTRIBUTION` constant pattern
(the Rumsey attribution string does not exist anywhere in `web/src` today):
```ts
export const RUMSEY_ATTRIBUTION =
  "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries";
export const RUMSEY_LICENCE_URL =
  "https://www.davidrumsey.com/about/copyright-and-permissions";
```
No CC version number is hardcoded (mirrors Fletcher's Swift attribution, which
sets `licenseTitle: nil`); the version nuance is documented in the doc file.

**`web/src/App.tsx`** — render the four Church entries as disabled rows (copy
the existing `.layer-row.unavailable` Fletcher div, driven by
`churchLayerCatalog.map(...)`) inside a titled
`<details className="resource-layer-group">` group **"Church (1860s–80s)"**,
placed adjacent to the existing Fletcher row. Include a per-group source note
with the Rumsey attribution + a link to the copyright page.

### iOS (`ns-marks-the-spot/`)

**`ns-marks-the-spot/Layers/LayerDescriptor.swift`** — add four `LayerID`
cases: `churchInverness = "church-inverness"`, `churchVictoria`,
`churchRichmond`, `churchCapeBreton`.

**`ns-marks-the-spot/Layers/LayerCatalog.swift`** — add four `LayerDescriptor`
entries to `.all`, mirroring the Fletcher descriptor:
- `sourceKind: .remoteXYZTemplate`, `sourceURL:` the county's Georeferencer/
  Rumsey source reference (resolved at implementation time).
- `defaultVisibility: false` (do not default-show a non-rendering layer),
  `offlinePolicy: .onlineOnly` (no bundled tiles, no saved-area download yet).
- `attribution:` a `LayerAttribution` with
  `provider: "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries"`,
  `licenseURL:` the copyright page, disclaimer mirroring Fletcher.
- `userCaveat:` `"A.F. Church county map (published <year>); historical reference, not for navigation."`

**`ns-marks-the-spot/App/AppContainer.swift`** — `makeLayer(from:)` is an
exhaustive `switch descriptor.id`; add four arms. Each returns a
`MapKitTileLayer` with `.tile(url)` (identical shape to the Fletcher arm), or
`nil` when `sourceURL` is absent.

**Untouched on purpose:** `OpacityTileOverlay.bundledNativeZoomRange`
(global `11...15`) and `TileDownloadManager.fletcherLayerID` — Church needs
neither, since it has no bundled tiles and no saved-area downloads. This keeps
the iOS blast radius to the catalog + container + tests.

## Attribution & licensing

- **Credit line** (both surfaces): "David Rumsey Map Collection, David Rumsey
  Map Center, Stanford Libraries".
- **Licence:** Rumsey's copyright page currently states **CC BY-NC-SA 3.0**
  (the task brief said 4.0; the live page is authoritative — documented in
  `docs/CHURCH_MAPS.md`). Originals are public domain by age (1864–1885). The
  code does not hardcode a version string (mirrors Fletcher); the licence URL
  points at the copyright page.
- The app's non-commercial, open-source (MIT) use fits CC BY-NC-SA.

## Annapolis gap (why it is a follow-up, not part of this change)

The maintainer asked to add Annapolis for an imminent tax sale. Verified
2026-07-24 that this is not possible via the Rumsey pipeline:

- Rumsey's catalog returns **zero** hits for a Church Annapolis map.
- The only Rumsey Annapolis map is Roe Brothers 1878 "Counties of Annapolis and
  Queens" (`RUMSEY~8~1~33063~1170426`) — a small-scale (1:443,520) general
  atlas sheet with **no parcel/owner detail**, so it does not serve the Church
  series' due-diligence purpose.
- Non-Rumsey sources are dead ends: NS Archives has only an Annapolis fragment
  online (the `/churchmaps/` exhibit is a dead soft-404); DNR sells paper
  reproductions only. These carry Crown copyright, not the Rumsey CC licence.

Tracked as a separate follow-up task (source + georeference the 1876 Church
Annapolis sheet under its own rights). Recorded in `docs/CHURCH_MAPS.md`.

## Out of scope: tile generation (the deferred seam)

Not in this change. When undertaken (per-county, separate step):
1. Download the public-domain JP2/MrSID (keyless) or pull IIIF tiles.
2. Georeference to EPSG:3857 (GDAL: `gdal_translate` GCPs → `gdalwarp` →
   `gdal2tiles --xyz`; `gdal2tiles` is not currently installed here). Prefer a
   `metadata.json` per county (source URL, Rumsey id, bbox, zoom range, tile
   size, retrieval date, licence) — an improvement over the undocumented
   `Tiles/Fletcher` precedent.
3. Point each layer's `serviceUrl` / `sourceURL` at the produced tiles and flip
   `webAvailability` to `"available"` (or host + render).
4. Decide tile storage deliberately (the repo is moving away from committed
   blobs) before adding binaries.

## Documentation updates (this adds a new layer type — CLAUDE.md reminder)

- `docs/CHURCH_MAPS.md` (new): all eight Rumsey IDs, dates, scales, licensing,
  the Annapolis gap, and the deferred tile-generation recipe.
- `ARCHITECTURE.md` — "Layer Catalog And Offline Storage": note the Church
  series (Rumsey, web-disabled like Fletcher, tiles deferred).
- `README.md` / `web/README.md` — add Church to the layer list + parity prose.
- `plan.md` — annotate "Additional historical map collections beyond Fletcher"
  (partial: Church catalogued, tiles pending).

## Testing

- **Web** (`layerCatalog.test.ts`): a `describe("Church historical map series")`
  block asserting the four entries (ids, names, publication dates in caveats,
  `licence: "rumsey-reference"`, `webAvailability`, per-county coverage,
  attribution), that they are excluded from `provinceLayerCatalog`, and present
  in `churchLayerCatalog`. Update the `App.test.tsx` last-row assertion.
  New `rumseyLicense.test.ts` pins the attribution + URL constants.
- **iOS** (`LayerCatalogTests`, `LayerStatusTests`, `LayerInstallationTests`):
  extend for the four descriptors (ids, attribution provider contains
  "David Rumsey", caveat contains the published year, `offlinePolicy .onlineOnly`,
  `defaultVisibility false`).

## Branch / PR

- This branch (`claude/fervent-burnell-185acc`) predates `origin/nightly`
  (which has #139). Rebase onto `origin/nightly` before implementation.
- Follow the promotion ladder: feature branch → PR into `nightly`.

## Open micro-decisions (defaults chosen; override at spec review)

1. **Stretch four**: documented in `docs/CHURCH_MAPS.md`, not wired live.
2. **Grouped rows**: the four disabled Church rows live under one collapsible
   "Church (1860s–80s)" header rather than four loose rows.
3. **`webAvailability` value**: reuse `"rights-pending"` (exact Fletcher
   mechanism) rather than adding a `"tiles-pending"` value; the honest reason
   lives in the per-county caveat string.

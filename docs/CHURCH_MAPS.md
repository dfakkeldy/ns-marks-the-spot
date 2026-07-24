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
  the URL are, mirroring how the Fletcher layer is attributed.
- The original maps (1864–1885) are public domain by age. The *scans* are what
  the Creative Commons terms cover.
- This project is non-commercial and MIT-licensed, which fits BY-NC-SA.

## Producing tiles (deferred)

No tiles exist yet. When producing them:

1. Rumsey serves full public-domain scans without a key: a JP2/MrSID download
   per item, plus a IIIF Level-2 endpoint
   (`.../luna/servlet/iiif/<id>/info.json`). These are large — Inverness is
   34,427 × 34,543 px.
2. IIIF returns image-space tiles, not Web Mercator. Georeference to
   EPSG:3857 and slice with GDAL, per `docs/FLETCHER_GEOREFERENCING.md`
   (`gdal_translate` GCPs → `gdalwarp` → `gdal2tiles --xyz`). Note
   `gdal2tiles` is not installed by default here, and the georeferencing
   script in that document has two bugs called out in its own notes.
3. The Fletcher scrape shortcut (`docs/tile_downloader.py`) is **not**
   available: `wmts.oldmapsonline.org` now requires `OLDMAPSONLINE_API_KEY`,
   which is not in this repo, CI, or the environment.
4. Write a `metadata.json` beside any tile tree recording source URL, Rumsey
   id, bbox, zoom range, tile size, retrieval date, and licence. The existing
   `Tiles/Fletcher` tree has no such record, which is why its provenance
   survives only in a script's constants.
5. Decide storage deliberately before adding binaries. `Tiles/Fletcher` is
   ~311 MB of plain git blobs (no LFS), and there is an open roadmap item to
   stop bundling tiles.
6. To light a county up, set its `serviceUrl` / `sourceURL` to the tile
   template and flip `webAvailability` to `"available"`.

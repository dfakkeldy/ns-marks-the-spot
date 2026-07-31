# NS Marks The Spot — Online

Online map companion for the native map catalog, PID/civic-address search,
mapped-address Plus Code directions, and municipality-sourced property layers.
The current-notice catalog covers the August 11, 2026 Inverness County auction
and the August 31, 2026 Annapolis County tax sale by tender.
The completed July 21, 2026 CBRM event is retained in historical-record mode
with outcomes explicitly pending until the municipality publishes results.

## Run locally

```sh
npm install
npm run dev
```

Use `npm test`, `npm run lint`, and `npm run build` for the verification gates.

## Share card

`index.html` declares Open Graph/Twitter tags pointing at
`web/public/social-card.png` (1200×630). The source of truth is
`marketing/social-card.svg`; regenerate the PNG with:

```sh
rsvg-convert -w 1200 -h 630 marketing/social-card.svg -o web/public/social-card.png
```

The canonical deployment is the KinNoKi Labs site's pinned copy at
`https://kinnokilabs.com/apps/nsmarksthespot/map/`, so `og:url`,
`og:image`, and `twitter:image` carry that absolute origin (X/Twitter
ignores relative image URLs). If the canonical origin ever changes, update
these three tags and the matching `indexHtml.test.ts` assertions together.

## Data flow

1. Each municipality's official notice supplies its event date and public
   parcel fields. The catalog preserves the municipality's financial wording:
   CBRM publishes a minimum bid, Inverness publishes total arrears, and
   Annapolis publishes a $1.00 minimum bid plus HST for its sealed tender.
2. **Current notices** and **Historical records** are separate map modes with
   their own colour, heading, controls, and parcel-sheet marker. Changing modes
   clears the previous selection so a dated result cannot be mistaken for a
   currently advertised property.
3. Each current tax-sale event toggle has a collapsed property list. The list mirrors
   the redemption filter and renders one action per PID, including separate
   actions when a single lien covers multiple parcels. Selecting a row collapses
   the long list, enables its event layer, fits the map to that parcel, and opens
   the same parcel sheet used by PID search and direct map selection.
4. The browser asks the live NSPRD Feature Layer for polygon geometry by exact
   PID or by the exact coordinate of a visible-boundary map tap or chosen civic
   point. The selected parcel sheet sums NSPRD's mapped area across every
   polygon returned for that PID and converts it to acres. The municipal notice
   remains the authority for tax-sale fields.
5. The public dataset intentionally omits assessed-owner names. The app labels
   records as “listed in official notice,” because a property may be redeemed or
   withdrawn before the sale. Once an advertised start time passes without a
   verified result dataset, the UI changes to “Past sale date — verify results
   with the municipality.” Once the event is deliberately archived, its dated
   notice records can remain mapped with every outcome marked pending; sold,
   unsold, withdrawn, and winning-bid values are never inferred.
6. Browser location stays in the browser and is drawn on the map. This app has
   no application server receiving the coordinates.
7. For a selected PID, the browser reuses the exact NSPRD Polygon or
   MultiPolygon geometry to look up mapped physical-address points from the
   Nova Scotia Civic Address File. Municipal notice locations remain notice
   fields and are not promoted into civic addresses.
8. The address bar continuously records the selected mode, PID, event IDs,
   visible layers, and map latitude/longitude/zoom. The parcel sheet can copy
   that exact state as a share link or download a timestamped Markdown evidence
   note containing the link, official source URLs, mapped intersections, and
   limitations. The note is a reproducible screening receipt, not a title,
   survey, access, occupancy, safety, or current-sale-status conclusion.
9. The parcel sheet queries PVSC's licensed assessed-value history open dataset.
   A current municipal notice AAN is matched directly after normalization to
   the dataset's eight-digit key. Otherwise, the browser requests assessment
   account points in each selected parcel bounding box and retains only points
   inside the exact Polygon or MultiPolygon geometry. Multiple AANs stay
   separate and are never summed. Matched accounts are then looked up in PVSC's
   residential dwelling characteristics dataset, whose assessment-driven
   records (build year, style, living area) surface recent construction that
   aerial-photography building layers can miss for years.
10. Every selected eight-character PID has a user-initiated **Open parcel in
    ViewPoint** link. The short PID URL redirects to ViewPoint's canonical parcel
    page, which exists whether or not the property has a current MLS listing.
    NS Marks does not fetch, parse, cache, or infer listing status from ViewPoint.

All money is stored as integer cents. PIDs and AANs are strings. CBRM's
"Immediate deed" value is displayed as a municipal category; it is not a claim
of immediate possession, guaranteed access, clear title, or buildability.

## Print and Save as PDF

The selected parcel sheet exposes **Print / export** only after an exact PID has
resolved to parcel geometry and the Province restricted-services licence is
accepted. It opens an accessible browser preview with two monochrome US Letter
templates:

- **Research summary** is portrait. Its map fits the complete selected parcel,
  its first page summarizes the PID, mapped facts, evidence status, active
  layers, limitations, sources, and receipt, and an optional appendix prints
  the captured evidence without converting unavailable data into a zero.
- **Field sheet** is one landscape page. It preserves the complete geographic
  bounds frozen from the live map when the preview opened, rather than
  refitting only the selected parcel.

This is a hybrid extent rule: research output is parcel-complete, while field
output is viewport-complete. Each preview uses a sealed snapshot of the
selected PID, mode, event IDs, parcel geometry, enabled layers, map extent, and
matching evidence request. Later map movement, PID changes, or stale evidence
responses cannot silently rewrite an open preview.

Print maps are grayscale with line, weight, and hatch distinctions that do not
depend on colour. Aerial imagery is excluded by default and can be deliberately
included. Layers unavailable at the fitted print zoom are named as not rendered;
a failed layer blocks ordinary printing until it is retried or the user
deliberately chooses an incomplete print, which keeps a warning in the output.
Research evidence preserves separate returned, empty, outside-coverage,
below-zoom, unavailable, and timeout meanings. In particular, an unavailable
source is never presented as an empty result or proof of absence.

The **Print / Save PDF** action invokes the browser's print dialog. There is no
direct PDF/PNG generator, canvas capture, raw geometry download, tile archive,
or bulk data export. OpenStreetMap and ArcGIS images stay browser-rendered in a
display-only, non-interactive Leaflet map. The output includes a locally
generated QR code plus the complete written map-state URL; the written URL is
the required fallback if QR generation fails. It identifies the printed PID,
mode, events, actually rendered layers, and derived print position.

Attribution follows the material actually rendered or reported:

- Province restricted-service layers retain the required Province attribution,
  licence link, and not-a-survey boundary;
- Nova Scotia open-data layers and Civic Address evidence retain the Open
  Government Licence attribution;
- PVSC assessment and dwelling evidence retain the PVSC open-data attribution
  and licence;
  and
- the modern map retains © OpenStreetMap contributors and its copyright link.

The capture excludes owner names, private notes, uploads, and raw source data.
Browser geolocation remains local to the interactive map: its marker, accuracy
circle, and raw coordinates are not rendered or copied into print state.
Location-triggered map movement is suppressed from the printable viewport.
The receipt's latitude, longitude, and zoom describe the derived printed map
position, not a browser-location reading.

## Native layer parity

The web catalog mirrors the native source URLs and rendering restrictions while
remaining online-only. Web-only zoom gates keep Province exports at legible
scales — the parity list of sources and renderers is unchanged:

- NS Aerial streams the Province's NSODB 10k imagery from zoom 10 through map
  zoom 23, overzooming its last useful native scale instead of disappearing.
  Below zoom 10 the modern basemap carries the overview, so the imagery
  service's blank out-of-coverage tiles never frame the province.
- NS Property Boundaries begins at close parcel-detail zoom 14, following the
  live service's 1:36,114 display floor instead of forcing dense parcel lines
  into regional views. PID search still uses exact NSPRD Feature Layer geometry,
  and map-tap parcel identification follows the same zoom floor. A selected sale
  parcel becomes fully opaque at zoom 15 and closer while other listed parcels
  keep their lighter overview fill.
- Crown Lands uses the native green dynamic renderer.
- Watersheds uses the native `show:24,25,26` restriction; it is watershed
  context, not flood-risk mapping.
- Flood hazard context is separate and default-off: published 5%/1% AEP river
  layers for four study areas plus current, 2050, and 2100 Coastal Hazard Map
  scenarios. Selected parcels show coverage-aware source states and approximate
  raster exposure rather than a universal PID probability.
- Waterfalls uses hydrography layer 1 and the exact Province falls definition;
  enabling it fits the map to all 90 matching points before the user zooms in.
- [Water Features](https://data.novascotia.ca/Lands-Forests-and-Wildlife/Nova-Scotia-Topographic-DataBase-Water-Features-Li/fpca-jrmt)
  uses the complete Province hydrography service for rivers,
  lakes, wetlands, rapids, ditches, dams, and other mapped features, from
  zoom 10 where its 1:10,000 line work is legible. A higher
  export resolution improves line legibility without replacing the Province's
  symbols or colours.
- [Roads, Trails & Culverts](https://data.novascotia.ca/Roads-Driving-and-Transport/Nova-Scotia-Topographic-DataBase-Roads-Trails-and-/gywn-246n)
  uses the complete Province transportation service,
  including highways, local/resource roads, unpaved roads, tracks, trails,
  bridges, rail, ferry crossings, road polygons, and close-range culvert
  features, from zoom 10 so the service's route shields appear only where
  they are legible. A compact legend explains the principal line classes.
- [Buildings](https://data.novascotia.ca/d/tz45-5mz7) is a web-only,
  default-off NSTDB context layer from zoom 13. It preserves the Province's
  point and polygon renderer; it does not change the native-app parity list.
- [Contours](https://data.novascotia.ca/d/j63u-5nkj) is a web-only,
  default-off Topography layer from zoom 13. It uses the maintained NSTDB
  Landforms renderer's labelled 5 m LiDAR-derived contour lines. The layer is
  visual terrain screening only: it does not establish surveyed grade,
  drainage, stability, access, flood exposure, or buildability.
- Fletcher has a real default-off control for the 24 independently accepted
  direct-Rumsey sheets. The browser renders bounded per-sheet XYZ trees from
  the immutable `fletcher-direct-rumsey-20260726.1` revision and supports
  opacity, share links, print/evidence attribution, and retryable error state.
  It fails closed with “Tile hosting not configured” unless
  `VITE_FLETCHER_TILE_BASE_URL` names an authorized HTTPS object host. No
  OldMapsOnline endpoint is used.
- The four A.F. Church Cape Breton county sheets (Inverness, Victoria,
  Richmond, Cape Breton; 1884–85, David Rumsey Map Collection) are catalogued
  as disabled rows: no tiles have been produced for them yet. See
  [docs/CHURCH_MAPS.md](../docs/CHURCH_MAPS.md).

## Forestry policy

The collapsed **Forestry** group contains one web-only, default-off open-data
overlay: the Province's
[Old Growth Forest Policy Layer](https://data.novascotia.ca/Lands-Forests-and-Wildlife/Old-Growth-Forest-Policy-Layer/wanf-acts).
At zoom 9 or closer it queries only the current viewport from the official
Socrata GeoJSON endpoint, cancels stale requests, and paginates in stable
system-ID order. It does not require acceptance of the restricted Province map
services licence.

The renderer keeps the source's three policy states distinct: **Confirmed old
growth**, **Restoration opportunity**, and **Status unknown**. Popups carry
source-reported hectares, selection method, the official source link, and the
Open Government Licence provenance. These are mapped policy areas on publicly
owned land outside protected areas, not a complete inventory of old-growth
forest. A returned zero is only “no mapped policy polygon returned for this
viewport”; it is not evidence that no old growth exists. The policy provisions
govern Crown-land management and do not establish conditions on private land.

## Geology and resources

The collapsed **Geology & Resources** group is web-only and starts with every
switch off. Its three source-backed overlays use Province open data
independently of the restricted map-services gate:

- [Mineral Occurrences Database](https://novascotia.ca/natr/meb/download/dp002.asp)
  records known occurrences and past producers. A point is not proof of a
  viable or recoverable deposit.
- [NovaROC](https://novaroc.novascotia.ca/novaroc/) supplies exploration
  licences and mineral leases (MapServer layers 1 and 7). Mineral tenure is a
  provincial right and is not land ownership.
- [Abandoned Mine Openings Database](https://novascotia.ca/natr/meb/download/dp010.asp)
  supplies the degree-of-hazard point inventory. Locations and field conditions
  can change, so it is screening context rather than a site-safety conclusion.

The optional **Properties within 1 km of a mineral occurrence** row is an
application-derived screening layer. At zoom 12 or closer it queries published
Mineral Occurrences points around the settled viewport, then highlights NSPRD
parcels whose mapped geometry falls within 1,000 metres. It requires Province
restricted-services licence acceptance because the output uses NSPRD polygons.
Selecting a highlighted parcel lists occurrence number, name, commodity,
published status, and either **On parcel** or **Within 1 km**. Proximity does not
prove mineralization, deposit extent, grade, recoverability, value, mineral
rights, access, exploration permission, or completeness of the inventory.

Those three source-backed overlays remain independent of the derived row and
each other. Mineral tenure uses the Province's rendered MapServer output. The
two point layers query only the current map envelope, cancel stale requests,
and page ArcGIS results. Mineral occurrences begin at zoom 8; the 8,443-record
mine inventory waits until zoom 11. Each switch reports its own loading,
visible count, zoom, or failure state, so one unavailable source does not
disable the other map and parcel features. Every layer row also exposes its
source date, native or useful scale, coverage, and supported map-zoom range.
All three source-backed overlays were verified against their live sources on
July 20, 2026 under the Nova Scotia Open Government Licence. The fourth row is
the application-derived NSPRD parcel screening layer described above; it
remains licence-gated and off by default.

## Municipal zoning

The collapsed **Municipal zoning** group renders zoning polygons live from five
municipal ArcGIS services. Every layer is default-off, unofficial, and outside
the Province licence gate, because these are municipal rather than provincial
sources.

Nova Scotia publishes no provincial zoning layer (verified July 23, 2026), so
zoning is necessarily per-municipality. Three consequences are carried in the
UI rather than left implicit:

- These are **not** the municipalities' official copies and are **not to be
  used for legal purposes**. Each layer row and popup links the authoritative
  land use by-law.
- **Absence of a polygon is not evidence that no zoning applies.** Most Nova
  Scotia municipalities publish no zoning GIS at all — Pictou County, for
  example, publishes PDF only with its plan in transition through mid-2026 — so
  the map shows nothing there rather than something wrong.
- **Towns inside a county are separate zoning jurisdictions.** A county layer
  does not cover town parcels.

| Layer | Service | Zone code / name fields | Zoom | Licence |
| --- | --- | --- | --- | --- |
| Inverness County | [`IN_Zoning/FeatureServer/708`](https://services5.arcgis.com/IRdatShZ61GuNjMZ/arcgis/rest/services/IN_Zoning/FeatureServer/708) | `Zone` / `ZONETYPE` | 12+ | None stated |
| Victoria County | [`VIZoning_Clipped/FeatureServer/707`](https://services5.arcgis.com/IRdatShZ61GuNjMZ/arcgis/rest/services/VIZoning_Clipped/FeatureServer/707) | `Zone` / `ZONETYPE` | 12+ | None stated |
| Richmond County | [`RI_Plan_Richmond/FeatureServer/376`](https://services5.arcgis.com/IRdatShZ61GuNjMZ/arcgis/rest/services/RI_Plan_Richmond/FeatureServer/376) | `Zone` / `ZONETYPE` | 12+ | None stated |
| Cumberland County | [`Zoning_Cumberland_2018_abbr2/FeatureServer/0`](https://services6.arcgis.com/9de72LkV8htkdfB9/arcgis/rest/services/Zoning_Cumberland_2018_abbr2/FeatureServer/0) | `ZONE` / `ZoneName` | 13+ | None stated |
| Halifax Regional Municipality | [`ZoningBoundaries/FeatureServer/0`](https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/arcgis/rest/services/ZoningBoundaries/FeatureServer/0) | `ZONE` / `DESCRIPTION` | 13+ | [Open Government Licence — Halifax](https://data-hrm.hub.arcgis.com/pages/open-data-licence) |

### Zoning source receipt — July 23, 2026

All five services were queried live on July 23, 2026. Every one returned an
empty `copyrightText`, and only Halifax publishes a licence page. The four
sources with no stated licence are marked `redistribution: "live-query-only"`
in `web/src/layers/layerCatalog.ts`: they are rendered from the publisher's
public endpoint and their geometry is **not** extracted or republished as
project data. Doing so would need the publisher's permission first.

- **Inverness County** — county-wide zoning in effect September 11, 2025. 1,125
  polygons. Authority: [Plan Inverness Land Use By-law](https://edpc.ca/plandocs/inverness_county/Plan_Inverness-LUB.pdf).
- **Victoria County** — county-wide zoning in effect October 2, 2025. 901
  polygons. Authority: [Plan Victoria Land Use By-law](https://edpc.ca/plandocs/victoria_county/Plan_Victoria-LUB.pdf).
  The Baddeck plan area is administered separately and is **not** included;
  Baddeck's own service and the county layer both return polygons over the same
  ground, so which one governs is unconfirmed and Baddeck is deliberately
  omitted rather than shown ambiguously.
- **Richmond County** — Plan Richmond adopted February 26, 2024. 1,284
  polygons. Authority: [Plan Richmond Land Use By-law](https://edpc.ca/plandocs/richmond_county/Richmond_County_LUB.pdf).
  Note Richmond does not follow EDPC's `Plan_<County>-LUB.pdf` filename pattern.
- **Cumberland County** — 34,281 polygons. The service slug says `2018` but the
  published layer is `CU_Zone_2025`, and the current by-law is the April 4, 2018
  Land Use By-law **consolidated to April 17, 2026** — there is no new 2026
  by-law. Authority: [Cumberland Land Use Regulations](https://www.cumberlandcounty.ns.ca/land-use-regulations.html).
  The county GeoHub records `license: "none"` for this dataset, so it is treated
  as no-stated-licence despite being published on an open data portal.
- **Halifax Regional Municipality** — 11,076 polygons under the
  [Open Government Licence — Halifax](https://data-hrm.hub.arcgis.com/pages/open-data-licence),
  attributed as "Contains information licenced under the Open Government
  Licence—Halifax." Halifax zoning is set by **22 separate plan-area by-laws**
  (each polygon carries a `BYLAW_ID`), so the layer links the
  [land use by-law index](https://www.halifax.ca/city-hall/legislation-by-laws/land-use-by-laws)
  rather than any single by-law.

Zone naming differs by municipality: Inverness and Victoria store the code
inside the name (`"CR Commercial Recreation"`), Cumberland appends it
(`"Agriculture (AG)"`), and Richmond and Halifax store a bare name.
`web/src/services/zoning.ts` normalizes all three so a popup reads
"CR — Commercial Recreation" rather than repeating the code.

These layers do **not** establish development permission, lot-specific
requirements, setbacks, variances, non-conforming rights, overlay or secondary
plan policies, or subdivision eligibility. Confirm any zone and its rules with
the municipality before relying on it.

## Water well logs

The collapsed **Groundwater** group is web-only, starts off, and is independent
of the restricted map-services gate. It renders the Province's water well log
inventory from
[DP ME 430 version 5](https://novascotia.ca/natr/meb/download/dp430.asp) —
125,517 wells constructed between 1940 and 2021, extracted January 5, 2022 —
through the DNRR ArcGIS feature service published alongside that product. The
service is queried for the visible envelope only, from zoom 12, and returns
WGS84 geometry so the published UTM Zone 20 NAD83 coordinates are reprojected
by the source rather than in the browser.

**Location accuracy is the layer's organising idea.** Every record carries the
Province's own estimate, in metres, of how far the plotted point may sit from
the real well (`GEOREF_A`), together with the coordinate's origin
(`GEOREF_S`). [Appendix A of the Users
Manual](https://novascotia.ca/nse/groundwater/docs/UsersManual_NSWellLogsDatabase.pdf)
documents the bands, and the published data matches them:

| Band | Estimate | Typical origin | Records |
| --- | --- | --- | --- |
| Surveyed | ±50 m | Driller GPS, mostly wells built after 2004 | 27,557 |
| Map-referenced | ±800 m | NS Map Book or Atlas | 80,066 |
| Sheet-referenced | ±1.5 km | NTS map sheet | 14,886 |
| Community centroid | up to ±8 km | Community or gazetteer centroid | 2,995 |
| No estimate | — | `GEOREF_A` recorded as 0 | 13 |

Only the surveyed band is drawn as a confident filled point, and it is the only
band shown by default — the **Surveyed only / Include approximate** control
makes the distinction explicit rather than implicit. The filter is applied in
the service query, so hidden coarse records are never transferred. When they are
requested they draw hollow and dashed, and their popup leads with "a well was
reported within about *N* of here. The marker is not the well location." A zero
accuracy estimate is treated as unknown, never as a perfectly located well.

Popups carry well number, completion date, depth, casing, depth to bedrock,
static level, yield, and coordinate source. The published table's `-9999`
no-data marker is dropped rather than rendered as a measurement; small negative
static levels are kept, because those are real readings for flowing wells where
water stands above ground. Depths and yields are the driller's report — not a
survey, and not proof of a usable or potable supply.

**Licensing and privacy.** DP ME 430 is published by DNRR under the Nova Scotia
Open Government Licence. The separate NSE Access-database download of the same
underlying database may not be redistributed and is deliberately not used here,
and the stale 2015 Socrata copy is not used either. The published table includes
an `ADDRESS` column that can hold a well owner's civic address; it is excluded at
the query rather than filtered out afterwards, so it never reaches the browser.

## Inverness micro-hydro screening pilot

The collapsed **Micro-hydro pilot** is a web-only, default-off open-data
micro-hydro screen for 13 Inverness-centred watersheds with adequate routed
catchment coverage. Turning it on fits the map to the pilot. It retains the
connected tributary paths from modeled catchment outlets instead of publishing
only the longest river trunk. Line width grows with modeled upstream drainage
area. Line colour shows a nominal 1–50 kW-scale opportunity band; a grey-blue
reach means that no 5 m mapped drop was found within 3 km. Selecting a reach
reports its modeled upstream area, trunk/tributary role, selected drop,
downstream route, nominal flow scenario, and indicative kW scale.

The checked-in GeoJSON is reproduced with `npm run generate:hydro-pilot` from:

- [1:10,000 Nova Scotia Secondary Watersheds](https://data.novascotia.ca/Environment-and-Energy/1-10-000-Nova-Scotia-Secondary-Watersheds/ynkv-x6rx),
  for the official watershed name and outer area;
- [Tertiary Watersheds](https://data.novascotia.ca/Environment-and-Energy/1-10-000-Nova-Scotia-Tertiary-Watersheds/6htv-yzkm)
  and [Sub-Tertiary Watersheds](https://data.novascotia.ca/Environment-and-Energy/1-10-000-Nova-Scotia-Sub-Tertiary-Watersheds/s4r5-2srh),
  for the finest official catchment partition that covers at least 90% of the
  secondary watershed; and
- the [Nova Scotia Hydrographic Network](https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_NSHN_UT83/MapServer),
  using directed primary-flow features from the Spines (9) and Wet Features
  (11) layers for route geometry and Z values.

For each watershed, the generator keeps the connected network formed by routing
every accepted catchment outlet downstream through NSHN features where
`LEVELPRIOR = 1` and `FLOWDIR = 1`. Catchment identifiers are unioned at
confluences, preventing area from being counted twice if a mapped path splits
and rejoins. The longest connected route is retained only to label trunk versus
tributary reaches. At each reach the generator searches no more than 3 km
downstream for the nearest points reaching 5, 10, 20, and 30 m of mapped drop.

`average mapped fall = selected drop / downstream route length`

`nominal flow = modeled upstream area × 8 L/s/km²`

`indicative kW = 9.81 × nominal flow in m³/s × mapped gross drop × 60%`

`screening value = indicative kW / downstream route length in km`

The 8 L/s/km² scenario is a rounded lower-flow reference from the 2021-07-21
through 2026-07-20 daily records for federal gauges 01FB001 and 01FB003. Their
10th-percentile specific discharges were approximately 10.82 and 7.51 L/s/km².
The 60% nominal efficiency is within the overall-system range discussed by
[Natural Resources Canada](https://natural-resources.canada.ca/sites/nrcan/files/canmetenergy/files/pubs/buyersguidehydroeng.pdf).
These fixed inputs make the comparison reproducible; they do not turn it into a
site flow or production estimate. Reaches below 1 kW scale, within four 1–50 kW
bands, above 50 kW scale, and without a qualifying drop remain separately
visible.
Display geometry is simplified to about two metres and rounded to six decimal
places; catchment areas, Z-derived drops, and source plan lengths are not
recalculated from that display geometry. The July 20, 2026 receipt contained 535
mapped reaches across 13 watersheds. The July 21 tributary revision contains
1,213 reaches, including 727 tributary reaches, 723 with a qualifying mapped
drop, and 596 in the nominal 1–50 kW band. It identifies secondary dataset
`ynkv-x6rx`, tertiary dataset `6htv-yzkm`, sub-tertiary dataset `s4r5-2srh`,
NSHN layers 9 and 11, and the two federal gauge references above.

This pilot does **not** measure streamflow, establish usable flow, net hydraulic
head, or predict electrical production. Its L/s and kW values are fixed regional
screening scenarios. It does not present Strahler stream order:
NSHN's `LEVELPRIOR` describes primary/alternate flow paths and must not be
relabeled as stream order. It also does not establish seasonal reliability,
mapped stream width, buildability, access, water rights, fish-habitat review,
or regulatory approval. It is a terrain-screening scale only.
The upstream-area value is catchment-resolution modeling: it changes in coarse
steps at routed tertiary/sub-tertiary outlets and is not an exact delineation
for every arbitrary point along a line.

After the Province licence is accepted, the default composition turns on the
Modern Map basemap together with NS Aerial, NS Property Boundaries, Water
Features, and Roads, Trails & Culverts. The basemap carries overview zooms;
the zoom-gated Province layers take over from zoom 10 (boundaries from 14), so
the first view is never framed by blank imagery tiles. It fits the initial
view once to the loaded tax-sale parcels. Fletcher is the final layer row; it
is usable only when the build has an authorized tile-host base URL. The
initial fit does not repeat after searches or ordinary navigation.

All eight distinct Province services used by the catalog have returned Web
Mercator export images in validation. The web app sends direct image requests from
the browser and does not add an application server or offline cache.

## Parcel context

The parcel sheet reports mapped acreage as an approximate NSPRD-derived value,
not a legal survey. It sends the selected polygon to the Province road and water
sublayers using exact `esriSpatialRelIntersects` queries, and sends a separate
20-metre proximity query to the road sublayers. Exact road hits are labelled
“Intersects parcel”; near hits are labelled “Adjacent within 20 m.” If an
in-parcel Civic Point names a road not returned by either geometry query, the
same road list adds it as “Named by civic address.” These signals provide useful
orientation but do not prove legal access or frontage. An empty result is
displayed as empty; a service failure is reported rather than inferred from the
visible map.

`services/buildings.ts` sends the same exact selected NSPRD geometry to the
NSTDB classified-point, unclassified-point, and building-polygon layers. The
parcel sheet sums those three mutually exclusive representations and excludes
the separate polygon-callout layer. A returned zero remains a mapped-source
empty result, while a source failure displays as unavailable. The count does
not establish the present number, condition, occupancy, use, permits, or
existence of structures on the ground.

`services/pvscAssessments.ts` uses the [PVSC assessed and taxable assessed value
history dataset](https://www.thedatazone.ca/Assessment/Assessed-Value-and-Taxable-Assessed-Value-History/bt58-qu28),
not the restricted PVSC property-search site. For a selected current notice
with an AAN, it requests that exact normalized account and displays its dated
history. For other PIDs, it pages bounded open-data queries and applies the same
client-side Polygon/MultiPolygon containment rules used for civic points,
including boundary and interior-hole handling. A spatial match associates a
published account point with mapped parcel geometry; it does not prove a legal
parcel-account relationship. Multiple returned accounts are displayed
individually and are not summed. Returned-empty and source-unavailable states
remain distinct.

Assessed value and taxable assessed value are dated public assessment records,
not a current sale price or appraisal. The parcel sheet and evidence note show
the dataset date, required attribution, and the [Open Data & Information
Government Licence – PVSC & Participating Municipalities](https://www.pvsc.ca/sites/default/files/shared/Open%20Data%20and%20Information%20Government%20Licence%20-%20PVSC%20and%20Participating%20Municipalities.pdf).
No assessed-owner names are requested or displayed.

`services/pvscDwellings.ts` uses the [PVSC residential dwelling characteristics
dataset](https://www.thedatazone.ca/Assessment/Residential-Dwelling-Characteristics/a859-xvcs)
to list per-dwelling records — build year, style, living area, living units,
bathrooms, garage, and under-construction flags — for the assessment accounts
matched above. Dwelling lookups depend on a matched account: when the
assessment source fails, the dwelling row reports a blocked lookup rather than
implying absence. Records are assessment records, not a building census;
multi-unit parcels can repeat living-unit totals across records, and
commercial or other non-residential structures are not in this dataset. The
dwelling row complements the NSTDB mapped-building count because assessment
records reflect permitted new construction long before aerial re-mapping does.

The same selected polygon is checked independently against the Province's
Mineral Occurrences inventory for exact and 1-kilometre relationships. NovaROC
exploration-licence and mineral-lease records and Abandoned Mine Openings still
use exact `esriSpatialRelIntersects` queries. The parcel sheet lists each
returned result, displays an explicit empty result per source, and distinguishes
source failure from an empty result. These are mapped-source screening results
only: an empty result does not prove absence, and a returned record is not a
legal, ownership, safety, or economic finding.

The Province publishes a [Nova Scotia Well Logs Database](https://data.novascotia.ca/Mines-and-Minerals/Nova-Scotia-Well-Logs-Database/eqej-ag64),
but the available map-ready release is dated and its location methods have
different accuracy. It is not included as a layer until its use-purpose and
precision warnings are reconciled in the product. Nova Scotia does not publish
a comparable septic-system map: those records are requested by civic address
through the [Environmental Registry](https://novascotia.ca/nse/dept/envregistry.asp),
so no septic overlay is manufactured here.

## Mapped civic addresses

The authoritative source is the [Nova Scotia Civic Address File — Civic
Points](https://data.novascotia.ca/Municipalities/Nova-Scotia-Civic-Address-File-Civic-Points/tntn-er5g).
`services/civicAddresses.ts` calculates a bounding box for each selected
Polygon/MultiPolygon part, requests only civic-point geometry and address
components through Socrata's `within_box` filter, and follows ordered
`$limit`/`$offset` pages. It then deduplicates by `pntid` and performs exact
client-side containment across polygon parts and holes. Boundary points count
as inside; hole interiors do not.

The same service searches civic addresses through Socrata's full-text `$q`
index and returns at most 12 mapped-point candidates. It folds harmless
punctuation when checking relevance, rejects broad suffix matches, and retries a
compact possessive initialism with official periods when needed (`dr's` can find
`D.R.'s`). The same one-shot fallback treats `hwy 19` and `route 19` as
`Highway 19`. Choosing a result uses the point's published coordinate in an
NSPRD `esriSpatialRelIntersects` query; the app never guesses a PID from address
text. With Property Boundaries visible,
tapping the map uses the same point query, merges the returned geometry, and
opens the same parcel/civic/context sheet. Search and map-point requests abort
their own stale predecessors.

The parcel sheet lists every unique mapped point inside the parcel. It never
chooses a nearest point or infers an address from a road, address range, tax-sale
description, or registry data. Zero matches display “No civic address point is
mapped inside this parcel.” A Civic Points service failure instead displays
“Civic address lookup is unavailable right now.” Road/water and civic failures
remain independent, and changing PIDs aborts the stale civic request.

Each listed civic point also receives a full 10-character Open Location Code
(Plus Code), calculated locally from its published coordinate by
`services/googleMaps.ts`. Tapping the code opens a universal Google Maps
directions URL with that exact latitude/longitude as the destination and the
user's current location left to Google Maps. The URL needs no API key and avoids
a second address-geocoding step. NS Marks makes no Google request while merely
displaying the code; the destination leaves the app only when the user activates
the external link.

This dataset is governed by the [Open Government Licence – Nova
Scotia](https://support.novascotia.ca/services/open-data-portal-licence), which
requires acknowledgement. The parcel sheet therefore displays `Contains
information licensed under the Open Government Licence – Nova Scotia` and links
both the dataset and licence. This is a separate licence boundary from the
restricted NSPRD/Province layer gate. Civic points are mapped physical-address
points, not proof of ownership, mailing address, access, occupancy, or legal
parcel status.

Live verification on July 19, 2026 confirmed that the GeoJSON endpoint returns
`Access-Control-Allow-Origin: *`. PID `15234636` returned two exact in-parcel
points (16 and 18 Centre St, Reserve Mines); PID `15161631` returned none. These
are live service examples, not fixtures used by the ordinary unit suite.

## Inverness 2026 source receipt

- Official landing page: [Inverness County Property Tax Sales](https://invernesscounty.ca/services/finance-taxation/tax-sales/)
- Current official source: [Tax Sale by Public Auction — August 11, 2026, revision 4](https://invernesscounty.ca/wp-content/uploads/2026/07/Tax-Sale_August-11-4.pdf)
- PDF publication metadata is July 16, 2026; the current file was modified July
  27 and retrieved July 27, 2026. Its SHA-256 is
  `4ceb039af25ecb10f2e04e4d29028d8b4567a28314da772b26a18095ba585e9f`.
- The revision still contains 45 lien entries and 47 unique PIDs, but visibly
  strikes through liens 5, 6, 10, 11, 12, and 37. Those six records (eight PIDs)
  remain in the dated evidence as `withdrawn`; only 39 advertised PIDs render
  in the active tax-sale parcel layer. Lien 11 covers three PIDs.
- NSPRD validation on July 19, 2026: all 47 unique PIDs matched. NSPRD returned
  53 geometry features because some PIDs have more than one polygon record.
- Source anomaly: lien 6 appears in the summary table but its detailed property
  page is absent from the PDF's detailed packet. The public layer preserves the
  official summary row.
- Source normalization: extracted text renders lien 19 as `N0`; visual review of
  the rendered summary confirms `NO`, stored as `redeemable: false`.
- The wrong 2025 notice is not an input to this layer.
- The owner-free book dataset is checked in byte-for-byte as
  `src/data/invernessTaxSale.snapshot.json`; the web model is generated from
  that JSON, including its AAN strings and integer-cent conversion. A test pins
  the published SHA-256
  `58cdf7158158b72619e1d08cb70a5eb5b2ebf0e49e7f7627ee9a2b3f7fabdb55`
  so either repository cannot drift silently.

Run `npm run refresh:inverness-tax-sale` with Poppler's `pdftotext` and
`pdftocairo` available. The refresher resolves the current PDF from the
municipal landing page, parses owner-free summary fields, detects visible
strike-through marks from PDF vector geometry, preserves reviewed location
normalization, and updates both document and JSON receipts. An omitted stored
row or ambiguous landing-page link fails closed instead of deleting evidence.

`npm run watch:tax-sales` handles sources that publish results to a single page
they overwrite each sale, where the previous sale's results are destroyed rather
than kept at a dated URL — Cumberland today. On no change it does nothing. When a
new sale appears it submits the page to the Wayback Machine and, if a capture's
raw `id_` bytes carry the results table, ingests the event, records, and ledger
entry against that capture; if no capture carries the table yet, it records the
sale as pending and retries next run, archiving first so evidence is never lost
while ingestion waits. Any winning-bid cell that is not a money amount,
`ADJORNED`, or `NOT COMPLETED` fails the run rather than being guessed. The
manual workflow `.github/workflows/tax-sale-watch.yml` remains available as a
diagnostic. The Codex tax-sale automation owns the recurring refresh,
verification, publication, and exact-pin deployment path.

## CBRM July 21, 2026 source receipt

- Official landing page: [CBRM Tax Sales](https://cbrm.ns.ca/business/property-sales-management/tax-sales/)
- Official property list: [July 21, 2026 second advertisement](https://cbrm.ns.ca/wp-content/uploads/2026/06/JULY-21-2026-2nd-Ad.pdf)
- Official maps and descriptions: [CBRM parcel fact sheets](https://cbrm.ns.ca/wp-content/uploads/2026/06/1.-List-of-Maps-and-Descriptions36.pdf)
- Notice retrieved July 19, 2026 and the official results page re-checked after
  the auction on July 21, 2026. The property-list SHA-256 was
  `5435e9b89df5ac15f63097c0935661b5616e7b6bdc8b04fd4e8811ba6d457566`.
- Owner-free reconciliation: 67 lien rows and 68 unique eight-character PIDs.
  Lien `26-13` contains PIDs `15426125` and `15789985`.
- Public fields retained: lien, AAN, PID list, address/description, location,
  minimum bid, the municipality's redemption category, outcome, and printed
  winning bid. The assessed-name column was discarded before the repository
  dataset was written.
- Live NSPRD validation on July 19, 2026 matched every exact CBRM and Inverness
  PID: 115 of 115 unique catalog PIDs. Requests are split into bounded
  batches because the Province service returned HTTP 500 for one 115-PID query.
- The auction date has passed, so all 67 owner-free CBRM notice records (68
  PIDs) render only in historical-record mode. The official
  [July 21 result PDF](https://cbrm.ns.ca/wp-content/uploads/2026/07/List-of-Sold-Properties-July-21-2026.pdf)
  was retrieved July 27, 2026 with SHA-256
  `ae4f1b0b08528a6d7e90fb3c2e5816bde6ec593e63c44c02f5b4e9fae07d7d5d`.
  Its 54 identifier-bearing rows reconcile to the notice: 21 print numeric
  winning bids, one prints `PAID AT SALE`, and 32 publish no bid or
  disposition. Thirteen notice rows do not appear in the result. Only the 21
  numeric rows are classified sold; the other 46 records stay outcome unknown.
  Yellow table fill is ignored because it also highlights the `PAID AT SALE`
  row. The owner-free result snapshot is pinned byte-for-byte at
  `dc57447252e40e8834fcee39d6ad69b20d24aba6b57b32f02ac52f610b934d64`.

Run `npm run refresh:cbrm-tax-sale-results` with Poppler's `pdftotext`
available. The refresher resolves the newest dated result from CBRM's landing
page, reconciles every parsed row to the owner-free notice fields, and fails
closed on an unrecognized winning-bid value or identifier mismatch.

## Annapolis August 2026 source receipt

- Official landing page: [Annapolis County Tax Sale](https://annapoliscounty.ca/tax-finance/tax-sale)
- Current official source: [August 2026 Tax Sale by Tender, Tender #08-2026](https://annapoliscounty.ca/tax-finance/tax-sale/2342-june-2026-tax-sale-by-tender)
  — the URL slug still says "june-2026" because the municipality rewrites the
  page in place; the content is the August 31, 2026 sealed-tender sale.
- The notice page returns HTTP 403 to plain fetchers and HTTP 200 with a
  browser user agent, and its bytes vary per request because of a dynamic form
  token, so the page itself cannot be hash-pinned. It was retrieved July 23,
  2026 and archived at the
  [Wayback Machine](https://web.archive.org/web/20260724020945/https://annapoliscounty.ca/tax-finance/tax-sale/2342-june-2026-tax-sale-by-tender).
- The hash-pinned source documents are the two linked PDFs, both retrieved
  July 23, 2026 and Wayback-archived:
  [Parcel Description Report](https://annapoliscounty.ca/images/2026_TAX_SALE/9153144_copy.pdf)
  (`b040f7e1e20fb5a0e583e99bac8e0eb24ae4a87e8131c5915029022938c773d5`) and
  [Property Online map](https://annapoliscounty.ca/images/2026_TAX_SALE/9153144_Map.pdf)
  (`6d01a50da1d65fa22f9ff9048353deae50330ead31ac4530297d1fb906049a78`).
- Single listing: sealed tenders for `SHOPPING CENTRE - LOT 227`, 1043
  Highway 1, Cornwallis Park, close 1:00 PM Monday, August 31, 2026 at 752 St
  George Street, Annapolis Royal. Minimum bid $1.00 plus HST on the total bid;
  redeemable for six months. Faxed and electronic tenders are refused, and
  tender openings are closed to the public.
- Identifier normalization: the on-page table prints AAN `9153144`; the linked
  Property Online map PDF prints the eight-digit forms AAN `09153144` and PID
  `05266937`, which are stored. Live NSPRD confirmed PID `05266937` on July
  23, 2026. The assessed-owner column was discarded before the repository
  dataset was written, consistent with the other municipal layers.
- The owner-free tender dataset is checked in byte-for-byte as
  `src/data/annapolisTaxSale.snapshot.json`; the web model is generated from
  that JSON. A test pins the published SHA-256
  `ccfe84b6452c25fce271a8a83ebd9f18fe2055d126d426efac79c415ea84d87b`
  so either repository cannot drift silently.

## Historical record layer receipt

The historical layer is visually distinct and off by default. Its 22 verified
events span seven municipalities:

| Municipality | Events | Records | Unique PIDs | Sold | Unsold | Withdrawn | Redeemed | Unknown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Halifax | 7 | 87 | 93 | 82 | 4 | 0 | 0 | 1 |
| Victoria County | 3 | 19 | 19 | 6 | 3 | 1 | 0 | 9 |
| CBRM | 2 | 140 | 133 | 71 | 0 | 0 | 1 | 68 |
| Cumberland | 2 | 34 | 33 | 27 | 0 | 6 | 0 | 1 |
| Lunenburg District | 6 | 145 | 125 | 69 | 21 | 37 | 0 | 18 |
| Richmond | 1 | 3 | 3 | 3 | 0 | 0 | 0 | 0 |
| Pictou | 1 | 21 | 21 | 18 | 0 | 3 | 0 | 0 |
| **Total** | **22** | **449** | **427** | **276** | **28** | **47** | **1** | **97** |

The total counts each parcel once; ten parcels appear in both CBRM sales and
some parcels repeat across Lunenburg events. The Victoria County March 24, 2026
event carries one `withdrawn` record: the official table prints `REMOVED`
beside a $17,500.00 successful bid
for PID `85142388`, so the contradiction is preserved without a winning-bid
claim. The CBRM July 22, 2025 event carries one `redeemed` record, lien
`25-143`, printed as `REDEEMED` with no bid.

Every Halifax listing was reconciled between the official notice and result.
The July 21, 2026 CBRM result rows were reconciled to the official notice by
lien, AAN, PID, minimum bid, and redemption category. The Victoria County and
July 22, 2025 CBRM records come from self-contained official result tables that
carry identifiers, amounts, statuses, and bids in one document; those
municipalities remove their pre-sale listings after a sale, so the retained
notice receipts are official sale announcements, tender or auction terms, or an
archived official page that pins each sale method and date. Victoria result rows
with no published status stay outcome-unknown, and rows publishing no `Total
Owing` (deferred, paid, or removed before sale) are excluded and itemized in the
source ledger.

Richmond's June 12, 2026 result contributes three numeric successful bids from
an archived copy of its overwrite-prone official page. Pictou's April 10, 2026
dated result PDF contributes 18 numeric selling prices and three rows whose
selling-price column prints `Removed`; those three remain withdrawn with no
selling-price claim. All 24 exact Richmond and Pictou PIDs returned from NSPRD
on July 28, 2026. Their public datasets omit the assessed-name and
successful-bidder fields carried by the source documents.

The CBRM July 22, 2025 result prints a `WINNING BID` column and fills
outcome-bearing rows in yellow. Each rendered row's fill was measured against
its printed disposition, and the two agree on all 74 rows, so the highlighting
adds nothing and no outcome rests on it. `PAID AT SALE` (five rows) and `WALKED
AWAY` (four rows) publish no bid and stay outcome-unknown with the official
wording preserved, because neither phrase establishes whether the parcel changed
hands; thirteen rows with an empty bid cell are treated the same way. One row is
excluded because the live NSPRD service returns no parcel for its exact official
PID, and it is itemized in the match-exceptions file.

Every exact official eight-digit PID entering the layer matched NSPRD; the
Lunenburg account-only records use their separately documented deterministic
PVSC-coordinate reconciliation. Multi-PID listings retain amounts at listing
level rather than dividing them between parcels. The September 24, 2024 Halifax
`PENDING` row and every outcome-unknown CBRM row are fail-closed with no winning
bid or financial comparison. Assessed-owner and bidder names are absent.

`src/data/historicalSourceLedger.json` pins official URLs, retrieval dates,
available fields, review notes, and SHA-256 receipts for the reviewed PDFs.
`src/data/historicalMatchExceptions.json` records the one row that was published
by a municipality but cannot render as a parcel: CBRM lien `25-178` (PID
`15440050`), for which NSPRD returns no feature. Only exact official PIDs that
the live service returns enter the layer, and future ambiguous or unmatched rows
must be recorded there. The detailed human-readable coverage table is in
[`docs/historical-tax-sale-source-coverage.md`](../docs/historical-tax-sale-source-coverage.md).

The CBRM March 10, 2026 result is still researched but held fail-closed: it
mixes published bids, blanks, and outcome highlighting that has not been shown
to be redundant with its printed columns, so it needs the same row-by-row
rendered reconciliation the July 22, 2025 result passed. It contributes no map
parcel or financial comparison.

NSPRD is governed by the [Province of Nova Scotia Restricted Geographic
Services License](https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf).
The app requires acceptance before loading parcel geometry, shows the required
Province attribution, and states that boundaries are not a legal survey. The
exact attribution sentence remains in the rendered footer after the licence
dialog closes. Each event control also renders its municipal snapshot retrieval
date rather than leaving that date only in source data.

## Source and deployment boundary

- Baseline source commit: NS Marks The Spot
  `aed5bc60e4514e755abb26cc74265fe0c6e54ec7` was the exact merged `nightly`
  source inspected before the civic-address work.
- NS Marks deployment: this repository owns the source and relative/subpath-safe
  production build. Building or merging this branch is not proof that its Pages
  deployment is live; deployment must be checked separately after promotion.
- KinNoKi production copy: KinNoKi Labs pins and deploys a separate copy of the
  web artifact. This repository-only change does not update that pin and makes
  no KinNoKi production-deployment claim.

## Current boundary

This slice includes the modern OpenStreetMap basemap, nine web-cleared
Province layers, three default-off open geoscience/resource source overlays,
one default-off open old-growth policy overlay, one default-off licence-gated
derived mineral-proximity parcel row,
five default-off unofficial municipal zoning layers rendered live from
municipal services and never republished as project data,
live NSPRD PID/address/map-tap parcel discovery, browser location,
mapped acreage, parcel
road/water/adjacency context, authoritative mapped civic-address points, the
upcoming Inverness municipal tax-sale event, local Plus Codes with opt-in Google
Maps directions, and a separate default-off layer of twelve verified Halifax,
Victoria County, and CBRM result events.
User-loaded files stay in the browser: raster maps (GeoTIFF, GeoPDF, PNG,
JPEG) under "Your maps" and vector data (GeoJSON, KML, KMZ, GPX) under "Your
data" share one drop zone, are stored locally in IndexedDB, render clearly
labeled as user-loaded material, and are excluded from print capture and
share links. Vector layers export back out as GeoJSON or KML. Zipped
shapefile import and on-map editing land in later updates.
The Fletcher web integration and immutable, bounded per-sheet package are
implemented, but the layer remains disabled in builds without
`VITE_FLETCHER_TILE_BASE_URL`. The 24 direct-Rumsey source trees are kept
separate so overlapping XYZ keys are never resolved by last-write-wins copying.
The public revision includes a source receipt; private object and duplicate-key
receipts stay with the deployable package. Hosting, upload verification, and
custom-domain acceptance remain separate gates. The permission does not by
itself clear native offline bundling. Unsupported historical
sources remain fail-closed; this web workflow does not change the native app.

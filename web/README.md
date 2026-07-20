# NS Marks The Spot — Online

Online map companion for the native map catalog, PID/civic-address search,
mapped-address Plus Code directions, and municipality-sourced property layers.
The event-aware catalog currently covers the July 21, 2026 CBRM auction and the
August 11, 2026 Inverness County auction.

## Run locally

```sh
npm install
npm run dev
```

Use `npm test`, `npm run lint`, and `npm run build` for the verification gates.

## Data flow

1. Each municipality's official notice supplies its event date and public
   parcel fields. The catalog preserves the municipality's financial wording:
   CBRM publishes a minimum bid, while Inverness publishes total arrears.
2. Each tax-sale event toggle has a collapsed property list. The list mirrors
   the redemption filter and renders one action per PID, including separate
   actions when a single lien covers multiple parcels. Selecting a row enables
   its event layer, fits the map to that parcel, and opens the same parcel sheet
   used by PID search and direct map selection.
3. The browser asks the live NSPRD Feature Layer for polygon geometry by exact
   PID or by the exact coordinate of a visible-boundary map tap or chosen civic
   point. The selected parcel sheet sums NSPRD's mapped area across every
   polygon returned for that PID and converts it to acres. The municipal notice
   remains the authority for tax-sale fields.
4. The public dataset intentionally omits assessed-owner names. The app labels
   records as “listed in official notice,” because a property may be redeemed or
   withdrawn before the sale. Once an advertised start time passes without a
   verified result dataset, the UI automatically changes to “Past sale date —
   verify results with the municipality.” It does not infer sold, unsold, or
   withdrawn results.
5. Browser location stays in the browser and is drawn on the map. This app has
   no application server receiving the coordinates.
6. For a selected PID, the browser reuses the exact NSPRD Polygon or
   MultiPolygon geometry to look up mapped physical-address points from the
   Nova Scotia Civic Address File. Municipal notice locations remain notice
   fields and are not promoted into civic addresses.

All money is stored as integer cents. PIDs and AANs are strings. CBRM's
"Immediate deed" value is displayed as a municipal category; it is not a claim
of immediate possession, guaranteed access, clear title, or buildability.

## Native layer parity

The web catalog mirrors the native source URLs and rendering restrictions while
remaining online-only:

- NS Aerial streams the Province's NSODB 10k imagery through map zoom 23,
  overzooming its last useful native scale instead of disappearing.
- NS Property Boundaries begins at regional zoom 10, avoiding slow and cluttered
  province-wide rendering while keeping parcel lines available well before
  street-level zoom. A low export DPI clears the live service's 1:36,114
  display floor without changing tile extents; PID search still uses exact
  NSPRD Feature Layer geometry. Map-tap parcel identification follows the same
  zoom floor. A selected sale parcel becomes fully opaque at zoom 15 and closer
  while other listed parcels keep their lighter overview fill.
- Crown Lands uses the native green dynamic renderer.
- Flood Risk Areas uses the native `show:24,25,26` watershed restriction.
- Waterfalls uses hydrography layer 1 and the exact Province falls definition;
  enabling it fits the map to all 90 matching points before the user zooms in.
- [Water Features](https://data.novascotia.ca/Lands-Forests-and-Wildlife/Nova-Scotia-Topographic-DataBase-Water-Features-Li/fpca-jrmt)
  uses the complete Province hydrography service for rivers,
  lakes, wetlands, rapids, ditches, dams, and other mapped features. A higher
  export resolution improves line legibility without replacing the Province's
  symbols or colours.
- [Roads, Trails & Culverts](https://data.novascotia.ca/Roads-Driving-and-Transport/Nova-Scotia-Topographic-DataBase-Roads-Trails-and-/gywn-246n)
  uses the complete Province transportation service,
  including highways, local/resource roads, unpaved roads, tracks, trails,
  bridges, rail, ferry crossings, road polygons, and close-range culvert
  features. A compact legend explains the principal line classes.
- Fletcher remains listed but disabled until web-use rights are clear.

## Geology and resources

The collapsed **Geology & Resources** group is web-only, starts with every
switch off, and uses Province open data independently of the restricted map
services gate:

- [Mineral Occurrences Database](https://novascotia.ca/natr/meb/download/dp002.asp)
  records known occurrences and past producers. A point is not proof of a
  viable or recoverable deposit.
- [NovaROC](https://novaroc.novascotia.ca/novaroc/) supplies exploration
  licences and mineral leases (MapServer layers 1 and 7). Mineral tenure is a
  provincial right and is not land ownership.
- [Abandoned Mine Openings Database](https://novascotia.ca/natr/meb/download/dp010.asp)
  supplies the degree-of-hazard point inventory. Locations and field conditions
  can change, so it is screening context rather than a site-safety conclusion.

Mineral tenure uses the Province's rendered MapServer output. The two point
layers query only the current map envelope, cancel stale requests, and page
ArcGIS results. Mineral occurrences begin at zoom 8; the 8,443-record mine
inventory waits until zoom 11. Each switch reports its own loading, visible
count, zoom, or failure state, so one unavailable source does not disable the
other map and parcel features. All three overlays were verified against their
live sources on July 19, 2026 under the Nova Scotia Open Government Licence.

After the Province licence is accepted, the default composition keeps Modern
Map and NS Aerial off, turns NS Property Boundaries, Water Features, and Roads,
Trails & Culverts on, and fits the initial view once to the loaded tax-sale
parcels. Fletcher is the final layer row because it is not yet available. The
initial fit does not repeat after searches or ordinary navigation.

All seven Province services successfully returned Web Mercator export images in
the July 19, 2026 validation pass. The web app sends direct image requests from
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

- Official source: [Tax Sale by Public Auction — August 11, 2026](https://invernesscounty.ca/wp-content/uploads/2026/07/Tax-Sale_August-11.pdf)
- PDF publication metadata checked: July 16, 2026.
- Notice summary: 45 lien entries and 47 unique PIDs. Lien 11 covers three PIDs.
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
  `b69a50e76fd87fc6785e4742367796a4d2ee9f013b9c0ebd002868e01d5c3be4`
  so either repository cannot drift silently.

## CBRM July 21, 2026 source receipt

- Official landing page: [CBRM Tax Sales](https://cbrm.ns.ca/business/property-sales-management/tax-sales/)
- Official property list: [July 21, 2026 second advertisement](https://cbrm.ns.ca/wp-content/uploads/2026/06/JULY-21-2026-2nd-Ad.pdf)
- Official maps and descriptions: [CBRM parcel fact sheets](https://cbrm.ns.ca/wp-content/uploads/2026/06/1.-List-of-Maps-and-Descriptions36.pdf)
- Retrieved July 19, 2026. The property-list SHA-256 was
  `5435e9b89df5ac15f63097c0935661b5616e7b6bdc8b04fd4e8811ba6d457566`.
- Owner-free reconciliation: 67 lien rows and 68 unique eight-character PIDs.
  Lien `26-13` contains PIDs `15426125` and `15789985`.
- Public fields retained: lien, AAN, PID list, address/description, location,
  minimum bid, and the municipality's redemption category. The assessed-name
  column was discarded before the repository dataset was written.
- Live NSPRD validation on July 19, 2026 matched every exact CBRM and Inverness
  PID: 115 of 115 unique upcoming-event PIDs. Requests are split into bounded
  batches because the Province service returned HTTP 500 for one 115-PID query.

## Historical outcome layer receipt

The historical layer is visually distinct and off by default. Its supported
slice pairs official Halifax notices and result tables for seven sales by
tender from March 8, 2022 through September 16, 2025:

| Event | Records | Exact PIDs | Sold | Unsold | Unknown | Official amount labels |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Halifax March 8, 2022 | 11 | 11 | 9 | 2 | 0 | `Opening Bid`, `Selling Price` |
| Halifax September 12, 2023 | 10 | 10 | 10 | 0 | 0 | `Opening Bid`, `Selling Price` |
| Halifax January 16, 2024 | 8 | 9 | 8 | 0 | 0 | `Opening Bid`, `Selling Price` |
| Halifax May 14, 2024 | 7 | 8 | 5 | 2 | 0 | `Opening Bid`, `Selling Price` |
| Halifax September 24, 2024 | 9 | 10 | 8 | 0 | 1 | `Opening Bid`, `Selling Price` or `PENDING` |
| Halifax March 25, 2025 | 5 | 7 | 5 | 0 | 0 | `Opening Bid`, `Selling Price` |
| Halifax September 16, 2025 | 37 | 38 | 37 | 0 | 0 | `Opening Bid`, `Selling Price` |
| **Total** | **87** | **93** | **82** | **4** | **1** | |

Every included listing was reconciled between the official notice and result,
and every eight-digit PID matched NSPRD on July 19, 2026. Multi-PID listings
retain opening and selling prices at listing level rather than dividing them
between parcels. The September 24, 2024 `PENDING` row is fail-closed as outcome
unknown and has no winning bid or financial comparison. Assessed-owner and
bidder names are absent from the normalized JSON.

`src/data/historicalSourceLedger.json` pins official URLs, retrieval dates,
available fields, review notes, and SHA-256 receipts for the reviewed PDFs.
`src/data/historicalMatchExceptions.json` is intentionally empty because only
exact official PIDs entered this slice; future ambiguous or unmatched rows must
be recorded there and cannot render as parcels. The detailed human-readable
coverage table is in
[`docs/historical-tax-sale-source-coverage.md`](../docs/historical-tax-sale-source-coverage.md).

Two CBRM result sets were researched but held fail-closed. The March 10, 2026
result mixes published bids, blanks, and outcome highlighting that still needs
row-by-row visual reconciliation. The July 22, 2025 result has useful outcome
detail, but its original notice is no longer linked from the current municipal
page. Neither event contributes a map parcel or financial comparison.

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

This slice includes the modern OpenStreetMap basemap, seven web-cleared
restricted Province layers, three default-off open geoscience/resource layers,
live NSPRD PID/address/map-tap parcel discovery, browser location,
mapped acreage, parcel
road/water/adjacency context, authoritative mapped civic-address points, the two
upcoming municipal tax-sale events, local Plus Codes with opt-in Google Maps
directions, and a separate default-off layer of seven verified Halifax
historical result events. The Fletcher layer is visible but disabled until
web-use rights are clear. Unsupported historical sources remain fail-closed.
Offline maps remain the native iPhone app's job.

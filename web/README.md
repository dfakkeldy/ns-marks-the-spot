# NS Marks The Spot — Online

Online map companion for the native map catalog, PID search, and
municipality-sourced property layers. The first municipal layer covers the
Municipality of the County of Inverness tax sale scheduled for August 11, 2026.

## Run locally

```sh
npm install
npm run dev
```

Use `npm test`, `npm run lint`, and `npm run build` for the verification gates.

## Data flow

1. The municipality's official notice supplies the sale date, lien number,
   location, arrears, redeemable value, and PID list.
2. The browser asks the live NSPRD Feature Layer for polygon geometry by exact
   PID. The municipal notice remains the authority for tax-sale fields.
3. The public dataset intentionally omits assessed-owner names. The app labels
   records as “listed in official notice,” because a property may be redeemed or
   withdrawn before the sale.
4. Browser location stays in the browser and is drawn on the map. This app has
   no application server receiving the coordinates.

## Native layer parity

The web catalog mirrors the native source URLs and rendering restrictions while
remaining online-only:

- NS Aerial streams the Province's NSODB 10k imagery.
- NS Property Boundaries streams statewide NSPRD outlines at zoom 12 and above;
  PID search still uses the NSPRD Feature Layer so a selected parcel can be
  inspected precisely.
- Crown Lands uses the native green dynamic renderer.
- Flood Risk Areas uses the native `show:24,25,26` watershed restriction.
- Waterfalls uses hydrography layer 1 and the exact Province falls definition;
  the live service returned 90 matching points on July 19, 2026.
- Fletcher remains listed but disabled until web-use rights are clear.

All five Province services successfully returned Web Mercator export images in
the July 19, 2026 validation pass. The web app sends direct image requests from
the browser and does not add an application server or offline cache.

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

NSPRD is governed by the [Province of Nova Scotia Restricted Geographic
Services License](https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf).
The app requires acceptance before loading parcel geometry, shows the required
Province attribution, and states that boundaries are not a legal survey.

## Current boundary

This slice includes the modern OpenStreetMap basemap, the five web-cleared
Province layers already defined by the native catalog, live NSPRD exact-PID
search, browser location, and the Inverness tax-sale layer. The Fletcher layer
is visible but disabled until web-use rights are clear. Offline maps remain the
native iPhone app's job.

# NS Marks The Spot — Online

Online map companion for the native map catalog, PID search, and
municipality-sourced property layers. The event-aware catalog currently covers
the July 21, 2026 CBRM auction and the August 11, 2026 Inverness County auction.

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
2. The browser asks the live NSPRD Feature Layer for polygon geometry by exact
   PID. The municipal notice remains the authority for tax-sale fields.
3. The public dataset intentionally omits assessed-owner names. The app labels
   records as “listed in official notice,” because a property may be redeemed or
   withdrawn before the sale. Once an advertised start time passes without a
   verified result dataset, the UI automatically changes to “Past sale date —
   verify results with the municipality.” It does not infer sold, unsold, or
   withdrawn results.
4. Browser location stays in the browser and is drawn on the map. This app has
   no application server receiving the coordinates.

All money is stored as integer cents. PIDs and AANs are strings. CBRM's
"Immediate deed" value is displayed as a municipal category; it is not a claim
of immediate possession, guaranteed access, clear title, or buildability.

## Native layer parity

The web catalog mirrors the native source URLs and rendering restrictions while
remaining online-only:

- NS Aerial streams the Province's NSODB 10k imagery through map zoom 23,
  overzooming its last useful native scale instead of disappearing.
- NS Property Boundaries streams statewide NSPRD outlines at zoom 12 and above;
  PID search still uses the NSPRD Feature Layer so a selected parcel can be
  inspected precisely.
- Crown Lands uses the native green dynamic renderer.
- Flood Risk Areas uses the native `show:24,25,26` watershed restriction.
- Waterfalls uses hydrography layer 1 and the exact Province falls definition;
  enabling it fits the map to all 90 matching points before the user zooms in.
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

## Historical layer fail-closed receipt

Historical events remain absent and therefore off by default in this first
cut. The live revised Pictou County advertisement was visually checked on July
19, 2026 and contains 21 parcel rows, including three visibly withdrawn rows,
not the expected 19 rows/16 remaining recorded in the research handoff. The
catalog does not guess which two rows to exclude and commits no Pictou parcels.
Richmond results are also held for the later historical-layer pass so this
change remains the authorized CBRM-plus-generalized-model cut.

No parcel records are created for Annapolis County, Kings County, or Chester.
Annapolis still needs visual PID extraction from embedded images, Kings exposes
no current parcel table, and Chester states that it is not holding a 2026 sale.

The cross-municipality research handoff is from
[Explainer Audiobooks PR #63](https://github.com/dfakkeldy/explainer-audiobooks/pull/63).
The live official municipal sources control wherever a research count differs.

NSPRD is governed by the [Province of Nova Scotia Restricted Geographic
Services License](https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf).
The app requires acceptance before loading parcel geometry, shows the required
Province attribution, and states that boundaries are not a legal survey. The
exact attribution sentence remains in the rendered footer after the licence
dialog closes. Each event control also renders its municipal snapshot retrieval
date rather than leaving that date only in source data.

## Source and deployment boundary

- Baseline source commit: NS Marks The Spot `92f1261e50dc05c8b2b2a6c38807d11d0f17cc98`
  was the exact single-Inverness implementation inspected before this work.
- NS Marks deployment: this repository owns the source and relative/subpath-safe
  production build. Building or merging this branch is not proof that its Pages
  deployment is live; deployment must be checked separately after promotion.
- KinNoKi production copy: KinNoKi Labs pins and deploys a separate copy of the
  web artifact. This repository-only change does not update that pin and makes
  no KinNoKi production-deployment claim.

## Current boundary

This slice includes the modern OpenStreetMap basemap, the five web-cleared
Province layers already defined by the native catalog, live NSPRD exact-PID
search, browser location, and the two upcoming municipal tax-sale events. The
Fletcher layer is visible but disabled until web-use rights are clear. Historical
tax-sale layers are fail-closed pending the Pictou reconciliation. Offline maps
remain the native iPhone app's job.

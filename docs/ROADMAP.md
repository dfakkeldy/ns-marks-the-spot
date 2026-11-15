# Roadmap - NS Marks The Spot

Version **1.0 was released on 14 November 2026**. See the
[release receipt and App Store link](APP_STORE_RELEASE.md). The July roadmap
below is historical; its remaining-v1.0 list is not the current release state.

Status as of July 1, 2026.

> **Superseded in part (2026-10-30).** The 1.0 release record is
> [`APP_STORE_RELEASE.md`](APP_STORE_RELEASE.md). The proposed 1.0 closeout and
> v1.1 program, with a reconciliation of the lists below, is in
> [`plans/2026-10-30-nsmts-v1-1-streamlined.md`](plans/2026-10-30-nsmts-v1-1-streamlined.md).
> The lists below stay unchanged until Dan ratifies that plan's tags.

## v1.0 Release Candidate

The v1.0 goal is a field-ready historical map viewer for Nova Scotia:

- Fletcher historical map overlay with adjustable transparency.
- Modern MapKit context with selectable basemap modes.
- Optional Nova Scotia reference layers for field context.
- Waterfall POIs fetched through the ArcGIS-backed service.
- Viewed-tile caching.
- Prepared Fletcher offline areas.
- Data Sources & Licenses disclosure.
- TestFlight release train through `nightly`.

## Remaining v1.0 Work

1. Confirm internal testers are invited and can install build `1.0 (4)`.
2. Add or verify `PrivacyInfo.xcprivacy` for Required Reason APIs and collected data.
3. Publish privacy policy and support pages.
4. Add in-app links to privacy/support if App Review requires them in the binary.
5. Capture App Store screenshots for current iPhone and iPad device classes.
6. Run a final physical-device field check in Nova Scotia.
7. Run an IPv6-only network check.
8. Confirm App Store Connect metadata, age rating, export compliance, DSA/trader status, pricing, and territories.
9. Promote `nightly -> weekly -> main`.
10. Select the final build and submit for App Review.

## v1.1 Candidates

- Bulk offline downloads for NS Aerial imagery.
- Bulk offline downloads for restricted Nova Scotia reference layers where licensing permits.
- Additional historical map collections beyond Fletcher.
- User-submitted POIs.
- Search for historical places, lots, and map-sheet metadata.
- iCloud sync for POI collections and saved areas.

## Later Exploration

- Alternative map renderer if MapKit tile performance or opacity control becomes a ceiling.
- More guided historical-map stories on the public website.
- Public data-source notes that explain where each map layer comes from and what it should not be used for.

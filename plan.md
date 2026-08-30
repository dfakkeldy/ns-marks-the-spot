# Development Plan — NS Marks The Spot

## Completed
- [x] Repository setup and CLAUDE.md
- [x] Project scaffold — Xcode project, folder structure, core protocols
- [x] Architecture documentation
- [x] MapKit-backed `MapEngine` implementation via `UIViewRepresentable`
- [x] Fletcher overlay rendering and opacity controls
- [x] Layer catalog for Fletcher, NS Aerial, and provincial reference layers
- [x] Viewed-tile persistence with `TileCache` and `TileStore`
- [x] Offline storage reporting and cache deletion UI
- [x] Saved offline area models, estimation, and Fletcher download pipeline
- [x] Map rectangle selection wired through `MapEngine` for saved-area drafting
- [x] Data Sources & Licenses disclosure with Province attribution
- [x] Fastlane metadata automation and release-prep verification
- [x] Unit and UI test targets in place for v1.0

## v1.0 Milestones

### Map Experience
- [x] Engine-agnostic map boundary preserved for future renderer swaps
- [x] NS Aerial available as a selectable basemap-style context layer
- [x] Layer sheet shows per-layer offline policy

### Offline
- [x] Viewed historical tiles persist until manual deletion
- [x] Fletcher saved areas use rectangular bounds captured from the map
- [x] Saved-area downloads record estimate, success, and failure counts
- [x] NS Aerial and restricted provincial layers remain viewed-cache only in v1.0

### Release Readiness
- [x] App icon asset catalog uses rasterized PNG deliverables
- [x] App Review notes document optional location access and offline limits
- [x] Local Fastlane metadata lint passes without network credentials

## Deferred For v1.1
- [ ] Bulk offline downloads for NS Aerial imagery
- [ ] Bulk offline downloads for restricted Nova Scotia reference layers where licensing permits
- [ ] Additional historical map collections beyond Fletcher (A.F. Church Cape Breton sheets are catalogued; tiles still pending — see `docs/CHURCH_MAPS.md`)
- [ ] User-submitted POIs and syncing improvements

## Online Companion

- [x] React + Vite map shell with a responsive desktop/mobile layout
- [x] Versioned Province licence acceptance before NSPRD geometry loads
- [x] Exact PID search against the live NSPRD Feature Layer
- [x] Civic-address search through the authoritative Civic Address File with NSPRD parcel resolution
- [x] Tap-to-identify any visible NSPRD parcel boundary and open the shared parcel sheet
- [x] Browser-local current location display
- [x] Live GPS location with follow mode and one-tap Field notes marking (field-capture W1, #261)
- [x] Foreground track recording with raw-GPX evidence retention (field-capture W2, #262)
- [x] GPX export for user layers and raw-recording downloads (field-capture W3, #266)
- [x] Snap math + NSPRD parcel snap source (field-capture W4, #269)
- [x] Snap-to-parcel drawing licence-gated with traced provenance (field-capture W5, #271)
- [x] Points-to-path conversion with numbered preview and one-shot undo (field-capture W6, #273)
- [x] Freeform feature attributes + KML ExtendedData (field-capture W7, #275)
- [x] Native catalog parity for NS Aerial, Property Boundaries, Crown Lands, Watersheds, and Waterfalls
- [x] Coverage-aware parcel flood-hazard evidence with separate published river and coastal scenario sources
- [x] Native ArcGIS sublayer restrictions, symbology, zoom floors, and Province licence gate on the web
- [x] Complete Province water and transportation overlays with legible official cartography, trails, and close-range culverts
- [x] Default-off web NSTDB buildings overlay with exact selected-PID point-and-polygon building count
- [x] Collapsed, default-off Topography group with labelled 5 m LiDAR-derived contours from zoom 13
- [x] Collapsed, default-off Geology & Resources group with live mineral occurrences, NovaROC tenure, and zoom-bounded abandoned mine openings
- [x] Collapsed, default-off Environmental health screens group with provincial arsenic, uranium, and manganese well-water risk bands, surficial aquifer context, province-sourced legend colours, testing guidance, and a pre-map licence gate on the restricted services
- [x] Default-off Inverness hydro terrain-potential pilot with official watershed area, NSHN mapped drop/route length, area-scaled streams, relative potential colour, raw-metric popups, and reproducible source receipt
- [x] Viewport-paged feature queries with independent loading, zoom, count, failure, source, and screening-caveat states
- [x] Close-range NSPRD boundary visibility from zoom 14 and an opaque close-zoom selected-parcel fill
- [x] Approximate NSPRD acreage, exact road/water intersections, and explicitly labelled adjacent/civic-address roads in the selected-parcel sheet
- [x] Authoritative Civic Address File lookup with paginated bounding-box queries and exact parcel containment
- [x] Independent civic-address loading, empty, failure, attribution, and stale-selection cancellation states
- [x] Locally calculated Plus Codes with opt-in Google Maps directions for mapped civic points
- [x] Parcel-first defaults: modern/aerial off, boundaries/water/roads on, and one-time tax-sale bounds fit
- [x] Host-neutral direct-Rumsey Fletcher control placed last in the web layer
      list, with opacity, share, print/evidence, attribution, and failure state
- [x] Privacy-minimized Inverness County August 11, 2026 tax-sale layer
- [x] Official-source link, withdrawal/redemption warning, and title-search caveat
- [x] Offline-use handoff to the native iPhone app
- [x] Default-off, owner-free historical tax-sale records with verified Halifax outcomes and outcome-pending CBRM notice archives
- [x] Municipality of the District of Lunenburg 2021–2026 outcomes reconciled from tender packages and per-property award documents, with PIDs derived by assessment-account/PVSC/NSPRD reconciliation
- [x] Historical municipality/year/outcome filters, conditional result provenance, source-linked infocards, validation, and match/source ledgers
- [ ] Monochrome browser Print / Save as PDF research and field sheets (implementation complete; saved-PDF, iPhone AirPrint, and physical monochrome acceptance remain pending in `docs/real-world-testing/2026-07-23-web-print-export-test-plan.md`)
- [ ] Fletcher Route 19 corridor georeferencing (sheets 22, 19, 16, 14):
      sheets 19 and 16 have hand-measured control points committed under
      `tools/fletcher/measured/` (2026-08-01); sheet 22 has only uncommitted
      machine proposals; sheet 14 is unstarted
- [ ] Fletcher tile publication in progress: the packaged revision
      `fletcher-direct-rumsey-20260726.1` (8.2 GB, 144k files) sits on the
      bazzite host at `~/nsmarks-fletcher-20260725/deploy/`, and the R2 bucket
      `ns-marks-fletcher-tiles` exists; a feature-led re-tile of sheets 19 and
      16 is pending before upload. `reports/fletcher/RESULTS.md` records the
      caution that the engraved-grid warps carry a measured ~636 m feature
      displacement; the publish decision is the owner's, taken 2026-08-28
- [ ] Add municipality importers only from current official notices
  - [x] Scheduled watcher archives and auto-ingests overwrite-prone sources (Cumberland) via `npm run watch:tax-sales` and `.github/workflows/tax-sale-watch.yml`
- [x] Collapsed, default-off Groundwater group rendering the Province's dated water well log inventory with per-record location-accuracy bands, source-purpose wording, and a surveyed-only default (see the Water well logs section of `web/README.md`)
- [ ] Add the DNRR radon-in-indoor-air potential layer once a Web Mercator service exists or a proj4 custom CRS is approved; the published `radon_cache` MapServer returns an empty image from `export` and caches tiles only in NAD83/MTM (wkid 2961)
- [ ] Add separate Karst Risk and Known Karst Occurrences layers from DP ME 494 only with 2019 currentness, source-scale, completeness, and non-survey caveats
- [ ] Add a selected-parcel Property context summary, starting with karst and coastal hazards; use the researched source order and caveats in `docs/property-context-data-candidates.md`
- [x] Municipal zoning group rendering Inverness, Victoria, Richmond, Cumberland, and Halifax live from municipal ArcGIS services, unofficial, by-law linked, and never extracted to project data
- [ ] Add Victoria's Baddeck plan area only after confirming with EDPC whether it supersedes or overlaps the county layer; the two currently return polygons for the same ground
- [ ] Add municipal zoning to the selected-parcel evidence sheet and print appendix, reusing the `parcelResources.ts` query-table pattern
- [ ] Add MODL zoning, including its explicit "Unzoned Area" polygons, as the model for stating that no zoning applies rather than showing nothing
- [x] "Your maps": user-loaded GeoTIFFs rendered client-side with opacity control (spec `docs/superpowers/specs/2026-07-24-web-user-maps-design.md`, PR 1 of 4)
- [x] In-browser georeferencer for plain scans (PR 2)
- [x] TPS warping + Allmaps annotation export (PR 3)
- [x] GeoPDF import (PR 4)
- [ ] Evaluate geotiff.js 3.x migration (pinned to 2.1.3 in PR 1; read API changed)

## Future Considerations
- Google Maps SDK as alternative engine
- iCloud sync for POI collections

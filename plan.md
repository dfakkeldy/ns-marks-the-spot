# Development Plan - NS Marks The Spot

Status as of July 1, 2026. The detailed v1 design record lives in
`docs/superpowers/plans/2026-06-28-v1-release-roadmap.md`; the public summary
lives in `docs/ROADMAP.md`.

## Completed

- [x] Repository setup and project instructions.
- [x] Xcode project scaffold, app target, unit test target, and UI test target.
- [x] Engine-agnostic `MapEngine` boundary with MapKit behind the adapter.
- [x] Fletcher map overlay rendering with adjustable opacity.
- [x] Disk and memory tile caching for viewed historical tiles.
- [x] POI model, waterfall POI fetching, detail sheet, and map annotations.
- [x] Layer catalog for Fletcher, NS Aerial, and provincial reference layers.
- [x] Offline storage reporting and cache deletion UI.
- [x] Fletcher saved-area models, estimation, and download pipeline.
- [x] Data Sources & Licenses disclosure with Province attribution.
- [x] Fastlane metadata automation, TestFlight metadata, signing, and release train workflows.
- [x] GitHub Pages site and generated devlog automation.
- [x] Real-world testing ledger for the June 28 field QA pass.

## App Store Readiness

- [x] App Store Connect app id and bundle id configured.
- [x] Fastlane metadata files checked in under `fastlane/metadata`.
- [x] Nightly TestFlight upload proven through GitHub Actions.
- [x] Internal TestFlight distribution proven for build `1.0 (4)`.
- [ ] Confirm tester invitation/acceptance state in App Store Connect.
- [ ] Add or verify `PrivacyInfo.xcprivacy` and aggregate privacy report.
- [ ] Publish support and privacy policy URLs, then wire them into App Store Connect and the app.
- [ ] Capture current App Store screenshots for iPhone and iPad sizes.
- [ ] Complete age rating, export compliance, DSA/trader status, pricing, and territory settings.
- [ ] Run final real-device, IPv6, accessibility, and release-build checks.
- [ ] Select final build and submit for App Review.

## v1.0 Finish Line

- [ ] Fix or explicitly accept the Swift warning in `OfflineAreasViewModel.swift` about an `await` with no async operations.
- [ ] Decide whether to add `ITSAppUsesNonExemptEncryption = NO` to avoid manual export-compliance waits.
- [ ] Add a privacy/support surface in-app if App Review needs policy access inside the binary.
- [ ] Run a final field pass with a real Nova Scotia route, location permission, and offline area.
- [ ] Promote `nightly -> weekly -> main` once v1.0 is ready to cut.

## Deferred For v1.1

- [ ] Bulk offline downloads for NS Aerial imagery.
- [ ] Bulk offline downloads for restricted Nova Scotia reference layers where licensing permits.
- [ ] Additional historical map collections beyond Fletcher.
- [ ] User-submitted POIs and syncing improvements.

## Future Considerations

- Alternative map renderer if MapKit becomes a ceiling for raster tile or transparency performance.
- iCloud sync for user POI collections and saved areas.
- Search and discovery for historical places, lots, and map-sheet metadata.

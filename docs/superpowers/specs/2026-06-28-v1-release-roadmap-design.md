# NS Marks The Spot v1.0 Release Roadmap Design

## Purpose

NS Marks The Spot v1.0 will ship as a field-ready historical map explorer for
Nova Scotia. The release should feel dependable in a user's hand, explain its
data sources clearly, and avoid over-promising offline access for restricted
provincial services.

The app is already beyond a prototype: it has a MapKit-backed engine boundary,
Fletcher historical map overlays, layer controls, user location, ArcGIS-backed
Nova Scotia reference layers, metadata and Fastlane scaffolding, and a GitHub
Pages landing page. v1.0 should harden that work into a coherent release.

## Current Project Baseline

Audit date: June 28, 2026.

- Platform: iOS app using SwiftUI, MapKit, SwiftData, and UIKit interop through
  `UIViewRepresentable`.
- Xcode observed locally: Xcode 26.6.
- Deployment target observed in the project: iOS 26.5.
- Swift language version observed in build settings: Swift 5.0.
- App version settings already show marketing version 1.0 and build 1.
- Current architecture keeps SwiftUI views away from direct MapKit imports
  except for the MapKit implementation layer.
- Simulator build passed with code signing disabled.
- Unit-test execution was not reliable during the audit: the test command hung
  in simulator launch/test execution and was interrupted.
- The bundled `Tiles` folder was about 1.9 GB and roughly 29,350 PNG files.
- `OpacityTileOverlay.debugShowTileGrid` was enabled, which would show tile
  coordinate labels and borders in release.
- App icon assets were SVG-based and Xcode warned that the app icon set
  references files with invalid extensions.
- Fastlane has build/test/metadata lanes, while beta, release, and screenshot
  lanes are still commented-out stubs.
- Fastlane App Store API key material is ignored by git and should remain out of
  source control.

## Release Scope

v1.0 includes:

- Fletcher historical map overlay.
- Layer opacity and visibility controls.
- Basemap switching.
- User location support with optional permission.
- Disclaimer flow warning that historical maps are not navigation-grade.
- Point-of-interest and waterfall support.
- Nova Scotia reference overlays, including property boundaries, Crown lands,
  flood risk areas, and waterfalls.
- New Nova Scotia aerial imagery layer using:
  `https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_UT83/MapServer`
- Persistent viewed-tile cache.
- Editable rectangular saved areas for predownloading Fletcher tiles.
- Storage/offline management UI.
- Data source, license, attribution, and disclaimer surface.
- TestFlight/App Store release hardening.

v1.0 does not include:

- Bulk saved-area downloads for NS Aerial imagery.
- Bulk saved-area downloads for restricted Nova Scotia reference services.
- Freeform polygon offline areas.
- Offline Apple/MapKit basemap guarantees.
- Provider permission workflow beyond documenting and linking license terms.
- Google Maps SDK or any other map engine implementation.
- User-submitted POIs or iCloud sync.

## Offline Promise

The v1.0 offline promise is intentionally split by layer type.

Fletcher tiles:

- Every viewed Fletcher tile is persisted until the user manually deletes it.
- Users can draw an editable rectangular area, choose a zoom range, estimate
  storage, and download Fletcher tiles for that area.
- Download failures are visible and retryable.
- The app never claims complete saved-area coverage when failures remain.

NS Aerial imagery:

- NS Aerial is available online as both a basemap-style context layer and a
  fadeable overlay layer.
- Viewed NS Aerial tiles are persisted where technically possible.
- NS Aerial is not bulk-downloaded by saved areas in v1.0.
- Bulk NS Aerial saved-area download is deferred to v1.1, after explicit
  confirmation that the service terms and provider expectations allow it.

Restricted Nova Scotia reference services:

- Reference layers can be displayed and cached as viewed where technically
  possible.
- They are not part of saved-area bulk downloads in v1.0.
- Bulk downloads for restricted services move into the v1.1 candidate scope.

Apple/MapKit basemap:

- The app may benefit from MapKit's own system behavior, but v1.0 does not
  promise offline Apple basemap availability.

## Layer Architecture

v1.0 should introduce a small layer-management spine instead of continuing to
add one-off setup in `AppContainer`.

Add a `LayerCatalog` that defines each supported layer:

- Stable layer ID.
- Display name.
- Source type.
- Source URL or local bundle path.
- Attribution text.
- License URL when required.
- Copyright/provider text.
- Default visibility.
- Default opacity.
- Zoom limits.
- Rendering mode: basemap-style, overlay, or both.
- Offline policy: viewed-cache eligible, saved-area downloadable, or online
  only.
- Cache key strategy.
- User-facing caveats, such as "not navigation-grade" or "requires network for
  complete coverage."

Initial catalog entries:

- Fletcher historical map.
- NS Aerial imagery.
- NS Property Boundaries.
- Crown Lands.
- Flood Risk Areas.
- Waterfalls.

The `MapEngine` abstraction remains intact. SwiftUI talks to view models and
catalog/store services. MapKit-specific tile rendering, coordinate conversion,
and overlay construction stay behind the engine implementation.

## Tile Storage

Add a `TileStore` as the durable storage boundary for map tiles.

Responsibilities:

- Persist tile data by layer, zoom, x, and y.
- Separate app-bundled source tiles from user-generated cache data.
- Track tile metadata, including layer ID, source URL family, date cached, byte
  size, and whether the tile belongs to a saved area.
- Report total cache size and per-layer size.
- Delete all cached tiles.
- Delete cached tiles by layer.
- Delete tiles belonging to a saved area.
- Support lookup by tile coordinate without blocking the main actor.

The existing `TileCache` can be evolved or wrapped rather than replaced in one
large step. The roadmap should prefer a migration that preserves existing cache
behavior while making storage explicit enough to support UI, tests, and release
diagnostics.

## Saved Offline Areas

Saved offline areas are rectangular in v1.0.

Model fields:

- Stable ID.
- Name.
- Bounds.
- Zoom range.
- Created date.
- Updated date.
- Layer policy snapshot.
- Estimated tile count.
- Estimated byte size.
- Downloaded tile count.
- Failed tile count.
- Actual byte size.
- State: draft, estimating, queued, downloading, complete, partial, failed, or
  deleted.

User flow:

1. User taps "Save Area".
2. The map enters rectangle-edit mode.
3. User draws a rectangle.
4. User can move or resize the rectangle with edit handles.
5. User confirms the area, name, and zoom range.
6. The app shows estimated tile count and storage.
7. User starts download.
8. Download progress remains visible.
9. Complete and partial states are shown clearly.
10. Failed downloads can be retried.

v1.0 saved-area downloads include Fletcher tiles only.

## Download Manager

Add a `TileDownloadManager` to coordinate saved-area download jobs.

Responsibilities:

- Convert saved-area bounds and zoom range into tile coordinates.
- Estimate work before download.
- Download tiles with bounded concurrency.
- Reuse `TileStore` for lookup and persistence.
- Skip already-cached tiles.
- Track progress and failures.
- Retry failed tiles.
- Allow cancellation.
- Avoid blocking panning/zooming or normal tile display.

The manager should be written so future layers can opt into saved-area download
without changing the saved-area UI. v1.1 can then enable NS Aerial or reference
layers after legal and service-behavior review.

## NS Aerial Layer

The NS Aerial service is the Nova Scotia Orthophotomap Database service:

`https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_UT83/MapServer`

Observed service characteristics:

- Service description identifies the Nova Scotia Orthophotomap Database.
- Copyright text: Service Nova Scotia.
- `singleFusedMapCache` is true.
- `supportsDynamicLayers` is false.
- Tile format includes PNG32.
- Level of detail range observed: 0 through 14.
- Spatial reference uses UTM/NAD83 identifiers 2038/latest 2961.
- Service metadata reported `exportTilesAllowed: false`.

Implications:

- The service should be modeled as a cached raster layer, not a dynamic ArcGIS
  export layer.
- It should be available as both basemap-style context and an opacity-controlled
  overlay.
- v1.0 can persist viewed tiles where technically possible.
- v1.0 should not bulk prefetch this service for saved areas.
- The data source and restricted license must be visible in the app.

## Data Sources And Licenses

v1.0 requires a persistent data-source and license surface.

The info sheet should include a "Data Sources & Licenses" section with:

- Fletcher map source attribution.
- Province of Nova Scotia attribution and disclaimer:
  "Contains information obtained under license from the Province of Nova Scotia
  which is provided without warranty or liability for errors or omissions."
- Link to the Province of Nova Scotia Restricted Geographic Services License.
- Clear non-endorsement language.
- Clear "not for navigation" language.
- Layer-specific provider/copyright rows where useful.

The exact public URL for the Province restricted geographic services license must
be stored in the layer catalog and exposed in the app before TestFlight or App
Store submission. If no stable public URL is available, the app should include a
locally bundled license document and link to that document from the info sheet.

## User Experience

Main screen:

- The map remains the first screen.
- Controls stay lightweight and map-focused.
- Layer controls remain reachable from the floating map UI.

Layer sheet:

- Shows basemap style.
- Shows visible overlays.
- Supports per-layer visibility.
- Supports per-layer opacity where meaningful.
- Shows whether each layer is online, cached when viewed, or downloadable by
  saved area.
- Allows NS Aerial to act as both context and overlay.

Offline UI:

- A map action starts "Save Area".
- Rectangle edit mode provides move and resize handles.
- Confirmation sheet explains what will and will not be downloaded.
- Storage screen shows total cache size, layer cache sizes, saved areas,
  download states, failure counts, retry actions, and manual delete controls.

First-run and legal UI:

- First-run navigation disclaimer remains.
- Ongoing legal/source details move into the info sheet.
- App Review should be able to find source, license, and location-permission
  explanations without special instructions.

## Error Handling

Layer loading:

- Network failures should produce a non-disruptive layer status, not a crash.
- Missing tiles should not silently become permanent false positives.
- Placeholder/debug tiles must not ship in normal release rendering.

Saved-area downloads:

- Partial completion is a first-class state.
- Failed tiles are counted and retryable.
- Cancellation leaves already-downloaded tiles in the cache.
- Download estimates should be shown before large work starts.
- Storage-pressure failures should explain that the user can delete cached data.

Licensing:

- Layers with restricted terms must not be described as freely redistributable.
- Bulk offline behavior must respect each layer's offline policy.
- NS Aerial and restricted reference services remain viewed-cache only in v1.0.

## Testing And Verification

Required automated tests:

- `LayerCatalog` entries and policies.
- Tile cache lookup and persistence.
- Tile cache deletion by all/layer/saved area.
- Tile URL or tile-coordinate calculation for supported source types.
- Saved-area tile estimation.
- Download manager progress, skip-cached behavior, retry, failure, and
  cancellation.
- Offline policy enforcement so NS Aerial and restricted reference layers are
  not included in v1.0 saved-area bulk downloads.

Required UI or scripted manual coverage:

- First launch and disclaimer.
- Layer menu open/close.
- Toggle Fletcher and NS Aerial.
- Adjust layer opacity.
- Switch NS Aerial basemap-style context.
- Draw, resize, name, estimate, and download a Fletcher saved area.
- View cache/storage status.
- Delete cached tiles.
- Open data-source/license screen.
- Simulate offline or failed network behavior.

Release gates:

- Clean simulator build.
- Clean physical-device build.
- No app icon or asset catalog warnings.
- Reliable unit-test lane.
- Relevant tests passing.
- App Review metadata lint passing.
- TestFlight lane enabled.
- Screenshots captured.
- Review notes explain optional location, historical-map disclaimer, and
  provincial data sources.
- Real-device field sanity pass for panning, zooming, memory use, offline viewed
  cache, saved-area download, failed network behavior, and storage growth.

## Release Operations

Fastlane should become the standard release path.

v1.0 needs:

- Working `test` lane that avoids hanging on large resources.
- Working `build` lane for simulator sanity.
- Working archive/TestFlight lane.
- Metadata lint lane kept current.
- Screenshot capture lane or a documented screenshot capture workflow.
- App Store review notes updated for data sources and optional location.
- App icon assets converted to valid App Store-ready raster assets.
- Version/build number process documented.

The current bundled `Tiles` resource strategy should be revised so tests and
builds do not repeatedly copy a 1.9 GB tile directory when only a small fixture
set is needed.

## v1.0 Milestones

Milestone 1: Release blockers and cleanup

- Disable release tile debug grid.
- Fix app icon warnings.
- Split test fixtures from production/user tile content.
- Restore reliable build/test lanes.
- Update documentation to reflect current architecture.

Milestone 2: Layer catalog and NS Aerial

- Add `LayerCatalog`.
- Move existing layers into catalog entries.
- Add NS Aerial as cached raster source.
- Support NS Aerial as both basemap-style context and overlay.
- Add layer attribution metadata.

Milestone 3: Persistent tile storage

- Introduce or evolve `TileStore`.
- Persist viewed tiles by layer.
- Add cache size reporting.
- Add manual delete controls.
- Add tests for storage behavior.

Milestone 4: Saved Fletcher areas

- Add saved-area model.
- Add rectangle draw/edit flow.
- Add estimation.
- Add Fletcher-only download manager.
- Add progress, partial, retry, and delete behavior.

Milestone 5: Legal, review, and release polish

- Add data sources and licenses UI.
- Add Province attribution/disclaimer and license link or bundled license.
- Update metadata and review notes.
- Capture screenshots.
- Enable TestFlight lane.
- Run real-device field sanity pass.

## v1.1 Candidate Scope

v1.1 candidates:

- Bulk saved-area downloads for NS Aerial after explicit terms and provider
  expectations are confirmed.
- Bulk saved-area downloads for restricted Nova Scotia reference layers if
  terms and service behavior allow.
- More detailed saved-area management.
- More granular per-layer storage controls.
- Richer download scheduling and background behavior.
- Additional historical map layers.

## Open Release Decisions

These decisions do not block writing the v1.0 implementation plan, but they must
be resolved before App Store submission:

- Exact public URL or bundled-document strategy for the Province of Nova Scotia
  Restricted Geographic Services License.
- Final screenshot set and App Store positioning.
- Final size policy for initial bundled Fletcher assets, if any remain bundled.
- Whether TestFlight should precede public App Store submission by a fixed beta
  window.

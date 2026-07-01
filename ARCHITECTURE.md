# Architecture - NS Marks The Spot

Status as of July 1, 2026.

## Overview

NS Marks The Spot is an iOS/iPadOS SwiftUI app for exploring georeferenced
historical Nova Scotia maps over modern map context. The v1.0 candidate centers
on Fletcher map overlays, transparency comparison, optional reference layers,
waterfall POIs, and prepared offline Fletcher areas.

## Platform And Toolchain

- Xcode project: `ns-marks-the-spot.xcodeproj`
- Scheme: `ns-marks-the-spot`
- Local Xcode observed: 26.6
- GitHub Actions Xcode selection: 26.5
- Deployment target: iOS 26.5
- Swift setting: `SWIFT_VERSION = 5.0`
- App bundle id: `com.danfakkeldy.nsmarksthespot`
- App version: `1.0`
- App build in source: `1`; Fastlane increments the uploaded build number
- Third-party app dependencies: none

The app intentionally preserves its current Swift language setting. New code
should remain Swift-6-friendly, but a Swift 6 language-mode migration is tracked
separately and should not be mixed into release docs or App Store prep work.

## Key Design Decisions

### Engine-Agnostic Map Boundary

SwiftUI views do not import MapKit directly. Map rendering goes through the
`MapEngine` abstraction, with MapKit contained in the adapter layer.

- `MapEngine` defines map behavior: render view, manage layers, update opacity,
  report viewed tiles, and drive saved-area bounds selection.
- `MapLayer` defines map overlays and metadata that concrete engines can render.
- `MapKitEngine`, `MapKitMapView`, `MapKitTileLayer`, and
  `OpacityTileOverlay` contain the MapKit-specific implementation.
- `MockMapEngine` supports tests and UI logic without live MapKit behavior.

If MapKit becomes the wrong renderer for raster tiles or opacity performance, a
future engine can conform to `MapEngine` while preserving the SwiftUI and
view-model surfaces.

### Architecture Shape

```text
SwiftUI Views
  -> ViewModels and local SwiftUI state
  -> MapEngine protocol
  -> MapKit adapter
  -> Tile, POI, layer, and offline services
  -> SwiftData and file-backed tile storage
```

The project is feature-oriented:

- `App/`: app entry point and dependency container.
- `MapEngine/`: protocols plus MapKit implementation.
- `Layers/`: layer descriptors, attribution, and catalog metadata.
- `Offline/`: saved-area models, planning, tile store, downloads, and UI.
- `Overlay/`: map screen, layer controls, transparency, and app information.
- `POI/`: point-of-interest model, view model, and detail UI.
- `Services/`: POI and tile networking/cache services.
- `Mocks/`: test doubles.

### Layer Catalog And Attribution

v1.0 centralizes layer definitions in `LayerCatalog`. Each layer carries its
rendering role, source, cache key, zoom limits, attribution, and offline policy.

Current layer categories:

- Fletcher historical maps: core historical overlay and prepared offline areas.
- NS Aerial: context layer with viewed-tile caching only in v1.0.
- Nova Scotia reference layers: property, Crown land, flood risk, and related
  online services, with licensing and offline constraints made visible to users.
- Waterfall POIs: fetched from the ArcGIS-backed service through `POIFetcher`.

The app includes a Data Sources & Licenses surface because the Province of Nova
Scotia restricted-service attribution is part of the release surface, not just a
developer note.

### Offline Storage

Offline support has two tiers:

- Viewed-tile persistence through `TileCache` and `TileStore`.
- Explicit Fletcher saved areas using rectangular bounds captured from the map,
  estimated by `FletcherTilePlanner`, and downloaded through the offline flow.

NS Aerial and restricted provincial layers are viewed-cache only for v1.0. Bulk
offline downloads for those layers are deferred until licensing and product scope
are revisited.

### Data Flow - Transparency Slider

1. `TransparencySliderView` writes to `OverlayViewModel.opacity`.
2. `OverlayViewModel.updateOpacity(_:)` updates state and calls
   `engine.setOpacity(for:to:)`.
3. `MapKitEngine` finds the matching layer and updates its opacity.
4. The MapKit overlay renderer reads the updated opacity on its next draw.

This keeps UI state small and prevents the slider from recreating the map view
for every opacity change.

### Data Flow - Offline Area

1. The user starts a saved-area draft from the offline UI.
2. The app asks `MapEngine` to select rectangular map bounds.
3. `FletcherTilePlanner` estimates the Fletcher tile count for the selected
   zoom range.
4. The user confirms the saved area.
5. `TileDownloadManager` fetches Fletcher tiles and records progress, success,
   and failure counts.
6. `SavedOfflineAreaRepository` persists the saved-area metadata.

### POI Fetching

`POIFetcher` is injectable and tested with an ephemeral `URLSession` plus custom
`URLProtocol`. ArcGIS attributes are decoded through typed fields that the app
actually consumes instead of relying on broad string dictionaries.

### Dependency Injection

`AppContainer` owns long-lived services and injects them through initializers.
The project avoids a third-party dependency-injection framework; missing
dependencies should remain compile-time problems.

## Release Architecture

Release automation is intentionally file-backed:

- App Store metadata lives under `fastlane/metadata/en-US`.
- TestFlight metadata lives under `fastlane/metadata/testflight/en-US`.
- Review notes live under `fastlane/metadata/review_information/notes.txt`.
- Fastlane lanes validate metadata, build, upload TestFlight builds, and upload
  App Store builds without submitting for review.
- GitHub Actions checks out train branches (`nightly`, `weekly`) from the
  workflow definitions on `main`.

`main` is also the GitHub Pages source branch (`docs/`). Release-train changes
therefore sometimes need back-merges down to `nightly` so the workflows and
integration branch stay aligned.

## App Store Compliance Gaps

Known gaps before App Review:

- No `PrivacyInfo.xcprivacy` is present in the current tree.
- Privacy and support URLs still need to be published and configured.
- Current screenshots for required iPhone/iPad sizes still need to be captured.
- Age rating, export compliance, DSA/trader status, pricing, and territory
  settings need final confirmation in App Store Connect.
- The app should be tested on a physical device and an IPv6-only network before
  submission.

See `docs/APP_STORE_NEXT_STEPS.md` for the operational checklist.

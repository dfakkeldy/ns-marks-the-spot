# App Store Screenshot Pack

Captured July 3, 2026 from simulator builds of NS Marks The Spot using the
existing UI-test mode. Raw screenshots are stored here so Fastlane can upload
them directly. Captions below are the intended App Store story if the final
set is framed or text-overlayed before submission.

Apple screenshot reference:
https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/

## Device Families

- iPhone 6.9-inch: `1320x2868` PNGs, captured on iPhone 17 Pro Max simulator.
- iPad 13-inch: `2064x2752` PNGs, captured on iPad Pro 13-inch simulator.

The app supports both iPhone and iPad, so keep both families populated in App
Store Connect. Current Apple specs accept these sizes for the newest required
iPhone and iPad families; 6.5-inch iPhone screenshots can be generated from this
storyboard only if App Store Connect requests a separate legacy family.

## Six-Shot Storyboard

1. `01-map-home`
   - Caption: Compare Then And Now
   - Purpose: Show Nova Scotia with the Fletcher historical layer enabled.
   - Final capture preference: zoom to a legible historical-overlay area and use
     Satellite or Hybrid as the base map if it makes the Fletcher tiles clearer.

2. `02-layer-catalog`
   - Caption: Tune Every Map Layer
   - Purpose: Show the layer catalog, base-map options, Fletcher opacity, and
     optional Nova Scotia reference layers.

3. `03-save-visible-area`
   - Caption: Save The Area You Need
   - Purpose: Show the visible-map save flow and field-prep entry point.

4. `04-save-area-estimate`
   - Caption: Preview Fletcher Tile Size
   - Purpose: Show saved-area estimating before committing an offline download.

5. `05-offline-maps`
   - Caption: Manage Offline Maps
   - Purpose: Show storage totals, saved areas, cache controls, and sample area
     setup.

6. `06-data-sources`
   - Caption: Verify Every Source
   - Purpose: Show Data Sources & Licenses, attribution, and layer suitability
     notes.

## Files

- `iphone-6-9-01-map-home.png`
- `iphone-6-9-02-layer-catalog.png`
- `iphone-6-9-03-save-visible-area.png`
- `iphone-6-9-04-save-area-estimate.png`
- `iphone-6-9-05-offline-maps.png`
- `iphone-6-9-06-data-sources.png`
- `ipad-13-01-map-home.png`
- `ipad-13-02-layer-catalog.png`
- `ipad-13-03-save-visible-area.png`
- `ipad-13-04-save-area-estimate.png`
- `ipad-13-05-offline-maps.png`
- `ipad-13-06-data-sources.png`

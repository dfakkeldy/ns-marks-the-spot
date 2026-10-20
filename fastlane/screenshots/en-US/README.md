# App Store Screenshot Pack

Re-checked October 6, 2026. The 12 PNGs here were captured July 3, 2026 from
simulator builds using UI-test mode. They are preserved historical assets, not
selected-final-build evidence. The first iPhone image shows the former Apple
map without the current parcel search. Refresh the native core journey before
submission. Fastlane currently detects these PNGs and can upload them, so their
presence alone must not be treated as approval to use them.

Apple screenshot reference:
https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/

## Device Families

- iPhone 6.9-inch: `1320x2868` PNGs, captured on iPhone 17 Pro Max simulator.
- iPad 13-inch: `2064x2752` PNGs, captured on iPad Pro 13-inch simulator.

All 12 tracked screenshots are RGB PNGs without alpha. The app supports both
iPhone and iPad. Apple's current required iPhone category is Dynamic Island
medium, accepting portrait `1179x2556` or `1206x2622`. Existing larger images
may qualify through a documented scaling fallback; actual acceptance in ASC
remains unverified. The iPad `2064x2752` size is listed for the 13-inch category.
Capture at the current required dimensions when refreshing rather than assuming
an old family label completes the current store form.

## Fresh selected-build storyboard

Use actual native screens; no browser-map substitutes or invented results.
Capture the same core story on iPhone and iPad. Keep source attribution visible
and avoid personal imports, photos, tester identities or account details.

1. **Find a Nova Scotia property**: search/parcel inspector showing a real
   public record and its source; demonstrate the current native chrome.
2. **Read dated tax-sale records**: notices and historical results visibly
   separated, with source/date; do not imply an active offer from an old notice.
3. **Measure and export with context**: distance/area and not-a-survey caveat,
   or a native PDF preview with scale and attribution, after the test failure
   is resolved.
4. **Keep your maps on your device**: local imported map/drawing and a safe
   sample photo attachment. Do not imply a public feed or cloud sync.
5. **Prepare a supported historical area**: Fletcher download/storage flow
   only after native/offline rights and the selected build's host are cleared;
   explain that other live services require a connection.
6. **See every source and privacy choice**: Map Info/licence controls and the
   accessible privacy-policy path once implemented and verified.

These are capture instructions, not new assets or validated behavior. The
[native release packet](../../../docs/APP_STORE_RELEASE.md) records the exact
build, rights, privacy and acceptance gates. No automated capture lane exists;
schedule one selected-build simulator session after the native blockers clear.

## Preserved July storyboard

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

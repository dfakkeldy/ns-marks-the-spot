# App Store Screenshot Pack

Captured **October 31, 2026** from an unsigned **Release simulator build
1.0 (127)** of main source `0cb4f5d5f44a40af1ccdb29780b88cbc3bb6079e`.
That source includes the Atlas fallback and tile-loading changes from
[PR #636](https://github.com/dfakkeldy/ns-marks-the-spot/pull/636), promoted
through [#637](https://github.com/dfakkeldy/ns-marks-the-spot/pull/637) and
[#639](https://github.com/dfakkeldy/ns-marks-the-spot/pull/639).

The capture host used Xcode 27.2 and the iOS/iPadOS 27.0 simulator runtime.
The signed App Store workflow uses its configured Xcode 26.5 toolchain. These
images show the same native source in the simulator; they are not physical-iPad
acceptance or evidence that Apple's original blank-map report was reproduced.

## Device families and encoding

- iPhone 6.9-inch: `1320x2868`, iPhone 17 Pro Max simulator.
- iPad 13-inch: `2064x2752`, iPad Pro 13-inch (M5) simulator.

All 12 files are native-resolution, 24-bit RGB PNGs without alpha. The native
captures were fully opaque; removing the unused alpha channel preserved every
RGB pixel, checked by decoded-pixel SHA-256 comparison. No map content, labels,
records, or UI were retouched. Every visible map was inspected for a completed
draw. Captures use a disposable app container and contain no personal imports,
photos, recorded tracks, or account information.

Both dimensions are listed in Apple's
[screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
Check the actual version's device slots in App Store Connect before submission,
including any smaller-device assets that would otherwise retain older images.

## Captured views

1. **Map home**: the default Cape Breton view with Fletcher imagery over the
   Atlas background, current map controls, scale, coordinates and attribution.
2. **Layer catalog**: the native layer panel, Atlas selection and visible
   licence gates. Restricted features remain locked.
3. **Save visible area**: the real area-selection flow over the drawn map.
4. **Save-area estimate**: the calculated Fletcher tile count and download
   estimate. The estimate was cancelled; no saved-area download was started.
5. **Offline Maps**: actual cache/storage state in the disposable container,
   with no invented saved areas.
6. **Sources**: expanded active source credits on iPad; the Map Info licence
   list and `Version 1.0 (127)` footer on iPhone.

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

## Delivery state and recovery

[App Store Release run 41228750750](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/41228750750)
passed its native test gate and exported a signed 1.0 (127) archive, then failed
before binary upload because fastlane rejected `metadata/testflight` as an
unsupported App Store metadata directory. These are prepared candidate assets,
not an upload or App Review submission receipt. Final delivery state belongs in
the [release packet](../../../docs/APP_STORE_RELEASE.md).

The beta metadata now lives outside the App Store metadata root at
`fastlane/testflight/en-US`; the release workflow must be rerun from main after
the repair merges. Its actual uploaded build number remains a separate check.

The former July 3 screenshot files remain recoverable from
[the pre-refresh main commit](https://github.com/dfakkeldy/ns-marks-the-spot/tree/0cb4f5d5f44a40af1ccdb29780b88cbc3bb6079e/fastlane/screenshots/en-US).

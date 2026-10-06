# Native App Store release packet

Re-checked: **2026-10-06**. Scope: the native iPhone/iPad app and its Live
Activity extension. Browser-map publication does not establish native readiness.
This packet prepares a release; it does not authorize promotion, upload,
submission, pricing, agreement acceptance, or legal declarations.

## Release decision

**Hold public release.** A recent internal upload exists, but the current native
test gate now passes at the earlier documentation head and the native privacy
link is implemented; native/offline rights and policy-content reconciliation
remain unresolved. Complete those
bounded items before choosing a final build. Keep existing features intact while
resolving them; any alternative release scope needs an explicit decision.

| Evidence | Verified state | Remaining gate |
|---|---|---|
| Nightly source | `af8a13750eda50423f599079c1f851eeb7ac7805` | Privacy-link source head `1153d59c` passed all native/UI/package tests; selected signed-device acceptance remains separate |
| Weekly source | `781d7b5b2206eee48cd20a00b2cfbcebea78d4d3` | 327 nightly commits are ahead; use a separate `nightly -> weekly` promotion |
| Main source | `1859b08e08f4a50588e762a86e391f8b41db4356` | 827 weekly commits are ahead; use `weekly -> main` after external acceptance |
| Latest real internal receipt | October 4: `1.0 (109)`, source `3e7fb58130b04bba69b402a57f3473c11703c26f`; uploaded, processed, distributed internally | Not the current source and not App Store approval |
| Latest inspected real weekly receipt | September 28: `1.0 (103)`, weekly SHA above; uploaded, processed, Fastlane reported external distribution | Confirm the selected build's beta-review state, group eligibility and actual external acceptance in ASC |
| October 5 native train | Source `37a5c6228fcf83e0e544cac87ae3248e3c0fba0f` compiled; tests failed; upload skipped | `MapChromeUITests.testMeasuringReportsADistanceForTapsOnTheMap`, line 103: badge tap did not update endpoint and card |
| Current source preparation CI | [37410821481](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/37410821481), head `1153d59c`: native and all 18 UI tests + core package tests passed | Counts and source receipt recorded separately; no promotion or device acceptance implied |
| App Store Release workflow | Present on nightly; no runs returned by the live workflow query | No App Store upload/submission/approval/live outcome established |

The October 5 failure remains historical intermittent evidence. The October 6
`079da5ba` native/UI rerun and the isolated local two-tap/endpoint-extension
journey passed without a measurement-source change. Preserve that assertion and
diagnose a future reproduced failure; the current evidence does not justify a
speculative measurement repair. The privacy-link source patch `1153d59c` also passed its own native/UI gate
in run 37410821481. These repeat passes leave the historical intermittent
record intact and do not substitute for selected signed-device acceptance.

Receipts:

- [Internal upload, October 4](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/37199904619)
- [Weekly upload, September 28](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/36472512037)
- [Native test failure, October 5](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/37318150629)
- [Historical CI, October 5](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/37371862671)

## Promotion and build contract

The ladder remains `feature/* -> nightly` (internal testing) `-> weekly`
(external testing) `-> main` (App Store). CI permits only `nightly` or `main`
as PR heads into weekly; main accepts `weekly` or `hotfix/*`. Do not backport a
feature directly to weekly/main to obtain a green check.

Live classic protections require `Build gate + tests` on all three branches,
including administrators, with zero mandatory approvals. Weekly/main require an
up-to-date base (`strict: true`); nightly does not. CI classifies paths: a green
documentation/web run may skip native compilation and tests. Release trains and
the App Store workflow separately compile and run native unit/UI tests before
shipping. The latter uploads with `submit_for_review: false`; upload is not
submission. The July main Fastfile also has older release behavior, so inspect
the promoted main payload before using it. Do not dispatch, tag, change branch
rules, or alter pipelines during preparation.

Source configuration:

- App: `com.danfakkeldy.nsmarksthespot`; extension:
  `com.danfakkeldy.nsmarksthespot.LiveActivity`.
- Marketing version `1.0`; checked-in build number `1`, replaced by the release
  lane using the latest TestFlight number plus one. Source build `1` is not the
  uploaded build number.
- iPhone and iPad; deployment target iOS 18.0; Swift 6.0; native CI selects
  Xcode 26.5. This satisfies the source-configured toolchain/target direction of
  Apple's current iOS upload requirements; inspect the final archive's SDK.
- Match is readonly for normal shipping and maps the app and extension to their
  respective profiles. The October 4 receipt proves a successful archive/upload
  for that older source. No certificates, private signing assets or credentials
  were inspected for this audit.
- No checked-in `.entitlements` or `CODE_SIGN_ENTITLEMENTS` setting was found.
  Inspect the exported final app/extension entitlements before submission.
- Background mode is `location` only. When In Use location supports positioning,
  marking and recording; `CLBackgroundActivitySession` exists only for an active
  recording. No Always permission request/string is configured. Camera and
  Photos purpose strings describe local feature photos and on-device photo-map
  indexing. Live Activity shows elapsed time/distance and pause/resume, not
  coordinates; stop/save remain in the app.

## Store fields and prepared copy

Existing source fields are in `fastlane/metadata/`:

| Field | Prepared value/status |
|---|---|
| Name | NS Marks the Spot |
| Subtitle | Nova Scotia property research |
| Primary / secondary category | Reference / Education |
| Promotional text | Existing 169-character text describes parcel search, dated notices, measuring, PDF export and local imports |
| Keywords | Existing 92-byte list; validate the actual files before use |
| Privacy URL | `https://kinnokilabs.com/privacy` |
| Support URL | `https://kinnokilabs.com/nsmarksthespot-help` |
| Marketing URL | `https://kinnokilabs.com/apps/nsmarksthespot/map/` is a browser map; confirm the chosen public destination accurately presents the native app |
| Review contact | Existing file-backed name/email; phone is required from the authorized secret or ignored local file. Verify in ASC without copying private values into this packet |
| Copyright | Required in ASC; no `copyright.txt` is staged. Owner must confirm the exact line |
| Price / territories / release timing | Unread in ASC; historical free/no-IAP intent is not a newly approved pricing or availability answer |

The existing privacy URL returned HTTP 200 on 6 Oct and now appears in native
Map Info with an accessibility identifier and a 44-point target. Its global
policy still claims only Apple-service traffic and no servers, which does not
reconcile the app's provincial/OSM/hosted-tile requests. Reachability and a link
are therefore verified separately from policy accuracy. Prepare factual native
network/photo/location/export disclosures and verify retention before owner
confirmation; no public policy or legal answer changed. Support/marketing
browser reachability and actual native link opening remain candidate checks.

The following replacement description is ready to copy once the selected
build's journey and content clearance are verified. It corrects the existing
metadata's claim that location only displays position, and limits offline
promises to what the native code implements:

```text
NS Marks the Spot is a screening and research map for Nova Scotia property, tax-sale research, local history and field work.

Find and understand a place:
- Search by PID or civic address and inspect the provincial parcel record.
- Read municipal tax-sale notices as dated source records, with historical results kept separate from current notices.
- Export an evidence note that records each source's answer and date.

Work with maps:
- Choose NS Marks Atlas, OpenStreetMap or Apple's standard, satellite and hybrid backgrounds.
- Explore available provincial and municipal reference layers, with sources, licence terms and suitability notes.
- Measure distance and area, and export a framed PDF map with scale and attribution.
- Import and place your own maps, draw layers and attach photos on your device.
- With optional location permission, show your position, mark a point or record a track. An active iOS recording can continue off screen; iOS shows its recording indicator. Saved tracks stay on this device unless you export or share them.
- Historical-overlay saved areas prepare Fletcher tiles where supported. Queried parcels and other live services need a connection; recently viewed cached tiles are not a guaranteed offline download of every layer.

No account is required. Imported maps, drawings and attached photos stay on your device unless you export or share them yourself.

This is reference material, not a survey, title search, legal proof, route guidance or emergency tool. A mapped parcel is a drawing of a record, not a line on the ground. Source errors and empty answers remain distinct. Confirm important decisions with the official source.

Some provincial services require accepting the Province of Nova Scotia's licence before loading. You can withdraw acceptance in the app. Historical imagery has separate attribution and noncommercial licence terms; the software licence does not cover the maps.
```

Prepared review notes, subject to final-build verification and rights clearance:

```text
NS Marks the Spot requires no account or login and has no in-app purchases.

The native app is a Nova Scotia screening and research map. Use PID or civic-address search, then inspect a provincial parcel record. The tax-sale control shows dated municipal notices with their sources, not property offers. Map Info lists data sources, licences and limits. Data is not suitable for surveying, title/legal decisions, route guidance, emergency use or flood-risk assessment.

Restricted provincial layers load only after the user's explicit Province of Nova Scotia Restricted Geographic Services License acceptance. The user can withdraw acceptance and clear restricted cached tiles. Unanswered licences and source failures are shown separately from empty results.

Imported maps, drawn layers and photos are local. Camera/Photos access is requested for the relevant action; the photo-map index is on device. Export/share is initiated by the user. Recently viewed tiles can be cached; named saved areas prepare supported Fletcher historical tiles. Other queried services need a connection.

Location is optional When In Use. The location controls can show position, mark a point or record a track. Background location is held only during an active recording, with the iOS indicator; the app never requests Always permission. During recording, a Live Activity may show elapsed time/distance and Pause/Resume on the Lock Screen/Dynamic Island. Open the app to stop and save. A local checkpoint offers interrupted recordings at the next launch. No coordinates are shown in the Live Activity and tracks leave the device only through the user's export/share.

The Fletcher historical overlay uses tiles.kinnokilabs.com. Historical map rights and attribution are separate from the software licence.
```

Attach the final build/version, actual device/OS acceptance results, and exact
review paths once known. Do not include an unresolved-rights promise or submit
these notes as evidence of rights. First-version What's New is unavailable in
ASC; updates need truthful release notes for the actual changes.

## Assets

Three tracked app icons are 1024×1024 RGB PNGs without alpha (light/dark/tinted).
The existing screenshot pack contains six 1320×2868 iPhone PNGs and six
2064×2752 iPad PNGs without alpha, captured July 3. Visual inspection of its
first iPhone image shows the old Apple map without the current parcel-search
bar; its historical-first storyboard predates the current core journey.

The old PNGs remain preserved. They are not a current-final-build capture.
Current Apple specifications list the required iPhone category as Dynamic
Island medium (1179×2556 or 1206×2622); the existing large images may use a
documented scaling fallback, but acceptance in the actual ASC category remains
unverified. iPad 13-inch 2064×2752 is listed. See the
[screenshot plan](../fastlane/screenshots/en-US/README.md) for a focused fresh
native storyboard. No capture lane is implemented, and no new screenshot was
fabricated from the web interface. Four new authentic native draft captures are preserved locally: three phone
and one iPad. They cover map, layer controls and measurement. Status/candidate
cleanup, final category acceptance and content-rights review remain; no
measurement repair is currently supported by the passing rerun and local journey.

## Privacy and conditional features

`ns-marks-the-spot/PrivacyInfo.xcprivacy` declares tracking false, no tracking
domains, no collected data types, and required-reason categories FileTimestamp
(`C617.1`) and UserDefaults (`CA92.1`). These are source declarations, not ASC
answers or final-archive placement proof. The only package dependency in the
project is local `NSMarksCore`; no remote advertising, analytics, authentication
or purchase SDK was found. The Live Activity target has no separate manifest;
check its final linked API usage and bundle coverage in the archive report.

The local-data design supports a proposed no-data-collected label, but verify
the complete real data flow before making that declaration: device-only marks,
tracks, imports and photos; user-directed exports; MapKit; provincial PID/civic
and viewport queries; OSM tile requests; and the developer's own
`tiles.kinnokilabs.com` requests and server/CDN log retention. An empty manifest
does not establish that no request data is retained. Confirm provider practices
and the final Xcode privacy report. No data-collection answer was submitted.

No account creation, login, StoreKit purchase or subscription implementation
was found in the native targets. Account deletion and purchase/restore flows
are therefore not applicable to the audited source. Local imports/photo
attachments and explicit sharing exist; no public social feed was found. Use
that evidence when the owner reviews the current age/social-media questionnaire;
do not infer an age rating from the Reference category.

`ITSAppUsesNonExemptEncryption` is absent. Source uses system HTTPS and hashing
for data integrity; no custom encryption library was found. Export-compliance
questions, intended territories and any required documentation remain an
authorized-owner determination. Do not insert a guessed plist answer.

## Content rights: specific unresolved items

1. **Fletcher native/offline distribution.** The published
   [rights boundary](FLETCHER_GEOREFERENCING.md#evidence-and-rights-boundary)
   records permission for direct-Rumsey georeferencing for a free web map and
   explicitly excludes native offline bundling unless supported by the original
   request and response. Native Release configuration enables the hosted
   Fletcher mosaic and the app saves historical areas. Confirm the native
   App Store/offline/export scope against that permission or obtain the missing
   permission. Preserve Rumsey/Stanford, changes and CC BY-NC-SA 3.0 attribution.
   Free software alone does not establish the needed distribution rights.
2. **Municipal zoning without stated terms.** `LayerCatalog` marks Inverness
   Municipality, Village of Inverness, Richmond and Cumberland zoning
   `municipalNoStatedLicence`. Native source names the limitation and does not
   turn it into permission. Confirm the application display/export rights for
   these specific services before the owner makes an all-content-rights answer.
3. **Restricted provincial services.** The bundled licence permits viewing and
   directs other uses to the provider. Acceptance gates and attribution exist;
   verify whether the app's evidence/PDF/geometry exports fall within the
   permitted scope or need separate clearance. A user's acceptance is not a
   blanket publisher redistribution grant.
4. **OSM and other credited sources.** Native OSM requests identify the app and
   use HTTP caching; it is not included in named offline saved-area downloads.
   Keep on-map/export attribution. Review current host policies and the Atlas
   raster's provincial/OpenFreeMap/OpenMapTiles/OSM derivative terms for final
   distribution. Do not interpret the repository MIT licence as a data licence.

Keep underlying correspondence, private evidence and personal data out of public
PRs. A separate existing provenance/rights workstream should remain intact.

## Finish before the ASC sitting

Agent work: preserve the passing measurement evidence; verify the implemented native
policy link through normal work; resolve the specified rights scopes with the
available evidence; verify public URLs; validate and stage the corrected copy;
capture the selected build's native core journey; inspect one final archive's
privacy report, signed entitlements and SDK; and prepare the authorized promotion
PRs only when requested. Public release also needs a selected-build core-device
acceptance record, rather than assuming an older build was tested.

At one later ASC sitting, the owner confirms the selected build and the prepared
answers for age/social-media, privacy, content rights, export compliance,
copyright, availability/price, trader status and any agreements, then explicitly
authorizes submission/release. Inspect current fields and present exact unresolved
choices then; signing in is not required to complete independent preparation.

## Current official references

- [Apple upload requirements](https://developer.apple.com/news/upcoming-requirements/)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (complete builds, accurate metadata, privacy-policy access and permitted background use)
- [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/) (on-device processing and retained network data are distinct)
- [Privacy manifest placement](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)
- [Age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)
- [September social-media questionnaire notice](https://developer.apple.com/news/?id=tlur8uvi)
- [Export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)
- [External TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/)
- [Rumsey permissions](https://www.davidrumsey.com/about/copyright-and-permissions)
- [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/)

All references were re-checked during the October 6 release-preparation audit.

## 6 October continuation

The minimal Map Info privacy-link diff passed independent source review. All
current phone/iPad draft captures are authentic native UI from an isolated
simulator. They remain draft assets, with neutral status bars/candidate scope
and content-rights review before upload. No measurement behavior, licence gate,
source/provider, policy text, signing, pipeline or release action changed.

Exact privacy-link source-head [CI 37410821481](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/37410821481)
completed successfully. All 18 native UI tests ran, including measurement;
core and native unit suites passed. Web was correctly skipped for this native
change. Documentation-only follow-ups do not change that source payload.

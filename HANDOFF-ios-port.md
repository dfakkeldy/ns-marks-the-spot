# Handoff — iOS web-map parity port

## 2026-08-12 — Phase 0 mainline code complete, unbuilt

Done: 5 commits on `claude/ios-web-map-parity-a66e38` (e88ffb4..43ecae0):
MapEngine→MapSurface collapse, dead-code removal, @Observable +
NavigationModel/SheetRoute, Swift 6 flip with isolation fixes,
ARCHITECTURE.md rewrite. Nothing compiled yet — the single Apple build slot
was owned by other sessions (Echo, then Burly) all evening.
Next: slot-wrapped `xcodebuild test` (unit then UI bundles), fix what
surfaces (watch: @Observable on NSObject subclass, @Sendable loadTile
override, UIGraphicsImageRenderer off-main under Swift 6), simulator check,
push, PR to `nightly`.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/map-portfolio-improvements-fa1f45,
branch claude/ios-web-map-parity-a66e38. Run via xcode-build-slot.sh:
xcodebuild test -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot
-destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:ns-marks-the-spotTests
CODE_SIGNING_ALLOWED=NO, fix failures, then UI tests, then PR to nightly.
```

## 2026-08-13 — Phase 0 green and verified in the simulator

Done: 113 unit tests / 19 suites and 9 UI tests pass on iPhone 17. Swift 6
surfaced four isolation classes (commit d4404f3): nonisolated annotation
bridging, async `loadTile(at:)` replacing the closure form the 6.0
region-isolation checker cannot analyze, a lock-guarded POIFetcher stub, and
`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` on the unit target only (the UI
target keeps the default because XCTestCase overrides are nonisolated).
Simulator run confirms launch + POI fetch, layers panel, base-map picker,
opacity slider, layer toggle, POI/info/offline sheets, and bounds-drag →
save-area draft. Offline sheet shows Fletcher/NS Aerial tiles cached under
unchanged cache keys.
Next: PR to `nightly`, then Phase 0 spikes on throwaway branches (GeoTIFF IFD
reader, MKMultiPolygon scale, TPS warp tile, CGPDF /VP walk, Mac smoke).
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/map-portfolio-improvements-fa1f45,
branch claude/ios-web-map-parity-a66e38 (pushed, PR open to nightly).
Next action: start Phase 0 spike 1 — GeoTIFF IFD tag reader vs repo fixtures —
on a throwaway branch off nightly.
```

## 2026-08-13 — Phase 0 spikes 1, 3, 4: mac-native legs done; device legs blocked

Done: spikes 1 (GeoTIFF tags), 3 (TPS warp cost) and 4 (CGPDF GeoPDF) complete
and written up in `docs/spikes/`. Reader is 282 LOC / 15 tests; CGPDF needs no
PDF dependency; warp cost tracks minification, not source size, so a per-zoom
scale-matched mip drops an 8192px source from 1310 to 2.8 ms/tile — this
retires the plan's "cap sources at 4096 px" performance constraint and composes
with spike 1's thumbnail path. Spike code on `spike/geotiff-ifd-reader`
(83a17a0, pushed); writeups on this branch (387636f).
Next: spike 1's iOS leg, spike 2, spike 3's device leg, spike 5 — all need
Xcode. Blocked on host memory, not slot contention: the slot reports FREE while
the gate holds at pressure 2 with 1.27 GB free swap against a 2 GB floor.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/map-portfolio-improvements-fa1f45,
branch claude/ios-web-map-parity-a66e38.
Next action: check `~/.claude/bin/xcode-build-slot.sh --status`; when the gate
admits, run the iOS ImageIO tiled-TIFF test on the spike branch and replace the
"Pending" block in docs/spikes/ios-port-spike-1-geotiff-tags.md.
```

## 2026-08-13 — Spike 1 closed: iOS confirms the tiled+compressed ImageIO hole

Done: iPhone 17 simulator (iOS 26.5) reproduces the macOS result exactly —
tiled+DEFLATE gives properties=nil and image=nil, striped+DEFLATE control
passes. Spike 1 is complete; the fail-closed + hand-rolled DEFLATE/LZW
recommendation is no longer contingent. Spikes 1, 3 and 4 all written up.
Next: spikes 2 (MKMultiPolygon paging), 3's device leg, 5 (Designed-for-iPad).
Pre-flight every queued Swift file with `xcrun swiftc -parse` first: a syntax
error cost a two-hour gate wait on this one.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/map-portfolio-improvements-fa1f45,
branch claude/ios-web-map-parity-a66e38.
Next action: write Phase 0 spike 2 (10x2k-parcel MKMultiPolygon paging, z>=15
restyle, tap hit-test) on the spike branch, parse-check it, then queue it
through xcode-build-slot.sh.
```

## 2026-08-13 — Phase 1 opened; NSMarksCore lands, logic tests leave the build gate

Done: worktree moved to `ios-web-map-parity-2de228` on
`claude/ios-web-map-parity-2de228`, reset onto `nightly` (5a677c8) — the old
worktree's branch merged as PR #216, verified as a real merge, spike docs
included. Key finding: the RAM-gate hook only intercepts
`xcodebuild`/`fastlane`/`make`, so `swift test` over a pure SPM package is
ungated. Four commits: NSMarksCore package + GeoCore geodesy (12 tests),
point-in-polygon with holes (10), Web Mercator + slippy tile maths (10, with a
cross-check tying the two ported halves together), and the web-side
`exportSharedData.mjs` + repo-root `SharedData/` with a SHA-256 manifest
(12 node tests; wired into `npm run test:scripts`). All 32 package tests and
24 web script tests green. Zero Apple builds consumed.
Next: layer-catalog parity, licence gate, Fletcher direct-Rumsey switch — a
6-agent parity extraction over the web sources is synthesising the spec.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (4 commits ahead of nightly, unpushed).
Next action: implement Phase 1 layer catalog + licence gate from the parity
spec; keep pure logic in NSMarksCore (`swift test`, ungated) and let only the
app-target wiring wait on xcode-build-slot.sh.
```

## 2026-08-13 — Phase 1: catalog, parity oracle and the licence gate land

Done: three more commits, still zero Apple builds. `LayerID`/`LayerGroupID`/
`LayerLicence` + `OverlayZIndex` in GeoCore; `web/src/layers/layerParity.ts`
exports `layer-parity.json` via `toMatchFileSnapshot` (no new dependency); all
36 descriptors in `MapCatalog` with a field-by-field Swift parity test.
Then `NSDataServices`: `TileRequest` (internal init), `ProvinceLicence*`,
`TileRequestFactory` (licence checked before the URL is built), and
`ArcGISExportURL` byte-compatible with `URLSearchParams`. 105 package tests,
8 web tests, all green; three mutations confirmed the gate tests bite.
A Codex adversarial pass (`codex exec ... < /dev/null` — without the redirect
it blocks on stdin forever) found five real transcription errors, all fixed in
4a4ffd826; it confirmed every licence, the 16-member restricted set, all
service URLs and all `dynamicLayers` bytes are correct.
Next: Fletcher direct-Rumsey switch (spec §5) — sheets + URL normalisation are
portable and testable now; deleting the 311 MB root `Tiles/`, the Info.plist
`FLETCHER_TILE_BASE_URL` key and the pbxproj `XCLocalSwiftPackageReference`
need the app target. Then grouped layer UI. Hold promotion past nightly until
HTTPS hosting exists.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (6 commits ahead of nightly).
Next action: port normalizeFletcherTileBaseUrl + the 24 sheet bounds from
web/src/layers/fletcherLayer.ts into NSMarksCore with tests (ungated), then
wire the app target: delete root Tiles/, add FLETCHER_TILE_BASE_URL, migrate
TileStore on key "fletcher-direct-rumsey-20260726.1".
```

## 2026-08-13 — Fletcher direct-Rumsey switch: portable half landed, app half staged

Done: `b09e18919` (still zero Apple builds). Portable half in NSMarksCore:
`GeoBoundingBox` + `TileMath.geographicBounds`, `FletcherSheets` (24 sheet
bounds generated from the web fixture, never typed) and `FletcherTileURL`
(`normalizeBaseURL` with typed `BaseURLError`; refuses non-HTTPS, any
`oldmapsonline` host, and any query/fragment/userinfo). 125 package tests, 49
web tests, green in ~0.015 s. Codex verified all 96 decimal literals
digit-for-digit and found one vacuous test (`coversEverySheet` passed a
constant template) — fixed and mutation-confirmed.
App half is written and **uncommitted, never compiled**: pbxproj wires
NSMarksCore as an `XCLocalSwiftPackageReference` into app + unit-test targets
and drops every `Tiles` ref; root `Tiles/` `git rm`'d (3755 files, 311 MB —
a rights obligation, not a size win); `.fletcherSheets(baseURL:)` source;
`OpacityTileOverlay.fletcherSheetTile` (per-sheet cache keys, highest sheet
first); `FletcherSourceMigration` clears the tile cache once per revision.
Every touched file passes `swiftc -parse`; the gate has been HOLD all day
(swapFree ~440-840 MB against a 2048 MB warnMin).
Next: one gated `xcodebuild test` admission to validate the app half, then
commit it. Then grouped layer UI + status chips, a CI job for package tests,
and the app-local `LayerID` (10 cases) vs GeoCore `LayerID` (36) collision.
Hold promotion past nightly until HTTPS tile hosting exists.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (7 commits ahead of nightly, dirty).
Next action: poll /Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status
every ~5 min; when it admits, spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -project ns-marks-the-spot.xcodeproj
-scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 17'`
and fix what surfaces before committing the app half.
```

## 2026-08-13 — App half committed; both targets type-check clean without the gate

Done: two Codex adversarial reviews (13 + 7 findings, all dispositioned).
Real ones: `TileStore` kept OldMapsOnline tiles the cache sweep missed;
`MapViewState`'s cache identity ignored the revision so old tiles outlived the
switch; 404 (no such sheet) was conflated with 503 (transient), which poisoned
composites and permanently failed saved areas; `tileCount` scanned ~2.2 M tiles
on the main actor during a drag (now `countingLimit = 200_000`); three offline
test suites were fixtured on Halifax, which the new coverage filter makes an
empty plan — every assertion in them was `0 == 0`. Codex is not authoritative
on compilation: it web-searched Apple docs and cleared the `Task.detached`
capture in `FletcherSourceMigration`, and that exact line is what the build
then failed on (`UserDefaults` is not `Sendable` in this SDK).
One gate admission spent on `build-for-testing`; it failed on that one error.
Its DerivedData `.swiftmodule`s then made a **gate-free** loop possible:
`xcrun swiftc -typecheck` against the iphonesimulator SDK with the same six
flags the target uses (`-swift-version 6`, `-default-isolation=MainActor`,
`MemberImportVisibility`, `InferIsolatedConformances`,
`NonisolatedNonsendingByDefault`). App target (34 sources) and unit-test target
(17 sources, `-enable-testing` + the TestingMacros `-plugin-path`) both
type-check with **0 errors, 0 warnings**, in seconds, without touching the gate.
143 package tests + 18 web tests green.
Next: still one gated `xcodebuild test` run to prove runtime behaviour — type
checking is not execution. Then grouped layer UI + status chips, a CI job for
package tests, and the app-local `LayerID` (10 cases) vs GeoCore `LayerID` (36)
collision. Hold promotion past nightly until HTTPS tile hosting exists.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (clean, app half committed).
Next action: poll /Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status
every ~5 min; when it admits, spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -project ns-marks-the-spot.xcodeproj
-scheme ns-marks-the-spot -destination 'platform=iOS Simulator,name=iPhone 17'`
and read Swift Testing failures with
`xcrun xcresulttool get test-results tests --path <.xcresult>`.
```

## 2026-08-13 — shared catalog + Province licence gate committed

Done: `b60b2d53e` deletes the app-local `LayerCatalog`/`LayerDescriptor`
and reads `MapCatalog` directly; `NativeLayerTraits` keeps only the
MapKit-specific facts (install order = z-order, offline policy, basemap
capability). Restricted Province layers now sit behind an acceptance
sheet, gated *before* the tile cache, with `LicenceClearanceBox` carrying
the answer to MapKit's background queues and `withObservationTracking`
mirroring the store into it. Codex adversarial review returned 5
findings; all 5 fixed (the sharpest: `setBaseMapType(.nsAerial)`
bypassed the gate entirely). App + unit-test targets both type-check
clean gate-free; 143 package tests green.
Next: the gated `xcodebuild test` run — type checking is not execution.
Then Phase 1's last item, the grouped collapsible layer panel with the
web's status vocabulary from `web/src/components/LayerRows.tsx`
(Off / Ready to load / Loading visible area… / Ready · N loaded /
Zoom to N+ to load / Source temporarily unavailable), grouped by
`GeoCore.LayerGroupID`.
Still owed beyond Phase 1: a CI job for the package tests, and a
Province-licence revoke control **with a cache sweep beside it** —
`OpacityTileOverlay` documents that debt at its pre-cache gate.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (clean, pushed).
Next action: poll /Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status
every ~5 min; when admitted spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
(unit bundle only + no concurrency: the UI bundle hangs on debugger
attach and four clones exhaust memory). Read Swift Testing failures with
`xcrun xcresulttool get test-results tests --path <.xcresult>`.
```

## 2026-08-13 — Grouped layer panel with per-layer runtime status

Done: `9c03a4f6b`. Panel is now collapsible sections in catalog order
(headings from `NativeLayerTraits.title(for:)`, empty groups dropped),
each visible layer carries a status chip in the web's vocabulary, and
every row gained a "Source & scale" disclosure (source date, scale,
coverage, zoom range, official-source link) — the native app previously
showed none of that. Backed by `LayerLoadProgressBox`, which MapKit's
tile queues report into through `OpacityTileOverlay.loadTile`.
Codex adversarial review ran against the staged diff; five of its six
findings were applied, the sixth was the ordering defect already fixed:
- notifications carry only the layer id, panel re-reads the phase
- requests carry a generation, so a fetch in flight across a hide/show
  cannot settle the new cycle (`removeLayer` resets too)
- `TileLoadOutcome.cancelled` — MapKit's pan-away cancellations are no
  longer reported as "Source temporarily unavailable"
- revoking now hides refused layers as part of mirroring the clearance
- `OpacityTileOverlayProgressTests` drives the real `loadTile` against a
  stubbed session, so deleting the reporting fails the suite
Verified by gate-free `swiftc -typecheck` (app + tests) only. **No
Apple build or test run has executed against any of this work yet.**
Next: the gate has held all day (outside preferred windows). At 22:00
spend one admission on the unit bundle, and use the same run to settle
whether MapKit fetches tiles for hidden alpha-0 overlays — 6 → 21
installed layers may mean ~3.5x the tile traffic the app draws.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228 (clean, pushed).
Next action: poll /Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status
every ~5 min; when admitted spend ONE admission on
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
(unit bundle only + no concurrency: the UI bundle hangs on debugger
attach and four clones exhaust memory). Read Swift Testing failures with
`xcrun xcresulttool get test-results tests --path <.xcresult>`.
```

## 2026-08-13 — Phase 2 parcels: identify by tap and by PID
Done: `feat(ios): find a parcel by tapping the map or typing its PID`
(ee1545998) — ParcelShape/ParcelPolygon drawing in the web's colours,
ParcelSelection (dedupes on PID+geometry), ParcelLookupMessage (the
web's strings; only a successful empty collection may say "no parcel"),
identify tap gated on layer-visible + zoom ≥ nsprd minZoom, search bar.
Plus `test(ios): key network stubs per test, not per host` (6f0ca5b0c):
both parcel suites shared one host key and clobbered each other under
Swift Testing's parallelism — they take per-test channels now.
20 new app tests (ParcelSelectionTests 9, ParcelIdentifyTests 11+3
parameterised). Package tests 164/164 gate-free. **Still no Apple build
or test run against any of this.**
Next: same as the previous entry — one gate admission on the unit
bundle, and settle the hidden alpha-0 overlay tile-fetch question with
it. Civic-address search stays unported (said in words, not faked).
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: poll `/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status`
every ~5 min; on admission run ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Civic-address search, and the transport seam under it
Done: three commits. `refactor(core): move parcel fetchers into the
package behind a transport` (e1e478fae) — `HTTPTransport` is a Sendable
struct wrapping `(URLRequest) async throws -> (Data, URLResponse)`, so
fetchers live in NSMarksCore and their tests run gate-free.
`feat(core): look up civic addresses from the Province's open data`
(775c402dd) — CivicAddressQuery/Response/Fetcher, a port of the web's
`civicAddresses.ts`; Socrata `tntn-er5g`, Open Government Licence, no
clearance (the confinement test says why in words and now also checks
mechanically that anything reading a service address from the catalog
takes a clearance). `feat(app): search civic addresses from the parcel
field` (71edee8e9) — the field stops saying "not in the app yet";
`ParcelSearchInput.classify` reads PID vs address vs too-short in the
package. Then `fix(app): keep the search field and its lookups in step`
(474eb6fce) — seven defects Codex found: unidentified boundaries
reported as "no parcel", first-of-several presented as an
identification, stale results surviving a keystroke, an invalid
submission not cancelling the parcel lookup, isSearchingAddresses stuck
true, the chosen address replaced by its PID, an all-unreadable page
reported as no-such-address. Plus the OGL-NS attribution the licence
requires. Package tests 252/252 gate-free; app + test targets typecheck
via the scratchpad scripts (run them with **zsh**, not bash).
Next: unchanged and now overdue — one gate admission on the unit bundle.
Then Phase 3's inspector UI.
Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: poll `/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status`
every ~5 min; on admission run ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Phase 3 parcel inspector landed and reviewed

Done: the panel is built and reachable. `PlaceLinks` (Plus Code +
Google directions, ported from `googleMaps.ts`) and `ParcelRoads` (the
`MappedContextDetails` two-source merge) in the package (eced94ab2);
`ParcelInspection` + `ParcelInspectorView` + the `withTaskGroup` in
`refreshInspection`, presented as a bottom card in `MapContainerView`'s
`ZStack` — not a sheet, so the map stays visible under it (51d30335e).
Codex found seven more defects, all fixed in 0b900aa14: an unanswered
civic source credited in the road list's empty message; a licence
revocation that left the parcel, its panel and its NSTDB evidence on
screen; `plusCode` trapping on a finite-but-absurd coordinate;
`jsNumber` misformatting degrees near zero; the card covering the
layers button on a 667pt phone; two wordings drifted from the web.
Plus-Code and number expectations come from running the web under node.
New test fixture `HeldTransport` holds a reply until released, so the
stale-answer test arranges a genuine overlap. Package tests 265/265
gate-free; app + test targets typecheck (scripts need **zsh**).

Next: still one gate admission on the unit bundle — nothing in the app
target has ever been *run*. The gate has been BUSY/HOLD all day with
other people's builds. Then Phase 3's remaining evidence services
(PVSC assessments and dwellings, buildings, resource intersections,
zoning, flood hazard, well logs, mineral proximity, hydro potential,
old-growth policy, evidence note).

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: poll `/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh --status`
every ~5 min; on admission run ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — PVSC assessments and dwellings landed, review applied

Done: `e79e166de` PVSC assessment accounts (spatial match against the
parcel's rings, notice-AAN path built but unreachable until tax sales);
`611ce82b2` PVSC residential dwellings, asked only after an account
matches, plus six of seven findings from a Codex adversarial review —
unreadable-row counts on both PVSC results, a notice for a parcel only
partly drawn, `PolygonHitTest.containment` so an edge point is labelled
rather than claimed, ASCII-only AAN digits, the PVSC licence link, and
the 9e15 year cutoff explained. Package tests 310/310 gate-free; app and
test targets typecheck (scripts need **zsh**). Both pushed.

Next: the gate has still never run the app-target unit bundle — BUSY/HOLD
all day. Then the rest of Phase 3: buildings, resource intersections,
zoning, flood hazard, well logs, mineral proximity, hydro potential,
old-growth policy, evidence note. `CivicAddressFetcher` has the same
unreadable-row hole the PVSC fetchers just closed.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: continue Phase 3 with the NSTDB buildings layer in the
inspector panel; on gate admission spend it on ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Phase 3 evidence services complete

Done: `75ba0a887` NSTDB building counts; `989fc429a` resource and geology
intersections; `9b913f2fe` published river study areas plus the three
coastal scenarios, including a deliberate correction to the web — the
coastal bbox is now fitted to the integer pixel grid, because ArcGIS
silently widens a mismatched extent and `f=image` never says so, which
made every percentage off a tall parcel a measurement of the wrong
ground. Service Nova Scotia's permission, non-endorsement and warranty
notices now render with the coastal panel; they existed nowhere in the
native app before. Codex reviewed each landing. Package tests 355/355
gate-free; app and test targets typecheck (scripts need **zsh**).

Next: Phase 3's parcel-scoped evidence is done. `evidenceNote.ts` needs
share-state and belongs with Phase 5, and zoning / well logs / hydro
potential / old-growth / mineral proximity are viewport-scoped and belong
with Phase 6 — port `arcGISFeatureOverlay.ts` first as their shared
bounds-query seam. The gate has still never run the app-target unit
bundle.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: start Phase 6 by porting web/src/services/arcGISFeatureOverlay.ts
as the shared viewport bounds-query seam; on gate admission spend it on ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Phase 6 fetch services all ported

Done: shared viewport seam + six layers landed and pushed — zoning, well
logs, mineral occurrences/abandoned mines, old-growth policy, mineral
proximity (derived, gated on the derived layer first), and the bundled
Inverness hydro pilot (920 KB resource, strict decode). Catalog parity
now defers only legend/guidance fields. 422 package tests, gate-free;
app + test targets typecheck. Codex reviewed each landing; its two real
findings are fixed in f521c9e90 (old-growth fails closed on an
unreadable row; mineral proximity reports unreadable counts instead of
an empty result).

Next: nothing in Phase 6 is wired into the map renderer or layer panel
yet — that is the remaining work. The gate has still never run the
app-target unit bundle.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: wire the six Phase 6 layers into MapSurface + the layer panel
(viewport-driven refresh, licence gate, per-layer status); on gate admission
spend it on ONE `xcode-build-slot.sh -- xcodebuild test
-only-testing:ns-marks-the-spotTests -disable-concurrent-testing
-scheme ns-marks-the-spot -destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Phase 6 wired end to end

Done: viewport layers now draw, order against the rasters, and have panel
rows (860c3d3c8 + the wiring commit). Unreadable rows are counted rather
than dropped; degenerate geometry fails closed. Package suite 433 green;
both app targets typecheck (0 errors). The marker/overlay plane divergence
is documented in OverlayDrawOrder.swift.

Next: Codex adversarial review of the wiring, then Phase 4 (tax sales).
The gate has still never run the app-target unit bundle.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: start Phase 4 (tax sales); on gate admission spend it on ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests
-disable-concurrent-testing -scheme ns-marks-the-spot
-destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

## 2026-08-13 — Phase 6 closed; first app-target test run

Done: Codex review of the wiring found six issues; all fixed in fca2c47f3
(stale-request guard on both paths, surveyed-only wells, hydro is bundled
so no zoom gate and it counts watersheds, no opacity slider on queried
layers, empty geometry unreadable). Package 435 green. First-ever
app-target run on an iPhone 17 sim: ViewportFeaturePanelTests +
OverlayDrawOrderTests, 28 tests, TEST SUCCEEDED.

Next: Phase 4 (tax sales). The whole-bundle app test run still hangs —
task #12 — boot the sim and run focused suites until that is fixed.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-web-map-parity-2de228,
branch claude/ios-web-map-parity-2de228.
Next action: start Phase 4 (tax sales). To run app tests: xcrun simctl boot
24FBD923-387E-4B7E-9063-FCF166239B1C, then ONE
`xcode-build-slot.sh -- xcodebuild test -only-testing:ns-marks-the-spotTests/<Suite>
-scheme ns-marks-the-spot -destination 'id=24FBD923-387E-4B7E-9063-FCF166239B1C'`
```

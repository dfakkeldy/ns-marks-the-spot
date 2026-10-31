# NSMtS v1.1: streamlined UI, measured performance, hardened workflows

Date: 2026-10-30. Source: nightly `096c5be6b`. Every finding comes from reading the code and docs. Nothing was built, run or measured for this plan.

## 1. Summary

NS Marks The Spot is careful, well-commented code. The biggest risks are at the edges of user journeys, not in the core engines. The public 1.0 release is still on hold, and that hold is real: one rights question and a handful of broken or data-losing flows have to close before a public build. After that, v1.1 has three jobs: make the map screen simpler, make performance measurable, and harden the workflows people depend on in the field. The app has no `os_signpost` or `OSSignposter` anywhere and only one XCTest launch metric, so most performance questions cannot be answered from a trace today, and instrumentation comes first. Several performance problems share one cause: views and controllers rebuild everything when only one thing changed. On UI, the layer panel copies the web's full research catalog onto a phone, and the app's core feature (the Fletcher transparency slider) sits behind closed sections. Several docs disagree with the code and with each other, including the release packet and the older agent instructions' architecture rule. This plan splits the work into a 1.0 closeout (three workstreams) and then six 1.1 workstreams, each broken into reviewable PRs. Terms are defined in the glossary at the end.

## 2. Decision 1: what "v1.1" means while 1.0 is on hold

> **Correction (2026-10-31): 1.0 was submitted, and App Review rejected it.** The repository holds no record of this, so the status paragraph below is out of date. Apple's email shows submission `5804f9be-3976-46f8-bdb7-193233467383` (version 1.0 for iOS) was sent on 2026-10-18. On 2026-10-30 Apple reported "an issue with your submission". The email does not say which guideline was cited; that is only shown on the App Review page in App Store Connect, which this plan could not open. Until the reason is known, **R-0 (fix the App Review rejection) is the first `1.0-gate` item, ahead of S1.** Once Apple's message is copied in, R-0 is either mapped to an existing item or added as a new one. If Apple only needs metadata changes or more information, the fix may be a reply on the App Review page with no new build. One unrelated warning should not be mistaken for the reason: since build 93, uploads have carried ITMS-90863 (CLBackgroundActivitySession symbols that are missing on Apple-silicon Macs). That is a delivery warning about Mac availability, not a rejection.

**Release status, as last inspected in the packet (re-checked 2026-10-06).** This plan did not re-inspect App Store Connect or TestFlight. The release packet says "Hold public release", in part because "native/offline rights remain unresolved" (`docs/APP_STORE_RELEASE.md:10-14`). The latest internal TestFlight receipt is `1.0 (109)` from October 4 (`docs/APP_STORE_RELEASE.md:21`). The October 5 train compiled but skipped its upload because a UI test failed (`docs/APP_STORE_RELEASE.md:23`). Later CI on head `1153d59c` passed the native suite, all 18 UI tests and the package tests (`docs/APP_STORE_RELEASE.md:24`). The App Store Release workflow has never run (`docs/APP_STORE_RELEASE.md:25`). The packet also requires a device acceptance record for the selected build (`docs/APP_STORE_RELEASE.md:251-252`).

**Recommendation: two tracks, in this order.**

1. **1.0 closeout.** The code items tagged `1.0-gate` (crashes, data loss, App Review risk, broken core flows; most are size S), **plus** the packet's own remaining requirements, which this plan does not replace:
   - current native screenshots in the accepted App Store Connect categories (`docs/APP_STORE_RELEASE.md:160-179`);
   - one final archive's privacy report, signed entitlements and SDK check (`:244-252`);
   - a selected-build device acceptance record (`:251-252`; C-8 below);
   - the owner's App Store Connect answers and explicit submission authorization (`:254-258`).

   Ship on the current 1.0 marketing version. A blocking device case (C-8) must pass, or Dan must make an explicit scope decision about it. Filing an issue does not clear it.
2. **1.1.** Everything tagged `1.1`, delivered in the workstreams in section 5. Bump `MARKETING_VERSION` to 1.1 after 1.0 is submitted and before the first 1.1 upload (D-9).

Do not start 1.1 UI refactors of `MapContainerView` before 1.0 ships. The file is 3,656 lines, and churn there puts the closeout fixes at risk.

**Architecture rule correction.** The MapEngine/MapLayer facade named in older agent instructions was removed on purpose (`ARCHITECTURE.md:12-17`). The rule in force is that SwiftUI views other than the `MapSurfaceView` representable never import MapKit (`ARCHITECTURE.md:59-60`). Today some files break that rule and some are legitimate adapters the rule does not name (D-7 sorts them). The proposals here either move MapKit values out of views or ask for an explicit amendment to the rule; none adds a new MapKit import to a view. Slider changes must still not redraw the map.

## 3. Items

Tags: `1.0-gate`, `1.1`, `later`. Effort: S (under a day), M (a few days), L (a week or more).

### A. UI: simplify and streamline

**A-1. First-run surface: Layers reachable, usable rows first** · `1.1` · S–M
- **Problem.** The rail has 10 icon-only controls, or 11 with tax sales on. Layers is the last control and falls off a landscape phone. The only opacity slider is inside Layers. Historical Maps is the 8th of 10 sections and opens closed. In it, four dead Church rows sort above Fletcher. The app has no onboarding or tips.
- **Evidence.** `ns-marks-the-spot/Overlay/Views/MapContainerView.swift:1082-1088` (comment on rail overflow), `:1301-1325` (Layers last), `:77`. `ns-marks-the-spot/Overlay/Views/TransparencySliderView.swift:636,655`. `ns-marks-the-spot/Overlay/ViewModels/OverlayViewModel.swift:335-344` (rows sorted only by uiOrder), `:1775-1780` (opening section falls back to Background Maps). `NSMarksCore/Sources/MapCatalog/LayerCatalog.swift:801-831,886`.
- **Proposal.**
  - Move Layers to the top of the rail or into the fixed area.
  - Fold Save Area into the Offline Maps sheet.
  - Within each section, sort usable rows above unusable ones.
  - Open Historical Maps when Fletcher is visible and no setup matches.
  - Add one dismissible TipKit tip.
  - Keep the two Measure buttons, as the comment at `:1188-1191` argues.
  - Keep catalog `uiOrder` unchanged, because parity tests enforce it.
- **Acceptance.**
  - On an iPhone SE in landscape, Layers is visible without scrolling.
  - With tax sales on, the rail has 9 controls or fewer.
  - Fletcher is the first row of Historical Maps.
  - Nothing is clipped at AX5 text size.
  - `LayerCatalogParityTests` still pass.

**A-2. Layer panel diet: one licence banner, provenance on demand, unusable rows folded** · `1.1` · M
- **Problem.** On a fresh install, 8 of 36 catalogued rows can never be turned on: 4 Church and 4 locked zoning. Up to 16 more show a lock button each. Every row carries a 44 pt "Source & scale" disclosure, so one licence decision is spread over many controls.
- **Evidence.** `TransparencySliderView.swift:576-580` (caption and disclosure on every row), `:487` (minHeight 44), `:585-599` (lock button per row), `:601-616` (disabled toggle), `:675-690` ("No tiles produced yet"). `OverlayViewModel.swift:304-306` (summary repeats "Province licence required"), `:340` (Church rows injected). `docs/licensing-locks.md:8,14,16`. `NSMarksCore/Sources/MapCatalog/LayerCatalog.swift:567-643,851-877`.
- **Proposal.**
  - Show one banner while `needsDecision` is true, with a Review button that opens `ProvinceLicenceSheetView`.
  - Keep a lock glyph on locked rows, and make tapping the row open the sheet.
  - Replace each row's disclosure with a 44 pt info button that opens a detail sheet.
  - Fold the Church and municipal zoning rows into one summary row per group. Each summary opens a list with source links.
  - Keep the one-line caveat on every row. It is the catalog's own sentence.
  - Licence and attribution lines stay visible.
- **Acceptance.**
  - Exactly one Province licence control appears above the sections.
  - The panel shows no disabled toggles.
  - Each summary sheet lists all 4 ids with their URLs. This keeps the intent of the old "no county silently absent" test.
  - Every row's date, scale and coverage is reachable in at most one tap.
  - Content height with all sections open is recorded before and after.

**A-3. Merge duplicate controls and fix mis-filed layers** · `1.1` · M
- **Problem.** Some layers duplicate each other:
  - Two road rows query the same service, and both can be on at once.
  - Three coastal-flood rows stack at the same z-index.
  - NS Aerial is both a row and a base-map choice.
  - The map-setup header offers saving in two places.
  - "Watersheds" (id `.floodRisk`) is filed under hazards with a flood icon, even though its caveat says it is not flood mapping.
- **Evidence.** `LayerCatalog.swift:231-237,301-307,401-455`. `NSMarksCore/Sources/GeoCore/OverlayZIndex.swift:296-297`. `OverlayViewModel.swift:2602-2639`. `ns-marks-the-spot/Overlay/Views/MapThemePickerView.swift:25-142`. `ns-marks-the-spot/Overlay/Views/MapThemeManagerSheet.swift:32-49`. `NSMarksCore/Sources/MapCatalog/LayerCategory.swift:126-128`. `web/src/layers/layerCategories.ts:70`.
- **Proposal.**
  - Keep every `LayerID`.
  - One Roads row with an All / Main choice.
  - One Coastal flooding row with a scenario choice.
  - NS Aerial only in the base-map menu. Its licence gate in `setBaseMapType` stays.
  - One save path for map setups.
  - Move Watersheds to Water & Terrain on native, on web and in the parity fixture together.
- **Acceptance.**
  - Unit tests show that at most one road id and one coastal id are visible after any sequence of toggles.
  - Picking NS Aerial on a fresh install still opens the licence sheet.
  - One view calls `saveCurrentSetup`.
  - The regenerated parity fixture passes.

**A-4. Parcel inspector: facts lead** · `1.1` · M
- **Problem.** Ten sections are always expanded inside a card capped at `min(360, 45%)` of the screen. Seventeen caveat paragraphs push the facts down. Share and Export sit at the end of the scroll, and the header shows only the PID. The web inspector already solved this in commit `6317cb29a`.
- **Evidence.** `MapContainerView.swift:568`. `ns-marks-the-spot/Overlay/Views/ParcelInspectorView.swift:43-66,78-99,426-436,547,791-849`. `web/src/components/ParcelInspector.tsx:159-172,460-465`.
- **Proposal.**
  - Port `EvidenceCaveat` as a native disclosure. Move only the multi-sentence interpretation behind it. Keep one-line caveats, sources and licence links visible.
  - Lead the header with the address, limited to 2 lines, and show the PID as a subtitle.
  - Pin Share and Export in the title bar.
  - Make sections collapsible with a status summary.
  - Leave the exported note text unchanged.
- **Acceptance.**
  - On an iPhone SE, the assessed-value row and the flood heading are reachable within 2 swipes.
  - The Share and Export buttons are reachable without scrolling at AX XXXL.
  - Evidence-note tests are unchanged.

**A-5. One owner for sheets and bottom cards** · `1.1` · M
- **Problem.** The root view has four sibling `.sheet` modifiers, even though `AppRoute` promises "a single sheet at a time". Five bottom cards are kept exclusive by about 21 scattered clear-the-others calls. A PID search during measuring or editing opens a parcel card on top of the active panel. The top notices use fixed 60/116 pt offsets, so at large text sizes they can land on the search field.
- **Evidence.** `ns-marks-the-spot/App/AppRoute.swift:4-7`. `MapContainerView.swift:191,232,235,266` (sibling sheets), `:330-342` (search bar stays live), `:546` (parcel card gate), `:3184-3193` (edit start leaves the inspection open), `:489,511,536` (fixed notice offsets). `ns-marks-the-spot/MapSurface/MapController.swift:1660-1663` (a `BottomCard` enum already exists).
- **Proposal.**
  - Fold the share, save-track and bulk-placement sheets into `SheetRoute` with explicit priority.
  - Add a small card arbiter keyed on `BottomCard`.
  - Measure the search card's height and derive one top inset from it.
  - Cheap stopgap: gate the parcel card on `measure == nil && editSession == nil`, and clear the inspection when editing begins.
- **Acceptance.**
  - `MapContainerView.swift` has exactly one `.sheet(`.
  - A Swift Testing matrix of cards against triggers shows at most one active card at a time.
  - At AX XXXL on an SE, the notice and HUD frames do not overlap the search field.

**A-6. Show locks up front on secondary surfaces** · `1.1` · M
- **Problem.**
  - With the current locks, the export sheet offers a Research summary, an appendix and an aerial toggle that can only end in refusal.
  - The Export menu for an NSPRD-traced vector layer lists every format, and each one then fails.
  - Map Info is one long scroll of equal-weight cards.
  - The search bar draws its own material instead of the shared glass surface.
- **Evidence.** `ns-marks-the-spot/Print/PrintExportSheet.swift:170-202,236-247,250-349`. `ns-marks-the-spot/Overlay/ViewModels/OverlayViewModel+PrintQueries.swift:64-67,88`. `ns-marks-the-spot/UserVectors/UserVectorRowsView.swift:50-61,428-446`. `ns-marks-the-spot/Overlay/Views/InfoSheetView.swift:18,22-31,262-276`. `ns-marks-the-spot/Overlay/Views/ParcelSearchBar.swift:109-123,177-179,197-199,240-242`.
- **Proposal.**
  - Hide controls whose outcome the locks already decide, reading `LayerUse` directly.
  - Show one disabled "Export locked" item for traced layers.
  - Split Map Info into About and grouped Sources, with "Drawn now" first.
  - Put the search bar on `mapChromeSurface` and give its clear button a 44 pt target.
- **Acceptance.**
  - With locks held, the sheet shows no Research summary and no aerial toggle.
  - A traced row exposes no format actions.
  - `source-licence-fletcher` still works.
  - There are no `regularMaterial` hits in `ParcelSearchBar.swift`.

**A-7. Your own content: reachable entry, georeferencer controls, rename** · `1.1` · M
- **Problem.**
  - Draw and Import exist only inside My Maps, the closed 10th section.
  - The georeferencer's controls panel has no height limit and squeezes the two panes on phones.
  - The importer says a map's name is the user's to change, but no rename exists.
  - `GeoreferenceView` (1,031 lines, 28 `@State`) imports MapKit and keeps its own draft store.
- **Evidence.** `TransparencySliderView.swift:180-182,268-319`. `ns-marks-the-spot/UserMaps/GeoreferenceView.swift:3,40,81,173-180,785-932`. `ns-marks-the-spot/UserMaps/UserMapImporter.swift:40-41`. `ns-marks-the-spot/UserMaps/UserMapRowsView.swift:193-206`. `ns-marks-the-spot/UserMaps/UserMapsViewModel.swift:103-108`.
- **Proposal.**
  - Add "New Drawing" and "Import File…" to the existing More menu, with no new rail circle.
  - Collapse the georeferencer tools behind one disclosure.
  - Add Rename.
  - Extract a `GeoreferenceViewModel` with one injected draft store.
  - Move the stored `MKCoordinateRegion` (`GeoreferenceView.swift:40`) onto a GeoCore value type, converted to MapKit only inside the representable, so the view no longer imports MapKit. An allow-list entry is not a substitute.
- **Acceptance.**
  - From a cold launch, an edit session opens in 2 taps or fewer and the panel never opens.
  - On an SE, each pane keeps at least 30% of the sheet height.
  - Rename survives a reload.
  - Draft-lifecycle unit tests run on an injected temporary directory.

**A-8. Single undo/redo for vector editing** · `1.1` · M
- **Problem.** There are three separate undo mechanisms. Vertex drags, feature moves and attribute edits cannot be undone at all. The delete alert says "cannot be undone", yet an eraser delete can be undone.
- **Evidence.** `ns-marks-the-spot/UserVectors/VectorEditSession.swift:587-620,706,764-785,1064-1068,1349-1361`. `ns-marks-the-spot/UserVectors/VectorEditPanel.swift:196-256,382-387,500-512`.
- **Proposal.** Keep a bounded history of `ParsedVector` snapshots, pushed in `commit(_:)`. Push one entry per drag, at drag end. Show one Undo/Redo pair. Make the alert text agree with the eraser, for 1.0 if it is cheap.
- **Acceptance.**
  - Undo and redo restore the exact earlier state for move, attribute, delete, erase and convert.
  - Undo goes through the persist path.
  - The history is capped at 50 entries.

**A-9. iPad regular-width layout** · `1.1` · M
- **Problem.** The target ships on iPad, and the review copy calls it an iPad app. Yet no view reads a size class. The panel is fixed at 300 pt and the cards at 420 pt.
- **Evidence.** `ns-marks-the-spot.xcodeproj/project.pbxproj:548` (`TARGETED_DEVICE_FAMILY = "1,2"`). `docs/APP_STORE_RELEASE.md:141,173`. `MapContainerView.swift:373-388,530,568,1007`.
- **Proposal.** One layout decision driven by `horizontalSizeClass`. In regular width, show the panel as a sidebar or inspector column. Leave the compact layout unchanged. See open question 3 for 1.0.
- **Acceptance.**
  - On a 13-inch iPad, opening Layers leaves search usable.
  - Phone layouts are unchanged.
  - CI includes an iPad UI test destination.

**A-10. Web: split the 6,309-line `App()`** · `1.1` · L
- **Problem.** One component holds 88 `useState` calls and 30 effects. Every web-side UI item lands in it.
- **Evidence.** `web/src/App.tsx:1142` (`App()` runs to the end of the file), `:618-881`, `:1252`. `web/src/railMemoization.test.tsx`.
- **Proposal.** Extract a LicenceProvider, a print/export hook, a tax-sale hook and a share-URL hook. Leave a thin shell. Pair with B-12. Split into one PR per extracted hook.
- **Acceptance.**
  - `App.tsx` is under 2,000 lines.
  - Existing vitest and Playwright tests pass.
  - Profiler commit counts are recorded before and after.

### B. Performance (measure first)

Rule for this section: no item claims a gain. Every expected improvement below is a hypothesis. Each item lands its signposts and baseline first. The fix lands only if the baseline meets the "Fix if" threshold in the measurement table, and the PR then reports the measured change against the target. Where an item says "Release on device", the fallback is a Release build on a simulator, marked as such.

**B-1. Instrumentation foundation** · `1.1` · S
- **Problem.** No signposts exist anywhere. The only native performance test is the launch metric (B-11), and the earlier warp spike's timings were one-off measurements. So there is no diagnostic coverage of map updates, tile loading or printing.
- **Evidence.** A repo-wide grep for `signpost` finds no matches. `ns-marks-the-spotUITests/ns_marks_the_spotUITests.swift:100-102` (launch metric). Instrumentation sites: `MapController.swift:289-305` (`apply` / `perform`), `:2078-2099` (per-frame region callback). `ns-marks-the-spot/MapSurface/OpacityTileOverlay.swift:77` (`loadTile`). The same entry point exists in `AtlasBaseOverlay.swift`, `OSMBaseOverlay.swift:158` and `BlankBaseOverlay.swift:39`.
- **Proposal.**
  - Add one `OSSignposter` per category (MapSurface, Tiles, UI, Launch, Print, Georeference), subsystem `com.danfakkeldy.nsmarksthespot` (`project.pbxproj:540`).
  - Add intervals around `apply`, each `perform` case, and every `loadTile`.
  - Add a checked-in Instruments recipe.
- **Acceptance.** A Release trace shows named intervals for every overlay class, and the recipe doc exists.

**B-2. Injectable transport for the Atlas and OSM tile paths, with tests** · `1.1` · S–M
- **Problem.** The default ground's tile path calls `URLSession.shared` directly. The crop arithmetic, the 404-to-ocean memo and validation have no tests.
- **Evidence.** `ns-marks-the-spot/MapSurface/AtlasBaseOverlay.swift:76-77,96,120,223-241`. `ns-marks-the-spot/MapSurface/OSMBaseOverlay.swift:66-67`. `ns-marks-the-spot/Services/TileFetcher.swift:59`. `ns-marks-the-spotTests/MapSurface/AtlasBaseMapTests.swift:110-116`.
- **Proposal.**
  - Thread a `URLSession` parameter, defaulting to `.shared`, through the static functions.
  - Reuse `Fixtures/StubURLProtocol.session(channel:)`.
  - Fix the memo keys first. Both static memos leave out the host: missing tiles are keyed `style/z/x/y` and ocean tiles `style/z` (`AtlasBaseOverlay.swift:91-93,116-122`), so a unique base URL per test would not isolate them. Key by full source identity (host, revision, style), or make the memo owned by the overlay instance and inject it.
- **Acceptance.**
  - Quadrant colour tests run at min, min+1 and z23.
  - A second ask for a 404 address makes no request.
  - Two hosts asked for identical coordinates, one returning 404 and one 200, get different answers.
  - Changing the crop mask by one level fails a test.

**B-3. Scope what the map screen observes** · `1.1` · S, then M
- **Problem.** These all re-run the 3,656-line container body:
  - Every opacity tick, integer zoom change and tile-phase change, because `rows` is read for the attribution strip.
  - Every GPS fix, because `recording` is observed.
  - Every pan frame while a drawing tool is armed, because of `reticleCoordinate` and an inline `snapHit`.
  - The map itself does not redraw, because `updateUIView` is empty.
- **Evidence.**
  - `OverlayViewModel.swift:153-199` (`rows` reads `controller.layers`, `zoomLevel` and `layerLoadPhases`).
  - `MapContainerView.swift:779` (strip), `:1735` (`liveSegments` onChange), `:578-589,619` (reticle and snap).
  - `ns-marks-the-spot/FieldCapture/TrackRecorder.swift:81,180-181,567-568`.
  - `MapController.swift:225-226` (phase writes), `:1688-1728` (reticle).
  - `ns-marks-the-spot/MapSurface/MapSurfaceView.swift:96-97`.
  - Precedent fix: `MapContainerView.swift:3627-3646` (compass leaf view).
- **Proposal.**
  - Give the attribution strip its own subview, reading visibility only.
  - Store recorder `status` and `isActive` as their own properties that change only on transitions.
  - Create a `ReticleLayer` leaf view.
  - Later, and only if the baseline misses: per-row phase observation and caching `rows`.
- **Acceptance.** See the measurement table: B-3a, B-3b, B-3c.

**B-4. Diff features, markers, parcels and vector layers by id** · `1.1` · M
- **Problem.** Any change to one viewport layer tears down and rebuilds every feature overlay and marker, including the 1,213 hydro reaches. Markers visibly blink. Every parcel tap rebuilds every parcel polygon. Only user vectors have an incremental path today.
- **Evidence.** `ns-marks-the-spot/Overlay/ViewModels/ViewportFeatureViewModel.swift:783-809`. `ns-marks-the-spot/MapSurface/MapStateDiff.swift:82-88,116-118`. `MapController.swift:350-366,418-428`, and `:744-799` (existing incremental pattern). `ns-marks-the-spot/MapSurface/FeatureShape.swift:13,61`.
- **Precondition: stable identity.** Feature ids are built from the position in each response, e.g. `"\(id.rawValue)#\(index)"` (`ViewportFeatureViewModel.swift:453-455,571-573,616-618`). After a pan, the same id can name a different feature, so diffing by today's ids would keep the wrong geometry. First carry the source's own identifier (ArcGIS `OBJECTID` or the dataset key), namespaced by layer. Treat a changed geometry or callout under the same id as a replace, never a keep.
- **Proposal.**
  - Emit per-id add, remove and restyle mutations from the pure `MapStateDiff`.
  - Do markers first, then shapes, keeping draw order through `installInDrawOrder`.
  - Replace one vector layer per answer.
  - Skip publishing a result identical to what is installed.
  - Mark `shapesByLayer` and `markersByLayer` `@ObservationIgnored`.
- **Acceptance.**
  - In `MapStateDiffTests`, an identical republish emits no mutations.
  - When 90 of 100 markers are kept, the diff emits 10 removals and 10 additions.
  - A reordered response, and two overlapping viewports, never leave one feature's geometry or evidence attached to another feature's id.
  - Measurement table: B-4.

**B-5. Reuse viewport results and stop status flicker** · `1.1` · M
- **Problem.** Every settle re-queries every visible layer. Status writes are unguarded and reset "Ready" to "Loading" on every pan.
- **Evidence.** `ViewportFeatureViewModel.swift:297-345` (unguarded writes at `:305,309,322,328,338`). `MapContainerView.swift:1530`. `NSMarksCore/Sources/NSDataServices/FeatureOverlayFetcher.swift:49-77`. `ARCHITECTURE.md:328-331` (the web's margin cache).
- **Proposal.**
  - Guard status writes first; this is size S.
  - Then add a per-layer cache: 10% margin, same integer zoom, 60 s.
  - Consult it only after the rights check.
  - Never cache locked ids (`docs/licensing-locks.md:8,14`).
- **Acceptance.** Measurement table B-5. Locked ids have zero cache entries.

**B-6. Cut wasted tile CPU and network** · `1.1` · S each
- **Problem.**
  - Every Fletcher tile pays a full RGBA decode whose result `loadTile` throws away.
  - Each 1024 px Atlas parent is fetched, decoded and PNG re-encoded up to four times, once per sibling.
- **Evidence.** `OpacityTileOverlay.swift:97,166-168,184-185,193-194,369-387`. `AtlasBaseOverlay.swift:60-61,96,137,223-241`.
- **Proposal.**
  - Compute the substance lazily, only in `exportTile`.
  - Add an in-flight map so concurrent siblings share one parent fetch and one decode.
  - Keep the existing overzoom arithmetic: it cuts a variable number of levels, not just four quadrants, and the overlay serves up to z23 (`AtlasBaseOverlay.swift:226-236,297`).
  - Siblings that arrive after the parent's request has finished are a separate question: they need a small bounded cache of decoded parents or crops, sized and measured on its own.
- **Acceptance.**
  - Measurement table B-6.
  - The print and saved-area tests (`SavedAreaRenderingTests.swift:146,170,246,285`) stay green.

**B-7. Dedicated URLSessions: timeouts, retry, sized cache** · `1.1` · S–M
- **Problem.** Everything uses `URLSession.shared` with default timeouts and no retry. `URLCache.shared` is never sized, yet it is the only cache for the OSM and Atlas basemaps.
- **Evidence.** `NSMarksCore/Sources/NSDataServices/HTTPTransport.swift:26-30`. `TileFetcher.swift:59`. `OSMBaseOverlay.swift:53-58,67`. `OverlayViewModel.swift:2394-2400`. A grep for `timeoutInterval` or `URLSessionConfiguration` finds none.
- **Proposal.**
  - Size `URLCache` once at launch. Proposed starting values: 32 MB memory, 256 MB disk.
  - Give the data services a session with a 20 s per-request and 60 s per-resource timeout.
  - Proposed overall deadline per operation, retry included: 45 s (two 20 s attempts plus jitter).
  - The PR confirms or changes these three values and records them in code as named constants. The tests use those constants, not hard-coded numbers.
  - Inject sessions through every measured path, including Atlas and OSM, which call `URLSession.shared` directly today (`AtlasBaseOverlay.swift:96,120`, `OSMBaseOverlay.swift:67`).
  - Add one jittered retry on 429, 502, 503 and 504. The timeout applies per attempt; the whole operation, retry included, has its own stated deadline.
  - Keep the licence-revocation contract: revoking still clears every cache that can hold restricted responses (`OverlayViewModel.swift:2394-2400`), including any new session's cache.
  - Defer the separate restricted cache.
- **Acceptance.**
  - A stub that never responds fails within the overall deadline plus 2 s, on the data-service path and on the Atlas path, including when the first attempt fails and the retry also hangs.
  - Cancelling an operation mid-retry stops it without starting another attempt.
  - A 503 then 200 succeeds after exactly one retry.
  - After revocation, no new session's cache holds a restricted response.
  - Measurement table B-7.

**B-8. Take disk and PhotoKit work off the launch path** · `1.1` · S
- **Problem.** `PhotoMapViewModel` is an `@State` default value. Its init creates a directory, reads and decodes `index.json`, and checks PhotoKit access synchronously, on every scene reconnect.
- **Evidence.** `MapContainerView.swift:20-22`. `ns-marks-the-spot/FieldCapture/PhotoMapViewModel.swift:119-125,678-683`. `ns-marks-the-spot/App/NSMarksTheSpotApp.swift:8-25`.
- **Proposal.** Make the three user view models lazy properties on `AppContainer`, and load the snapshot off the main actor. Signpost the launch path, but keep the orphan Live Activity sweep synchronous, as `AppContainer.swift:113-117` requires.
- **Acceptance.** The init runs once per process, asserted in a unit test. Measurement table B-8.

**B-9. Offline download throughput and TileStore reads** · `1.1` · M
- **Problem.**
  - Downloads are strictly serial.
  - A resume rewrites every stored PNG just to record which area owns it.
  - Tile reads queue on the same actor as `summary()`, which walks up to 100k JSON records.
- **Evidence.** `ns-marks-the-spot/Offline/Services/TileDownloadManager.swift:49-99,59-73`. `ns-marks-the-spot/Offline/Services/TileStore.swift:124-126,153-201,203-233`. `ns-marks-the-spot/Offline/ViewModels/OfflineAreasViewModel.swift:312-324`.
- **Proposal.**
  - Add a membership-only fast path first.
  - Then a bounded task group, starting at 4 concurrent tasks (raise to 6 only if the B-9 trace shows it helps). C-13's offline bound depends on this number.
  - Make the tile read `nonisolated`.
  - Keep running byte totals so `summary()` is cheap.
  - Defer SQLite.
- **Acceptance.** Measurement table B-9. Existing `TileDownloadManagerTests` pass.

**B-10. Smaller native wins** · `1.1` · S each
- **User-map mesh.** `UserMapRecord.mesh` is computed and re-solves the spline on every panel redraw (`NSMarksCore/Sources/GeoCore/Georeference/UserMapRecord.swift:60-89,115`). Cache the placement state on `Row`.
- **User-map drapes.** A visibility toggle re-warps every user-map drape (`MapController.swift:368-375`, `MapStateDiff.swift:49-61`). Diff them by record id.
- **Print memory.** The print compositor allocates a full-frame white `UIImage` (`ns-marks-the-spot/Print/PrintMapCompositor.swift:219-220,797-806`). Fill the context instead.
- **Warped user maps.** Draw them from a mip matched to the zoom level. This was the spike 3 recommendation (`docs/spikes/ios-port-spike-3-tps-warp-cost.md:110-122`). It is mainly an image-quality fix, and the renderer itself calls it "a second change with its own measurement" (`UserMapOverlay.swift:254-259`). It ranks last.
- **Acceptance.** Measurement table B-10.

**B-11. Native performance regression lane** · `1.1` · M
- **Problem.** The only performance test is the launch metric, and it has no `.xcbaseline`, so it can never fail.
- **Evidence.** `ns-marks-the-spotUITests/ns_marks_the_spotUITests.swift:86-103`. A search for `*.xcbaseline` finds none.
- **Proposal.**
  - Add a scheduled, not per-PR, lane with committed baselines.
  - Cover TPS solve at n=50, `MapStateDiff` over 2,000 polygons, `TileStore.summary` over 100k records, and print compose memory.
- **Acceptance.** A deliberate 2x slowdown in `ThinPlateSpline.solve` fails the lane.

**B-12. Web: camera state out of `App`, `MapCanvas` memoised** · `1.1` · M
- **Problem.** Each pan re-renders the whole `App` and the unmemoised 3,197-line `MapCanvas` several times.
- **Evidence.** `web/src/App.tsx:1618-1636,5671-5690,5777-5781`. `web/src/components/MapCanvas.tsx:1145-1191,1877`.
- **Proposal.** Keep viewport and centre in a small external store. Wrap `MapCanvas` in `memo` with stable props.
- **Acceptance.** Measurement table B-12.

**B-13. Web: historical tax-sale JSON off the boot path, plus a bundle budget** · `1.1` · S
- **Problem.** A 249 KB JSON file is parsed and validated at module load on the boot path. Nothing checks bundle size.
- **Evidence.** `web/src/data/historicalTaxSales.ts:1,3,270-341`. Eager imports: `web/src/services/mapShareState.ts:6` and `web/src/App.tsx:96-100`. `web/vite.config.ts:86-90` (several entry points, so shared chunks matter). `web/src/data/invernessHydroPotential.ts:64` shows the dynamic-import pattern.
- **Proposal.** Keep a tiny static events index. Remove every eager import of the records and load them dynamically. Add a CI budget on the whole set of JavaScript each entry page loads before first render, measured from the build's real compressed output.
- **Acceptance.** Measurement table B-13.

**Measurement table.** Baselines are TBD and must be recorded in each PR first. "Fix if" is the threshold that justifies the fix; "Target" is the improvement the fix is then measured against.

| ID | Metric | Fixture | Tool | Baseline | Fix if | Target |
|---|---|---|---|---|---|---|
| B-1 | Named intervals present for `apply`, each `perform`, each `loadTile` | 10 s pan and zoom over Cape Breton, z12–15, Fletcher plus one raster | Instruments Points of Interest and Time Profiler, Release | none (no signposts) | always (instrumentation only) | every interval visible |
| B-3a | `MapContainerView` body evaluations during a 5 s opacity drag | Fletcher, NSPRD and NS Aerial visible, z15, panel open | SwiftUI instrument plus body signpost, Release on device | TBD | any body evaluation caused by `layerLoadPhases` or zoom, or any dropped frame during the drag | ≥90% fewer; 0 caused by `layerLoadPhases` |
| B-3b | Container body evaluations per GPS fix; p95 root body cost | GPX replay at 1 Hz, 400-mark layer, no edit session | SwiftUI instrument plus os_signpost | TBD | more than 1 body evaluation per fix, or p95 over 4 ms | ≤0.1 per fix; p95 under 4 ms |
| B-3c | Container body evaluations per second while armed; `snapHit` p95 | 200-feature drawing layer, Point tool, 5 s swipe | SwiftUI instrument plus `snapHit` signpost | TBD | more than 2 evaluations per second, or `snapHit` p95 over 1 ms | ≤2 per second; under 1 ms |
| B-4 | Renderer allocations per settle; p95 main-thread time per settle and per parcel tap; hydro removals per pan | Seeded stub responses: wells, HRM zoning (open-licensed), parcels and the hydro reaches layer switched on, z13–15 | Time Profiler, Allocations, Hangs | TBD | p95 over 8 ms per settle or over 4 ms per parcel tap, or any hydro removal on a pan that keeps the reaches in view | allocations within 10% of real enter/leave; under 8 ms and under 4 ms; 0 hydro removals |
| B-5 | Requests per layer for small back-and-forth pans that stay inside one cached extent; then one 60% pan | `nsWellLogs` plus a road tier, z14 (no locked layers); 10 pans of ±5% width alternating direction | Counting URLProtocol stub; Network instrument | TBD | any request for a pan that stays inside the cached extent | 0 while inside the cached extent; 1 per layer each time the view leaves it |
| B-6 | CPU per memory-cache-hit Fletcher tile; requests per Atlas parent URL (non-404) | Warm-cache Judique to Port Hood pan, z13; cold Atlas open, then pinch to z5 | Time Profiler plus signposts; counting stub | TBD | discarded decode work over 10% of `tile(at:)` CPU, or more than 1 request per parent among concurrent siblings | CPU down ≥50% inside `tile(at:)`; exactly 1 request per parent among concurrent siblings |
| B-7 | Time to fail with a dead host; second-pass bytes over a scripted loop | Never-responding stub; Halifax to Truro to Halifax, z12–14, Atlas, cleared caches | Unit test; Network instrument | 60 s per request; TBD | always (correctness: an unbounded wait) | under the overall deadline plus 2 s on both the data-service and Atlas paths; second pass ≤10% of the first |
| B-8 | `PhotoMapViewModel` init count and duration; time to first frame | 10k-entry `index.json`, 5 cold launches plus 3 foreground cycles | App Launch template plus Launch signposts | TBD | more than 1 init per process, or over 1 ms on main | 1 init per process, under 1 ms on main; no regression |
| B-9 | Cold download wall time at 50 ms latency; bytes written on a full resume; `savedTile` p95 during a download | Mock tile server (12 KB PNG), Baddeck sample, z10–15 | os_signpost, File Activity, Hangs | TBD | wall time at or above 80% of tiles × latency (the downloads are effectively serial), any PNG rewritten on resume, or `savedTile` p95 over 5 ms | ≥3x faster; 0 PNG bytes; under 5 ms |
| B-10 | Spline solves during an opacity drag; renderer inits per toggle; print peak footprint at 300 dpi | 3 spline maps of 40, 100 and 300 points; 3 drapes plus a 4th; stub tiles | SwiftUI instrument; signpost counter; Allocations | TBD | any spline solve during the drag, more than 1 renderer init per toggle, or a full-frame image allocated only to fill white | 0 solves; 1 init; −19 MB |
| B-11 | Baselined XCTest metrics with stddev ≤10% | Pinned simulator and Xcode, Release with testability | Scheduled xcodebuild lane | none | always (the lane is the deliverable) | lane fails on an injected 2x regression |
| B-12 | `App` commits per settled pan; scripting ms per pan | Playwright: 10 pans, z14, Baddeck, 4x CPU throttle, 390x844 | Chrome Performance plus React Profiler, production build | TBD | more than 1 `App` commit per settled pan, or any long task over 50 ms | ≤1 commit; no long task over 50 ms |
| B-13 | Compressed size of all JavaScript each entry page loads before first render; TBT | `vite build`; Lighthouse mobile, median of 5 | `manifest.json` import graph plus Lighthouse | TBD | always (a known eager load on the boot path) | the records chunk is absent from every entry's initial set; TBT no worse |

### C. Workflow: user journeys

**C-1. "Delete Layer Cache" silently wipes saved offline areas** · `1.0-gate` · S
- **Problem.** The storage screen merges saved-area bytes and viewed-cache bytes into rows that both read "Fletcher". Deleting the plain row deletes every saved Fletcher area. The confirmation only mentions cached tiles.
- **Evidence.** `OfflineAreasViewModel.swift:253-263,455-469,488-522`. `TileStore.swift:257-265`. `ns-marks-the-spot/Offline/Views/OfflineStorageView.swift:59-84,205-214`. `TileDownloadManager.swift:22`.
- **Proposal.** Layer rows report and delete only viewed-cache bytes. Saved areas stay deletable per area only. Keep "Delete Cached Tiles" as the single global wipe.
- **Acceptance.** A test seeds a complete saved area plus viewed tiles and deletes every layer row. The area stays `.complete` with bytes present, and only one "Fletcher" row shows.

**C-2. Unsaved walk moved aside if Record is tapped before the restore offer appears** · `1.0-gate` · S
- **Problem.** The restore offer waits for both libraries to load, but Record is live in that window. Tapping it calls `checkpoint.begin`, which renames the unsaved walk to `recording-kept-*`. Nothing ever offers that file again.
- **Evidence.**
  - `MapContainerView.swift:1673-1686` (restore runs after both loads), `:1186` (Record disabled only by save-area selection or an active recorder), `:1960` (silent return).
  - `TrackRecorder.swift:273-275`.
  - `ns-marks-the-spot/FieldCapture/TrackCheckpointStore.swift:95-97,156-178`.
  - `SharedActivity/TrackActivityIntents.swift:28,40` (only Pause and Resume intents exist).
- **Proposal.**
  - Disable Record, or make `start()` refuse, until the restore decision is resolved.
  - Fix the misleading comment that blames a Lock Screen intent.
  - In 1.1, add a "Recovered recordings" list for kept files.
- **Acceptance.** A test taps Record before the libraries finish loading. The earlier walk is still offered by id, and no kept file is created.

**C-3. Lock Screen Resume may show "Recording" while no fixes arrive** · `1.0-gate` (if reproduced) · S
- **Problem (a risk, not yet reproduced).** `pause()` ends the background session on purpose, and `resume()` restarts location updates from an intent while the phone is locked. The code's own comments say location updates started in the background do not start. No device run has confirmed the failure.
- **Evidence.** `TrackRecorder.swift:290-317` (no scene check in `resume()`), `:476-478` (why pause ends the session: the location indicator), `:516-525`. `AppContainer.swift:160-175`. `ns-marks-the-spot/FieldCapture/LocationFixSource.swift:199-212`. The test `ns-marks-the-spotTests/UserVectors/TrackRecorderSeamTests.swift:289-312` requires the session to end on pause and restart on resume.
- **Proposal.**
  1. Reproduce first, on a device with a development build: pause and resume from the Lock Screen during a pocket walk (the same steps as C-8 case (c)).
  2. If it fails, choose one fix and change its tests, indicator expectations and docs in the same PR: either make Resume foreground-only ("Open the app to resume"), or keep the session for the whole walk, which means rewriting the seam test above and accepting the indicator during pauses.
  3. If it passes, record the run and downgrade this item.
- **Acceptance.**
  - A dated device record of the reproduction attempt.
  - If fixed: the GPX has fixes after the resume timestamp, and the seam tests describe the chosen behaviour.

**C-4. Approximate Location silently breaks Mark and Record** · `1.0-gate` · S–M
- **Problem.** With Precise Location off, fixes are km-accurate. Mark tells the user to "try again outdoors", which cannot help. A recording keeps 0 points. Neither path reads `accuracyAuthorization`.
- **Evidence.** `MapController.swift:1092,1193` (only the map's locate button handles it). `NSMarksCore/Sources/GeoCore/Capture/CaptureSpec.swift:49,54`. `ns-marks-the-spot/FieldCapture/MarkLocation.swift:79-80,188`. `NSMarksCore/Sources/GeoCore/Capture/TrackRecording.swift:199`. A grep for `requestTemporaryFullAccuracy` finds none.
- **Proposal.**
  - First add the seam this needs. `MarkLocation` owns and calls `CLLocationManager` directly (`MarkLocation.swift:140,205-225`), and `LocationFixSource` exposes neither accuracy authorization nor a temporary-full-accuracy request (`ns-marks-the-spot/FieldCapture/LocationFixSource.swift:19-50`). Add both to `LocationFixSource`, plus the one-shot request `MarkLocation` needs, and inject it. (This takes over D-5's location-seam bullet.)
  - When Mark or Record is tapped, call `requestTemporaryFullAccuracy` with a new purpose string.
  - If the user declines, show a specific message with the existing Settings button.
  - Remind Dan that the privacy notes need the new purpose string.
- **Acceptance.** With a stub source reporting reduced accuracy, Mark returns the new outcome (no "outdoors" wording) and the HUD shows the reduced-accuracy status.

**C-5. Province licence sheet only exists inside the Layers panel** · `1.0-gate` · S
- **Problem.** The only licence-sheet presenter is attached to the Layers panel, and that panel is closed during editing. Turning on parcel snapping shows "Accept the Province licence" with nowhere to accept. A pasted shared link hits the same dead end. The sheet then pops up unasked the next time Layers opens.
- **Evidence.** `TransparencySliderView.swift:149-159` (the only presenter). `MapContainerView.swift:387-389,1327,1769-1773,1785-1789,2395-2401,3190-3192`. `OverlayViewModel.swift:1623-1641,2232,2350-2354`.
- **Why it gates 1.0.** Licence-gated snapping and shared links are advertised flows with no way to complete them. That is a broken core flow, unless those entry points are removed for 1.0.
- **Proposal.** Present the sheet once at the root, as a `SheetRoute` case or a root `.sheet` bound to `isShowingLicenceSheet`. Accept and decline stay in the view model.
- **Acceptance.**
  - A UI test turns on NSPRD snap during editing, and the sheet appears within 2 s with Layers closed.
  - Decline turns the toggle off.
  - Exactly one presenter exists.
  - `MapChromeUITests.swift:249-268` still passes.

**C-6. Share from the PDF preview asks a busy presenter for a second sheet** · `1.0-gate` (conditional on a simulator repro) · S
- **Problem.** The export sheet stays up on purpose. The preview's Share sets the root's `share`, a sibling sheet on the same presenter, so the share sheet most likely never appears. No UI test touches print.
- **Evidence.** `MapContainerView.swift:191,217-229,232-234`. `PrintExportSheet.swift:382-386`. `ns-marks-the-spot/Print/PrintExportPreview.swift:95-98`. No print identifiers appear in `ns-marks-the-spotUITests`.
- **Proposal.** Reproduce it on a simulator first. If it reproduces, present `ShareSheet` from inside the export sheet, after the preview has dismissed. If it does not, downgrade to a 1.1 test item.
- **Acceptance.** A UI test runs Export, then print-preview-share, and asserts the activity view appears within 5 s.

**C-7. PDF export refused only after framing and filling the sheet** · split: `1.0-gate` part S–M, `1.1` part M
- **Problem.** The export entry is always enabled. With a parcel open, parcels held, or Fletcher or a restricted layer visible, the export fails with "Export locked" only after the user has framed the page and tapped Export. The research summary path can never succeed.
- **Evidence.** `MapContainerView.swift:1261-1269`. `PrintExportSheet.swift:100,141-148,397-403,461`. `OverlayViewModel+PrintQueries.swift:64-67,217,250`. `ns-marks-the-spot/Print/PrintExport.swift:240`. `PrintMapCompositor.swift:161-164`. `NSMarksCore/Sources/MapCatalog/LayerUse.swift:7,25-38`.
- **What is safe today.** The refusal is already enforced at export time (`PrintExport.swift:240`, `PrintMapCompositor.swift:164`). Nothing leaks. The problem is a flow that always ends in refusal.
- **1.0 part (S–M).** Fix the flows an App Reviewer is most likely to hit:
  - Hide the Research summary option, which under the current locks can never succeed, **and** change the sheet's starting selection. Today it opens on `.researchSummary` whenever a parcel is framed (`PrintExportSheet.swift:100`), so hiding the picker entry alone would leave it selected.
  - With a parcel inspection open, the Field sheet is refused too: the open inspection counts as property-source content (`OverlayViewModel+PrintQueries.swift:250`, `PrintExport.swift:240`). Disable the Export entry in that state, with the reason ("Close the parcel to export"), before the user frames anything.
- **1.1 part (M).**
  - Add one pure `reproductionLock(...)` function that reuses the `LayerUse` checks, so the preflight and the enforcement cannot drift apart.
  - Evaluate it when the menu opens, and disable the item with the reason.
  - Treat an open parcel as a lock for every sheet kind.
- **Acceptance.**
  - 1.0: with the current locks, the export sheet offers no Research summary, and opening it after framing a parcel starts on the Field sheet.
  - 1.0: with a parcel open, the Export entry is disabled and shows its reason.
  - 1.0: with only permitted content visible (OSM plus user vectors), a Field sheet exports successfully end to end.
  - 1.1: unit tests return non-nil for an open inspection, held parcels, Fletcher and NS Aerial, and nil for OSM plus user vectors.
  - `retainedParcelGeometryCannotBypassReproductionPermission` still passes.

**C-8. Device acceptance protocol for the selected build** · `1.0-gate` · M
- **Problem.** Off-screen recording, jetsam recovery, the Lock Screen Live Activity and offline areas have never run on hardware. The App Review notes promise all of them.
- **Evidence.** `TrackRecorder.swift:471-482`. `docs/field-capture-design.md:54-61`. `docs/handoffs/HANDOFF-ios-track-checkpoint.md:55-56`. `docs/handoffs/HANDOFF-field-review-follow-ups.md:796-798`. `fastlane/metadata/review_information/notes.txt:9,11`. `docs/APP_STORE_RELEASE.md:251-252`.
- **Proposal.** Write a dated checklist under `docs/real-world-testing/` and add it to the packet's device record. Cases that block release:
  - (a) A 15–20 minute locked pocket walk.
  - (b) A kill and relaunch, with restore and the orphan Live Activity ending.
  - (c) Lock Screen Pause and Resume.
  - (d) A saved Fletcher area in airplane mode.
  - Run Low Power Mode and Live Activities-off in the same session.
  - Note which kill method was used.
  - Move the redundancy A/B test to 1.1.
- **Acceptance.**
  - The record names the build, device and iOS version, with pass or fail for each case.
  - Every blocking case (a)–(d) passes, or Dan records an explicit scope decision for it (for example, removing that feature from 1.0). An issue alone does not clear a failure.
  - `ROADMAP.md` item 6 is retired.
- **Order.** C-8 runs on the selected build after S1 and S2 merge. It is the final acceptance. Diagnosis runs that come earlier (C-3's reproduction) use a development build and do not count as C-8.

**C-9. Default Atlas ground fails with no status or fallback** · `1.0-gate` · S–M
- **Problem.** On hosted builds the Atlas replaces Apple's map. When its tiles fail, the user sees an empty grid with no message. A code comment and the handoff both claim the panel reports a failed ground, but nothing implements that.
- **Evidence.** `ns-marks-the-spot/MapSurface/MapViewState.swift:32,116-117`. `AtlasBaseOverlay.swift:113-115,299-309,319-328`. `MapController.swift:603-611` (contrast `:314-322`). `docs/handoffs/HANDOFF-atlas-raster-publication.md:41-42`.
- **Proposal.**
  - Give the Atlas and OSM overlays a `LayerLoadProgressBox`, using the begin/finish pattern at `OpacityTileOverlay.swift:95-103`.
  - Show "Ground unavailable" with a one-tap switch to OpenStreetMap or None, through the view model.
  - Correct the false comment and handoff text.
  - In 1.1, route Atlas quadrants through TileCache and consider including the Atlas in saved areas, after a licence check.
- **Acceptance.**
  - In airplane mode, a visible status appears within 5 s and the switch works.
  - A stub-transport test drives `.failing`, then `.ready`.

**C-10. Past tax sales shown as current notices** · `1.0-gate` · S
- **Problem.** Halifax's sale of 2026-09-15 is hard-coded `.upcoming` in Swift, while the web marks it historical and iOS bundles its results. Inverness (Aug 11) and Annapolis (Aug 31) are past their dates. The map still colours all three as listed, and they are switched on by default.
- **Evidence.** `NSMarksCore/Sources/NSDataServices/TaxSaleSnapshots.swift:50,192,350,381`. `web/src/data/halifaxTaxSale.ts:117`. `ns-marks-the-spot/TaxSale/ViewModels/TaxSaleViewModel.swift:30,55-57,85-93`. `NSMarksCore/Sources/NSDataServices/TaxSaleCatalog.swift:75-82`. `NSMarksCore/Sources/NSDataServices/TaxSaleEvent.swift:280-284`. `NSMarksCore/Tests/NSDataServicesTests/TaxSaleCatalogTests.swift:156`.
- **Proposal.**
  - Set Halifax to `.historical`.
  - Drive the default selection, `highlightedPIDs` and `listingContext` from `lifecycle(now:) == .upcoming`, with `now` injected.
  - In 1.1, split the notices list into Upcoming and Past.
- **Acceptance.** An injected clock at 2026-10-30 highlights only Victoria's PIDs. Halifax has no listing context.

**C-11. Layer-delete message is false for recorded tracks and photo layers** · `1.0-gate` · S
- **Problem.** Every non-drawn layer gets "Your original file is untouched." Deleting a recorded track removes its raw GPX in the same call, and deleting a photo layer removes the app's photo copies.
- **Evidence.** `ns-marks-the-spot/UserVectors/UserVectorRowsView.swift:173-195`. `ns-marks-the-spot/UserVectors/UserVectorStore.swift:449-461,468-486`. `ns-marks-the-spot/UserVectors/UserVectorsViewModel.swift:553-562,660-669`.
- **Proposal.** Write one pure message function in GeoCore, keyed on source: drawn, recorded (names the raw recording), photos (names the count). Fix the stale comment at `UserVectorStore.swift:457-458`.
- **Acceptance.** A table test shows no "untouched" in the recorded or photos messages.

**C-12. Retry for parcel evidence and for failed tiles** · `1.1` · S
- **Problem.**
  - Parcel evidence: a source that fails on weak signal stays "unavailable", and the only recovery is re-tapping the parcel, which nobody would guess.
  - Tiles: holes stay after the network comes back. A manual "Retry tiles" button exists, but it disappears once the next cycle clears the failure state, even though the holes remain.
- **Evidence.** `ns-marks-the-spot/Overlay/ViewModels/ParcelEvidencePanel.swift:89-92,127-175`. `ParcelInspectorView.swift:375-379,917-918,1012-1013`. `MapContainerView.swift:296-308`. `TransparencySliderView.swift:555-571`. `ns-marks-the-spot/MapSurface/LayerLoadProgress.swift:110-117,146-153`. No `reloadData` or `NWPathMonitor` exists.
- **Proposal.**
  - Add a "Retry unavailable sources" action that does a full rebuild.
  - For tiles, check on a device first. If holes persist, keep a per-layer had-failures flag and call `reloadData()`, debounced, when a request succeeds again.
- **Acceptance.**
  - A stub test fails, then succeeds, and triggers exactly one reload.
  - After the retry, the evidence sources show as loaded.
  - Export stays locked regardless: property-record reproduction is prohibited outright (`NSMarksCore/Sources/MapCatalog/LayerUse.swift:7`, applied in `OverlayViewModel+PrintQueries.swift:64-67`). Source readiness and reproduction permission are tested separately.

**C-13. Offline download: preflight, stop on disk-full or no signal, background time** · `1.1` · M
- **Problem.**
  - Nothing compares the estimate with free space.
  - A full disk or no signal still attempts every tile.
  - Locking the phone suspends the download.
  - A Fletcher revision bump silently empties saved areas, which then read "Estimating".
  - Saving an area does not start its download.
- **Evidence.** `TileDownloadManager.swift:94-97`. `OfflineAreasViewModel.swift:185-195,376-391,411-429`. `ns-marks-the-spot/Offline/Views/SaveAreaDraftView.swift:36-52,96-118,142-150`. `ns-marks-the-spot/Services/FletcherSourceMigration.swift:19-27,77-80`.
- **Proposal.**
  - Free-space preflight.
  - Stop on out-of-space errors. Pause after k consecutive network errors; propose k = 3.
  - Wrap the run in `beginBackgroundTask`. This only buys a short grace period, not an unlimited background download. Its expiration handler stops new requests and saves progress, so the download resumes on the next launch.
  - Add a "Needs re-download" state with a one-time notice.
  - A live estimate and a "Save & Download" button.
  - Drop the Baddeck sample entry.
- **Acceptance.** Written to hold with B-9's concurrent downloads:
  - After a stubbed out-of-space error is observed, no new tile request starts. Requests already in flight number at most the concurrency limit.
  - Offline from the start, at most k + c − 1 tile requests start in total, where c is the download concurrency. With k = 3 and B-9's starting value c = 4, that is 6.
  - A forced background expiration leaves the area resumable with its progress recorded.
  - A migration-emptied area shows as needing re-download.

**C-14. Ways out of failed saves** · `1.1` · M
- **Problem.**
  - A failed track save traps the user in an undismissable sheet whose only exits are Save and Discard.
  - A failed vector flush on Done leaves the user stuck in edit mode.
  - Removing an imported map destroys the hand placement with no export offered.
- **Evidence.** `MapContainerView.swift:235-253,627-641,1990-1999,3173-3180`. `ns-marks-the-spot/FieldCapture/SaveTrackSheet.swift:183-212`. `VectorEditSession.swift:184-236,1403-1424`. `UserMapRowsView.swift:126-142`. `ns-marks-the-spot/UserMaps/UserMapStore.swift:130-134,198-203`.
- **Proposal.**
  - Track save: add "Share raw GPX", and "Keep for later" only together with a reachable place to find kept walks. Keeping the checkpoint alone is not enough: starting another recording moves it aside (`TrackCheckpointStore.swift:95-97,176-182`), and restore is read only at launch (`App/AppContainer.swift:29-31`), so the walk would sit on disk where no one can reach it. Either ship the "Recovered recordings" list from C-2 with this escape, or block a new recording until the kept walk is saved or discarded.
  - Vector edit: add "Share unsaved copy" and "Leave without saving" on the session.
  - User maps: add "Export placement…" to the row menu, and honest Remove copy.
- **Acceptance.**
  - With an injected write failure, both escapes work.
  - The checkpoint survives "Keep for later", then a second recording, then a relaunch, and is still offered.
  - The placement export produces `.georef.json`.

**C-15. Open GPX, KML, KMZ, GeoJSON, GeoTIFF and GeoPDF from Files, Mail and AirDrop** · `1.1` · M
- **Problem.** No document types are declared, and `onOpenURL` only restores share links. The file importer drops `.failure` silently.
- **Evidence.** `Config/NSMarksTheSpot-Info.plist:1-38`. `MapContainerView.swift:310-315`. `TransparencySliderView.swift:285-302`. `ns-marks-the-spot/UserMaps/UserFileImport.swift:38,69-88,130-135`.
- **Proposal.**
  - Declare imported UTIs and document types (Viewer, Alternate rank), and copy files in.
  - Route file URLs to `UserFileImport.load`.
  - Show a notice on failure.
  - Depends on B-8, so the stores are reachable on a cold launch.
- **Acceptance.** `simctl openurl` with a fixture .gpx and a GeoTIFF adds rows on both cold and warm launch. Share links still restore.

**C-16. Honour `exceededTransferLimit` in the viewport and mineral pagers** · `1.1` (promote to `1.0-gate` if any service's `maxRecordCount` is under 2,000) · S
- **Problem.** The pagers stop on a short page and never read ArcGIS's transfer-limit flag, so a capped service looks complete. The web pager and the native parcel path both honour it.
- **Evidence.** `FeatureOverlayFetcher.swift:71`. `NSMarksCore/Sources/NSDataServices/FeatureOverlayQuery.swift:136`. `NSMarksCore/Sources/NSDataServices/FeatureOverlayResponse.swift:83-84`. `NSMarksCore/Sources/NSDataServices/MineralProximityOverlay.swift:102,267`. `NSMarksCore/Sources/NSDataServices/ParcelResponse.swift:307-308`. `web/src/services/arcGISFeatureOverlay.ts:126-135`.
- **Proposal.**
  - Decode the flag in both places it can appear.
  - Keep paging while it is set.
  - Advance the offset by rows actually received.
  - Throw on a limited page with no rows.
  - Check each endpoint's `maxRecordCount` first; it is a single GET.
- **Acceptance.** A mirror of `arcGISFeatureOverlay.test.ts:78` passes for both fetchers.

**C-17. Smaller field and data fixes** · `1.1` · S each
- **Messages.** Give viewport failures specific wording: "zoom in" for too many features (`ViewportFeatureViewModel.swift:688-692`, `ns-marks-the-spot/Services/ParcelLookupMessage.swift:365-369`).
- **Tax-sale loads.** NSPRD tax-sale loads should keep the batches that succeeded and offer a Retry (`NSMarksCore/Sources/NSDataServices/ParcelFetcher.swift:70-80`, `OverlayViewModel.swift:883-885`, `ns-marks-the-spot/TaxSale/Views/TaxSaleNoticesView.swift:40-45`).
- **Duplicate requests.** Stop the historical load re-requesting PIDs the advertised load already has in flight (`OverlayViewModel.swift:914-925,1022-1023`).
- **Socrata pagers.** Cap the two pagers that have no page limit (`NSMarksCore/Sources/NSDataServices/CivicAddressFetcher.swift:132`, `NSMarksCore/Sources/NSDataServices/PVSCAssessmentFetcher.swift:120`).
- **GeoTIFF import: measure before capping.** The active path already asks ImageIO for a bounded thumbnail and never builds the full bitmap (`ns-marks-the-spot/UserMaps/UserMapImporter.swift:314-324`). The spike measured a 108-megapixel raster with no overviews at +2.9 MB (`docs/spikes/ios-port-spike-1-geotiff-tags.md:69-83`), and the fallback decoder samples as it reads (`NSMarksCore/Sources/GeoCore/Georeference/TiffRaster.swift:39-45,81-85`). Do not add a blanket pixel cap. Find a specific format that fails first, keep large streaming imports working, and correct the stale full-grid warnings (`NSMarksCore/Sources/GeoCore/Georeference/UserMapImport.swift:95-103,146-148`).
- **Georeferencing.** Seed "Place on map" for a self-placed GeoTIFF from its existing placement, and confirm before replacing it (`UserMapRowsView.swift:145-156`, `UserMapsViewModel.swift:719-740`).
- **Lock Screen Stop.** Add a Stop action on the Lock Screen now that checkpoints exist, and fix the stale comment (`SharedActivity/TrackActivityIntents.swift:5-14`, `docs/field-capture-design.md:97-101`). Depends on C-2.
- **GeoPDF: correctness first, then compatibility.** Native reading accepts `ScaleFactor == 0` as EPSG:3857 (`NSMarksCore/Sources/GeoCore/Georeference/PdfMapRegistration.swift:479-485`), and a test enshrines it (`NSMarksCore/Tests/GeoCoreTests/PdfMapRegistrationTests.swift:375-388`). The web writer explains why zero is invalid and why spherical and ellipsoidal Mercator differ (`web/src/print/pdf/geoRegistration.ts:98-122`). First reject invalid registrations, check the datum numerically, and replace that test. Then, as a separate change, accept ScaleFactor 1 with a sphere datum and merge duplicate candidates (`PdfMapRegistration.swift:728-736`).
- **Acceptance.** Each change comes with the unit test named in its source finding.

### D. Workflow: CI, release, tests, docs

**D-1. Fail-closed guard on the App Store release workflow** · `1.0-gate` · S–M
- **Problem.** The workflow has two entry points and neither checks where its source came from:
  - Any `v*` tag on any commit runs the App Store release, with no check that it is on main, that it matches the version, or that the PR gate passed.
  - Manual dispatch (`workflow_dispatch`, with a `force` input) builds whatever SHA is checked out, and the delivery script does not require main ancestry.
- **Evidence.** `.github/workflows/app-store-release.yml:3-13,41-44,122-132`. `.github/scripts/release_delivery.py:115-117,216-237`.
- **Proposal.** One Ubuntu guard job that every macOS job depends on, with rules for both entry points:
  - Tag push: the tag is an ancestor of `origin/main`, the tag equals `v` + `MARKETING_VERSION`, and "Build gate + tests" succeeded on that SHA.
  - Manual dispatch: the checked-out SHA is on `origin/main` and passed the same gate. `force` may rebuild unchanged inputs but never skips these checks.
- **Acceptance.**
  - A tag on a non-main commit, a mismatched tag, and a manual run from a non-main branch each fail in the guard job, before any macOS runner starts.

**D-9. Single-source the marketing version** · `1.1` · S
- **Problem.** `MARKETING_VERSION = 1.0` is hard-coded in 8 configurations, and nothing bumps it. Once 1.0 is approved, App Store Connect normally refuses further 1.0 uploads (Apple's documented behaviour; not verified here). This does not block the first 1.0 upload, but it must land before the first 1.1 upload.
- **Evidence.** `project.pbxproj:539,579,601,624,645,665,694,724`. `fastlane/Fastfile:345-350,402-407`.
- **Proposal.** Set the version from one xcconfig or one lane, with a test that the app and extension versions match. Document "bump nightly to 1.1 after 1.0 is submitted".
- **Acceptance.** One command changes the version everywhere, and the version-match test passes.

**D-2. Reconcile the release packet with the settled Fletcher rights scope** · `1.0-gate` · S
- **Problem.** The docs are not in real conflict, but the release packet has not caught up:
  - `docs/licensing-locks.md:32` records that the owner-reviewed Rumsey reply covers free native iPhone use, offline bundling and public derived tiles **for the matching 1884 Cape Breton set**, and says not to reopen that scope. Reproduction stays a separate lock.
  - `docs/FLETCHER_GEOREFERENCING.md:79-84` excludes native offline bundling *unless separately supported*. The lock entry is that support.
  - The packet, last re-checked 2026-10-06, still lists native/offline rights as unresolved.
  
  What remains is a factual check: does every sheet the app serves and saves offline belong to that 1884 Cape Breton set? The shipping offline feature is Fletcher-only (`TileDownloadManager.swift:22`).
- **Evidence.** `docs/licensing-locks.md:10,32`. `docs/FLETCHER_GEOREFERENCING.md:61-66,79-84`. `docs/APP_STORE_RELEASE.md:10-14,126,213-221`. `NSMarksCore/Sources/MapCatalog/FletcherSheets.swift`.
- **Proposal.**
  - Match the source identifiers of the current mosaic's sheets against the set the lock names.
  - If they match, close the packet item with a citation to the lock entry, and have the georeferencing doc link to it.
  - Escalate to Dan only on an actual mismatch. The mosaic is one precomposited pyramid (`ARCHITECTURE.md:106-110`), and each downloaded PNG already holds every sheet that touches it (`TileDownloadManager.swift:140-144`). So one sheet cannot be removed by filtering an index or a build flag, especially where sheets overlap. A mismatch means a source-level decision: hold the Fletcher layer, or build and separately authorize a cleared mosaic. Either decision covers viewing, saved areas and already-cached tiles together, because the settled scope covers native viewing too (`licensing-locks.md:32`).
  - Private correspondence stays out of the repo. The reproduction lock is unchanged.
- **Acceptance.**
  - The packet's rights item is closed with a citation to `licensing-locks.md:32`, or stays open naming the specific sheets outside scope.
  - `grep 'offline bundling' docs/*.md` returns one statement plus links.

**D-3. Release jobs: timeouts, failure evidence, metadata lint** · `1.1` (cheap; pull into the 1.0 closeout if time allows) · S
- **Problem.**
  - Only `go-claude` sets a timeout, so a hung bundle can hold the shared release-trains queue for 6 hours.
  - The release jobs keep no `.xcresult` on failure.
  - `lint_metadata` runs nowhere automated.
- **Evidence.** `.github/workflows/go-claude.yml:19`. `.github/workflows/release-trains.yml:50-53,171-175,248-259`. `.github/workflows/app-store-release.yml:23-26,61-68,122-133`. `Scripts/gated-focused-tests.sh:4-9`. `fastlane/Fastfile:227-297,394-436`. `fastlane/metadata/review_information` has no phone file.
- **Proposal.**
  - Add `timeout-minutes` to every macOS job.
  - Copy CI's `-resultBundlePath` and its upload-on-failure step.
  - Fix the lint rule before wiring it in. It rejects every occurrence of "navigation" (`fastlane/Fastfile:285-294`), so it would fail on the description's own required disclaimer, "Not for navigation or emergency use" (`fastlane/metadata/en-US/description.txt:11`). Allow that disclaimer (or match only claims such as "navigation app"), keep the disclaimer, and test the rule against the real metadata.
  - Then call `lint_metadata` at the top of the release lane, and add the `APP_REVIEW_CONTACT_PHONE` secret to that step.
  - Optional: an Ubuntu `release_config` CI job with a placeholder phone.
- **Acceptance.**
  - Every job has a timeout.
  - A forced failure uploads an xcresult.
  - The release lane aborts before `match` on bad metadata, and passes on the current metadata, disclaimer included.

**D-4. Hermetic UI tests; stabilise the two flaky ones** · `1.1` · M
- **Problem.**
  - UITestMode isolates only 3 of about 8 stores, and the default ground loads from live hosts.
  - The measuring test blocked the October 5 train.
  - The sources-sheet test is reported in maintainer notes to fail on hosted CI and then pass on rerun. This plan has no run receipt for it, so treat it as an investigation: find the failing run first.
  - The native jobs run unit and UI tests in one call.
- **Evidence.** `ns-marks-the-spot/App/AppContainer.swift:92-99,139-150,196-200`. `ns-marks-the-spotUITests/OfflineFlowUITests.swift:33-35`. `docs/APP_STORE_RELEASE.md:23,28-31`. `ns-marks-the-spotUITests/MapChromeUITests.swift:96-109,195-201`. `.github/workflows/ci.yml:275-286`.
- **Proposal.**
  - Give each store a per-run temporary root.
  - Add a fixture URLProtocol that fails any request to an unregistered host.
  - Diagnose the failing condition in the sources-sheet test before adding any retry. A retrying helper for opening the More menu is acceptable only if the menu itself is shown to work, because retries can hide a broken interaction.
  - Split unit and UI test steps.
  - Keep the badge-tap assertion; the packet says to preserve it.
- **Acceptance.**
  - No unregistered host is hit during a UI run.
  - The scroll workaround comment is removed.
  - Every retry shows in the job summary.

**D-5. Test-infrastructure cleanup** · `1.1` · S each
- **Global stubs.** Port the two remaining global URLProtocol stubs to channel keys and drop `.serialized` (`ns-marks-the-spotTests/ns_marks_the_spotTests.swift:238-244,497-506`, `ns-marks-the-spotTests/Offline/FletcherTileLoaderTests.swift:18,203`).
- **Fixed sleeps.** Replace fixed-tick sleep loops with `settles()` (`ns-marks-the-spotTests/Fixtures/Settling.swift:7-44`).
- **Location seam.** Done in C-4. D-5 only checks that no direct `CLLocationManager` use is left in `MarkLocation` (`MarkLocation.swift:140,198-230`).
- **Python suites.** Run the unrun suites (Atlas builder, crown-grant, doc automation) and classify `tools/` as tooling (`.github/workflows/ci.yml:64-75`, `.github/scripts/classify_ci_changes.py:35-37,74-75`).
- **Delivery jobs.** Run `swift test` in the delivery jobs, and add an unsigned Release compile before fastlane (`.github/workflows/release-trains.yml:222-259`, `fastlane/Fastfile:343-356`).
- **Acceptance.**
  - No test file registers a global `URLProtocol`, and no suite needs `.serialized` for stubs.
  - No fixed-duration sleep loop remains in the unit tests.
  - A `MarkLocation` test runs with a stub location source and no CoreLocation prompt.
  - CI runs the three Python suites on changes to `tools/`.
  - Each delivery job runs `swift test` and an unsigned Release compile before fastlane starts.

**D-6. Supply-chain and bot workflows** · `1.1` · S
- **Problem.**
  - Jobs that hold signing secrets run floating action tags, and no Dependabot config exists.
  - `devlog-update.yml` opens PRs into main, which the ladder forbids, using `GITHUB_TOKEN`, so CI never starts on them. Its page was retired on October 28, yet it still spends `OPENAI_API_KEY`.
- **Evidence.** `.github/workflows/release-trains.yml:194,263,287-312,356-380`. `fastlane/Fastfile:309`. `.github/workflows/go-claude.yml:35,40,45` (SHA pins). `.github/workflows/devlog-update.yml:3-11,58-61,99-106`. `.github/workflows/ci.yml:47-58`. `.github/workflows/tax-sale-watch.yml:3-4,29`. `docs/plans/plan.md:102`.
- **Proposal.**
  - Pin every `uses:` to a full SHA and add a Dependabot config.
  - Delete `devlog-update.yml`.
  - Mint the App token for `tax-sale-watch`.
  - Correct `plan.md:102` to say the watcher runs manually.
- **Acceptance.** No `uses:` line lacks a 40-character SHA. `devlog-update.yml` no longer exists.

**D-7. Docs truth: one release checklist, one backlog, one architecture rule** · `1.1` · S
- **Problem.**
  - Four "Status as of July 1" docs contradict the packet. One recommends a guessed export-compliance answer.
  - Six files outside `MapSurface/` import MapKit, and they are not all the same kind:
    - View violation: `GeoreferenceView` stores an `MKCoordinateRegion` (`:40`).
    - Unused import: `UserMapRowsView`.
    - Representables (legitimate adapters): `MapScaleBar` (`:15`) and `UserMaps/GeoreferenceMapPane.swift` (`:41`).
    - Non-view helpers (legitimate, but unnamed by the rule): `PrintMapCompositor`, a rendering struct (`:19`), and `GeoreferenceReferenceServices`, a service type with an environment value (`GeoreferenceReferences.swift:56,195-199`).
  - `CLAUDE.md` is only `@AGENTS.md`, and `AGENTS.md` has no native guidance. Its issue-closure rule conflicts with the owner's.
  - `plan.md` still schedules work behind the retired facade.
  - The root README pins a stale Fletcher revision and research-control count.
- **Evidence.**
  - `docs/APP_STORE_NEXT_STEPS.md:3,25,31,53`. `docs/APP_STORE_RELEASE.md:206-209`. `docs/ROADMAP.md:3,20-23`. `docs/BRANCH_CLEANUP.md:3-8`. `docs/MARKETING_PLAN.md:3`.
  - `ARCHITECTURE.md:59-60,128-130`.
  - `ns-marks-the-spot/UserMaps/GeoreferenceView.swift:3`, `ns-marks-the-spot/UserMaps/UserMapRowsView.swift:2`, `ns-marks-the-spot/UserMaps/GeoreferenceReferences.swift:4`, `ns-marks-the-spot/Print/PrintMapCompositor.swift:3`, `ns-marks-the-spot/Overlay/Views/MapScaleBar.swift:1`.
  - `CLAUDE.md:1`. `AGENTS.md:11-19,74-76`.
  - `docs/plans/plan.md:7,13,46`.
  - `README.md:45,98` against `NSMarksCore/Sources/MapCatalog/FletcherSheets.swift:33` and `web/README.md:389`.
- **Proposal.**
  - Archive the July docs with a banner pointing to the packet.
  - Fold the IPv6 check into the packet.
  - Turn `ROADMAP.md` into the single native backlog (1.0 gates link to the packet; 1.1 lists open items only). Replace only `plan.md`'s "Deferred For v1.1" section with a pointer. Its other unchecked items (web print acceptance, Fletcher corridor and tile publication, data layers, zoning, geotiff.js, fishing, turbines, Point Tupper) are web, data and site workstreams with their own dates and cross-repository dependencies; they stay in `plan.md` unless each gets a destination (see section 4).
  - Amend the MapKit rule to name the two legitimate kinds of file (representables and non-view helpers). Fix the one view violation by moving its MapKit value to GeoCore (A-7). Then add a CI check that only the named files import MapKit.
  - Remove the unused import in `UserMapRowsView`.
  - Add a native section to `AGENTS.md` and align its closure rule.
  - Fix the README facts and drop the pinned counts.
  - Delete finished handoffs after moving their open lines (see the section 4 table).
- **Acceptance.**
  - `Status as of July 1` appears only under `docs/archive/`.
  - The MapKit check matches only the files the amended rule names, and no SwiftUI view other than representables.
  - Every unchecked `plan.md` item still exists somewhere, with its date.
  - The README shows `fletcher-seams-20261009.2`.

**D-8. App Store metadata-only lane** · `1.1` · M
- **Problem.** Metadata and screenshots are excluded from the build fingerprint. After a build is delivered, a text fix re-tags to "unchanged" and uploads nothing.
- **Evidence.** `.github/scripts/release_delivery.py:43-46,194-201`. `fastlane/Fastfile:415-433`. `docs/APP_STORE_RELEASE.md:101`.
- **Proposal.** Add a `metadata` lane (`skip_binary_upload: true`, with `lint_metadata` first) and a separate receipt.
- **Acceptance.** A description edit uploads metadata only, with no xcodebuild step.

## 4. Prior backlog reconciliation

| Prior item | Decision | Reason |
|---|---|---|
| ROADMAP "Remaining v1.0 Work" (`docs/ROADMAP.md:18-29`) | Retire | Superseded by `APP_STORE_RELEASE.md`. Item 6 (device field check) is absorbed into C-8. |
| ROADMAP and plan.md: NS Aerial / restricted-layer bulk offline | Retire to later | The locks give viewing clearance only (`licensing-locks.md:9,16`). |
| Additional collections (Church) | Later | Georeferencing acceptance is unproven (`docs/CHURCH_MAPS.md:24-25`). The dead rows fold away in A-2. |
| User-submitted POIs | Absorb | Covered by field capture N1–N3 (`plan.md:19-21`). |
| Native fishing POI layer (`plan.md:46`) | Later; rewrite wording | The facade it names no longer exists (`ARCHITECTURE.md:12-17`). |
| Search historical places / lots / sheets | Partly absorb; rest later | PID and address search shipped. The search bar has no groundwork for the rest (`ParcelSearchBar.swift`). |
| iCloud sync | Later | It would change the no-data-collected privacy answer. |
| Alternative map renderer (`ROADMAP.md:42`) | Later; annotate | There is no swap seam now. A swap means re-implementing `MapController`. |
| `docs/audits/CODE_AUDIT.md` "native verification pending" | Absorb, then retire the line | Native and UI CI later passed (`APP_STORE_RELEASE.md:24`). |
| MapEngine/MapLayer facade rule (older CLAUDE.md instructions) | Retire | Removed on purpose (`ARCHITECTURE.md:12-17`). The live rule is `ARCHITECTURE.md:59-60` (D-7). |
| §5 perf findings, 13 unmeasured (`HANDOFF-field-review-follow-ups.md:500,802`) | Absorb | §5.3, §5.5 and §5.13 map to B-3 and B-4. Tile-cache hysteresis (§5.8) and per-tile JSON (§5.14) are later. |
| HANDOFF-atlas-raster-publication | Keep open | `source.json` returned HTTP 200 on 2026-10-30, but the publisher uploads that receipt before syncing tiles (`HANDOFF-atlas-raster-publication.md:24-27`), so a 200 does not prove the tiles exist. Retire only after representative tiles and ocean stand-ins are checked in every style, the receipt identity matches, and the native app renders them. Correct its false failure-status claim separately (C-9). |
| `plan.md` unchecked items outside "Deferred For v1.1" (`docs/plans/plan.md:89-139`) | Keep in `plan.md` | Web print acceptance, Fletcher corridor and tile publication, municipality importers, radon, karst, property context, zoning, geotiff.js, fishing, turbines and Point Tupper are web, data or site workstreams outside this native program. Their dates and cross-repository dependencies stay as written (D-7). |
| HANDOFF-ios-track-checkpoint | Absorb into C-8 | The code landed. The device verification is still owed. |
| HANDOFF-field-review-follow-ups | Absorb, then delete | Device walk goes to C-8; §5 goes to B; the late-write failure goes to C-14. |
| HANDOFF-main-nightly-reconcile | Retire after moving notes | The fix is at `release-trains.yml:294`. The `lint_metadata` gap moves to D-3 and the facade note to D-7. |
| HANDOFF-field-capture-n3 / -w9 | Retire | Marked done in `plan.md:21,64`. |
| HANDOFF-ios-empty-layer-mark-fix | Retire after checking #292 | The fix is present (`UserVectorParseTests.swift:118-121`). |
| `docs/licensing-locks.md` | Keep | Authoritative locks. Line 32 must agree with D-2. |
| `docs/APP_STORE_RELEASE.md` | Keep as sole release checklist | Other release docs point to it (D-7). |
| July snapshots (`APP_STORE_NEXT_STEPS.md`, `BRANCH_CLEANUP.md`, `MARKETING_PLAN.md`) | Archive | They contradict the packet (D-7). |

## 5. Workstreams

A workstream is a goal with a list of items. It is not one PR. Each item, or each bullet of a multi-part item, ships as its own reviewable PR unless noted.

| Workstream | Goal | Items |
|---|---|---|
| **S1. Field data safety (1.0)** | No silent loss of walks, saved areas or user files | C-1, C-2, C-3 (reproduce first), C-4, C-11 |
| **S2. Broken flows, honest UI (1.0)** | Every advertised flow either works or says why not | C-5, C-6, C-7 (1.0 part), C-9, C-10 |
| **S3. Release truth and acceptance (1.0)** | A build that can be selected, legally and mechanically | D-2, D-1, then C-8 last |
| **S4. Measure first (1.1)** | Make performance and network behaviour observable and testable | B-1, B-2, B-7, B-8, B-11, D-9 |
| **S5. Render scope and incremental map updates (1.1)** | Stop whole-screen and whole-layer rebuilds | B-3, B-4, B-5, B-6, B-9, B-10 |
| **S6. Simplified map screen (1.1)** | Core feature first, one licence decision, fewer controls | A-1, A-2, A-3, A-5, A-6, C-7 (1.1 part) |
| **S7. Field workflow hardening (1.1)** | Recovery paths, imports and content creation | C-12, C-13, C-14, C-15, C-16, C-17, A-4, A-7, A-8 |
| **S8. CI and docs (1.1)** | Reliable trains and truthful docs | D-3, D-4, D-5, D-6, D-7, D-8 |
| **S9. iPad and the web companion (1.1)** | A real iPad layout; a maintainable, faster web app | A-9, A-10, B-12, B-13 |

**1.0: start with S1.** Its items are mostly small fixes (C-4 is S–M). They sit outside the 3,656-line container's layout code and prevent data loss in the app's headline v1 feature. S1 and S2 can run in parallel. D-2 is a factual check that can start at once. C-8 comes last, on the selected build. D-3 is cheap and may be pulled into S3 if time allows; otherwise it stays in S8.

**1.1: start with one PR: B-1 plus the B-2 transport seam.** It adds signposts and makes the Atlas and OSM tile paths testable. It changes no behaviour, so it is safe to land while 1.0 closes out, and every later performance item depends on its baselines.

**Item map**

| ID | Tag | Workstream | Prerequisites |
|---|---|---|---|
| C-1 | 1.0-gate | S1 | none |
| C-2 | 1.0-gate | S1 | none |
| C-3 | 1.0-gate (if reproduced) | S1 | development-build device reproduction (not C-8) |
| C-4 | 1.0-gate | S1 | none |
| C-11 | 1.0-gate | S1 | none |
| C-5 | 1.0-gate | S2 | none |
| C-6 | 1.0-gate (conditional) | S2 | simulator repro |
| C-7 (1.0 part) | 1.0-gate | S2 | none |
| C-7 (1.1 part) | 1.1 | S6 | C-7 (1.0 part) |
| C-9 | 1.0-gate | S2 | none |
| C-10 | 1.0-gate | S2 | none |
| D-2 | 1.0-gate | S3 | none (owner decision only on a mismatch) |
| D-1 | 1.0-gate | S3 | none |
| C-8 | 1.0-gate | S3 | S1, S2, D-1, D-2 done; build selected |
| D-3 | 1.1 | S8 (may be pulled into S3) | release secret for the phone |
| D-9 | 1.1 | S4 | 1.0 submitted |
| B-1 | 1.1 | S4 | none |
| B-2 | 1.1 | S4 | B-1 |
| B-7 | 1.1 | S4 | none |
| B-8 | 1.1 | S4 | B-1 |
| B-11 | 1.1 | S4 | B-1 |
| B-3 | 1.1 | S5 | B-1 baseline |
| B-4 | 1.1 | S5 | B-1 baseline |
| B-5 | 1.1 | S5 | B-1; locked-id rule |
| B-6 | 1.1 | S5 | B-1, B-2 |
| B-9 | 1.1 | S5 | B-1 |
| B-10 | 1.1 | S5 | B-1 |
| A-1 | 1.1 | S6 | none |
| A-2 | 1.1 | S6 | C-5 (root sheet) |
| A-3 | 1.1 | S6 | web change paired for Watersheds |
| A-5 | 1.1 | S6 | C-6 |
| A-6 | 1.1 | S6 | C-7 |
| C-12 | 1.1 | S7 | device check for the tile half |
| C-13 | 1.1 | S7 | D-2 outcome; uses B-9's concurrency c if B-9 lands first (c = 1 otherwise) |
| C-14 | 1.1 | S7 | C-2 |
| C-15 | 1.1 | S7 | B-8 |
| C-16 | 1.1 | S7 | `maxRecordCount` check |
| C-17 | 1.1 | S7 | Lock Screen Stop needs C-2 |
| A-4 | 1.1 | S7 | none |
| A-7 | 1.1 | S7 | B-8 |
| A-8 | 1.1 | S7 | none |
| D-4 | 1.1 | S8 | B-2 |
| D-5 | 1.1 | S8 | none |
| D-6 | 1.1 | S8 | none |
| D-7 | 1.1 | S8 | D-2 |
| D-8 | 1.1 | S8 | D-3 |
| A-9 | 1.1 | S9 | open question 3 |
| A-10 | 1.1 | S9 | none |
| B-12 | 1.1 | S9 | A-10 |
| B-13 | 1.1 | S9 | none |

## 6. Out of scope / later

- Breaking up `MapContainerView` and `MapController` as a goal in itself, with line-count targets. Extract pieces when a feature touches them. The exceptions are the event router and walk-save tests (D-5 territory).
- Splitting `OverlayViewModel` along its MARK seams. Fold in only the two-line header and `@ObservationIgnored` fixes when the file is touched.
- Speculative performance work with no symptom:
  - opacity-tick fan-out in the layer panel
  - per-triangle precompute in the warp renderer
  - live-trace append channel
  - parcel geometry LRU
  - hydro pilot decode off the main thread
  - per-tile JSON to SQLite
  - KMZ streaming export
  - compact storage JSON
  - DerivedData cache re-key
  - roads casing parallel fetch
  - TileCache LRU-on-read
  - georeferencer drag recompute
  
  Each is promoted only when a B-1 trace shows a hitch.
- Tile-cache low-water mark (§5.8). It is a cheap fix but runs off the main thread with no symptom.
- Parcel-tap evidence reuse. Measure first.
- Moving the tax-sale list button off the rail. Wait for A-1 to show it is still needed.
- Tax-sale event metadata export to SharedData. The two cheap guards from that item go into D-5.
- NS Aerial and restricted-layer bulk offline; iCloud sync; historical-sheet search; native fishing POIs; Church activation. Each is gated on licence evidence or acceptance.
- Release docs copied from Echo; fastlane `ci` lane drift. Fold into D-7 if touched.
- Retiring `FletcherTilePlanner.tileXY` and adding a NaN guard. Do it when the file is next edited.
- Mip-based user-map drapes beyond B-10, and memory-warning eviction.

## 7. Open questions for Dan

1. `licensing-locks.md:32` settles native use and offline bundling for the matching 1884 Cape Breton set. If D-2 finds served sheets outside that set, should they be left out of saved areas for 1.0, or do you have evidence that covers them? (Only needed on a mismatch.)
2. If 1.0 scope must shrink, may C-6 (PDF Share, if it does not reproduce) slip to 1.1? Or would you rather remove the licence-gated snapping and shared-link entry points than fix C-5?
3. Ship 1.0 on iPad with the phone layout, or set 1.0 to iPhone only and add iPad in 1.1? (A-9)
4. Given every bundled notice except Victoria's is past its sale date, should the 1.0 binary ship tax-sale notices at all?
5. What is the exact copyright line for App Store Connect, and what is the export-compliance answer? Both are owner-only fields (`APP_STORE_RELEASE.md:101,206-209`).
6. Should we delete `devlog-update.yml` now that the devlog page is retired? (D-6)
7. Do you approve moving Layers to the top of the rail and folding Save Area into Offline Maps? (A-1)
8. Should 1.1 add a short-lived "Recently deleted" area for vector layers and user maps, or is honest confirmation copy enough? (C-11, C-14)

## 8. Glossary

- **AX5 / AX XXXL.** The largest accessibility text sizes in iOS (Settings › Accessibility › Larger Text). "AX5" is the very largest; "AX XXXL" means the same here. Tests should use AX5.
- **Hermetic test.** A test that touches nothing outside itself: no live network, no shared files, no state left from an earlier test.
- **Jetsam.** iOS ending a background app to free memory. To the user it looks like the app quit.
- **Mip.** A pre-shrunk copy of an image, matched to the zoom level so the renderer does not scale a huge image down every frame.
- **Seam.** A place where a test can swap in a fake, such as passing a `URLSession` in instead of using `.shared`.
- **Channel key.** How this repo's `StubURLProtocol` keeps parallel tests' fake network answers apart, so tests no longer share one global stub.
- **Signpost.** A named start/end marker (`OSSignposter`) that shows up as an interval in Instruments.
- **TBT (Total Blocking Time).** A Lighthouse score for how long a web page's main thread is too busy to respond while it loads.
- **TPS (thin-plate spline).** The smooth warp that bends a scanned map onto modern coordinates from control points.
- **Workstream.** A goal with a list of items. Each item ships as one or more PRs.

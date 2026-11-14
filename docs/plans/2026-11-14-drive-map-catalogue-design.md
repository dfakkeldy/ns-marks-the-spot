# Drive maps: catalogue, auto-activation, coverage, drive mode, and your own layers

Date: 2026-11-14. Source: `nightly` at `ec1292ebf`. Status: design only. Nothing here is built.

Every "today" statement below comes from reading the code at that commit. Where a point was not checked, the text says "not verified". A different model will write the code. Each PR in section 15 is written to be read alone, with section numbers for the shared rules.

## 1. Summary

Dan drives rural Cape Breton with dash cams. Before a trip, an agent makes a set of georeferenced PDF drive maps. Dan loads them on his phone, mounts the phone in the car, and drives.

This design adds six things.

1. **Catalogue.** A named, ordered set of imported sheets.
2. **Auto-activation.** The sheet under the car shows by itself. Sheets switch over as he drives.
3. **Overlap bar.** Two big buttons when two or more sheets cover his position.
4. **Coverage.** Recorded drives stay on the map, per catalogue, across sessions.
5. **Drive mode.** The screen stays on, with or without a recording.
6. **Your layers.** The user adds a tile, WMS or ArcGIS layer by URL. It can be a base map and a PDF-export base.

Decisions made in this document:

| Question | Decision | Section |
|---|---|---|
| Which surface gets the drive features first? | **Native (iOS).** Web follows from the same test fixture. | 11 |
| Which surface gets your-own-layers first? | **Web.** It owns the GeoPDF export. | 12 |
| First PR | **P1: drive capture profile.** Shared spec, no UI. | 15 |
| What happens when a pasted URL is a catalogued restricted source? | **Dan decides.** Recommended: the same lock applies. | 12.8 |

Four problems in today's code affect driving. They were found while reading for this design.

| Problem | Where | Effect on a drive |
|---|---|---|
| The track filter rejects fixes above 30 m/s (108 km/h). The comment calls it walk speed. | `web/src/location/captureSpec.ts` `trackFilter.maxSpeedMps`; `NSMarksCore/Sources/GeoCore/Capture/CaptureSpec.swift` | On a 110 km/h highway the track stops growing, then jumps. |
| No segment break on a time gap. | `web/src/location/trackRecorder.ts`; `NSMarksCore/Sources/GeoCore/Capture/TrackRecording.swift` | After a gap, one straight line crosses roads that were not driven. That is false coverage. |
| The web loads every sheet's preview into memory at start. | `web/src/userMaps/useUserMaps.ts:430` | Thirty aerial sheets can use several hundred megabytes on a phone. |
| The web rewrites the whole recording draft every 5 s, raw fixes included. | `web/src/location/trackDraftStore.ts`, `useTrackRecording.ts` | A six-hour drive rewrites megabytes every few seconds. |

## 2. Goals and non-goals

### Goals

- Load a set of sheets as one named group.
- Show the right sheet without a tap while following live location.
- Give one-tap control when sheets overlap. Targets are large. Nothing needs reading.
- Record honest coverage. A gap in the record shows as a gap.
- Keep coverage per catalogue, across sessions and trips.
- Keep the screen on in drive mode, and say so when the device refuses.
- Let the user add a map source by URL, labelled as the user's own, never as an app source.
- Keep every existing licence lock and every evidence rule in `AGENTS.md`.

### Non-goals

- Turn-by-turn navigation or routing.
- Matching the track to a road network, or a "percent of roads covered" figure. See 9.7.
- Offline download or caching of tiles from a user-added layer.
- Syncing catalogues, coverage or layers between devices.
- A moving-vehicle lockout. The app cannot know who taps the phone.
- Reprojection of user-added layers. Web Mercator (EPSG:3857) only.
- Vector user-added sources (WFS, vector tiles, feature services).
- Changing any existing lock in `docs/licensing-locks.md`.
- Opening promotion PRs or updating the KinNoKi pin.

## 3. What exists today

### 3.1 Web (`web/src`)

| Area | What the code does | File |
|---|---|---|
| Sheet record | `UserMapRecord`: id, name, source, `pixelSize`, `georef`, optional `sourceRect` and `pdf` metadata. | `userMaps/types.ts` |
| Sheet storage | IndexedDB `ns-marks-the-spot-user-maps`, version 3. Stores `maps`, `blobs`, `vectors`, `photos`. One schema owner. | `userMaps/store/database.ts` |
| Row state | `{ enabled, opacity }` per sheet in `localStorage` key `user-map-ui-state-v1`. Default opacity 0.7. | `userMaps/useUserMaps.ts` |
| Sheet order | Sorted by `createdAt`. There is no user order. | `userMaps/store/userMapStore.ts:132` |
| Sheet stacking | One canvas per sheet in `user-maps-pane` (z 160). Order is mount order. Nothing sets it. | `userMaps/render/WarpedRasterLayer.ts:294` |
| Sheet footprint | `meshForRecord(record)` returns a lat/lng lattice, or `null` when the sheet is not placed. | `userMaps/recordMesh.ts` |
| Preview size | Long edge capped at 4096 px. | `userMaps/parsers/previewBudget.ts` |
| GeoPDF import | Page 1 only. `/Measure` and `/LGIDict`. A frame chooser when a page has more than one frame. | `userMaps/parsers/*`, `useUserMaps.ts:157` |
| Live location | One `watchPosition`. Follow mode pans the map. A drag turns Follow off. | `location/liveLocation.ts`, `components/MapCanvas.tsx:2427-2494` |
| Recording | Pure recorder, 5 s draft to IndexedDB, GPX original, recovery after a reload. | `location/trackRecorder.ts`, `useTrackRecording.ts`, `trackDraftStore.ts` |
| Saved track | Each recording becomes one user vector layer with `source: "recorded"`. | `App.tsx:2217`, `userMaps/vector/useUserVectorLayers.ts:892` |
| Track drawing | Live trace: dashed blue line in Leaflet's overlay pane. Saved track: `user-vector-pane`, z 425. Both are above the sheets. | `MapCanvas.tsx:3052`, `components/mapPanes.ts` |
| Wake lock | Taken in `start()`, released in `stop()`. A refused request is swallowed. | `location/wakeLock.ts`, `useTrackRecording.ts` |
| Durable storage | `navigator.storage.persist()` is already requested. | `services/durableStorage.ts` |
| PDF export | Client-side GeoPDF. Layer kinds: `tile`, `image`, `warped`, `open-data`, `atlas`, `parcel-ring`. | `print/pdf/mapCompositor.ts` |
| User sheets in export | **Not exported.** `App.tsx:6810` passes `userMaps: []`. They are named as omitted. | `App.tsx:4397-4408` |
| Licence locks | `PROVINCE_REPRODUCTION_LOCK_IDS` holds 16 ids, `ns-aerial` first. Three export entry points call `assertReproductionAllowed`. | `licensing/layerUse.ts`, `print/pdf/exportLayerSpecs.ts:174`, `mapCompositor.ts:342`, `ExportDialog.tsx:178,235` |
| Themes | A theme sets visibility for catalogue layer ids (`ShareLayerId`) only. User sheets are not touched. | `App.tsx:3254`, `themes/mapThemes.ts` |

### 3.2 Native (`ns-marks-the-spot/`, `NSMarksCore/`)

| Area | What the code does | File |
|---|---|---|
| Sheet library | One JSON document plus one preview image per sheet. Previews load on demand. | `UserMaps/UserMapStore.swift`, `UserMapsViewModel.swift:661` |
| Row state | `isVisible`, `opacity` per sheet in `UserDefaults` key `user-map-display-v1`. | `UserMaps/UserMapDisplayStore.swift` |
| Drawing order | Panel order. Overlays are installed by `webDrawOrder`. User maps 160, user vectors 425. | `UserMapsViewModel.swift:785`, `MapSurface/OverlayDrawOrder.swift`, `GeoCore/OverlayZIndex.swift` |
| Recording | Runs with the app off screen. `CLBackgroundActivitySession`, When In Use only, a Live Activity. | `FieldCapture/TrackRecorder.swift`, `LocationFixSource.swift` |
| Crash safety | Append-only journal of the walk. | `FieldCapture/TrackCheckpointStore.swift` |
| Screen | `isIdleTimerDisabled` is true only while the scene is active **and** a recording runs. | `TrackRecorder.swift:396` |
| Location source | `activityType = .fitness`, no distance filter, no automatic pause. | `LocationFixSource.swift` |
| Locks | `LayerUse.requireReproduction`. Source identity survives a renamed row. | `MapCatalog/LayerUse.swift`, `MapSurface/TileReproductionScope.swift` |
| Tile sources | `TileLayerSource` has `.tile(URL)`, `.fletcherSheets`, `.atlasRaster`, `.catalogExport(LayerID)`. | `MapSurface/MapViewState.swift:121` |

Not verified on native: the preview pixel cap, how the map reports the user location when no recording runs (`MapController.swift:2373` is the delegate call), and whether one real drive sheet imports cleanly. Section 15 lists these as checks.

### 3.3 Platform facts

| Fact | Source |
|---|---|
| The Screen Wake Lock API is in Safari from 16.4. | [web-features explorer](https://web-platform-dx.github.io/web-features-explorer/features/screen-wake-lock) |
| It did not work in Home Screen web apps until iOS 18.4. | [Safari 18.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes.md), [WebKit bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545) |
| The browser releases the lock when the page hides. | `web/src/location/wakeLock.ts` already re-requests on return. |
| A web page gets no location fixes with the screen off or another app in front. | The repo's own note in `TrackRecorder.swift` ("the web surface still stops when its tab hides"). A [WebKit bug thread](https://bugs.webkit.org/show_bug.cgi?id=193946) is reported to say the same. No Apple document was found that states it. |

Not verified: whether iOS Low Power Mode refuses a wake lock request. Reports say it can. Test it on the device (section 14.3).

## 4. Terms

| Term | Meaning |
|---|---|
| Sheet | One imported user map: a `UserMapRecord`. |
| Catalogue | A named, ordered list of sheet ids. |
| Footprint | The sheet's outline on the ground: the outer ring of its mesh. |
| Entered | A sheet that the activation rules treat as "under the car". |
| Trip | One drive session. It has one `tripId`. |
| Leg | One saved recording inside a trip. The web saves a leg every 30 minutes. |
| Drive mode | Location on, Follow on, screen held awake, auto-activation on. |
| Your layer | A map source the user added by URL. |

## 5. The drive-map pack the agent makes

These limits come from the import code. The agent that makes the PDFs must follow them.

| Rule | Reason |
|---|---|
| One sheet per PDF file, one page. | Only page 1 is imported. |
| Registration in `/Measure` or `/LGIDict`. | Those are the two readers. |
| One registered frame per page. | More than one frame opens the frame chooser on every sheet. |
| Page pixels at or under 4096 on the long edge. | Larger pages are scaled down. Letter at 300 DPI is 3300 x 2550 px. |
| Neighbouring sheets overlap by about 10%. | Gives the switch-over time to load the next sheet. See 7.3. |
| File names sort in drive order. | Names become sheet names and the first catalogue order. |

A sheet with aerial imagery is about 15 to 25 MB as a stored preview. Thirty sheets are about 0.5 to 0.75 GB on the device. This is an estimate from pixel counts, not a measurement.

Optional later: a manifest file in the pack. See PR W7.

## 6. Catalogue

### 6.1 Rules

1. A catalogue has a name and an ordered list of sheet ids. The first id is the top sheet.
2. A sheet can be in more than one catalogue.
3. One catalogue at a time is "loaded". None is also valid.
4. Deleting a catalogue keeps its sheets and its trips. The trips move to the ordinary track list.
5. Deleting a sheet removes its id from every catalogue.
6. A sheet that is not placed (no mesh) stays in the list, marked "Not placed". It never auto-activates.
7. A catalogue has one opacity for its sheets while loaded. Default 1.0. The per-sheet opacity is left alone.
8. Nothing about a catalogue enters a share link, a print capture or an export.

### 6.2 Data model

```ts
// web/src/drive/types.ts
export type DriveCatalogue = {
  id: string;            // generateId()
  name: string;
  createdAt: string;     // ISO
  modifiedAt: string;    // ISO
  sheetIds: string[];    // top first; ids of UserMapRecord
  opacity: number;       // 0..1, default 1
};

// localStorage "drive-ui-state-v1"
export type DriveUiState = {
  loadedCatalogueId: string | null;
  autoActivate: boolean;      // default true
  showCoverage: boolean;      // default true
};
```

Swift mirrors this as `DriveCatalogue: Codable, Identifiable, Sendable` in `NSMarksCore/Sources/GeoCore/Drive/`.

### 6.3 Storage

| Surface | Where | Why |
|---|---|---|
| Web | New object store `catalogues`, `keyPath: "id"`, in the shared database. `DB_VERSION` goes up by one. | It is user content. `database.ts` is the single schema owner, and versions 2 and 3 were added the same way. |
| Web | `DriveUiState` in `localStorage`. | Same split as `user-map-ui-state-v1`: a switch is not an edit. |
| Native | `drive-catalogues.json` in Application Support, through an actor store. Versioned, and sealed when a newer build wrote it. | Same pattern as `UserMapStore`. |
| Native | UI state in `UserDefaults` key `drive-ui-state-v1`. | Same pattern as `UserMapDisplayStore`. |

Two web PRs each add a store (catalogues, your layers). Each must read `DB_VERSION` on `nightly` and add one. The upgrade guard stays additive: `if (!contains) create`.

### 6.4 UX: catalogue panel

The panel sits in My Maps, above the sheet rows.

```
+--------------------------------------------+
| My Maps                                    |
|                                            |
| CATALOGUES                    [ + New ]    |
| +----------------------------------------+ |
| | (o) Mabou - Port Hood        12 sheets | |
| |     Loaded - Auto on                   | |
| |     3 trips - 214 km driven            | |
| |     [ Add sheets ] [ Order ] [ ... ]   | |
| +----------------------------------------+ |
| | ( ) West Bay                  8 sheets | |
| +----------------------------------------+ |
|                                            |
| YOUR MAPS                                  |
|  [x] mabou-01.pdf        Your file ...     |
|  ...                                       |
+--------------------------------------------+
```

- **New** asks for a name, then opens the file picker. Every raster that imports goes into the catalogue, in file-name order.
- **Add sheets** opens the file picker again, or a checklist of sheets already on the device.
- **Order** opens a list with Up and Down buttons per sheet. No drag.
- The radio button loads the catalogue. Tapping the loaded one unloads it.
- **...** holds Rename, Auto on/off, Sheet opacity, Export coverage, Delete catalogue.
- Sheets of the loaded catalogue show a "In catalogue" tag on their own rows. Their checkbox then means pin or hide. See 7.5.

## 7. Auto-activation

### 7.1 When it runs

Auto-activation runs when all of these are true:

- a catalogue is loaded,
- `autoActivate` is on,
- location is on and Follow is on.

When Follow is off, the state is held. The shown sheets stay as they are. The chip says "Auto paused". Pressing Follow resumes from the next fix.

When no catalogue is loaded, or Auto is off, sheets behave as they do today.

### 7.2 Footprint

The footprint is the outer ring of the sheet's mesh.

1. Take the lattice from `meshForRecord(record)` (web) or `record.mesh` (native).
2. Walk its edge: top row left to right, right column top to bottom, bottom row right to left, left column bottom to top.
3. Drop vertices that are not finite.
4. Fewer than three vertices left means no footprint.

The ring, not a bounding box. A UTM sheet is rotated against latitude and longitude, and a box would claim ground the sheet does not show. The mesh already respects `sourceRect`, so the page margin and legend are outside the footprint.

Distance is measured in local metres: project the ring and the fix to an equirectangular plane centred on the fix. `signedDistanceM` is negative inside the ring and positive outside.

### 7.3 Rules

Constants, shared by both surfaces and pinned in the fixture:

```
SHEET_ACTIVATION = {
  enterFixes: 2,        // fixes in a row inside before a sheet enters
  exitMarginM: 60,      // metres outside before a sheet can leave
  exitFixes: 2,         // fixes in a row beyond the margin
  maxAccuracyM: 100,    // a rougher fix changes nothing
  maxShown: 3,          // sheets drawn at once
}
```

Per sheet the state is `{ entered, insideCount, outsideCount, insideNow }`.

For each fix:

1. **Unusable fix.** If the accuracy is not finite, is not positive, or is above `maxAccuracyM`, return the old state. The reason is `held-poor-fix`.
2. **Distance.** For each sheet with a footprint, compute `d = signedDistanceM(fix, ring)`. Set `insideNow = d <= 0`.
3. **Enter.** For a sheet that is not entered: if `d <= 0`, add one to `insideCount`, else set it to zero. At `enterFixes`, set `entered = true` and `outsideCount = 0`.
4. **First fix.** On the first usable fix after activation starts or resumes, one fix is enough to enter.
5. **Exit.** For an entered sheet: let `margin = max(exitMarginM, fix.accuracyM)`. If `d > margin`, add one to `outsideCount`, else set it to zero. At `exitFixes`, set `entered = false`, `insideCount = 0`, and clear that sheet from `dismissed`.
6. **Stack.** `contained` is the entered sheets in catalogue order.
7. **Shown.** `shown` is `pinned` plus `contained`, minus `dismissed`, in catalogue order, cut to the first `maxShown`. Count the rest as `notDrawn`.
8. **Status.**
   - `overlap` when two or more sheets have `entered && insideNow`.
   - `on-sheet` when `contained` has one or more sheets and it is not `overlap`.
   - `off-sheets` when `contained` is empty. Report the nearest sheet: id, distance, and bearing in degrees.

Why these numbers:

| Number | Reason |
|---|---|
| 2 fixes to enter | One stray fix across an edge must not flip the sheet. At 90 km/h and one fix a second, this costs 25 to 50 m. |
| 60 m to exit, or the accuracy if larger | A road that runs along a sheet edge would flicker with no margin. 60 m is about 2.4 s at 90 km/h. |
| 2 fixes beyond the margin | Same reason as entering. |
| 100 m accuracy limit | A fix that rough cannot tell two sheets apart. Holding the state is the honest answer. |
| 3 sheets drawn | One decoded sheet is about 34 MB at 3300 x 2550. Three is a safe ceiling on a phone. |

The overlap status uses `insideNow`, not `entered`. Two sheets that only share an edge are both entered for a few seconds because of the exit margin. That is not an overlap, and the bar must not flash on every switch.

### 7.4 Behaviour at edges, and off the sheets

```
 sheet A                    sheet B
 +----------------------+
 |                      |---------------------+
 |        car ->  . . . |. .> B enters here   |
 |                      |   (2 fixes inside)  |
 +----------------------+                     |
        A leaves here ->|      . .>           |
        (60 m past A's  +---------------------+
         edge, 2 fixes)
```

- With overlapping sheets, both draw across the shared strip. B is ready before A goes.
- With sheets that only touch, A stays for the exit margin while B loads. There is no blank moment.
- With a gap between sheets, A leaves, nothing from the catalogue is drawn, and the base map shows. The chip gives the nearest sheet.

Off the sheets, the app does not keep the last sheet on screen. A sheet that does not cover the car's position is not the sheet he is on.

### 7.5 Manual override

| Action | Effect | Ends when |
|---|---|---|
| Hide the top sheet (overlap bar, or its row checkbox off) | The sheet joins `dismissed`. The next sheet shows. | The car leaves that sheet's footprint (rule 5), or he taps Show. |
| Bring a sheet to top (overlap bar) | The sheet moves in `sheetIds` to just above the other entered sheets. Saved. | It is a lasting change. |
| Turn a sheet on by its row while it is not entered | The sheet joins `pinned`. It draws wherever the car is. | He turns the row off, turns Auto off, or unloads the catalogue. |
| Drag the map | Follow goes off. Activation holds. | He taps Follow. |
| Turn Auto off | Every sheet follows its own row checkbox, as today. | He turns Auto on. |

`pinned` and `dismissed` live in memory only. They do not survive a reload. The stored row state (`enabled`) is never written by auto-activation, so turning Auto off gives back what he had.

### 7.6 UX: the drive screen

Phone in portrait, in a car mount.

```
+------------------------------------------+
| [=]                              [3D][+] |
|                                          |
|              (map: sheet B)              |
|                                          |
|         ===== magenta: earlier trips     |
|         - - - blue: this drive           |
|                  (o)>  blue dot          |
|                                          |
| +--------------------------------------+ |
| | Mabou - Port Hood - sheet 4 of 12    | |  <- status chip
| | mabou-04   - Screen stays on         | |
| +--------------------------------------+ |
| +------------------+ +-----------------+ |
| |   (REC)  0:42    | |     [ End ]     | |  <- 64 px tall
| |   31.6 km        | |                 | |
| +------------------+ +-----------------+ |
+------------------------------------------+
```

Off the sheets:

```
| +--------------------------------------+ |
| | Off the sheets                       | |
| | Nearest: mabou-07 - 1.2 km - NE      | |
| +--------------------------------------+ |
```

Chip texts. Each state has its own words.

| State | Text |
|---|---|
| on-sheet | `<catalogue> - <sheet name>` |
| overlap | `<catalogue> - <top sheet> - 1 of N here` |
| off-sheets | `Off the sheets - Nearest: <sheet> - <distance> - <compass point>` |
| held-poor-fix | `Location is rough (+/- N m). Sheet not changed.` |
| Follow off | `Auto paused. Tap Follow.` |
| signal lost | `No location right now. Sheet not changed.` |
| sheet not drawn (limit) | `N more sheets here are not drawn.` |
| sheet failed to load | `<sheet> could not be drawn.` |

"Sheet not changed" is not "no sheet here". An unanswered question stays unanswered.

## 8. Overlap bar

Shown only when the status is `overlap`.

```
+------------------------------------------+
| +--------------------------------------+ |
| | 2 sheets here - top: mabou-04        | |
| +--------------------------------------+ |
| +-----------------+ +------------------+ |
| |                 | |                  | |
| |   SWAP  (<->)   | |   HIDE TOP       | |   <- each 72 px tall,
| |                 | |                  | |      half the width
| +-----------------+ +------------------+ |
+------------------------------------------+
```

Rules:

1. **Swap** moves the top entered sheet below the other entered sheets, and saves the order. With two sheets this swaps them. With three or more, repeated taps cycle through them.
2. **Hide top** adds the top entered sheet to `dismissed`. The label becomes **Show top**. A second tap removes it from `dismissed`.
3. Each button is one tap. No confirmation, no list, no drag, no long press.
4. Each button is at least 64 CSS px (web) or 64 pt (native) on each side. Text is at least 18 px.
5. The bar leaves when the status stops being `overlap`. It does not time out while the overlap lasts.
6. The bar sits above the record strip and never covers the blue dot. The follow target is offset upward by the height of the bar. If that offset is hard on a surface, lower the dot to no less than 40% of the map height.
7. Each button has a spoken label that names the sheet: "Swap. Top sheet is mabou-04."

Tapping the status chip opens the full catalogue panel. That is for a stopped car.

## 9. Coverage

### 9.1 Rules

1. A drive recorded while a catalogue is loaded belongs to that catalogue.
2. Coverage draws above every sheet. On the web this is already true (pane 425 over pane 160). On native the order table says the same; check it on a device.
3. Coverage for the loaded catalogue is on by default and stays on across sessions.
4. Trips are kept apart. The "merged view" is a display of all trips together. Geometry is never merged in storage.
5. A gap in the record is a gap on the map. No connector is drawn.
6. Ending a drive saves it without a dialog.
7. The raw GPX original is kept for every leg, as today.

### 9.2 Drive capture profile

The walk profile stays as it is. A second profile is added to the shared spec.

```ts
// added to FIELD_CAPTURE_SPEC (web) and CaptureSpec (Swift)
driveTrackFilter: {
  accuracyGateM: 30,
  maxSpeedMps: 50,            // 180 km/h
  smoothingAlpha: 1,          // no smoothing
  minSpacingFloorM: 5,
  spacingAccuracyFactor: 0.25,
  gapSplitS: 10,
},
driveSimplifyToleranceM: 3,
```

| Value | Reason |
|---|---|
| 50 m/s gate | 30 m/s rejects legal highway driving. 50 still rejects a teleport. |
| No smoothing | At 25 m/s, alpha 0.6 trails the car by about 17 m and cuts corners. GPS noise is small beside the distance moved. |
| 5 m spacing floor | A stopped car at a junction must not pile up vertices. |
| 10 s gap split | A fix that arrives more than 10 s after the last one starts a new segment. The missing stretch stays empty. |
| 3 m simplify | Roads are smooth. This removes most vertices on straights. |

These numbers are proposals. Confirm them on a real drive (section 14.3).

The gap split is the evidence rule in practice. A track is a record of where the device was. A straight line across ten missing minutes says the car was somewhere it was not.

### 9.3 Data model

A coverage leg is an ordinary recorded layer with one more field.

```ts
// web/src/userMaps/vector/types.ts, on UserVectorLayerRecord
coverage?: {
  catalogueId: string;
  tripId: string;      // one per drive session
  leg: number;         // 1, 2, 3 ...
  profile: "drive";
};
```

No new store on the web. The `vectors` store has no fixed columns, so an optional field needs no version change.

This reuses what exists: storage, the GPX original, the interrupted-recording marker, the export writers and removal.

Native adds the same optional field to its vector layer record. Check first whether an older build would drop the field when it rewrites the library. If it would, raise the library version.

### 9.4 Trips and legs

- Starting drive mode with a recording creates a `tripId`.
- **Web:** every 30 minutes the recording rolls over. The running leg is stopped and saved, and the next one starts in the same tick with the same fix. There is no gap between legs. This keeps the 5 s draft small.
- **Native:** the journal is append-only, so one recording covers the whole trip. `leg` is always 1.
- A reload in mid-drive leaves a draft. The web keeps a small note in `localStorage` (`drive-session-v1`: catalogue id, trip id, next leg, leg start time). A recovered draft that started at or after that time gets the same tags.

### 9.5 Drawing

| What | Style |
|---|---|
| Earlier trips | Solid line, 5 px, magenta `#ff2d95`, 0.9 opacity. |
| This trip, saved legs | Solid line, 5 px, blue `#2f80ed`. |
| This trip, live | The existing dashed blue trace. |

Width and dash carry the difference too, not colour alone. Magenta reads against both aerial imagery and the paper-toned Atlas.

Coverage layers are left out of the ordinary "Your data" list while they have a catalogue. They show in the catalogue panel, one row per trip:

```
 TRIPS                      [x] Show coverage
  2026-11-14   3 legs   87.4 km   [GPX] [Delete]
  2026-11-09   2 legs   61.0 km   [GPX] [Delete]
  2026-11-02   1 leg    65.2 km   [GPX] [Delete]
  Total driven: 213.6 km (not unique roads)
```

### 9.6 Export

- **GPX per trip:** one file, one `<trk>`, one `<trkseg>` per recorded segment, with times. This is the file to line up with dash-cam video.
- **Export coverage:** one GPX with one `<trk>` per trip.
- Both use the existing writers and the existing traced-provenance check.

### 9.7 What coverage does not say

"Total driven" is the sum of track lengths. A road driven twice counts twice. It is not a share of roads covered.

A true "roads covered" figure needs a road network to match against. The province publishes NSRN roads under the Open Government Licence, and the web already draws them. That is a separate design. If the agent also ships the roads to cover as a GeoJSON or GPX file in the pack, a later version can compare the two. Until then the app shows the track and makes no claim about what is left.

## 10. Drive mode and the screen

### 10.1 What drive mode is

One button. Turning it on does four things:

1. turns location on,
2. turns Follow on,
3. holds the screen awake,
4. arms auto-activation, if a catalogue is loaded.

Recording is separate. Drive mode offers a large Record button. The screen stays on whether or not a recording runs.

Turning drive mode off releases the screen. It does not stop a recording. A running recording keeps its own hold on the screen, as today.

### 10.2 Web

`acquireScreenWakeLock` is reused. Drive mode takes its own handle. The recorder takes its own. The screen stays on while either is held, and neither needs to know about the other.

The handle gains a state so the screen can say what is true:

```ts
export type WakeLockState = "held" | "released" | "refused" | "unsupported";
export type WakeLockHandle = {
  supported: boolean;
  state: () => WakeLockState;
  onChange: (listener: (state: WakeLockState) => void) => () => void;
  release: () => void;
};
```

| State | When | Chip text |
|---|---|---|
| held | The request resolved and the sentinel is live. | `Screen stays on` |
| released | The sentinel fired `release` and the page is still visible. | `Screen may sleep. Tap to keep it on.` |
| refused | The request rejected while the page was visible. | `This device refused to keep the screen on. Set Auto-Lock to Never.` |
| unsupported | No `navigator.wakeLock`. | `This browser cannot keep the screen on. Set Auto-Lock to Never.` |

A rejection while the page is hidden is not a refusal. The existing visibility listener asks again on return.

Limits on iPhone, stated in the UI help text:

- Safari tab: works from iOS 16.4.
- Home Screen web app: works from iOS 18.4. Older systems report `refused` or `unsupported`.
- Lock button, app switch, or a call that covers the page: the page hides, the lock is released, and location fixes stop. The gap split keeps the track honest. On return the chip says how long was missed.

### 10.3 Native

Today one line decides the idle timer: `screen.isHeldAwake = isSceneActive && recording.status == .recording`. Drive mode would be a second writer to the same flag.

Add one owner:

```swift
@MainActor @Observable
final class ScreenAwakeCoordinator {
    enum Reason: Hashable { case recording, driveMode }
    func set(_ reason: Reason, active: Bool)
    func sceneBecame(active: Bool)
    // held == sceneActive && !reasons.isEmpty
}
```

`TrackRecorder` sets and clears `.recording` through it. Drive mode sets and clears `.driveMode`. Nothing else writes `isIdleTimerDisabled`.

The location source uses `.fitness`. For a drive profile the source is created with `.automotiveNavigation`. It still never pauses automatically.

## 11. Which surface first

**Native first for the drive features.** Web first for your-own-layers.

| Factor | Web | Native | Favours |
|---|---|---|---|
| Location with the screen locked or another app in front | Stops. No workaround in a browser. | Continues under When In Use, with the system's blue indicator. Already built. | Native |
| Keeping the screen on | Wake Lock: Safari 16.4, Home Screen 18.4. Dropped on hide. May be refused. | Idle timer. One flag. | Native |
| Crash and reload safety | Whole draft rewritten every 5 s. Needs 30-minute legs. | Append-only journal. | Native |
| Memory with 30 sheets | All previews load at start. Needs a fix first. | Previews already load on demand. | Native |
| Getting it to Dan's phone | Merge does not deploy. KinNoKi's pin must be raised in another repo. | The scheduled train uploads `nightly` to TestFlight. | Native |
| Build and test speed | Fast. Browser checks at phone width. | Slower. One build slot on the Mac. | Web |
| Coder effort | Lower per PR. | Higher per PR. | Web |
| Depth of this design's reading | Read closely. | Read in part. See 3.2. | Web |

The first four rows are about whether the recorded coverage can be trusted in a moving car. The last three are about cost. Reliability decides it.

The cost is real. Native PRs are slower, and three native points are not verified. PR N0 checks them before any feature work.

The logic is written once as a fixture: `sheet-activation-parity.json`. Both surfaces test against it, as the field-capture spec does now. The web port is then mostly wiring.

Your-own-layers goes to the web first because the GeoPDF export lives there, and making drive maps is desk work.

## 12. Your own layers

### 12.1 The question

Dan asked: QGIS can export a PDF with NS aerial imagery as the base. Why can't NSMtS? Should users add their own layers, with the licence as their responsibility, as in QGIS?

**Why NSMtS cannot do it today.** It is a product lock, not a technical limit. `ns-aerial` is the first id in `PROVINCE_REPRODUCTION_LOCK_IDS`. Its catalogue entry is `licence: "province-restricted"`, served from `nsgiwa.novascotia.ca/.../BASE_NSODB_10k_WM84/MapServer`. Building export layers, composing the image, and the export dialog (once when an export starts, once when it finishes) each call `assertReproductionAllowed`. Any of them refuses a restricted id. Viewing is a separate gate: the user accepts the Province's restricted map services licence, then the layer draws.

`docs/licensing-locks.md` says why. A public endpoint or a display term is not treated as a grant to reproduce. The lock is "a conservative product choice pending exact scope evidence, not a final legal attestation". Reopening a held use needs a documented grant for that exact source and use.

**How QGIS differs.**

| | QGIS | NSMtS |
|---|---|---|
| What it is | A general desktop tool. | A published app about Nova Scotia. |
| Who names the source | The user types the address. | The app ships the address in its catalogue. |
| What it knows about the terms | Nothing. | It links the licence, shows the acceptance gate and records a hold. |
| Who makes the copy | The user, on their own machine. | The user, in an app that knows the source is restricted. |
| Technical limit | None. A desktop tool is not bound by CORS. | The browser needs CORS headers to read pixels for a PDF. |

A URL field makes NSMtS like QGIS for a source the app knows nothing about. It does not make NSMtS like QGIS for a source the app already catalogues as restricted. The app cannot claim not to know. That one case is section 12.8.

### 12.2 Layer kinds

| Kind | The user pastes | How it is drawn | How it is exported |
|---|---|---|---|
| `xyz` | A template with `{z}`, `{x}`, `{y}` | Tiles | Tiles |
| `tms` | The same, with a flipped y | Tiles, `tms: true` | Tiles |
| `wms` | A WMS base URL, plus layer names | `GetMap` per tile, EPSG:3857 | One `GetMap` for the frame |
| `arcgis-map` | A URL ending in `/MapServer` | `/export` per tile | One `/export` for the frame |
| `arcgis-image` | A URL ending in `/ImageServer` | `/exportImage` per tile | One `/exportImage` for the frame |

Only Web Mercator. A WMS or ArcGIS server is asked for EPSG:3857 and does its own reprojection. A server that cannot is reported as `unsupported`, not drawn in the wrong place.

### 12.3 Data model

```ts
// web/src/userLayers/types.ts
export type UserLayerKind = "xyz" | "tms" | "wms" | "arcgis-map" | "arcgis-image";

export type UserLayerRecord = {
  id: string;                  // "user-layer:" + generateId(). Never a catalogue id.
  kind: UserLayerKind;
  role: "base" | "overlay";
  name: string;                // the user's words, required
  url: string;                 // normalized; may hold a key in its query
  attribution: string;         // the user's words, required
  termsNote: string;           // the user's words, required
  termsUrl: string | null;
  minZoom: number;             // default 0
  maxNativeZoom: number;       // default 19
  tileSize: 256 | 512;         // default 256
  wms?: { layers: string; styles: string; format: "image/png" | "image/jpeg";
          version: "1.1.1" | "1.3.0"; transparent: boolean };
  arcgis?: { layers: string | null };
  createdAt: string;
  modifiedAt: string;
  acknowledgement: { version: 1; at: string } | null;
  probe: { display: boolean | null; corsReadable: boolean | null; at: string } | null;
};

// localStorage "user-layer-ui-state-v1"
export type UserLayerUiState = Record<string, { enabled: boolean; opacity: number }>;
```

The match against the app's catalogue (12.8) is computed on load and on save. It is not stored, so a catalogue change takes effect at once.

### 12.4 Storage

| Surface | Where |
|---|---|
| Web | New object store `userLayers`, `keyPath: "id"`, in the shared database. `DB_VERSION` goes up by one. |
| Web | Row state in `localStorage` key `user-layer-ui-state-v1`. |
| Native | `user-layers.json` in Application Support through an actor store, versioned and sealed like `UserMapStore`. Row state in `UserDefaults`. |

Layers survive sessions because they are in the store. They survive theme changes because a theme only sets catalogue ids. A test pins both (PR B2).

A user layer never enters a share link. The share format lists `ShareLayerId` values, and a user layer has none.

### 12.5 Adding a layer

```
+--------------------------------------------+
| Add your own layer                         |
|                                            |
| Address                                    |
| [ https://tiles.example.org/{z}/{x}/{y}.png]|
|  Looks like: XYZ tiles        [ Change ]   |
|                                            |
| Name          [ County ortho 2024        ] |
| Use as        (o) Base map  ( ) Overlay    |
| Credit line   [ (c) Example County 2024  ] |
| Terms         [ Personal use, no resale. ] |
|               [ Read 2026-11-14 at ...   ] |
| Terms link    [ https://example.org/terms] |
|                                            |
| [ Test ]  Draws: yes   PDF export: no      |
|           (the server does not let other   |
|            sites read its images)          |
|                                            |
| +----------------------------------------+ |
| | NS Marks The Spot does not provide or  | |
| | check this source. You are responsible | |
| | for following its terms, including for | |
| | PDF export and sharing. The address is | |
| | stored only on this device. Requests go| |
| | from your device straight to that      | |
| | server, which can see your IP address  | |
| | and the area you view.                 | |
| +----------------------------------------+ |
| [x] I have read this source's terms and I  |
|     am responsible for how I use it.       |
|                                            |
|                    [ Cancel ]  [ Add ]     |
+--------------------------------------------+
```

Rules:

1. **Add** is disabled until name, credit line and terms are filled and the box is ticked.
2. Only `https:` addresses. `http://localhost` and `http://127.0.0.1` are allowed for a local tile server. Any other scheme is refused.
3. The kind is guessed from the address and can be changed by hand.
4. **Test** makes one image request and one CORS fetch. It stores the result with its time. The result is an observation with a date, not a property of the source.
5. Editing the address clears the acknowledgement. The user ticks the box again.
6. The address is shown with its query string masked: `?key=....`. A full view needs a tap on "Show".

### 12.6 Labelling

A user layer is never shown as an app source.

| Place | What it shows |
|---|---|
| Layer row | Tag **Your layer**. Second line: `Added by you - <host> - not an NS Marks The Spot source`. |
| Where it lives | A "Your layers" group in My Maps. Not in Background Maps. |
| Map credit | `Your layer: <credit line>`. The prefix comes from the app. User text is escaped. |
| Row details | The terms note, the terms link, the date added, the date of the last test. |
| PDF attribution | See 12.7. |
| Evidence note and share link | Not present. |

The host is shown. The full address is not, because it can hold a key.

### 12.7 PDF export

A user layer with role `base` or `overlay` can go into "Export map (PDF)" when all of these hold:

- it is enabled,
- its last test found the server CORS-readable,
- the policy in 12.8 allows it.

Otherwise it is named in the dialog's "not included" list with its reason.

When an opaque base user layer is exported, the layers that would lie under it are left out of the request and out of the credits. The page must not credit data it does not contain.

The attribution strip gets one line per user layer, built by the app:

```
User-supplied layer, not an NS Marks The Spot source: "County ortho 2024" -
(c) Example County 2024 - Terms as noted by the user: Personal use, no resale.
Read 2026-11-14. - tiles.example.org
```

The first clause is fixed text. The user cannot remove or reword it. The strip's existing rules still apply: it is never trimmed quietly.

The export dialog shows one line, with no extra click:

```
Includes your layer "County ortho 2024". You are responsible for its terms.
The PDF says it is user-supplied.
```

Browser Print (the `window.print()` path) does not include user layers in this version. `PrintMap` takes no user content today, and that stays.

### 12.8 When the pasted URL is a catalogued source. **Dan's decision.**

A user pastes the address of the NSGIWA `BASE_NSODB_10k_WM84` service. That is the source behind `ns-aerial`. Typing the address by hand does not change what it is.

**How a match is found.** Normalize both addresses, then compare:

1. Lower-case the host.
2. For an ArcGIS address, take the service name: the path from after `/services/` to `/MapServer` or `/ImageServer`. This makes the REST address (`/arcgis/rest/services/...`) and the WMS address (`/arcgis/services/.../WMSServer`) the same key.
3. For other addresses, take the path without the tile or query part.
4. Treat hosts listed as aliases as one host. Start with `nsgiwa.novascotia.ca` and `nsgiwa2.novascotia.ca`.
5. Compare against every catalogue entry with a service or tile address. On the web, index `nativeProvinceLayerCatalog` as well as `provinceLayerCatalog`.
6. Ask the lock about a restricted service without an open-data argument. Nine web layers were replaced by open downloads; the restricted raster service cannot inherit their exception. For a matched open-download address, pass its documented open-data metadata to the lock for receipt verification.

**What the match cannot do.** It finds the plain case. A proxy, a mirror or a copy on another host does not match. The guard stops an honest user from walking around a lock by accident. It does not stop a determined one. The document should not claim more.

**Options.**

| | A. Same source, same lock | B. The user's responsibility | C. Owner build only | D. Ask, or use open files |
|---|---|---|---|---|
| Viewing a matched restricted source | Same acceptance gate as the built-in layer | Allowed after the general notice | As A | No app change |
| PDF export of a matched restricted source | Held, with the same reason text | Allowed, with a stronger warning that names the source | Held on the public build. Open in a local build with a flag. | Held until a grant or an open file exists |
| Matched municipal zoning (query lock) | Refused | Allowed | As A | Refused |
| Public site | Unchanged | Any visitor can export restricted imagery by pasting one address | Unchanged | Unchanged |
| Dan's own drive PDFs with NS aerial | Made outside the app | Made in the app | Made in his own build | Made outside the app, or in the app after a grant |
| Fit with `docs/licensing-locks.md` | Fits | Conflicts. A hold could be bypassed by paste. | Fits for the public build. The flag is a new release-config item. | Fits |
| Main risk | The feature does less than Dan asked for | The publisher knowingly ships a route around its own hold | Two behaviours to test. The flag must never reach the pinned site. | Slow. Depends on a reply. |

**Recommendation: A, with D started in parallel. C if Dan wants in-app aerial PDFs for himself now.**

Reasons:

- `AGENTS.md`: "Keep every source's identity and provenance visible." A relabelled address is the same source.
- `AGENTS.md`: "Keep licence gates, attribution, accuracy caveats, and source links in the UI."
- The code already takes this view twice. `docs/licensing-locks.md` says "Fletcher source identity survives an aliased presentation ID". The native `reproductionSourceLayerID` says "Source identity survives a renamed row".
- The web's own rule for the nine replaced layers: "The same ID on an old restricted raster does not inherit that exception."

Under A, a matched layer is handled as the catalogue layer:

- The row says: `This address is the Province's NS Aerial service. NS Marks The Spot already offers it as "NS Aerial". The same conditions apply.`
- Viewing needs the Province licence acceptance.
- Export passes the matched catalogue id to `assertReproductionAllowed`, which refuses it with the existing reason.
- A match to a verified open-download address is allowed, and the catalogue's own attribution is added to the credits. A restricted service address never inherits the open-download exception.

The policy is one constant, so the decision is one line and one test table:

```ts
// web/src/userLayers/sourceMatch.ts
export const USER_LAYER_MATCH_POLICY: "same-lock" | "user-responsibility" | "owner-build" = "same-lock";
```

This is a licensing and product call. It is Dan's. Nothing in this design has been confirmed with the Province, and no permission request has been sent.

Under option D there are two things to find out. Neither is verified here.

1. Whether the Province will grant personal, non-commercial reproduction of the NSODB imagery service in a field map.
2. Whether the same orthophotos can be downloaded as files under the Open Government Licence. If they can, a drive PDF made from those files with GDAL is clean, and the import path needs nothing new. The web README already warns that an open download does not show the rendered service has the same grant. The two must be checked apart.

### 12.9 How the evidence rules apply

| Rule in `AGENTS.md` | In this feature |
|---|---|
| Keep source identity and provenance visible. Distinguish official, project-derived and user-loaded. | Every surface says "Your layer" and names the host. A matched address is shown as the catalogued source. |
| Never invent a parcel match, owner, access right or site condition. | A user layer is a picture. It feeds no identify, no intersection and no evidence note. |
| Keep failure states distinct. | Section 12.10. |
| Keep licence gates, attribution and source links in the UI. | Notice at add time, credit on the map, fixed clause in the PDF, the terms note on the row. |
| User-loaded maps and browser location stay in the browser. | The record is stored locally. Requests go to the user's chosen server and nowhere else. The notice says the server sees the IP address and the area. |
| An empty or failed response is not evidence of absence. | A missing tile is reported as a failed request with its status. It is not "no imagery here". |

### 12.10 States

| State | Meaning | Shown as |
|---|---|---|
| `ready` | Tiles loaded for this view. | No message. |
| `loading` | Requests are out. | Spinner on the row. |
| `zoom` | The view is outside the layer's zoom range. | `Zoom in to level N.` |
| `source-error` | The server answered with an error, or did not answer. | `The server did not return an image (HTTP 404).` |
| `cors-blocked` | Draws on the map, cannot be read for a PDF. | `Draws here. Cannot go in a PDF: the server does not let other sites read its images.` |
| `unsupported` | Wrong kind, or the server cannot serve Web Mercator. | `This server cannot serve the map projection the app uses.` |
| `licence-blocked` | Held by the policy in 12.8. | The catalogue layer's own lock text. |
| `needs-acceptance` | Matched a source that has an acceptance gate. | The existing licence prompt. |
| `not-tested` | Never tested, or the address changed since. | `Not tested. Tap Test.` |

There is no `outside-coverage` state. The app has no coverage record for a user's server, so it cannot say that.

### 12.11 Drawing

| Role | Z-index | Sits |
|---|---|---|
| base | 152 | Above `ns-aerial` (150), below Fletcher (155) |
| overlay | 158 | Above Fletcher, below user sheets (160) |

One base user layer at a time. Turning one on turns the other base user layers off. It draws over the built-in background and does not change the theme's state. Removing it shows the background again.

Cost of this simple rule: the covered background still loads. Stopping that is a later change.

`crossOrigin: "anonymous"` is set only when the last test found the server CORS-readable. A server without CORS headers still draws. It cannot be exported and is not draped in 3D.

## 13. Edge cases

| Case | Behaviour |
|---|---|
| A sheet has no mesh. | In the list as "Not placed". Never activates. |
| A sheet's preview fails to decode. | The chip says it could not be drawn. The next sheet in the stack shows. |
| Two catalogues share a sheet. | Fine. Only the loaded catalogue drives activation. |
| A sheet is deleted while shown. | It leaves the catalogue and the stack on the next fix. |
| The fix jumps 2 km (tunnel exit, cold start). | Sheets behind exit after two fixes. Sheets ahead enter after two. About two seconds. |
| A road runs along a sheet edge. | The 60 m margin holds the sheet. No flicker. |
| Follow goes off during an overlap. | The bar stays and still works. The state is held. |
| The app opens inside a sheet. | The first usable fix enters it at once (rule 4). |
| More than three sheets cover the car. | The top three draw. The chip counts the rest. |
| The page hides for five minutes (web). | No fixes arrive. On return a new segment starts. The chip says "5 min not recorded". |
| A reload in mid-drive (web). | The draft is offered back and tagged from `drive-session-v1`. |
| Storage is full. | The existing draft and save messages apply. Coverage is "on the map, not saved", as today. |
| The catalogue is deleted. | Sheets stay. Trips lose their tag and show under "Your data". |
| Low Power Mode refuses the wake lock. | The chip says the device refused and names Auto-Lock. |
| A user layer's key expires. | `source-error` with the status code. The app does not fall back to another base. |
| A user layer address has a key. | Masked on screen. Never printed. Never in a share link. |
| A user layer address is `http:`. | Refused at entry, with the reason. |
| A pasted address matches `ns-aerial`. | Section 12.8. |
| The same address is added twice. | Allowed. Each record has its own name and terms note. |
| The theme changes while a user layer is on. | The user layer stays on. The theme's own layers change under it. |
| A user layer is on during a parcel export. | The parcel lock still refuses the export. The user layer does not change that. |

## 14. Test plan

### 14.1 Unit tests

| Subject | Cases |
|---|---|
| Footprint | Ring from a 9 x 9 lattice has 32 vertices. A rotated sheet's ring is not its bounding box. A `null` mesh gives no footprint. Non-finite vertices are dropped. |
| Signed distance | Inside is negative. A point 60 m outside reads 60 within 1 m at latitude 46. |
| Activation | Every case in `sheet-activation-parity.json`: enter after two fixes, first-fix entry, exit margin, accuracy-widened margin, poor fix holds, abutting sheets, overlapping sheets, a gap, dismissal cleared on exit, pin, the limit of three. |
| Capture profile | A 110 km/h run is accepted by the drive profile and rejected by the walk profile. A 12 s silence opens a new segment in drive and not in walk. Walk output is unchanged from today. |
| Catalogue store | Create, rename, reorder, delete. Deleting a sheet removes its id everywhere. An upgrade from the previous database version keeps maps, vectors, photos and the draft. |
| Coverage | A saved leg carries the tags. Rollover gives two legs with no gap and no shared raw fix lost. A recovered draft gets the session's tags. Deleting a catalogue clears the tags. |
| Wake lock | `held`, `released`, `refused`, `unsupported`. A rejection while hidden is not `refused`. Two handles are independent. |
| URL parsing | Each kind is recognised. `http:` is refused except localhost. `javascript:` is refused. A key is masked. |
| Source match | The REST and WMS addresses of `BASE_NSODB_10k_WM84` both match `ns-aerial`. `nsgiwa2` aliases match. The restricted service address of a layer the web replaced with an open download matches and is held. An unrelated host does not match. |
| Policy | For each policy value: view and export results for a restricted match, a municipal match, an open match and no match. |
| Export | A matched restricted user layer makes `buildExportLayers`, `composeMapImage` and the dialog each refuse before any fetch. The user-supplied clause is in the attribution lines and cannot be removed by user text. Layers under an opaque base are neither fetched nor credited. |
| Themes and share | Applying every built-in theme leaves an enabled user layer enabled. A share URL built with a user layer on holds no part of its address. |

### 14.2 Browser check at phone width

Viewport 390 x 844, and again at 844 x 390. Use the browser's location override, moved along a fixed route by a script.

1. Import three test sheets into a catalogue. Two overlap. One is apart.
2. Turn drive mode on. The first sheet shows after the first fix.
3. Move into the overlap. The bar appears. Both buttons are at least 64 px. **Swap** changes the top sheet. **Hide top** shows the one below.
4. Move off all sheets. The chip names the nearest sheet with distance and direction.
5. Record. Stop location for 15 s, then move on. The trace has a gap, not a line.
6. Reload. The catalogue is still loaded. The coverage is still drawn above the sheet.
7. Drag the map. The chip says "Auto paused". Tap Follow. It resumes.
8. Add an XYZ layer. Check the row tag, the map credit and the notice. Switch themes. It stays.
9. Export a PDF with that layer. Read the attribution strip in the file.
10. Paste the `ns-aerial` service address. Check the row text and that export is held.
11. Check no control overlaps another at either orientation.

Tests do not prove layout. Steps 3, 4 and 11 need eyes on a real rendering.

### 14.3 On the device, in a car

These need Dan, or a passenger.

1. Import one real drive sheet on native and on web. Check it lands on the right ground.
2. Drive ten minutes across two sheets. Watch the switch.
3. Press the lock button for one minute while recording. Native: the track continues. Web: the track has a gap.
4. Take a phone call. Same check.
5. Turn Low Power Mode on. Does the screen stay awake? Record the answer per surface.
6. Drive a stretch above 108 km/h where legal. The track keeps growing.
7. End the drive. Reopen the app the next day. Coverage is there.

A forum report says background location can stop after a few minutes on iOS 27 in some setups. It is one report, not confirmed. Step 3 will show whether it affects this app.

## 15. PR plan

Order: **P1**, then **N0 to N5**. **B1 to B3** can run in parallel on the web. Then **W1 to W7**. Then **BN1, BN2**.

Rules for every PR:

- Branch from current `origin/nightly`. Target `nightly`.
- Web PRs run `npm test`, `npm run lint`, `npm run build` in `web/`.
- Native PRs build and test through `~/.claude/bin/xcode-build-slot.sh`.
- A PR that changes what the map shows is checked in a browser or simulator at phone width.
- `web/src/userMaps/store/database.ts`: read `DB_VERSION` on `nightly`, add one, keep the upgrade additive.
- `MapCanvas.tsx` and `App.tsx` are mounting points. New logic goes in new modules.
- No PR changes an id list in `licensing/layerUse.ts` or `MapCatalog/LayerUse.swift`.

Overlap warning: B2, W3, W4 and W6 all touch `MapCanvas.tsx` and `App.tsx`. Land them one at a time.

### Phase P: shared

#### P1. Drive capture profile and gap split

**Goal.** Make recorded drives correct at highway speed and honest across gaps. No UI.

**Read first.** `web/src/location/captureSpec.ts`, `captureSpec.test.ts`, `trackFilter.ts`, `trackRecorder.ts`; `NSMarksCore/Sources/GeoCore/Capture/CaptureSpec.swift`, `TrackFilter.swift`, `TrackRecording.swift`; `NSMarksCore/Tests/ParityFixtures/FieldCaptureFixture.swift`; `docs/field-capture-design.md`.

**Change.**

- `captureSpec.ts`: add `driveTrackFilter` and `driveSimplifyToleranceM` exactly as in 9.2. Leave `trackFilter` untouched. Raise `schema` only if the Swift fixture reader needs it.
- `trackFilter.ts`: `applyFix(state, fix, spec = FIELD_CAPTURE_SPEC.trackFilter)`.
- `trackRecorder.ts`: `createTrackRecorder(now, profile = "walk")`. In `addFix`, when the profile has `gapSplitS` and the new fix is more than that many seconds after the last raw fix, close the segment and open a new one before applying the fix.
- Swift: the same three changes, same names in Swift style.
- Regenerate `field-capture-parity.json` (`npx vitest run captureSpec -u`).

**Acceptance tests.**

1. Walk profile: every existing recorder and filter test passes unchanged.
2. Drive profile: fixes 1 s apart at 30.6 m/s (110 km/h) are all accepted and kept.
3. Walk profile: the same fixes are rejected as `too-fast` after the first.
4. Drive profile: a fix 12 s after the previous one starts a second segment. The first segment ends at the last fix before the silence. No vertex joins them.
5. Walk profile: the same 12 s silence gives one segment, as today.
6. Drive profile: the smoothed position equals the raw position.
7. The Swift parity test passes against the regenerated fixture.

**Out of scope.** Any UI. Choosing the profile at run time (N3, W4).

### Phase N: native drive features

#### N0. Native pre-flight (no code, or tests only)

**Goal.** Close the three unverified points in 3.2 before feature work.

**Do.**

1. Import one real drive sheet (from the agent's pack) in the simulator. Record whether it places itself, and its stored preview size.
2. Read `MapSurface/MapController.swift` around line 2373 and the follow code near 1599 to 1680. Write down how the app can read the user's position when no recording runs.
3. Read the native vector layer record and its store version rule. Write down whether an added optional field survives an older build's rewrite.

**Output.** A short note added to this document under 3.2, in the same PR as N1. If the sheet does not import, stop and report: that is a bug to fix before the rest.

#### N1. Footprint and activation logic in `GeoCore`, with the shared fixture

**Goal.** The rules of section 7 as pure Swift, tested from a fixture the web will reuse.

**Read first.** Sections 7.2 and 7.3. `NSMarksCore/Sources/GeoCore/Georeference/UserMapRecord.swift`, `GeoBoundingBox.swift`, `Geodesy.swift`, `PolygonHitTest.swift`; `NSMarksCore/Tests/ParityFixtures/ParityFixture.swift`.

**Create.**

- `NSMarksCore/Sources/GeoCore/Drive/SheetFootprint.swift`: `static func ring(fromMesh: [[GeoPoint]]) -> [GeoPoint]?` and `signedDistanceM(from: GeoPoint, toRing: [GeoPoint]) -> Double`.
- `NSMarksCore/Sources/GeoCore/Drive/SheetActivation.swift`: `SheetActivationConfig` (the constants in 7.3), `SheetActivationState`, and `static func step(state:, sheets:, fix:, pinned:, dismissed:, isFirstFix:) -> (state, output)`. `output` holds `shown`, `contained`, `status`, `nearest`, `notDrawn`, `clearedDismissals`.
- `NSMarksCore/Tests/ParityFixtures/Fixtures/sheet-activation-parity.json`: the config, plus a list of cases. Each case has sheets as rings, a list of fixes, and the expected output after each fix.
- `NSMarksCore/Tests/GeoCoreTests/SheetActivationTests.swift`.

**Fixture cases, at least.** Enter after two fixes. First-fix entry. Exit needs the margin and two fixes. Accuracy 90 m widens the margin to 90. Accuracy 150 m changes nothing. Two abutting sheets: no `overlap` status at the join. Two overlapping sheets: `overlap` inside the shared strip only. A gap: `off-sheets` with the nearest sheet, distance within 1 m, bearing within 1 degree. Dismissed sheet returns after exit and re-entry. A pinned sheet shows when not entered. Four entered sheets: three shown, `notDrawn` is 1.

**Acceptance tests.** Every fixture case passes. `ring(fromMesh:)` on a 9 x 9 lattice returns 32 points. A rotated square's ring differs from its bounding box.

**Out of scope.** Any UI or store.

#### N2. Catalogue store and panel

**Goal.** Create, load, order and delete catalogues on native.

**Read first.** Section 6. `ns-marks-the-spot/UserMaps/UserMapStore.swift`, `UserMapDisplayStore.swift`, `UserMapsViewModel.swift`, `UserMapRowsView.swift`, `UserMapImporter.swift`; `App/AppContainer.swift`.

**Create.**

- `NSMarksCore/Sources/GeoCore/Drive/DriveCatalogue.swift`: the model in 6.2.
- `ns-marks-the-spot/Drive/DriveCatalogueStore.swift`: an actor. One JSON document `drive-catalogues.json` with a version number. A newer version is refused and never overwritten, as in `UserMapStore`.
- `ns-marks-the-spot/Drive/DriveUiStateStore.swift`: `UserDefaults` key `drive-ui-state-v1`.
- `ns-marks-the-spot/Drive/DriveCataloguesViewModel.swift`: `@MainActor @Observable`. Create, rename, delete, load, unload, reorder, add sheets, remove sheet.
- `ns-marks-the-spot/Drive/CataloguePanelView.swift`: the panel in 6.4.

**Modify.** `UserMapRowsView.swift` to mount the panel above the rows. `UserMapsViewModel.delete(id:)` to tell the catalogue view model. `AppContainer.swift` to own the new objects.

**Rules.** 6.1, all eight.

**Acceptance tests.**

1. Create, rename, reorder and delete round-trip through a temporary directory.
2. A document with a higher version is refused, and a later save does not overwrite it.
3. Deleting a sheet removes its id from every catalogue.
4. Deleting a catalogue leaves every sheet in the library.
5. Importing three files through "New" gives a catalogue with three ids in file-name order.
6. The loaded catalogue id survives a relaunch.

**Manual check.** iPhone simulator, portrait. The panel reads without clipping. Up and Down are easy to hit.

**Out of scope.** Auto-activation (N3). Coverage (N5).

#### N3. Drive mode, screen coordinator and auto-activation

**Goal.** One Drive button. Screen on. The sheet under the car shows.

**Read first.** Sections 7 and 10. `FieldCapture/TrackRecorder.swift` (lines 379 to 400 and `continuesOffScreen`), `LocationFixSource.swift`, `TrackRecordingHUD.swift`; `MapSurface/MapController.swift`; `UserMaps/UserMapsViewModel.swift` (`drapes`); the N0 note.

**Create.**

- `ns-marks-the-spot/Drive/ScreenAwakeCoordinator.swift`: as in 10.3, over the existing `ScreenWakeLock` seam.
- `ns-marks-the-spot/Drive/DriveModeModel.swift`: `@MainActor @Observable`. `isOn`, `status` (the output of `SheetActivation.step`), `pinned`, `dismissed`. It receives position updates and calls `step`.
- `ns-marks-the-spot/Drive/DriveStatusChip.swift`: the chip texts in 7.6.

**Modify.**

- `TrackRecorder.swift`: replace direct writes to `screen.isHeldAwake` with `coordinator.set(.recording, active:)`. Add a `profile` to `start`, passed to `TrackRecording`.
- `LocationFixSource.swift`: `CoreLocationFixSource.init(desiredAccuracy:activityType:)`.
- `UserMapsViewModel.swift`: `drapes` takes the activation output. For sheets of the loaded catalogue with Auto on, visibility is `shown` and opacity is the catalogue's. Row state is not written.
- The map screen: add the Drive button beside the location control.

**Rules.**

1. Section 7.1 decides when activation runs.
2. Section 7.3 is implemented only by calling `SheetActivation.step`. No rule is restated in app code.
3. Section 7.5 for overrides.
4. The screen is held when the scene is active and either reason is set. It is released the moment the scene goes inactive.
5. Turning drive mode off does not stop a recording.

**Acceptance tests.**

1. Coordinator: recording only, drive only, both, neither, each with the scene active and inactive.
2. Stopping a recording while drive mode is on leaves the screen held.
3. A scripted fix sequence through `DriveModeModel` gives the same `shown` list as the fixture case with the same input.
4. With Auto on, `drapes` holds only shown sheets, in catalogue order, at the catalogue opacity.
5. Turning Auto off returns `drapes` to the stored row state.
6. Follow off: a new fix does not change `shown`.
7. Existing `TrackRecorder` seam tests pass.

**Manual check.** Simulator with a GPX route across two test sheets, portrait and landscape. The chip text matches each state in 7.6.

**Out of scope.** Overlap bar (N4). Coverage (N5).

#### N4. Overlap bar

**Goal.** Section 8 on native.

**Read first.** Section 8. `Drive/DriveModeModel.swift`, `Drive/DriveCataloguesViewModel.swift`, `FieldCapture/MapHaptics.swift`.

**Create.** `ns-marks-the-spot/Drive/OverlapBarView.swift`.

**Modify.** The map screen to mount it above the recording HUD. `DriveCataloguesViewModel` gains `cycleTop(entered:)`.

**Rules.** Section 8, all seven.

**Acceptance tests.**

1. `cycleTop` with two entered sheets swaps them in `sheetIds` and saves.
2. With three, three taps return to the first order.
3. Sheets that are not entered keep their relative order.
4. Hide then Show leaves `dismissed` empty.
5. The bar is present only for status `overlap`.
6. A UI test finds both buttons with a frame of at least 64 x 64 pt.

**Manual check.** Simulator, portrait and landscape. The bar does not cover the blue dot.

#### N5. Coverage on native

**Goal.** Section 9 on native.

**Read first.** Section 9. `FieldCapture/SaveTrackSheet.swift`, `TrackCheckpointStore.swift`, `TrackRecorder.swift` (`stop`), `UserVectors/UserVectorStore.swift`, `UserVectorsViewModel.swift`, `UserVectorRowsView.swift`, `MapSurface/UserVectorShape.swift`; the N0 note on the record version.

**Modify or create.**

- The vector layer record: optional `coverage` as in 9.3.
- `DriveModeModel`: mint a `tripId` when a drive recording starts. On stop, save the track without the sheet, tagged, with `CaptureSpec` drive simplify tolerance.
- `UserVectorsViewModel`: coverage layers are filtered out of the ordinary rows while their catalogue exists. A new query returns trips for a catalogue.
- `CataloguePanelView`: the Trips list in 9.5, with Show coverage, GPX per trip, Export coverage, Delete trip.
- `UserVectorShape` or its styling: the styles in 9.5.
- Deleting a catalogue clears the tag on its layers.

**Acceptance tests.**

1. A drive stopped with a catalogue loaded saves one layer with the right tags and no dialog.
2. A drive with no catalogue loaded uses the existing save sheet.
3. Coverage layers do not appear in the ordinary rows. After the catalogue is deleted, they do.
4. Show coverage off removes them from the map state. The setting survives a relaunch.
5. The per-trip GPX has one `<trk>` and one `<trkseg>` per segment, with times.
6. The draw order puts coverage above user maps.
7. A walk recovered from the journal after a kill keeps its trip tags.

**Manual check.** Simulator: record a route over a sheet, relaunch, coverage is drawn above the sheet.

### Phase B: your own layers on the web

#### B1. Model, URL parsing, source matching and store

**Goal.** Everything pure for section 12, with tests. No UI.

**Read first.** Sections 12.2 to 12.4 and 12.8. `web/src/userMaps/store/database.ts`, `userMapStore.ts`; `web/src/layers/layerCatalog.ts` (`provinceLayerCatalog`, `nativeProvinceLayerCatalog`, the zoning and other catalogues), `contextLayerCatalog.ts`, `openDataSources.ts`; `web/src/licensing/layerUse.ts`, `licensingLocks.test.ts`.

**Create.**

- `web/src/userLayers/types.ts`: 12.3.
- `web/src/userLayers/parseLayerUrl.ts`: `guessKind(url)`, `normalizeLayerUrl(url, kind)`, `validateLayerUrl(url)` returning a reason on refusal, `maskUrl(url)`, `hostOf(url)`.
- `web/src/userLayers/sourceMatch.ts`: `sourceKey(url)`, `catalogueSourceIndex()` built from every catalogue including `nativeProvinceLayerCatalog`, `matchCatalogueSource(url)` returning `{ layerId, name, licence } | null`, `USER_LAYER_MATCH_POLICY`, and `userLayerUse(record, policy, provinceLicenceAccepted)` returning `{ view, export, reason, matched }`.
- `web/src/userLayers/store/userLayerStore.ts`: open through `openUserContentDatabase`. `list`, `put`, `delete`.
- Tests beside each file.

**Modify.** `database.ts`: `DB_VERSION + 1`, new store `userLayers`, additive guard. Update the doc comment.

**Acceptance tests.**

1. `guessKind` for one example of each of the five kinds.
2. `validateLayerUrl` refuses `http://example.org`, `javascript:alert(1)`, `data:`, `file:`, and an XYZ address without `{z}`. It accepts `http://localhost:8080/{z}/{x}/{y}.png`.
3. `maskUrl` hides every query value and keeps the path.
4. `sourceKey` gives the same key for `https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer`, the same with `/export?...`, and `https://nsgiwa.novascotia.ca/arcgis/services/BASE/BASE_NSODB_10k_WM84/MapServer/WMSServer`.
5. `matchCatalogueSource` returns `ns-aerial` for all three. It returns `nsprd` for the `nsgiwa2` PLAN service. For the `serviceUrl` of a layer the web replaced with an open download (take `roads` from `nativeProvinceLayerCatalog`), it returns that id, and `userLayerUse` reports export `held`: the lock is asked without the open-data argument. It returns `null` for `https://tiles.example.org/{z}/{x}/{y}.png`.
6. `userLayerUse` table: for each of the three policies, the view and export answers for a `ns-aerial` match, a `zoning-inverness` match, an open-source match, and no match. With `same-lock`: restricted match gives `needs-acceptance` then `allowed` to view and `held` to export, with `reproductionLockReason("ns-aerial")` as the reason. Zoning match gives `refused`.
7. Store: put, list, delete. An upgrade from the previous version keeps existing maps, vectors, photos and the recording draft.

**Out of scope.** UI, drawing, export.

#### B2. Add dialog, rows and drawing

**Goal.** A user can add a layer and see it on the map, labelled as theirs.

**Read first.** Sections 12.5, 12.6, 12.10, 12.11. `web/src/components/ContextTileLayer.tsx`, `web/src/layers/arcGISExport.ts`, `web/src/components/mapPanes.ts`, `web/src/userMaps/components/UserMapRows.tsx`, `web/src/userMaps/useUserMaps.ts` (the `localStorage` handling and the cross-tab `storage` listener), `App.tsx` near lines 3254 and 6218, `MapCanvas.tsx` near line 2700, `web/src/terrain/leafletScene.ts:99`.

**Create.**

- `web/src/userLayers/useUserLayers.ts`: records, row state, `add`, `update`, `remove`, `setEnabled`, `setOpacity`, `visibleLayers`. Row state uses the same guarded `localStorage` pattern as `useUserMaps`. Storage failure degrades to session-only.
- `web/src/userLayers/probe.ts`: `probeLayer(record)` returning `{ display, corsReadable, at }`. One `<img>` load and one `fetch(..., { mode: "cors" })` of a sample tile near the current map centre.
- `web/src/userLayers/tileUrls.ts`: per-kind tile URL builders. WMS `GetMap` and ArcGIS `/export` and `/exportImage` with a Web Mercator box. Reuse `webMercatorBoundsForTile`.
- `web/src/userLayers/components/AddUserLayerDialog.tsx`: 12.5, with the notice text exactly as drawn there.
- `web/src/userLayers/components/UserLayerRows.tsx`: 12.6.
- `web/src/userLayers/components/UserTileLayers.tsx`: one Leaflet layer per visible record.

**Modify.** `mapPanes.ts`: `USER_LAYER_BASE_Z_INDEX = 152`, `USER_LAYER_OVERLAY_Z_INDEX = 158`. First check that no tile-space layer already uses 152 or 158 (`mapPanes.ts`, `contextLayerCatalog.ts`). If one does, take the nearest free value that keeps the order in 12.11. `App.tsx`: call the hook, mount the rows in My Maps under "Your layers". `MapCanvas.tsx`: one new prop `userLayers`, one mount of `UserTileLayers`, not in print mode.

**Rules.**

1. 12.5 rules 1 to 6.
2. The map credit is `Your layer: ` plus the escaped credit line.
3. One base user layer on at a time.
4. A layer whose `userLayerUse(...).view` is `refused` cannot be enabled. `needs-acceptance` opens the existing Province licence prompt.
5. `crossOrigin: "anonymous"` only when `probe.corsReadable === true`.
6. States as in 12.10. A tile error reports `source-error` with the status when known.
7. No user layer is passed to `PrintMap`, to the share URL builder, or to the evidence note.

**Acceptance tests.**

1. Add is disabled until name, credit, terms and the box are set.
2. Editing the address clears the acknowledgement.
3. The row shows the tag, the host, and "not an NS Marks The Spot source". It does not show the query string.
4. A credit line of `<img src=x onerror=1>` renders as text.
5. Enabling a second base layer disables the first.
6. Applying every built-in theme leaves an enabled user layer enabled.
7. `buildMapShareUrl` output with a user layer on contains no part of its address or name.
8. A record matching `ns-aerial` shows the "already offers it" text and needs licence acceptance before it draws.
9. A record matching `zoning-inverness` cannot be enabled and shows the municipal lock text.
10. The layer is not mounted in print mode.
11. A reload restores the records and row state.

**Manual check.** Phone width. Add a public XYZ layer. See the notice, the tag and the credit. Switch themes. Reload.

**Out of scope.** PDF export (B3). Fetching WMS capabilities. 3D draping.

#### B3. PDF export base, attribution and guards

**Goal.** A user layer can be the base of "Export map (PDF)", labelled as user-supplied, under the policy in 12.8.

**Blocked on.** Dan's answer to 12.8. Without it, build with `same-lock`.

**Read first.** Sections 12.7 and 12.8. `web/src/print/pdf/exportLayerSpecs.ts`, `mapCompositor.ts`, `ExportDialog.tsx`, `attributionLines.ts`, `pdfComposer.ts`, `exportLayerGuards.test.ts`; `web/src/licensing/layerUse.ts`, `licensingLocks.test.ts`; `App.tsx` lines 4376 to 4410 and 6780 to 6830.

**Modify.**

- `mapCompositor.ts`: `CompositorTileLayer` and `CompositorImageLayer` gain optional `sourceId?: string`. `composeMapImage` asserts on `layer.sourceId ?? layer.id`.
- `exportLayerSpecs.ts`: `ExportLayerInputs.userLayers`. Tiles for `xyz` and `tms`. One image request for `wms`, `arcgis-map`, `arcgis-image`. A matched record carries `sourceId` and is included in the `assertReproductionAllowed` call. When an opaque base user layer is present, layers below z-index 152 are not emitted.
- `ExportDialog.tsx`: both existing assert calls use `sourceId ?? id`. Show the one-line reminder in 12.7.
- `attributionLines.ts`: `userLayerAttributionLines(layers)` returning the fixed-clause lines in 12.7. Called after `exportAttributionLines`.
- `App.tsx`: pass exportable user layers. Add the others to `omittedLayerNames` with their reason (`cannot be read for a PDF`, `not tested`, or the lock reason).

**Rules.**

1. A user layer is exportable only when enabled, `probe.corsReadable === true`, and `userLayerUse(...).export === "allowed"`.
2. The fixed clause is app text. User text is appended after it and cannot replace it.
3. The printed line shows the host, never the address.
4. A failed user-layer request is a failure, with the existing incomplete-export consent. No other base is substituted.
5. No id list in `layerUse.ts` changes.

**Acceptance tests.**

1. `buildExportLayers` with an XYZ user layer emits a `tile` layer with the right URL for a known tile.
2. With a WMS user layer it emits one `image` layer whose URL has `BBOX`, `WIDTH`, `HEIGHT`, and `SRS` or `CRS` for EPSG:3857.
3. A user layer matching `ns-aerial` under `same-lock` makes `buildExportLayers` throw the Province reproduction reason, with no fetch.
4. The same layer handed straight to `composeMapImage` is refused before `fetchImage` is called.
5. `userLayerAttributionLines` output starts with `User-supplied layer, not an NS Marks The Spot source:` for any name, including a name that contains that same sentence.
6. The output contains the host and no query string.
7. With an opaque base user layer and `modern` on, no `modern` layer is emitted and no OSM or Atlas credit is produced.
8. A user layer with `corsReadable: false` is absent from the layers and present in `omittedLayerNames` with its reason.
9. A selected parcel still locks the export with a user layer on.
10. All existing `licensingLocks.test.ts` cases pass unchanged.

**Manual check.** Export a Letter PDF with a public XYZ base. Open it. Read the strip. Open it in QGIS or with `gdalinfo` and check it is georeferenced.

**Out of scope.** Browser Print. Offline tile caching.

### Phase W: web drive features

#### W1. Footprint and activation logic in TypeScript

**Goal.** Section 7 in TypeScript, passing the fixture from N1.

**Read first.** Sections 7.2, 7.3. `web/src/userMaps/recordMesh.ts`, `web/src/services/geodesy.ts`, `web/src/location/captureSpec.test.ts` (how a fixture under `NSMarksCore/Tests/ParityFixtures/Fixtures/` is read).

**Create.** `web/src/drive/sheetFootprint.ts`, `web/src/drive/sheetActivation.ts`, and tests that run every case in `sheet-activation-parity.json`.

**Acceptance tests.** Every fixture case passes. `footprintForRecord(record)` returns `null` when `meshForRecord` does. A 9 x 9 lattice gives 32 vertices.

**Out of scope.** React, storage.

#### W2. Lazy previews and a set stacking order

**Goal.** Thirty sheets must not load thirty previews. Stacking order must be set, not left to mount order.

**Read first.** `web/src/userMaps/useUserMaps.ts` lines 401 to 468 and 935 to 948; `components/UserMapLayers.tsx`; `render/WarpedRasterLayer.ts` (`onAdd` near line 287); the caching tests.

**Modify.**

- `useUserMaps.ts`: stop reading every preview at load. Add `wantedPreviewIds` (enabled rows, the map being georeferenced, the frame chooser's map, plus ids passed in through a new option `extraPreviewIds`). Load a preview when its id becomes wanted. Revoke its URL 30 s after it stops being wanted.
- `WarpedRasterLayer.ts`: option `zIndex` and method `setZIndex`, applied to the canvas style.
- `UserMapLayers.tsx`: pass the array index as `zIndex`, so later entries draw on top.

**Acceptance tests.**

1. With ten stored maps and one enabled, exactly one `getPreviewBlob` call is made at load.
2. Enabling a second map loads its preview once.
3. Disabling a map revokes its URL after the delay and not before.
4. A map being georeferenced keeps its preview while its row is off.
5. Reversing the `maps` array reverses the canvases' `zIndex` without rebuilding a layer.
6. All existing `useUserMaps` and `WarpedRasterLayer` tests pass.

**Manual check.** Phone width. Enable two overlapping sheets. The later one is on top. Reload. Same order.

#### W3. Catalogue store, hook and panel

**Goal.** Section 6 on the web.

**Read first.** Section 6. `web/src/userMaps/store/database.ts`, `userMapStore.ts`, `useUserMaps.ts` (`importFiles`, `removeMap`, `outcomes`), `importRouting.ts`, `components/UserMapRows.tsx`, `App.tsx` near line 6218.

**Create.**

- `web/src/drive/types.ts`: 6.2.
- `web/src/drive/driveCatalogueStore.ts`: over `openUserContentDatabase`.
- `web/src/drive/useDriveCatalogues.ts`: catalogues, `DriveUiState` in `localStorage`, create, rename, delete, load, reorder, add and remove sheets, `cycleTop(enteredIds)`.
- `web/src/drive/components/CataloguePanel.tsx`: 6.4.

**Modify.** `database.ts`: `DB_VERSION + 1`, store `catalogues`. `App.tsx`: call the hook, mount the panel in My Maps, and after `routeImportFiles` settles add each successful raster import id to the target catalogue. `removeMap` callers also call `removeSheetEverywhere(id)`.

**Rules.** 6.1.

**Acceptance tests.** As N2 tests 1 and 3 to 6, against fake-indexeddb. Plus: an upgrade from the previous database version keeps maps, vectors, photos and the draft. A corrupt `drive-ui-state-v1` value reads as the default and does not throw.

**Manual check.** Phone width. Create a catalogue from three files. Reorder with Up and Down. Reload.

#### W4. Drive mode, wake lock state and auto-activation

**Goal.** Sections 7 and 10.2 on the web.

**Read first.** Sections 7 and 10. `web/src/location/wakeLock.ts`, `wakeLock.test.ts`, `useTrackRecording.ts`, `useLiveLocation.ts`; `MapCanvas.tsx` lines 2129 to 2160, 2308 to 2494, 2700, 3184 to 3300.

**Create.**

- `web/src/drive/useDriveMode.ts`: takes `{ fix, liveStatus, followOn, catalogue, sheets }`. Holds the wake lock handle, `pinned`, `dismissed`, and the activation state. Returns `{ on, toggle, shown, status, wakeLockState, pin, dismiss, restore }`.
- `web/src/drive/components/DriveStatusChip.tsx`: the texts in 7.6 and 10.2.

**Modify.**

- `wakeLock.ts`: the handle in 10.2. Existing callers keep working.
- `useTrackRecording.ts`: `start(profile = "walk")`, passed to `createTrackRecorder`. Use `driveSimplifyToleranceM` as the default tolerance for a drive save.
- `MapCanvas.tsx`: new props `driveCatalogue` and `driveSheets` (record, preview URL). Call `useDriveMode`. Build the `maps` list for `UserMapLayers`: sheets outside the catalogue from `userMaps`, then `shown` in catalogue order with the top sheet last, at the catalogue opacity. Add the Drive button to the location cluster. Mount the chip.
- `App.tsx`: pass the loaded catalogue and its sheets. Pass their ids as `extraPreviewIds` for the shown and entered sheets only.

**Rules.** Sections 7.1, 7.3 (by calling `stepSheetActivation` only), 7.5, 10.1, 10.2. Drive mode off does not stop a recording.

**Acceptance tests.**

1. Wake lock: the four states. A rejection while hidden is not `refused`. Two handles do not release each other.
2. `useDriveMode` with a scripted fix list gives the fixture's `shown` list.
3. Follow off: a new fix does not change `shown`, and the chip says "Auto paused".
4. With Auto on, a catalogue sheet whose row is off still draws when entered. `user-map-ui-state-v1` is not written.
5. With Auto off, the `maps` list equals today's `visibleMaps`.
6. Turning drive mode off while recording leaves the recording running.
7. Print mode mounts none of this.
8. All existing recording tests pass.

**Manual check.** Section 14.2 steps 1, 2, 4, 6, 7.

#### W5. Overlap bar

**Goal.** Section 8 on the web.

**Read first.** Section 8. `web/src/drive/useDriveMode.ts`, `useDriveCatalogues.ts`, `web/src/styles.css` (the `.location-hud` rules).

**Create.** `web/src/drive/components/OverlapBar.tsx` and its CSS.

**Modify.** `MapCanvas.tsx` to mount it. The follow effect gets a vertical offset while the bar is shown.

**Acceptance tests.** As N4 tests 1 to 5. Plus: both buttons have `min-height` and `min-width` of 64 px in the rendered style, each has an accessible name that includes the top sheet's name, and the bar has no `role="status"` (its content does not change on a clock).

**Manual check.** Section 14.2 step 3, both orientations. No control overlaps another.

#### W6. Coverage on the web

**Goal.** Section 9 on the web.

**Read first.** Section 9. `web/src/location/useTrackRecording.ts`, `trackFeature.ts`, `rawTrackGpx.ts`, `SaveTrackDialog.tsx`; `MapCanvas.tsx` lines 2536 to 2600; `App.tsx:2217`; `web/src/userMaps/vector/types.ts`, `useUserVectorLayers.ts` (`createRecordedLayer`), `vector/components/UserVectorRows.tsx`, `vector/render/`, `vector/export/gpxWriter.ts`.

**Create.**

- `web/src/drive/driveSession.ts`: read, write and clear `drive-session-v1`.
- `web/src/drive/components/TripsList.tsx`: the list in 9.5.

**Modify.**

- `vector/types.ts`: optional `coverage`.
- `useUserVectorLayers.ts`: `createRecordedLayer` accepts `coverage`. Add `tripsFor(catalogueId)`, `clearCoverage(catalogueId)`, `removeTrip(tripId)`.
- `useTrackRecording.ts`: `rollover(): StopResult | null`. It stops the recorder, starts a new one with the same profile, feeds the last consumed fix to the new one, and returns the finished result. The wake lock is not released.
- `MapCanvas.tsx`: in drive mode with a catalogue, Stop saves without the dialog. A 30-minute timer calls `rollover` and saves the leg. A recovered draft is tagged from `drive-session-v1` when it started at or after the noted leg start.
- `UserVectorRows.tsx`: skip layers that have `coverage` and a living catalogue.
- The vector renderer: the styles in 9.5 for coverage layers.
- `useDriveCatalogues.ts`: deleting a catalogue calls `clearCoverage`.

**Acceptance tests.**

1. Stop in drive mode with a catalogue saves one tagged layer and opens no dialog.
2. Stop with no catalogue opens the existing dialog.
3. `rollover` returns a result whose last vertex equals the first vertex of the next recording. The sum of raw fix counts of both legs equals the fixes fed, plus one shared fix.
4. Two legs of one trip appear as one row in the Trips list, with the summed distance.
5. A recovered draft that began after the noted leg start is tagged. One that began before is not.
6. Coverage layers are absent from "Your data" and return after the catalogue is deleted.
7. Per-trip GPX has one `<trk>` and one `<trkseg>` per segment.
8. A storage refusal reports "on the map, not saved", as today.

**Manual check.** Section 14.2 steps 5 and 6.

#### W7. Optional: pack manifest

**Goal.** One drop loads a named, ordered catalogue.

**Read first.** `web/src/userMaps/importRouting.ts`, `useDriveCatalogues.ts`.

**Change.** A JSON file with `"nsmtsCatalogue": 1`, `name`, and `sheets: [{ "file": "mabou-01.pdf" }]` is recognised before the vector pipeline sees it. After the batch imports, a catalogue is created with the listed order. A listed file that is missing from the drop is named in the outcome. It is not invented.

**Acceptance tests.** A drop of a manifest and three PDFs gives one catalogue in manifest order. A manifest naming a fourth, absent file reports it and still makes the catalogue of three. A manifest alone makes nothing and says why. A GeoJSON file is still routed as before.

Build this only if Dan wants it (question 6).

### Phase BN: your own layers on native

These two are specified at a lower level of detail. The native print path was not read for this design. Each starts with reading.

#### BN1. Store, add sheet and drawing

**Goal.** Sections 12.3 to 12.6 on native.

**Read first.** `ns-marks-the-spot/MapSurface/MapViewState.swift` (`TileLayerSource`, `TileLayerConfiguration`), `OpacityTileOverlay.swift`, `TileReproductionScope.swift`, `Services/TileFetcher.swift`, `Services/TileCache.swift`, `Layers/ActiveAttribution.swift`, `Layers/LayerAttribution.swift`; `NSMarksCore/Sources/NSDataServices/TileRequestFactory.swift`, `ArcGISExportURL.swift`; `NSMarksCore/Sources/MapCatalog/LayerUse.swift`, `LayerCatalog.swift`.

**Create.** `NSMarksCore/Sources/GeoCore/UserLayers/UserLayerRecord.swift`, `UserLayerURL.swift` (parse, validate, mask), `UserLayerSourceMatch.swift` (the same key rule as 12.8, against `LayerCatalog`); `ns-marks-the-spot/UserLayers/UserLayerStore.swift`, `UserLayersViewModel.swift`, `AddUserLayerSheet.swift`, `UserLayerRowsView.swift`.

**Modify.** `TileLayerSource`: add `.userLayer(UserLayerRecord.ID)`. `reproductionSourceLayerID` returns the matched catalogue id for a matched record. The tile request path builds XYZ, TMS, WMS and ArcGIS addresses. User-layer tiles are not written to the offline store.

**Acceptance tests.** The source-match table from B1 test 5, in Swift. The URL validation table from B1 test 2. The store round-trip, with a newer version refused. A matched `ns-aerial` record needs the Province clearance before a request is built. A user layer's attribution appears with the "Your layer" prefix. Its tiles are never written to the saved-area store.

#### BN2. Native print export

**Goal.** Section 12.7 on native.

**Read first.** `ns-marks-the-spot/Print/PrintExportPlan.swift`, `PrintMapCompositor.swift`, `PrintExport.swift`, `PrintExportSheet.swift`; `MapCatalog/LayerUse.swift`.

**Change.** Include an enabled user layer in the export plan. Check `LayerUse.requireReproduction` with the matched id. Add the fixed-clause attribution line. Name non-exportable user layers as not included.

**Acceptance tests.** A matched `ns-aerial` user layer is refused before any network work. An unmatched layer exports. The fixed clause is present and cannot be displaced by user text. No address or key is printed.

## 16. Open questions for Dan

1. **Matched restricted source (12.8).** A, B, C or D? This blocks only B3 and BN2. The recommendation is A, with D started.
2. **Native first for the drive features (11).** Agreed? If the web should come first instead, the order becomes W1 to W6, then N.
3. **Is the web drive phase wanted at all?** If the phone in the car always runs the native app, W3 to W7 can be dropped. W2 is still worth doing for memory.
4. **Drive profile numbers (9.2).** A 180 km/h gate, no smoothing, a 10 s gap split. Change any?
5. **Sheet opacity.** Should a loaded catalogue draw its sheets fully opaque by default?
6. **Pack contents.** Should the agent add a manifest (W7)? Should it add the roads to cover as a GeoJSON or GPX file, for a later "what is left" view?
7. **Open imagery.** Do the NSODB orthophotos exist as files under the Open Government Licence? Not verified here. If they do, drive PDFs with an aerial base can be made outside the app with no lock in the way.
8. **KinNoKi pin.** Who raises it after the web PRs merge? Merging here does not deploy.
9. **Trips after a catalogue is deleted.** The design keeps them as ordinary tracks. Is that right, or should they be deleted with it after a confirmation?

## 17. Sources

Code and documents, all at `ec1292ebf`: `AGENTS.md`, `ARCHITECTURE.md`, `web/README.md`, `docs/licensing-locks.md`, and the files named in section 3.

Platform facts:

- [Safari 18.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes.md)
- [WebKit bug 254545: Wake Lock API does not work in Home Screen Web Apps](https://bugs.webkit.org/show_bug.cgi?id=254545)
- [Screen wake lock, web-features explorer](https://web-platform-dx.github.io/web-features-explorer/features/screen-wake-lock)
- [iOS PWA compatibility notes, firt.dev](https://firt.dev/notes/pwa-ios/)
- [WebKit bug 193946](https://bugs.webkit.org/show_bug.cgi?id=193946)
- [Apple Developer Forums: background location stops on iOS 27](https://developer.apple.com/forums/thread/844579), one unconfirmed report

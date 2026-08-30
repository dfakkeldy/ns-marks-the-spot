# Field capture design: GPS points, tracks, snapping, photos, attributes

Status: approved scope. Web W1 (live GPS + Field notes mark, #261), W2
(foreground track recording with raw-GPX original, #262), W3 (GPX
export for user layers and raw-recording downloads, #266), W4 (snap
geometry math and the NSPRD parcel snap source, #269), and W5 (snap-to-parcel
drawing, licence-gated, with traced provenance, #271) are implemented.
Remaining web work starts at W6. Native recording (N1) is not shipped.
Produced 2026-08-28 from a code survey of both surfaces, four subsystem design
passes, and an adversarial cross-review that reconciled them. Decisions marked
"approved" were made by the project owner in this session and are fixed;
"open" items are listed in the final section.

The single most important section is **The field-capture contract**. It pins
every constant, key name, and file profile the two surfaces share. Implement
from the contract first; the per-subsystem sections say how each surface honors
it.

## Goals and use cases

Users need to create map data in the field and at the desk:

- Drop a point at the current GPS position.
- Record a walked or driven track, with noise filtering while recording and
  simplification on save.
- Turn a collection of points into a line or polygon.
- Snap new geometry to NSPRD parcel boundaries and to their own features.
- Attach photos and freeform attributes to any feature, place photos by their
  EXIF geotag, and (on iOS) see their whole photo library as a map layer.

Primary use cases: creating forestry layers and drawing landscaping plans.
That means precision tracing, clean polygons, and area awareness matter more
than navigation features.

## Approved decisions

1. Local-first per surface. Portability is file exchange only (GeoJSON, GPX,
   KMZ). No backend, no iCloud sync.
2. Photos: iOS gets a full photo-library map layer via PhotoKit. Web gets
   picked-files plus EXIF placement. `exifr` is authorized as a new pinned web
   dependency; iOS stays zero-third-party-dependency.
3. Track recording is foreground-only on both surfaces. Web holds a screen
   wake lock; iOS disables the idle timer and auto-pauses on background.
4. Web ships first; iOS mirrors after. Data models stay compatible throughout.
5. Snap targets are NSPRD parcel boundaries and the user's own features.
   Parcel snapping is licence-gated. Snapped coordinates may be stored and
   exported, with a "not a survey" caveat in the UI and on the feature. Zoning
   (live-query-only redistribution) must never become snappable and its
   geometry is never persisted.
6. Smoothing is both live filtering while recording and Douglas-Peucker
   simplification on save. Raw fixes are retained.
7. Attributes are freeform now (name, description, arbitrary key-value pairs,
   photos, timestamps). Storage is shaped so per-collection typed templates
   can arrive later without migration.
8. Photo interchange is KMZ with embedded photos. GeoJSON export stays
   geometry plus attributes, with an honest note that photos are not included.
9. Points-to-line and points-to-polygon conversion is in scope.

## Current state (what already exists)

Web (`web/src/`):

- Drawing via `@geoman-io/leaflet-geoman-free` 2.20.0: Point/Line/Polygon
  tools, reshape/move/delete, one layer in edit at a time, official layers
  protected by `L.PM.setOptIn(true)`
  ([EditableVectorLayer.tsx](../web/src/userMaps/vector/edit/EditableVectorLayer.tsx)).
- User vector layers persisted in IndexedDB with provenance (`drawn`,
  `imported`, or `recorded`), debounced saves, original-file blobs kept
  alongside live geometry
  ([userVectorStore.ts](../web/src/userMaps/vector/store/userVectorStore.ts),
  schema owner [database.ts](../web/src/userMaps/store/database.ts), DB_VERSION 2).
- Import: GeoJSON, KML, KMZ, GPX, zipped shapefile. Export: GeoJSON, KML,
  and GPX (layer GPX via
  [gpxWriter.ts](../web/src/userMaps/vector/export/gpxWriter.ts); Raw GPX
  original-file download on recorded layers), user layers only. Recorded
  layers keep raw GPX as the original-file blob.
- Live GPS watch (`watchPosition`) with follow mode, heading, and one-tap
  mark into a Field notes layer. Location stays out of share URLs and print
  ([liveLocation.ts](../web/src/location/liveLocation.ts),
  [useLiveLocation.ts](../web/src/location/useLiveLocation.ts),
  [MapCanvas.tsx](../web/src/components/MapCanvas.tsx)).
- Foreground track recording: start/pause/resume/stop, contract filter
  pipeline, Douglas-Peucker simplify on save, processed LineString /
  MultiLineString plus raw GPX as the layer original, origin `recorded`
  ("Recorded on this device")
  ([trackRecorder.ts](../web/src/location/trackRecorder.ts),
  [useTrackRecording.ts](../web/src/location/useTrackRecording.ts),
  [SaveTrackDialog.tsx](../web/src/location/SaveTrackDialog.tsx),
  [rawTrackGpx.ts](../web/src/location/rawTrackGpx.ts)).
- NSPRD parcel polygons already reach the browser as GeoJSON for identify and
  mineral-proximity queries ([nsprd.ts](../web/src/services/nsprd.ts),
  [mineralProximity.ts](../web/src/services/mineralProximity.ts)); the paged
  bbox-query convention lives in
  [arcGISFeatureOverlay.ts](../web/src/services/arcGISFeatureOverlay.ts).
- Snap geometry helpers on the existing geodesic module:
  `localMetricProjection` and `nearestPointOnSegment` (planar metres about a
  local reference; no UI)
  ([geodesy.ts](../web/src/services/geodesy.ts)).
- NSPRD parcel snap source: `fetchSnapParcels` (envelope query, PID-keyed,
  polygons only) and in-memory `ParcelSnapCache` (LRU 3000, viewport
  selection, fail-closed dense state). No UI, no schema change, no licence
  gate in this data layer; the W5 UI consumes it
  ([parcelSnapSource.ts](../web/src/services/parcelSnapSource.ts)).
- Parcel snap targets and snap tracker: `ParcelSnapTargetsLayer` mounts
  viewport NSPRD polygons as faint dashed snap-only geometry (zoom 16+,
  licence-gated at the mount site); `snapTracker` shows one indicator
  (square = vertex, round = edge) and stamps `nsmts:traced: "nsprd-parcel"`
  at snap-event time, plus `nsmts:createdAt` on the `pm:create` path
  ([ParcelSnapTargetsLayer.tsx](../web/src/userMaps/vector/edit/ParcelSnapTargetsLayer.tsx),
  [snapTracker.ts](../web/src/userMaps/vector/edit/snapTracker.ts)).
- Panel snapping group: master toggle ("Snap while drawing"), My features,
  and Parcel boundaries (NSPRD), with `LicenceIntent` kind `snap` and the
  standing caveat "Traced boundaries are not a survey." Zoning stamps
  `snapIgnore: true`
  ([VectorEditPanel.tsx](../web/src/userMaps/vector/edit/VectorEditPanel.tsx),
  [ZoningLayer.tsx](../web/src/components/ZoningLayer.tsx)).
- Traced provenance on export: GeoJSON foreign member, KML Document
  description, and GPX metadata desc when any feature was parcel-traced
  ([tracedProvenance.ts](../web/src/userMaps/vector/export/tracedProvenance.ts)).
- Geoman `map.pm` init: the session effect constructs `L.PM.Map` when the
  page-load map never received Geoman's addInitHook (the New drawing layer
  crash)
  ([EditableVectorLayer.tsx](../web/src/userMaps/vector/edit/EditableVectorLayer.tsx)).

Missing on web: points-to-path conversion, photos, EXIF,
attribute editing beyond name/description.

iOS (`ns-marks-the-spot/`, `NSMarksCore/`):

- Drawing (point/line/area), import/export of the same formats, actor-guarded
  JSON persistence, display-only location dot, licence gating, print export.
- Missing: track recording, any camera or PhotoKit code (no permission strings
  exist), per-feature notes/photos/attributes, snapping, conversion.
- Known bug found during this design:
  `UserVectorStore.write(_:)` writes back whatever library version it read
  instead of stamping `UserVectorLibrary.currentVersion`. Fix rides the first
  native PR.

## The field-capture contract

This section is normative for both surfaces. Every constant below is pinned in
one checked-in fixture,
`NSMarksCore/Tests/ParityFixtures/Fixtures/field-capture-parity.json`,
following the existing `layer-parity.json` pattern. Web asserts its constants
against the fixture by relative path (precedent:
[layerParity.test.ts](../web/src/layers/layerParity.test.ts)); a new Swift
`FieldCaptureParityTests` asserts the GeoCore constants. Each surface defines
each constant exactly once (web: `web/src/location/captureSpec.ts` plus the
snapping constants module; iOS: GeoCore), imported by the modules and asserted
by one test.

The fixture file lands with the first web PR and grows as later PRs pin more of
the contract.

### Reserved feature properties (the `nsmts:` namespace)

All app-owned metadata lives under the `nsmts:` prefix in GeoJSON `properties`.
`name` and `description` stay as-is (they map to KML fields). The freeform
attribute editor refuses keys that are `name`, `description`, simplestyle keys,
or anything starting with `nsmts:`.

| Key | Type | On | Meaning |
| --- | --- | --- | --- |
| `nsmts:capturedAt` | ISO 8601 string | marked points | GPS capture time |
| `nsmts:accuracyM` | number | marked points | reported horizontal accuracy, metres |
| `nsmts:altitudeM` | number, optional | marked points | altitude if the fix had one |
| `nsmts:recording` | object | recorded tracks | `{ startedAt, endedAt, rawFixCount, acceptedFixCount, simplifiedVertexCount, simplifyToleranceM, smoothingAlpha }` |
| `nsmts:photos` | array | any feature | photo descriptors, profile below |
| `nsmts:traced` | string `"nsprd-parcel"` | any feature | some vertex was placed via a parcel snap; carries the not-a-survey caveat |
| `nsmts:createdAt` | ISO 8601 string | app-created features | stamped only at creation (web: the `pm:create` path, never in `adopt()`; iOS: at feature creation). Never fabricated for imported features |
| `nsmts:convertedFromPoints` | number | converted features | count of source points |

Per-vertex track timestamps use the togeojson convention, not the namespace:
`properties.coordinateProperties.times` is a string array parallel to
`coordinates` (array of arrays for MultiLineString). Both GPX writers emit
per-vertex `<time>` from it; both GPX parsers must read trkpt `<time>` into it.
The iOS `GpxParse` currently drops trkpt time and gains that parsing in the
first native PR. KML/KMZ export drops per-vertex times; GeoJSON and GPX are the
formats that carry them.

Popups and callouts render GPS provenance ("Marked from GPS on this device
(±7 m)") only when `nsmts:capturedAt` and `nsmts:accuracyM` are both present.
This is honest labeling of user data, not proof; an imported file could carry
the keys, and the provenance line still correctly describes the claim the data
makes about itself.

### Recorded layers and raw fixes

- `UserVectorSource` gains `"recorded"` on both surfaces. Web also gains
  `"photos"` for bulk photo-placement layers.
- `UserVectorOrigin` gains `{ kind: "recorded", startedAt, endedAt }` (ISO
  strings on web, Dates in Swift Codable with those key names). Provenance
  string: "Recorded on this device".
- Every recording saves as a new layer. The raw recording rides the existing
  original-file mechanism: a GPX 1.1 document containing every received fix
  (kept and dropped alike), one `<trkseg>` per recording segment, `<time>` and
  `<ele>` per point, accuracy in `<extensions>`. Web stores it under the
  existing `${id}:vector-original` blob key (no schema change); iOS stores it
  through `UserVectorStore.add(_:geometry:original:)`. Both surfaces label the
  original-file export "Raw recording (GPX)" for recorded layers.
- The layer's geometry is the filtered, smoothed, simplified LineString (or
  MultiLineString when pause/resume produced multiple segments). The raw GPX is
  the evidence; the geometry is the labeled, processed view. There is no
  separate raw-track store and no per-fix disposition taxonomy.
- iOS bumps `UserVectorLibrary.currentVersion` to 2 so old builds refuse
  cleanly (`fromALaterVersion`) instead of reporting damage, and
  `UserVectorStore.write(_:)` stamps the current version (the bug above).

### Track filter and simplification constants

Applied identically on both surfaces, in fix order, against the last accepted
fix:

| Constant | Value | Rationale |
| --- | --- | --- |
| `accuracyGateM` | 25 | reject fixes with reported accuracy worse than 25 m (or ≤ 0); swallows cold-start and wifi-fallback fixes |
| `maxSpeedMps` | 30 | reject fixes implying speed over 30 m/s (108 km/h) from the last accepted fix; clears trucks on woods roads, catches multipath teleports |
| `smoothingAlpha` | 0.6 | exponential smoothing on accepted fixes, `smoothed = prev + 0.6 × (fix − prev)` per axis; light enough to keep walked corners |
| `minSpacingFloorM` | 2 | keep a fix only if it moved at least `max(2, 0.5 × accuracy)` metres from the last kept vertex |
| `spacingAccuracyFactor` | 0.5 | the adaptive half of the spacing rule: movement smaller than half the error radius is noise |
| `simplifyDefaultToleranceM` | 1 | Douglas-Peucker default; below the GPS noise floor, typically 60-80 % vertex reduction |
| `simplifyPresetsM` | [0, 0.5, 1, 2, 5] | user-selectable in the save dialog on both surfaces; 0 = off; chosen value recorded in `nsmts:recording.simplifyToleranceM` |

The final fix on stop is always kept so the track ends where the user did.
Pause closes the current segment; resume opens a new one; no connector is drawn
or stored between segments. Simplification is stack-based (no recursion),
runs per segment, keeps endpoints, uses perpendicular distance in local planar
metres (equirectangular projection about the segment's mean latitude, the same
hand-rolled style as `web/src/services/geodesy.ts`), and applies the same kept
indices to `coordinateProperties.times`.

Smoothing moves stored coordinates. That is deliberate and approved: the user
chose jitter smoothing, the raw GPX original retains the unmodified fixes, and
`nsmts:recording.smoothingAlpha` declares that processing on the feature
itself.

Web `watchPosition` options: `enableHighAccuracy: true`, `maximumAge: 0` and
`timeout: 20000` while recording, `maximumAge: 5000` when only the marker is
on.

### Snapping constants and the caveat

| Constant | Value | Notes |
| --- | --- | --- |
| `snapMinZoom` | 16 | parcel snapping arms at zoom 16+ (native uses the equivalent altitude); 15 screen units ≈ 25 m at z16 and ≈ 6 m at z18 at NS latitude |
| `snapToleranceScreenUnits` | 15 | pixels on web, points on iOS |
| `snapVertexPriority` | vertex-first | a vertex candidate within tolerance beats any edge candidate; otherwise the nearest edge projection wins |
| `maxSnapParcels` | 600 | more parcels in view than this and snapping reports "too many parcels here, zoom in" and mounts nothing. Fail closed, never a silent subset |
| `parcelCaveat` | `"Traced boundaries are not a survey."` | exact string, pinned; rendered wherever the parcel toggle is visible and in the provenance of `nsmts:traced` features |

Snap targets are the user's own features (default on) and NSPRD parcels
(default off, licence-gated). Snap preferences are session-scoped, not
persisted; each edit session starts from the defaults. Zoning is structurally
excluded on both surfaces: web stamps `snapIgnore: true` on zoning geometry
and pins it with a test; the iOS `SnapEngine` source enum contains only
`ownFeature` and `parcel`, asserted by test.

Tracing stamps `nsmts:traced: "nsprd-parcel"` at snap-event time, not by
comparing coordinates after the fact. On web, the snap indicator keeps a
WeakSet of working/edited layers that received a `pm:snap` whose source layer
carries the `nsmtsSnapSource: "nsprd-parcel"` option; at publish, features
from flagged layers get the property. Coordinate-equality reconciliation is
forbidden here: Leaflet's `toGeoJSON` rounds to 6 decimal places, so
full-precision comparisons never match. A vertex later dragged away from the
parcel keeps the stamp; conservative over-labeling is acceptable, silent
under-labeling is not. Any code that must compare stored coordinates rounds
both sides through 6-decimal formatting first.

### KMZ photo profile

Zip layout, identical bytes-in-structure on both surfaces:

```
doc.kml                # KML 2.2, DEFLATE, Document name = layer name
files/<photoId>.jpg    # one STORED entry per attached photo
```

Photo descriptor, the value of `nsmts:photos`:

- Internal form (GeoJSON properties, IndexedDB, JSON documents):
  `{ id, capturedAt?, sourceName?, width?, height? }`. Both surfaces always
  write `width`/`height`; parsers treat them as optional.
- KMZ form: the same object plus required `href: "files/<id>.jpg"`. Export
  rewrites internal to KMZ form; import rewrites back, re-minting ids.
- Parsers ignore unknown fields. A malformed `nsmts:photos` value is treated
  as an opaque user attribute: shown in the attribute editor, never
  interpreted as photos, with a per-file note on import.

Placemark content:

- `<name>` and `<description>` from the feature. The description is written as
  a CDATA section: the user's text, then a blank line, then one
  `<img src="files/<id>.jpg" width="400"/>` per photo so Google Earth renders
  them. Import strips every `<img>` tag whose `src` begins with `files/` and
  trims trailing whitespace, tolerant of either surface's historical output.
- `<ExtendedData>` carries one `<Data name="key"><value>` per property except
  `name`, `description`, and `coordinateProperties` (dropped; times are
  GPX/GeoJSON-only). All `nsmts:` keys are written, so `nsmts:traced` and
  `nsmts:recording` survive a KMZ round trip; `nsmts:photos` is written in KMZ
  form. Non-string scalars and objects are JSON-stringified. KML round trips
  are string-typed; GeoJSON is the type-faithful format and the export UI says
  so.

Plain KML export omits `nsmts:photos` and the img appendix (no dangling
references) and keeps the other `nsmts:` keys. GeoJSON export keeps
`nsmts:photos` in internal form (stable ids, no bytes), which lets a
same-device reimport re-link photos that still exist; the UI note reads
"Photos aren't included in GeoJSON. Use KMZ to carry photos."

### Photo processing policy

Identical on both surfaces. Every ingested photo (camera or library) is
decoded, orientation-corrected, downscaled to a 2048 px long edge, and
re-encoded as JPEG quality 0.8, with a 256 px quality 0.7 thumbnail. Re-encoding
strips all EXIF, including GPS, from stored and exported bytes; the only
location that survives is feature geometry the user confirmed. Caps: 20 photos
per feature, 500 per layer, 50 MB input file cap, refusal messages name the
cap. Capture time comes from EXIF `DateTimeOriginal` (web) or
`PHAsset.creationDate` (iOS) and lives in the descriptor's `capturedAt`; it is
never invented.

### Points-to-path conversion rule

- Input: the layer's Point features in stored array order (document order,
  which is creation order for drawn layers). No reordering UI in v1; the
  numbered on-map preview is the safeguard.
- Validation: at least 2 points for a LineString, 3 for a Polygon. Consecutive
  exact-duplicate coordinates are dropped. Polygon rings close by repeating
  the first position. Self-intersection is detected (O(n²) segment test) and
  warned, not blocked.
- Output: a new feature with `generateId()` id, `nsmts:createdAt` now,
  `nsmts:convertedFromPoints: n`, and `nsmts:traced` copied if any source
  point carried it.
- Source points are kept by default; a checkbox removes them in the same
  commit. One-shot undo: web recommits the pre-conversion collection through
  the session's normal write path; iOS uses the existing erased-features
  pattern. Undo clears on any later commit or session end.

### Other pinned behaviors

- Mark-my-location destination: if an edit session is open, the point is
  committed through that session into the edited layer; otherwise it appends
  to an auto-created drawn layer named "Field notes" (created once, reused,
  recreated if deleted). Same rule both surfaces; the name is in the fixture.
- Capture paths assign feature ids (`generateId()` / UUID) before appending;
  photo descriptors and any per-feature lookups key off feature ids.
- `appendFeatures` (web) stamps `modifiedAt` so an imported layer that gains
  GPS marks honestly shows its edited date.
- Freeform attribute values entered in either app are stored as strings. No
  numeric or boolean coercion; typing arrives later with templates. Imported
  non-string values round-trip untouched; complex values render read-only as
  "kept as imported".
- The web IndexedDB gets exactly one version bump for all of this work:
  DB_VERSION 2 → 3 in the photos PR, adding the `photos` metadata store (see
  subsystem C). Track recording needs no schema change.

## Web subsystem A: GPS capture and tracks

New modules under `web/src/location/`:

| File | Responsibility |
| --- | --- |
| `liveLocation.ts` | framework-free `watchPosition` wrapper; `LiveFix`; state union `off / acquiring / active / signal-lost / denied / unavailable`; injectable Geolocation for tests |
| `useLiveLocation.ts` | React hook; one shared watch feeds the marker, follow mode, mark, and the recorder |
| `captureSpec.ts` | the contract constants, asserted against the fixture |
| `trackFilter.ts` | pure per-fix pipeline: gate, outlier, smooth, spacing |
| `trackRecorder.ts` | recorder state machine (idle/recording/paused), segments, raw-fix accumulation, live stats; injectable clock |
| `useTrackRecording.ts` | wires fixes into the recorder, owns the wake lock, exposes start/pause/resume/stop |
| `wakeLock.ts` | acquire/release with `visibilitychange` re-acquire; graceful hint when unsupported |
| `simplifyTrack.ts` | metres-based Douglas-Peucker with parallel-times index selection |
| `LocationControls.tsx` | map-corner cluster (locate/follow/mark/record, recording HUD, privacy line), replacing the bare button at MapCanvas.tsx ~2102 |
| `SaveTrackDialog.tsx` | stop-time dialog: stats, simplify presets with live before/after vertex counts, name, save/discard |

Also: `userMaps/vector/export/gpxWriter.ts` (GPX 1.1 writer, DOM-built like
`kmlWriter.ts`; waypoints from Points, trk/trkseg from LineStrings, per-vertex
time only when the times array length matches, polygons skipped with an
up-front UI note), `userMaps/vector/summarize.ts` (extracted from the edit
session so `appendFeatures` shares one bbox/count implementation), and
`appendFeatures` plus GPX in `VectorExportFormat` on `useUserVectorLayers.ts`.

Interaction:

- The locate button becomes a toggle. First tap acquires and turns follow on;
  each fix re-centres behind the print/share viewport guard; dragging the map
  turns follow off but keeps the marker; a "Follow" pill re-enables it; second
  tap on the button clears the watch and marker. Signal loss dims the marker
  and shows "GPS signal lost, still trying" without dropping the last fix. A
  heading wedge renders when moving with a heading. Under the cluster, one
  permanent line: "Location stays on this device."
- Mark uses the current watch fix if fresher than 10 s and accuracy ≤ 50 m,
  else falls back to the existing one-shot `getBrowserLocation()`. Toast names
  the destination layer and accuracy.
- Recording shows a HUD (elapsed, distance, accepted vertex count, fix-quality
  dot: green ≤ 10 m, amber ≤ 25 m, red = currently gated). The live trace is a
  plain Polyline in the user-vector pane. Recording owns no map clicks, so the
  identify/measure/georeference arbitration is untouched. Stop opens
  SaveTrackDialog; save creates the new recorded layer with the raw GPX as its
  original.

Privacy: every location-driven map move sets the existing
`printableViewportGuard` suppress flag first, exactly as `requestLocation`
does today, so location-caused viewports never reach share URLs, print, or
evidence notes. The marker, trace, and controls render only when
`!isPrintMode`. Saved marks and tracks are deliberate user data and print or
export only by user action, like any drawn feature.

Tests: `trackFilter.test.ts`, `simplifyTrack.test.ts`, `liveLocation.test.ts`,
`useTrackRecording.test.ts` (segments, wake lock, raw-log completeness),
`gpxWriter.test.ts` including a `parseGpx` round trip, extensions to the store
and rows/popup tests for the recorded origin, and a MapCanvas test proving
follow sets the suppress flag before moving. Manual verification includes a
real outdoor walk on a phone.

## Web subsystem B: snapping and construction

Verified Geoman 2.20.0 semantics this design depends on (pinned by a
real-mount test so an upgrade fails loudly):

- A layer with `snapIgnore: false` in its options joins `_createSnapList()`
  even under `L.PM.setOptIn(true)` with `pmIgnore` left undefined.
- `L.PM.Utils.findLayers()` (the enumerator behind global edit/drag/delete)
  never reads `snapIgnore`, so parcel targets cannot be deleted, dragged, or
  reshaped. No official layer is ever opted in to Geoman.
- Snap distances are container pixels; with `snapSegment: true` Geoman
  computes the nearest point on the nearest segment and prefers a segment
  endpoint within `snapDistance` (the contract's vertex-first rule).
  Config: `{ snappable, snapDistance: 15, snapSegment: true, snapVertex: true,
  snapMiddle: false }`.
- `pm:snap`/`pm:unsnap` fire on the marker and shape without propagation;
  `pm:drawstart` on the map hands over the working layer.

New modules:

| File | Responsibility |
| --- | --- |
| `services/parcelSnapSource.ts` | envelope fetch of NSPRD polygons through `fetchArcGISFeatureOverlay` (`outFields=PID`, `returnGeometry=true`), PID-keyed LRU cache (cap 3000), mount cap `maxSnapParcels` |
| `userMaps/vector/edit/ParcelSnapTargetsLayer.tsx` | moveend + AbortController lifecycle (clone of `MineralProximityParcelLayer.tsx`); mounts cached parcels intersecting the viewport as snap-only geometry; reports `ParcelSnapStatus` |
| `userMaps/vector/edit/snapIndicator.ts` | one indicator marker (square for vertex hits, round for edge hits) on `pm:snap`/`pm:unsnap`; the WeakSet of parcel-snapped layers that drives `nsmts:traced` stamping |
| `userMaps/vector/convert/pointsToPath.ts` | pure conversion per the contract rule |
| `userMaps/vector/edit/ConversionPreviewLayer.tsx` | dashed preview with numbered vertex badges while the convert dialog is open |

`services/geodesy.ts` gains `localMetricProjection` and
`nearestPointOnSegment` (planar in locally projected space; the equirectangular
error at parcel-edge lengths is micrometres against a snap radius of metres).
`mapPanes.ts` gains a snap-target pane at z-index 410 (above well logs, below
user vectors). Parcel children mount with
`{ snapIgnore: false, interactive: false, nsmtsSnapSource: "nsprd-parcel" }`
and a faint dashed style so the user can see what is snappable.
`UserVectorLayers.tsx` stamps `snapIgnore` on read-only children per the
my-features toggle. `ZoningLayer.tsx` stamps `snapIgnore: true` as
defence-in-depth with a pinning test.

`ParcelSnapStatus` is its own union with distinct states: `idle`, `loading`,
`error`, `licence`, `zoom` (with minZoom), `dense` (count and cap), `ready`
(count, where "0 parcels snappable" is an honest empty, not absence evidence).
The parcels toggle opens the existing licence dialog through a new
`LicenceIntent` kind `snap` when the province licence is not yet accepted.
The pinned caveat renders directly under the parcels control whenever it is
visible. Alt suppresses snapping for a gesture (Geoman built-in; the panel
mentions it).

One behavior change to existing code: the edit session joins the click
arbitration (`ParcelIdentifyController` gains `&& !userVectorEdit`), so
drawing clicks stop firing parcel identify. Today they collide.

Exports of layers containing `nsmts:traced` features carry the province
attribution plus the caveat (GeoJSON foreign member `nsmts:provenance`, KML
Document description); the per-feature property survives even in consumers
that strip foreign members.

Tests: parcelSnapSource (query shape, dedupe, paged fail-closed, LRU,
dense state), geodesy additions (agreement with haversine under 1 mm at 500 m),
ParcelSnapTargetsLayer state transitions and option pins, the real-mount
Geoman pins, snapIndicator stamping, pointsToPath (ordering, closure,
validation, keep/remove), panel and session extensions, zoning `snapIgnore`.

## Web subsystem C: photos, attributes, interchange

Schema (the single DB_VERSION 2 → 3 bump, additive):

- New `photos` object store, keyPath `id`, index `by-layer` on `layerId`.
  `PhotoRecord`: `{ id, layerId, addedAt, capturedAt?, sourceName?, width,
  height, fullBytes, thumbBytes }`. No `featureId` field; the feature's
  `nsmts:photos` descriptors are the only authority on attachment.
- Photo bytes in the existing `blobs` store as `StoredBlob` under
  `${photoId}:photo` and `${photoId}:photo-thumb`.

New modules under `web/src/userMaps/vector/photos/`: `types.ts` (descriptor
type, `readPhotoDescriptors` with strict validation returning `[]` on
malformed, reserved-key constants), `photoPipeline.ts` (decode via
`createImageBitmap(file, { imageOrientation: "from-image" })` behind an
injectable seam, downscale, re-encode per the contract policy; decode failure
is a new distinct `unsupported-image` error code), `exif.ts` (the only file
importing `exifr`; GPS and DateTimeOriginal; `(0,0)` treated as absent; nulls
on any parse failure), `photoStore.ts` (save/get/delete, `deletePhotosForLayer`,
per-commit sweep), `usePhotoManager.ts` (object-URL LRU cache of 64 thumbs,
attach/remove, outcome messages), `PhotoStrip.tsx` ("Take photo" with
`capture="environment"`, "Add photos" multiple, per-photo remove and "Use
photo's location" offer with the distance shown), `PhotoLightbox.tsx`
(dialog-role viewer), `BulkPhotoImportDialog.tsx` and `bulkPlacement.ts` (the
bulk EXIF flow, deliberately not the shared drop zone, which must keep routing
JPEG magic bytes to the raster pipeline). Plus
`edit/AttributeEditor.tsx`, `export/kmzWriter.ts` (fflate `zipSync`, doc.kml
level 6, jpegs level 0), and `parseKmzWithAssets` in the KMZ parser.

Session additions: `updateFeatureProperties(featureId, patch)` where an
`undefined` value deletes a key, descriptor add/remove wrappers, and
`moveFeaturePoint` (the one narrow reconciler case where React sets a Point's
latlng outside a gesture; the real-mount test proves drag-after-move still
publishes).

Orphan discipline: removing a photo deletes record, blobs, and descriptor in
one flow. Each edit-session commit sweeps photo records for the layer that no
descriptor references. Layer delete removes all the layer's photo records and
blobs. An export with an unreadable blob completes and reports "N photos
couldn't be read and were left out".

Bulk placement flow: pick many photos, exifr reads each, rows classify as in
current view (checked by default), outside view, no location (unselectable),
or undisplayable HEIC (unchecked; selecting it creates the point without an
embedded photo and says so). "Create N points" builds one new layer
(`source: "photos"`, origin `{ kind: "photo-import", count, importedAt }`,
provenance "From your photos · N photos"), one Point per confirmed row at the
EXIF position, name from the filename stem, photo attached where decodable.
HEIC: EXIF parses everywhere, pixels decode only in Safari; the message
carries the conversion hint.

Quota: `navigator.storage.estimate()` before a bulk batch, warn at 80 % usage
and proceed; per-photo failures classify quota vs storage-failed vs
unsupported-image distinctly. A failed photo is not kept in memory; the
message says it was not added. `requestDurableStorage()` after the first
successful photo save.

Popups: a thumbnail strip between description and provenance, each thumb a
button with "Open photo n of m" labeling, lightbox on tap. All text rendering
stays `textContent`-only; images render only through object URLs of blobs the
app itself re-encoded. Points with photos render as hollow circle markers
(white fill, colored ring) with a "· photo" tooltip suffix; the full photo-map
layer stays iOS-only.

Tests: database upgrade preservation, photoStore, pipeline (pure math and the
decode seam), exif fixtures (GPS present/absent, `(0,0)`, HEIC container),
bulkPlacement, descriptor validation, AttributeEditor (reserved-key refusal,
string storage, complex read-only), session property patches, kmlWriter
ExtendedData, kmzWriter (unzip and assert), KMZ parser asset re-link and
img-strip, popup rendering, and one full writer-to-parser round-trip fixture
that the future Swift test mirrors byte-for-byte in structure.

## iOS mirror

GeoCore additions (pure, zero-dependency): `Capture/TrackFix.swift`,
`Capture/TrackFilter.swift` (contract pipeline and simplify),
`Capture/TrackGpx.swift` (raw GPX writer that round-trips through `GpxParse`),
`Vector/VectorEdit.convertingPoints`, `Vector/SnapEngine.swift` (vertex/edge
candidates over `ownFeature | parcel` sources only), `VectorExport` KML
ExtendedData plus `kmz(layerName:parsed:photos:)`, a `ZipArchive` writer
(STORED for jpegs, DEFLATE via `compression_encode_buffer` for doc.kml), and
`KmzParse.attachments`. `GpxParse` gains trkpt `<time>` into
`coordinateProperties.times`.

NSDataServices: `ParcelQuery.envelopeQueryURL(bounds:clearance:)`
(`esriGeometryEnvelope`, `inSR=4326`, `outFields=PID`, `returnGeometry=true`),
refusing without clearance exactly like the existing point query, and
`ParcelFetcher.parcels(in:clearance:)` paging up to `maxSnapParcels`;
`exceededTransferLimit` or over-cap reads as the distinct "too many parcels
here, zoom in" state, never as fewer parcels.

App:

- `FieldCapture/TrackRecorder.swift` (@Observable, own CLLocationManager
  when-in-use, `isIdleTimerDisabled` while recording and restored on stop or
  scene-phase change, auto-pause on leaving foreground with "Recording paused
  while the app was in the background"), `TrackRecordingHUD.swift`,
  `MarkLocation.swift`.
- `UserVectors/FeatureAttributesEditor.swift` (key-value rows stored as
  strings, reserved keys refused) and `FeaturePhotoPicker.swift`
  (`PhotosPicker` for library, permissionless out-of-process, plus
  `UIImagePickerController` for camera). New Info.plist keys in both pbxproj
  config blocks: `INFOPLIST_KEY_NSCameraUsageDescription` and
  `INFOPLIST_KEY_NSPhotoLibraryUsageDescription`, both stating photos stay on
  device. `PrivacyInfo.xcprivacy` stays zero-collection; CoreLocation and
  PhotoKit are not required-reason categories, so it is otherwise unchanged.
- Photo bytes as files under the existing store directory:
  `photos/<layerID>/<photoID>.jpg` and `.thumb.jpg`. `UserVectorStore` gains
  addPhoto/photoData/deletePhoto; `delete(id:)` removes the layer's photo
  directory; `replaceGeometry` sweeps files no descriptor references;
  `sweepOrphanedGeometry` drops unclaimed photo directories.
- Photo-map layer, native-only: PhotoKit has no location predicate, so the
  index is one full enumeration per grant (`PHAsset.fetchAssets` reading
  `asset.location`, with progress UI), persisted to
  `Caches/PhotoMapIndex/index.json` with the `PHPersistentChangeToken`;
  later launches apply `fetchPersistentChanges(since:)` and touch only changed
  assets. In memory the index buckets by z15 web-Mercator tile; a viewport
  query unions intersecting buckets; MapKit clustering renders with a 500
  annotation cap per viewport ("Zoom in to see all photos" over the cap);
  thumbnails via `PHCachingImageManager`. The row lives in the My Maps panel
  section (the `.myMaps` slot the parity tests reserve for catalogue-free
  content), so `LayerCatalog` and every parity fixture are untouched. Three
  distinct row states: granted, limited ("Showing only the photos you
  selected · Manage"), denied (disabled with an explanation). Subtitle:
  "Your photos · never uploaded".
- Snapping in `VectorEditSession`/`MapContainerView`: candidates rebuild on
  `.visibleRegionSettled` while armed, own visible features plus cached
  parcel rings, tolerance 15 pt converted like the existing `fingerTolerance`,
  haptic tick on snap, the pinned caveat as a standing caption while parcels
  are armed. Unreadable or not-supplied parcel boundaries contribute no
  candidates; never a partial ring.
- Conversion, mark-my-location destination, attribute typing, and KMZ profile
  all follow the contract verbatim.

Tests: TrackFilter/TrackSimplify/TrackGpx against scripted sequences,
FieldCaptureParityTests against the fixture, SnapEngine priority and source
exclusion, KmzRoundTrip (including the shared cross-surface fixture),
convertingPoints, ParcelEnvelopeQuery, TrackRecorder with an injected fix
source (segmentation, auto-pause, save writes geometry + original + origin,
library stamped v2, idle-timer restore), photo store sweeps, attribute
editing, PhotoMapIndex behind a fake asset source. Run focused suites (the
full bundle hangs on shared URLProtocol stubs); builds go through the
xcode-build-slot wrapper.

## Cross-cutting compliance

Privacy: nothing in this design adds a network path except the licence-gated
NSPRD envelope query, which sends only a viewport rectangle to the same
provincial endpoint the parcel identify already queries. Location never enters
share URLs, print, or evidence notes on either surface. Photos and attributes
live in IndexedDB or Application Support and leave only through explicit
user-initiated exports. Photo re-encoding strips EXIF GPS from every stored
and exported image byte. The iOS App Store privacy label (zero collected data
types) stays true.

Evidence and provenance: recorded layers say "Recorded on this device"; photo
layers say "From your photos · N photos"; GPS-marked points show their
accuracy; traced features carry `nsmts:traced` and the not-a-survey caveat
permanently, including through exports. Raw fixes are never silently promoted
into the processed line; they are a separate artifact with its own export.
Distinct states stay distinct everywhere: permission denied vs unavailable vs
signal lost; quota vs storage-failed vs unsupported-image; licence vs zoom vs
dense vs error vs an honest empty.

Licensing: parcel snapping requires the accepted province licence before any
URL is assembled, on both surfaces. Zoning geometry is structurally
unsnappable and never persisted. Exports remain user-layers-only; layers with
traced features carry province attribution plus the caveat.

## Roadmap and PR plan

All PRs branch from and merge to `nightly`, each with its focused Vitest or
Swift Testing additions and the standard gates. Web first, in order:

| PR | Contents |
| --- | --- |
| W1 | Live position + Mark: liveLocation, useLiveLocation, captureSpec + fixture file + fixture test, follow/off/heading with guard preservation, LocationControls (no record yet), appendFeatures + summarize extraction, recorded origin/source + provenance strings, privacy copy |
| W2 | Track recording: trackFilter, trackRecorder, useTrackRecording, wakeLock, simplifyTrack, SaveTrackDialog, raw GPX as layer original, recording HUD |
| W3 | GPX export: gpxWriter, export plumbing and row UI, "Raw recording (GPX)" labeling |
| W4 | Snap math + parcel source (no UI): geodesy additions, parcelSnapSource with cache and constants |
| W5 | Snap engine + UI: ParcelSnapTargetsLayer, snapIndicator, snap pane, option stamping, panel snap group + caveat, licence intent, zoning snapIgnore, identify arbitration line, traced/createdAt stamping, export provenance note, real-mount pins |
| W6 | Points to path: pointsToPath, ConversionPreviewLayer, panel section, session convert/undo |
| W7 | Freeform attributes + KML ExtendedData: AttributeEditor, updateFeatureProperties, writer changes. No schema change |
| W8 | Photo storage + attach + display: DB_VERSION 3, photoStore, pipeline, exif (pinned exifr), usePhotoManager, PhotoStrip, PhotoLightbox, popup thumbnails, map indicator, use-photo's-location, cleanup sweeps |
| W9 | KMZ interchange + bulk placement: kmzWriter, parser assets + re-link, KMZ button + honest notes, BulkPhotoImportDialog, photo-import origin, cross-surface round-trip fixture, manual Google Earth verification |

Then native, mirroring:

| PR | Contents |
| --- | --- |
| N1 | Recording core: FieldCaptureParityTests + GeoCore capture modules, GpxParse trkpt time, convertingPoints, recorded origin + library v2 + write-stamp fix, TrackRecorder + HUD + mark-my-location + scene-phase pause, raw-GPX original labeling, conversion UI |
| N2 | Attributes, photos, KMZ: photo file layout + sweeps, attributes editor + photo strip + callout rendering, camera/picker wrappers + Info.plist keys, ZipArchive writer, KML ExtendedData, kmz export/import, GeoJSON note |
| N3 | Snapping + photo map (splits into 3a/3b if review size demands; they share no files): envelope query + fetcher, SnapEngine + session integration + caveat + traced stamping, PhotoLibraryIndex + PhotoMapViewModel + MapViewState.photoMarkers + clustered annotations + the three-state My Maps row |

W1–W3 delivered the user's first ask (points and tracks at the current
location) as a coherent slice. W4 (snap math + parcel source, no UI) and
W5 (snap engine + UI) have landed; remaining web work starts at W6.

## Risks and open questions

Open questions for the project owner, none blocking W1-W3:

- The 25 m accuracy gate may starve a recording under forest canopy. The HUD's
  red state makes it visible. If field testing confirms it, the follow-up is
  an adaptive gate (rolling-median accuracy with a floor), a one-file
  two-surface fixture change.
- Parcel snap targets render faintly by design so the user sees what is
  snappable. If that reads as clutter over the NSPRD raster, an invisible
  variant is a style-only change. Decide on first look.
- Dense urban viewports (Halifax peninsula at z16) will exceed 600 parcels and
  require zooming to ~z17 before parcel snapping arms. Honest but possibly
  annoying; the cap is one tunable constant.
- Photos are recompressed and originals discarded. Archival originals would
  roughly triple storage; default is recompress-only.
- Conversion offers no drag-to-reorder in v1. If forestry point sets are often
  captured out of order, a reorder UI is a follow-up.
- Snap preferences reset each session. If two taps per session annoys, a
  persisted preference is a small follow-up with the localStorage guard
  pattern.

Known risks accepted:

- Web recording stops when the tab hides or the screen locks despite the wake
  lock (a call, a tab switch). The recorder shows a segment gap rather than
  pretending continuity; record-start copy sets the expectation.
- The Geoman `snapIgnore` semantics are verified for the pinned 2.20.0 only;
  the real-mount tests turn an upgrade regression into a red test.
- Snap-list rebuild cost with 600 parcels plus large user layers is unmeasured
  on low-end phones; the mount cap is the single-constant mitigation lever.
- Quota pressure is real at ~0.5 MB per photo; the 80 % warning plus per-photo
  failure classification is the honest floor.
- Long screen-on recordings drain battery, and Low Power Mode may throttle
  GPS; a support-page note covers it.
- KMZs edited by third-party tools between export and reimport can defeat the
  img-strip heuristic; worst case is a duplicated image reference in the
  description text.

## Appendix: reconciliation log

The four subsystem designs were drafted independently and cross-reviewed. The
review confirmed the architectures against the codebase (including verifying
Geoman 2.20.0 internals in the pinned dist and finding the real
`UserVectorStore.write` version-stamp bug) and surfaced conflicts this
document resolves:

- One property namespace (`nsmts:`) replaced subsystem A's bare
  `recordedAt`/`gpsAccuracy` keys, which were spoofable by imported data and
  invisible to the other surface.
- `nsmts:createdAt` stamping moved to the creation path only; stamping in
  `adopt()` would have fabricated identical timestamps on every imported
  feature when a layer was opened for editing.
- `nsmts:traced` stamping moved from post-hoc coordinate equality (defeated by
  Leaflet's 6-decimal `toGeoJSON` rounding) to snap-event-time flagging.
- Raw fixes unified on raw-GPX-as-layer-original, replacing a bespoke
  RawTrackLog store on web. This deleted a DB version bump, gave web a raw
  export path for free, and made recordings new-layer-only.
- One constant set for the filter, simplify, and snapping, with the adaptive
  spacing rule from A, the 30 m/s outlier ceiling and 0.6 smoothing from D,
  and the user-selectable simplify presets from A. Smoothing was ruled in
  because the owner chose it explicitly and the raw original preserves the
  unsmoothed truth.
- One KMZ photo descriptor (internal form plus `href` in KMZ form), one CDATA
  img appendix with a tolerant strip rule, and an enumerated ExtendedData
  policy that carries all `nsmts:` keys.
- One conversion rule (array order, keep-source default, one-shot undo) and
  one mark-my-location destination rule (open session, else "Field notes").
- Attribute values stored as strings on both surfaces; C's type coercion was
  dropped.
- The two proposed web DB bumps collapsed to one (photos, in W8).
- Session-scoped snap preferences replaced a persisted localStorage key;
  PhotoRecord dropped its stale-by-design `featureId` field; the per-fix drop
  taxonomy was cut as write-only data.

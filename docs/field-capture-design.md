# Field capture design: GPS points, tracks, snapping, photos, attributes

Status: approved scope. Web W1 (live GPS + Field notes mark, #261), W2
(foreground track recording with raw-GPX original, #262), W3 (GPX
export for user layers and raw-recording downloads, #266), W4 (snap
geometry math and the NSPRD parcel snap source, #269), W5 (snap-to-parcel
drawing, licence-gated, with traced provenance, #271), W6 (points-to-path
conversion with numbered preview, #273), W7 (freeform attributes + KML
ExtendedData, #275), W8 (photo storage + attach + display, #277), and W9
(KMZ photo interchange + bulk EXIF placement, #279) are implemented.
Remaining web work for field-capture is done. Native N1 (#281), N2
(#283), and N3 (#284) are implemented; remaining native field-capture work
for this plan is done.
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
  schema owner [database.ts](../web/src/userMaps/store/database.ts), DB_VERSION 3).
- Import: GeoJSON, KML, KMZ, GPX, zipped shapefile. Export: GeoJSON, KML,
  KMZ, and GPX (layer GPX via
  [gpxWriter.ts](../web/src/userMaps/vector/export/gpxWriter.ts); Raw GPX
  original-file download on recorded layers), user layers only. Recorded
  layers keep raw GPX as the original-file blob.
- Live GPS watch (`watchPosition`) with follow mode, heading, and one-tap
  mark into a Field notes layer. Location stays out of share URLs and print
  ([liveLocation.ts](../web/src/location/liveLocation.ts),
  [useLiveLocation.ts](../web/src/location/useLiveLocation.ts),
  [markFix.ts](../web/src/location/markFix.ts),
  [MapCanvas.tsx](../web/src/components/MapCanvas.tsx)).
- Foreground track recording: start/pause/resume/stop, contract filter
  pipeline, Douglas-Peucker simplify on save, processed LineString /
  MultiLineString plus raw GPX as the layer original, origin `recorded`
  ("Recorded on this device", or "interrupted" when it was saved from the
  device's copy of a walk in progress)
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
- Points-to-path conversion: `planPointsToPath` / `buildPathFromPoints` use
  stored array order (creation order for drawn layers), drop consecutive
  duplicates, close rings without double-closing a hand-closed last point,
  require at least 2 (line) or 3 (area) distinct points, warn on
  self-intersection without blocking, stamp `nsmts:createdAt` and
  `nsmts:convertedFromPoints`, and inherit `nsmts:traced` from any
  parcel-snapped source point
  ([pointsToPath.ts](../web/src/userMaps/vector/convert/pointsToPath.ts)).
- Numbered dashed preview: `ConversionPreviewLayer` draws the
  connect-the-dots order before commit, non-interactive
  ([ConversionPreviewLayer.tsx](../web/src/userMaps/vector/edit/ConversionPreviewLayer.tsx)).
- Panel convert section: "Make line or area from points" with live
  length/area stats and keep-source default
  ([VectorEditPanel.tsx](../web/src/userMaps/vector/edit/VectorEditPanel.tsx)).
- Session convert/undo: `convertPoints` and one-shot `undoConversion` go
  through the session's single write path so any later commit clears the undo
  ([useVectorEditSession.ts](../web/src/userMaps/vector/edit/useVectorEditSession.ts)).
- Draft-ADDED Geoman materialization: features the session adds to the draft
  (conversion output, undo-restored points, W1 mark-during-edit) get a live
  layer so the next gesture cannot publish them away
  ([EditableVectorLayer.tsx](../web/src/userMaps/vector/edit/EditableVectorLayer.tsx)).
- Freeform attributes: `AttributeEditor` lists every property except `name`,
  `description`, `coordinateProperties`, and the `nsmts:` namespace; values
  entered in the app are stored as strings; reserved and duplicate names are
  refused on add; imported objects/arrays render read-only
  ([AttributeEditor.tsx](../web/src/userMaps/vector/edit/AttributeEditor.tsx)).
- Session property patches: `updateFeatureProperties` sets string values and
  deletes `undefined` keys without aliasing already-published collections
  ([useVectorEditSession.ts](../web/src/userMaps/vector/edit/useVectorEditSession.ts)).
- KML ExtendedData: one `<Data>` per carried property except `name`,
  `description`, `coordinateProperties`, and `nsmts:photos`; `nsmts:`
  provenance keys are included; numbers/booleans stringify, objects as JSON
  text, nulls skipped
  ([kmlWriter.ts](../web/src/userMaps/vector/export/kmlWriter.ts)).
- Photo storage: `DB_VERSION` 3 adds the `photos` store (by-layer index);
  bytes live in `blobs` as `${photoId}:photo` and `${photoId}:photo-thumb`
  ([database.ts](../web/src/userMaps/store/database.ts),
  [photoStore.ts](../web/src/userMaps/vector/photos/photoStore.ts)).
- Photo pipeline: every attach re-encodes to a 2048 px JPEG plus a 256 px
  thumb, which strips all EXIF including GPS from stored and exported bytes;
  HEIC outside Safari is the distinct `unsupported-image` failure
  ([photoPipeline.ts](../web/src/userMaps/vector/photos/photoPipeline.ts)).
- EXIF confined to one module: pinned `exifr` 7.1.3; GPS and
  DateTimeOriginal only; `(0,0)` treated as absent
  ([exif.ts](../web/src/userMaps/vector/photos/exif.ts)).
- Photo manager, strip, and lightbox: attach from camera
  (`capture="environment"`) or files; caps 20/feature and 500/layer; bounded
  revoking thumbnail LRU
  ([usePhotoManager.ts](../web/src/userMaps/vector/photos/usePhotoManager.ts),
  [PhotoStrip.tsx](../web/src/userMaps/vector/photos/PhotoStrip.tsx),
  [PhotoLightbox.tsx](../web/src/userMaps/vector/photos/PhotoLightbox.tsx)).
- Marked-point popups: a layer made here says "Marked from this device's
  location (±N m)"; an imported layer says "Marked from a device's location
  (±N m)". Reserved keys that are not a claim render no provenance line;
  only Point features may claim capture. The line does not say GPS
  ([popup.ts](../web/src/userMaps/vector/render/popup.ts)).
- Popup thumbnails: labelled "Open photo n of m" buttons between description
  and provenance
  ([popup.ts](../web/src/userMaps/vector/render/popup.ts)).
- Hollow map indicator: points with photos render as a white-fill ring with a
  "· photo" tooltip suffix
  ([UserVectorLayers.tsx](../web/src/userMaps/vector/components/UserVectorLayers.tsx)).
- Move-to-photo location: geotag is offered once at attach ("Move point to
  photo's location") via session `moveFeaturePoint`; it is never persisted
  on the photo bytes
  ([PhotoStrip.tsx](../web/src/userMaps/vector/photos/PhotoStrip.tsx),
  [useVectorEditSession.ts](../web/src/userMaps/vector/edit/useVectorEditSession.ts)).
- Orphan sweeps: photo removal deletes row+blobs; layer delete takes its
  photos; the session write path sweeps rows no `nsmts:photos` descriptor
  references, except rows an in-flight attach has reserved — a row lands
  before the feature that will reference it, and the reservation ends the
  moment a write does
  ([userVectorStore.ts](../web/src/userMaps/vector/store/userVectorStore.ts),
  [photoStore.ts](../web/src/userMaps/vector/photos/photoStore.ts)).
- KMZ export: `buildKmzBlob` writes `doc.kml` (DEFLATE) plus STORED
  `files/<photoId>.jpg` entries; descriptors whose blob cannot be read are
  dropped from the written document (honest missing count, never a dangling
  reference); KML photo mode `kmz` carries `href` in ExtendedData and a
  CDATA description appendix of viewer `<img>` tags (width 400)
  ([kmzWriter.ts](../web/src/userMaps/vector/export/kmzWriter.ts),
  [kmlWriter.ts](../web/src/userMaps/vector/export/kmlWriter.ts),
  [captureSpec.ts](../web/src/location/captureSpec.ts) `kmz` profile).
- KMZ import re-link: `relinkKmzPhotos` resolves hrefs case-insensitively,
  re-encodes through the photo pipeline (EXIF stripped by construction,
  thumbs regenerated), re-mints ids, rewrites `nsmts:photos` to internal
  form, and strips img tags whose src points into `files/`;
  missing-from-archive, undecodable, and cap-overflow are distinct noted
  states; the re-link gate is reference-based
  ([relinkKmzPhotos.ts](../web/src/userMaps/vector/photos/relinkKmzPhotos.ts)).
- Bulk EXIF placement: "Add photos to map" uses its own file input, not the
  shared drop zone; `exifr` reads geotags locally; classification is in-view
  (checked), out-of-view (unchecked but checkable), or no-location
  (unselectable)
  ([BulkPhotoImportDialog.tsx](../web/src/userMaps/vector/photos/BulkPhotoImportDialog.tsx),
  [bulkPlacement.ts](../web/src/userMaps/vector/photos/bulkPlacement.ts)).
- Photo-import layers: `createPhotoLayer` builds a `photos`-source layer
  with photo-import provenance ("From your photos · N photos") and fits
  the map to the new layer
  ([useUserVectorLayers.ts](../web/src/userMaps/vector/useUserVectorLayers.ts)).
- Honest GeoJSON/KML export titles ("Photos aren't included — use KMZ to
  carry photos.") plus a KMZ button on user layers
  ([UserVectorRows.tsx](../web/src/userMaps/vector/components/UserVectorRows.tsx)).

Missing on web: none for the web field-capture plan. Native gaps stay under
iOS.

iOS (`ns-marks-the-spot/`, `NSMarksCore/`):

- Drawing (point/line/area), import/export of the same formats, actor-guarded
  JSON persistence, location display, licence gating, print export.
- Foreground track recording: `CaptureSpec` pinned by `FieldCaptureParityTests`
  against the shared fixture (kmz block copied verbatim from W9, never
  regenerated from Swift), `TrackFix`, `TrackFilter` plus stack-based
  Douglas-Peucker `TrackSimplify`, the pure `TrackRecording` state machine,
  `TrackFeature`, `MarkFeature` (10 s / 50 m freshness), `TrackGpx` raw writer
  ([Capture/](../NSMarksCore/Sources/GeoCore/Capture/)).
- `GpxParse` reads trkpt `<time>` into `coordinateProperties.times`
  (null-padded, togeojson convention)
  ([GpxParse.swift](../NSMarksCore/Sources/GeoCore/Vector/GpxParse.swift)).
- `UserVectorLibrary.currentVersion` is 3; `UserVectorStore.write(_:)` stamps
  `currentVersion`
  ([UserVectorLayerRecord.swift](../NSMarksCore/Sources/GeoCore/Vector/UserVectorLayerRecord.swift),
  [UserVectorStore.swift](../ns-marks-the-spot/UserVectors/UserVectorStore.swift)).
- App: `TrackRecorder` (foreground-only `CLLocationManager`, idle-timer,
  auto-pause on background with a visible message), recording HUD,
  `SaveTrackSheet` (simplify presets, live vertex counts), raw GPX as the
  layer original labeled "Raw recording (GPX)", mark-my-location into the
  open edit session else auto-created "Field notes", points→line/area
  conversion in stored array order with keep-source default, one-shot undo,
  dashed on-map preview, GPS callout "Marked from GPS on this device (±N m)"
  only when both reserved keys are present
  ([FieldCapture/](../ns-marks-the-spot/FieldCapture/),
  [VectorConvert.swift](../NSMarksCore/Sources/GeoCore/Vector/VectorConvert.swift),
  [VectorEditSession.swift](../ns-marks-the-spot/UserVectors/VectorEditSession.swift),
  [VectorEditPanel.swift](../ns-marks-the-spot/UserVectors/VectorEditPanel.swift)).
- Freeform attributes: `FeatureAttributesEditor` stores entered values as
  strings, refuses reserved / `nsmts:` keys (and `name` / `description` /
  `coordinateProperties`), and renders imported objects/arrays read-only
  ("kept as imported")
  ([FeatureAttributesEditor.swift](../ns-marks-the-spot/UserVectors/FeatureAttributesEditor.swift),
  [VectorEdit.swift](../NSMarksCore/Sources/GeoCore/Vector/VectorEdit.swift)
  `updatingProperties`).
- Photo attach: `PhotoDescriptor` (strict all-or-nothing reader; caps 20
  per feature, 500 per layer, 50 MB with named refuse messages),
  `PhotoPipeline` (ImageIO re-encode, 2048 px q0.8 + 256 px q0.7 thumb;
  ALL EXIF including GPS stripped from stored and exported bytes),
  `FeaturePhotoStrip` (camera + `PhotosPicker`), `CameraPicker`, callout
  thumbnails; optional one-time "move point to photo's location" offer
  (the only surviving location from photo EXIF, and only if the user
  accepts)
  ([PhotoDescriptor.swift](../NSMarksCore/Sources/GeoCore/Vector/PhotoDescriptor.swift),
  [PhotoPipeline.swift](../NSMarksCore/Sources/GeoCore/Vector/PhotoPipeline.swift),
  [FeaturePhotoStrip.swift](../ns-marks-the-spot/UserVectors/FeaturePhotoStrip.swift),
  [CameraPicker.swift](../ns-marks-the-spot/FieldCapture/CameraPicker.swift),
  [UserVectorCalloutCard.swift](../ns-marks-the-spot/UserVectors/UserVectorCalloutCard.swift)).
- Photo files under `photos/<layerID>/<photoID>.jpg` + `.thumb.jpg`;
  `UserVectorStore` `addPhoto` / `photoData` / `deletePhoto`; `delete(id:)`
  removes the layer's photo directory; `replaceGeometry` sweeps files no
  descriptor references, holding `reservedPhotoIDs` for an attach still in
  flight
  ([UserVectorStore.swift](../ns-marks-the-spot/UserVectors/UserVectorStore.swift)).
- KMZ interchange: `ZipWriter` (`ZipArchive.archive`; `doc.kml` DEFLATE,
  `files/<id>.jpg` STORED); `VectorExport.kmz`; KML ExtendedData carries
  `nsmts:` provenance (photos excluded from plain KML ExtendedData);
  `KmzParse.parseWithAssets` + `KmzRelink` re-link under re-minted ids
  with missing / undecodable / capped as distinct notes; GeoJSON/KML
  export honest that photos are not included; export menu includes
  **KMZ (with photos)**
  ([ZipWriter.swift](../NSMarksCore/Sources/GeoCore/Vector/ZipWriter.swift),
  [VectorExport.swift](../NSMarksCore/Sources/GeoCore/Vector/VectorExport.swift),
  [KmzParse.swift](../NSMarksCore/Sources/GeoCore/Vector/KmzParse.swift),
  [KmzRelink.swift](../NSMarksCore/Sources/GeoCore/Vector/KmzRelink.swift),
  [UserVectorRowsView.swift](../ns-marks-the-spot/UserVectors/UserVectorRowsView.swift)).
- Snapping: `SnapEngine` (vertex/edge candidates over `ownFeature | parcel`
  only), `Geodesy.localMetricProjection` / `nearestPointOnSegment`,
  licence-gated envelope query, session-scoped toggles, 15 pt, haptic,
  `nsmts:traced` / `nsmts:createdAt` at event time, standing caveat
  "Traced boundaries are not a survey.", zoom / licence / dense /
  load-error / honest-empty notes
  ([SnapEngine.swift](../NSMarksCore/Sources/GeoCore/Vector/SnapEngine.swift),
  [Geodesy.swift](../NSMarksCore/Sources/GeoCore/Geodesy.swift),
  [ParcelQuery.swift](../NSMarksCore/Sources/NSDataServices/ParcelQuery.swift),
  [ParcelFetcher.swift](../NSMarksCore/Sources/NSDataServices/ParcelFetcher.swift),
  [VectorEditPanel.swift](../ns-marks-the-spot/UserVectors/VectorEditPanel.swift),
  [VectorEditSession.swift](../ns-marks-the-spot/UserVectors/VectorEditSession.swift),
  [MapContainerView.swift](../ns-marks-the-spot/Overlay/Views/MapContainerView.swift)).
- Photo-library map layer: `PhotoMapIndex` (z15 buckets, 500-annotation
  cap keeping the most recent in a fixed order), PhotoKit enumeration
  persisted to `Caches/PhotoMapIndex/index.json` with the change token and
  on-disk `accessScope` (in-memory `indexedAccess`), incremental
  `fetchPersistentChanges(since:)` under unchanged full access (limited
  always a full re-read), My Maps row (`.myMaps` slot, LayerCatalog
  untouched), MapKit clustering, subtitle "Your photos · never uploaded"
  ([PhotoMapIndex.swift](../NSMarksCore/Sources/GeoCore/Vector/PhotoMapIndex.swift),
  [PhotoMapViewModel.swift](../ns-marks-the-spot/FieldCapture/PhotoMapViewModel.swift),
  [PhotoMapRow.swift](../ns-marks-the-spot/FieldCapture/PhotoMapRow.swift)).
- Bulk EXIF placement: row button "Add photos to map" (`PhotosPicker`) →
  confirm sheet titled "Place photos" → `source: photos` layer, provenance
  "Created from N of your photos"
  ([BulkPhotoPlacement.swift](../NSMarksCore/Sources/GeoCore/Vector/BulkPhotoPlacement.swift),
  [BulkPhotoPlacementSheet.swift](../ns-marks-the-spot/FieldCapture/BulkPhotoPlacementSheet.swift),
  [UserVectorLayerRecord.swift](../NSMarksCore/Sources/GeoCore/Vector/UserVectorLayerRecord.swift)).
- Missing on native: none for this field-capture plan.

## The field-capture contract

This section is normative for both surfaces. Every constant below is pinned in
one checked-in fixture,
`NSMarksCore/Tests/ParityFixtures/Fixtures/field-capture-parity.json`,
following the existing `layer-parity.json` pattern. Web asserts its constants
against the fixture by relative path (precedent:
[layerParity.test.ts](../web/src/layers/layerParity.test.ts));
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
per-vertex `<time>` from it; both GPX parsers read trkpt `<time>` into it
(iOS `GpxParse` included, null-padded). KML/KMZ export drops per-vertex times;
GeoJSON and GPX are the formats that carry them.

Popups and callouts render capture provenance from `nsmts:capturedAt` and
`nsmts:accuracyM`. This is honest labeling of user data, not proof; an
imported file could carry the keys.

Web (`popup.ts`) does not say GPS — the Geolocation API names no sensor.
Only a Point with a real capture instant and a non-negative finite accuracy
may claim a fix. Layers made here say "Marked from this device's location
(±N m)"; imported layers say "Marked from a device's location (±N m)".
Reserved keys that are not a claim render no provenance line.

iOS callouts still say "Marked from GPS on this device (±N m)" when both
reserved keys are present (`VectorStyle.swift`). The line still describes
the claim the data makes about itself.

### Recorded layers and raw fixes

- `UserVectorSource` gains `"recorded"` on both surfaces, and `"photos"`
  for bulk photo-placement layers.
- `UserVectorOrigin` gains `{ kind: "recorded", startedAt, endedAt }` (ISO
  strings on web, Dates in Swift Codable with those key names). Provenance
  string: "Recorded on this device". The web origin also carries an optional
  `interrupted` for a walk saved from the copy the device kept while it ran,
  which says so in its provenance. Swift carries the flag through decode and
  re-encode and says the same thing, though it never sets one: this app keeps
  no such copy yet.
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
- iOS `UserVectorLibrary.currentVersion` is 3 so old builds refuse cleanly
  (`fromALaterVersion`) instead of reporting damage, and
  `UserVectorStore.write(_:)` stamps the current version.

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
| Point-tool own-feature targets | points excluded | while the Point tool is armed, the layer's own point features are not snap targets: a new point snapped onto an existing one is an invisible duplicate at the same coordinate. Lines and areas stay targets. Applied on iOS (`VectorEditSession.snapTargetGeometry`); the web's Geoman options do not yet apply it (PR G) |

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
- A draggable vertex handle on a coarse pointer is a 44-unit canvas around a
  22-unit disc: the canvas is the touch target, the disc is what is seen.
  iOS draws it directly (`VectorVertexHandleImage.canvasSize` /
  `.discDiameter`); web reaches it in `@media (pointer: coarse)` by
  out-specifying Geoman's 14 px `.marker-icon`, scoped to Leaflet's
  `.leaflet-marker-draggable` so that vertices placed WHILE DRAWING keep
  Geoman's size and keep finishing the shape on tap. Web is the surface
  catching up here, not iOS.
- Known web-only gaps, not closed by that rule: Geoman's 10 px middle marker
  stays the only touch route to INSERTING a vertex, removing one is bound to
  `contextmenu` and has no touch gesture, and nothing on the web panel says
  a handle can be dragged — where iOS says "Press and hold a corner handle to
  drag it." and offers a non-drag corner mover for VoiceOver and Switch
  Control.
- "Hold Alt to place a vertex without snapping." is desktop-only wording.
  Where the primary pointer is coarse the web shows "Turn off Snap while
  drawing to place a vertex freely." instead, naming the control both
  surfaces label "Snap while drawing"; iOS shows no Alt hint at all.

## Web subsystem A: GPS capture and tracks

New modules under `web/src/location/`:

| File | Responsibility |
| --- | --- |
| `liveLocation.ts` | framework-free `watchPosition` wrapper; `LiveFix`; state union `off / acquiring / active / signal-lost / denied / position-unavailable / unavailable`; a run of three pre-fix POSITION_UNAVAILABLE reports ends a non-recording watch in `position-unavailable`; injectable Geolocation for tests |
| `useLiveLocation.ts` | React hook; one shared watch feeds the marker, follow mode, mark, and the recorder |
| `markFix.ts` | one-shot held to the same 10 s / 50 m watch rule; four distinct browser-failure sentences; accuracy formatting |
| `captureSpec.ts` | the contract constants, asserted against the fixture |
| `trackFilter.ts` | pure per-fix pipeline: gate, outlier, smooth, spacing |
| `trackRecorder.ts` | recorder state machine (idle/recording/paused), segments, raw-fix accumulation, live stats; injectable clock |
| `useTrackRecording.ts` | wires fixes into the recorder, owns the wake lock and the in-progress draft, holds Record until the device has said what it is already storing, exposes start/pause/resume/stop |
| `trackDraftStore.ts` | the in-progress recording in the shared user-content database, one overwritten `blobs` key; written only while a walk runs, offered back after an interrupted session, deleted on save or discard |
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
  without dropping the last fix, and the live region names the reason without
  saying GPS: timeout → "Your location is taking longer than expected — still
  trying."; unavailable → "Your location is unavailable right now — still
  trying." When the view is already closer than the locate scale (zoom 14),
  the first locate pans and keeps the reader's zoom; it flies to zoom 14 only
  when further out. Leaflet fly/pan honours Reduce Motion (no JS animation).
  A heading wedge renders when moving with a heading. Under the cluster, one
  permanent line: "Location stays on this device."
- Mark uses the current watch fix if fresher than 10 s and accuracy ≤ 50 m
  (`MARK_MAX_FIX_AGE_MS` / `MARK_MAX_ACCURACY_M`), else falls back to a
  one-shot `getBrowserLocation()` held to the same 10 s / 50 m rule. A rough
  or stale one-shot names which half failed. Browser failures are four
  distinct sentences (denied / timeout / unsupported / unavailable); only
  denied is about permission. The toast names the destination layer and
  accuracy. An open edit session says "added", not "saved". A failed append
  or a guarded store no-op is said out loud, not treated as silent success.
  A point later moved by hand drops `nsmts:capturedAt`, `nsmts:accuracyM`,
  `nsmts:altitudeM`, and the fix altitude coordinate.
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
descriptor references — other than rows an attach still owes a descriptor,
which both surfaces reserve before writing them and release when a write
references them (`reservedPhotoIDs` natively, `reservePhotoId` on the web). Layer delete removes all the layer's photo records and
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
that GeoCore `KmzRoundTripTests` mirrors byte-for-byte in structure.

## iOS mirror

N1 (#281), N2 (#283), and N3 (#284) are implemented. Remaining native
field-capture work for this plan is done.

GeoCore N1 (pure, zero-dependency), present: `Capture/CaptureSpec.swift`
(pinned by `FieldCaptureParityTests` against the shared fixture, including
the kmz block copied verbatim from W9 and never regenerated from Swift),
`Capture/TrackFix.swift`, `Capture/TrackFilter.swift` (contract pipeline and
stack-based Douglas-Peucker `TrackSimplify`), `Capture/TrackRecording.swift`,
`Capture/TrackFeature.swift`, `Capture/MarkFeature.swift`,
`Capture/TrackGpx.swift` (raw GPX writer that round-trips through
`GpxParse`), and `Vector/VectorConvert.swift`
(`VectorEdit.convertingPoints`). `GpxParse` reads trkpt `<time>` into
`coordinateProperties.times`.

GeoCore N2, present: `Vector/PhotoDescriptor.swift` (strict all-or-nothing
reader, KMZ string form, caps 20/500/50 MB), `Vector/PhotoPipeline.swift`
(ImageIO 2048 px q0.8 + 256 px q0.7; re-encode strips ALL EXIF including
GPS; `captureClaims` reads DateTimeOriginal + GPS before the strip),
`Vector/ZipWriter.swift` (`ZipArchive.archive`; STORED JPEGs, raw-DEFLATE
doc.kml via `compression_encode_buffer`), `VectorExport` KML ExtendedData
plus `kmz(layerName:parsed:photos:)` (CDATA description + img width 400,
KMZ-form descriptors with href; missing bytes dropped and counted),
`KmzParse.parseWithAssets`, `KmzRelink` (re-minted ids, img-strip,
missing/undecodable/capped distinct), and `VectorEdit.updatingProperties`.

GeoCore N3, present: `Vector/SnapEngine.swift` (vertex/edge candidates over
`ownFeature | parcel` sources only, vertex-first; unreadable rings
contribute nothing), `Geodesy.localMetricProjection` /
`nearestPointOnSegment`, `Vector/BulkPhotoPlacement.swift` (in-view
default-checked, out-of-view checkable, untagged unselectable),
`Vector/PhotoMapIndex.swift` (z15 buckets, 500-annotation cap keeping
the most recent in a fixed order; the row and map say so).

NSDataServices N3, present: `ParcelQuery.envelopeQueryURL(bounds:clearance:)`
(`esriGeometryEnvelope`, `inSR=4326`, `outFields=PID`, `returnGeometry=true`),
refusing without clearance exactly like the existing point query, and
`ParcelFetcher.parcels(in:clearance:)` paging up to `maxSnapParcels`;
`exceededTransferLimit` or over-cap reads as the distinct "too many parcels
here, zoom in" state, never as fewer parcels.

App N1, present:

- `FieldCapture/TrackRecorder.swift` (@Observable, own CLLocationManager
  when-in-use, `isIdleTimerDisabled` while recording and restored on stop or
  scene-phase change, auto-pause on leaving foreground with "Recording paused
  while the app was in the background"), `TrackRecordingHUD.swift`,
  `SaveTrackSheet.swift`, `MarkLocation.swift`. Conversion UI in
  `UserVectors/VectorEditPanel.swift` / `VectorEditSession.swift`
  (keep-source default, one-shot undo); dashed preview in
  `MapContainerView`. GPS callout "Marked from GPS on this device (±N m)"
  only when both reserved keys are present. Mark-my-location destination
  follows the contract (open session, else "Field notes").

App N2, present:

- `UserVectors/FeatureAttributesEditor.swift` (key-value rows stored as
  strings, reserved / `nsmts:` keys refused, imported complex values
  read-only) and `FeaturePhotoStrip.swift` (`PhotosPicker` for library,
  permissionless out-of-process, plus `CameraPicker` wrapping
  `UIImagePickerController`). Info.plist keys in both pbxproj config
  blocks: `INFOPLIST_KEY_NSCameraUsageDescription` ("Takes photos to attach
  to your own map features. Photos stay on this device.") and
  `INFOPLIST_KEY_NSPhotoLibraryUsageDescription` ("Shows the locations stored
  with your photos by indexing them on this device, and attaches photos you
  choose to your own map features. Attached photos and their locations leave
  this device only when you export or share a layer yourself.").
  `GENERATE_INFOPLIST_FILE` merges
  [`Config/NSMarksTheSpot-Info.plist`](../Config/NSMarksTheSpot-Info.plist),
  which sets `PHPhotoLibraryPreventAutomaticLimitedAccessAlert` because the
  photo-map row presents the limited-library picker itself. `PrivacyInfo.xcprivacy`
  stays zero-collection; CoreLocation and
  PhotoKit are not required-reason categories, so it is otherwise unchanged.
- Photo bytes as files under the existing store directory:
  `photos/<layerID>/<photoID>.jpg` and `.thumb.jpg`. `UserVectorStore`
  `addPhoto` / `photoData` / `deletePhoto`; `delete(id:)` removes the
  layer's photo directory; `replaceGeometry` sweeps files no descriptor
  references; `sweepOrphanedGeometry` drops unclaimed photo directories.
- Callout thumbnails on `UserVectorCalloutCard`; session
  `attachPhotos` / `removePhoto` / `updateFeatureProperties` plus the
  one-time photo-location offer; KMZ export menu item **KMZ (with photos)**
  plus the honest GeoJSON/KML note and shortfall report; KMZ import
  re-link with distinct missing / undecodable / capped notes.

App N3, present:

- Photo-map layer, native-only (tip after #298): PhotoKit has no location
  predicate, so the first grant is one full enumeration (`PHAsset.fetchAssets`
  reading `asset.location`). The snapshot is persisted to
  `Caches/PhotoMapIndex/index.json` with the `PHPersistentChangeToken` and
  on-disk `accessScope` (in-memory `indexedAccess`). Later refreshes apply
  `fetchPersistentChanges(since:)` only under unchanged full access; limited
  access always re-reads the whole selection (the change history there
  covers only the selected photos). A downgrade clears the pins. Under limited access, every
  foreground return (and the prompt's first answer) treats the selection as
  possibly changed: pins come down at once and any in-flight read is
  discarded. Library reads are single-flight; an intent counter wins if
  the switch is turned off mid-read; authorization is re-read on every
  return to the foreground. In memory the index buckets by z15 web-Mercator
  tile; a viewport query unions intersecting buckets
  and, over `PhotoMapIndex.maxAnnotations` (500), keeps the most recent in
  a fixed order. The row says "Showing the 500 most recent of N in view";
  the map overlay says "Showing the 500 most recent of N photos here."
  They do not advise zooming in. The photo drawing's record is
  stable across pans; viewport pins are diffed by id for single points with
  unique ids (`MapController.isIncrementallyUpdatable`); clusters are
  layer-qualified (`nsmts-photos-<layerID>`). Co-located members, or a
  cluster already at closest zoom, open one card with all members' photos
  ("N photos here"). A pin card is titled by capture date when the library
  reported one; the card loads the thumbnail and full image through
  PhotoKit (`imageData`, progress in `downloadProgress`, cancel on dismiss).
  The row lives in the My Maps panel section (the `.myMaps` slot the
  parity tests reserve for catalogue-free content), so `LayerCatalog` and
  every parity fixture are untouched. `PhotoMapViewModel.State` is
  `off` / `requestingAccess` / `indexing` / `on` / `failed`, with lines such
  as "Waiting for photo access…", "Indexing your photos…", "Updating your
  photo index…", and "Your photo library couldn't be read. Turn the switch
  off and on to try again." Access is separate: limited says "Showing only
  the photos you selected." with a **Manage** button that presents
  `PHPhotoLibrary.presentLimitedLibraryPicker` in place (not Settings);
  denied says "Photo access is off. The map cannot show your library." with
  **Open Settings**; restricted says "Photo access is restricted on this
  device, for example by Screen Time or a management profile." and
  unavailable says "The photo library is not available on this device.",
  neither with a Settings route. Empty and in-view lines: "No photos with a
  location were found in your library." / limited "No selected photos with
  a location were found." / "N geotagged photos indexed · none in this
  view" / "N of M geotagged photos in this view". Subtitle: "Your photos ·
  never uploaded". The bulk-placement picker on the row is labelled "Add
  photos to map"; the confirm sheet's navigation title is still "Place
  photos"
  (`FieldCapture/PhotoMapViewModel.swift`, `PhotoMapRow.swift`,
  `UserVectorsViewModel.swift`, `UserVectorCalloutCard.swift`,
  `MapController.swift`).
- Snapping in `VectorEditSession`/`MapContainerView`: candidates rebuild on
  `.visibleRegionSettled` while armed, own visible features plus cached
  parcel rings, tolerance 15 pt converted like the existing `fingerTolerance`,
  haptic tick on snap, the pinned caveat as a standing caption while parcels
  are armed. Unreadable or not-supplied parcel boundaries contribute no
  candidates; never a partial ring.
- Bulk placement: the row's "Add photos to map" `PhotosPicker` → classify →
  `BulkPhotoPlacementSheet` (navigation title "Place photos") creates a
  `source: photos` layer with provenance
  "Created from N of your photos". `UserVectorLibrary.currentVersion` is 3.

Tests in the tree for N1: TrackFilter/TrackSimplify/TrackGpx against
scripted sequences, FieldCaptureParityTests against the fixture,
convertingPoints, and `TrackRecorderSeamTests` against an injected
`LocationFixSource` and `ScreenWakeLock` — a refused start touching neither the
clock, CoreLocation nor the idle timer; the device-wide switch refusing a
granted app; a grant starting the recording that waited for it; a refusal
mid-walk pausing and giving the screen back; a denied error classified rather
than ignored and a transient one ignored rather than classified; fixes reaching
the contract's filter and its refusals being reported; the foreground auto-pause;
and stop returning the walk and the screen.

That paragraph claimed the injected fix source from N1 onward and it did not
exist until 2026-09-03: both `TrackRecorder` and `MarkLocation` built a
`CLLocationManager` in their initialiser and wrote straight to
`UIApplication.shared`, so none of the behaviour above could be driven from a
test. Three of the six device bugs the 2026-09-02 field review reported lived in
exactly those classes. `MarkLocation` and `PhotoMapViewModel` still construct
their own dependencies; the seam covers the recorder only, and this paragraph
says so rather than describing a tree that is not there. Tests in the tree for N2: PhotoDescriptor,
PhotoPipeline, ZipWriter, KmlExtendedData, KmzRoundTrip (including the
shared cross-surface fixture), VectorEdit.updatingProperties, photo
store sweeps (`FieldCapturePhotoTests`), attribute editing. Tests in the
tree for N3: SnapEngine priority and source exclusion, ParcelEnvelopeQuery,
PhotoMapIndex cap and buckets (`PhotoMapIndexTests`,
`PhotoMapIndexBucketTests`), BulkPhotoPlacement classify,
`FieldCaptureSnapTests`, `PhotoMapViewModelTests`, and the extra
`UserVectorShapeTests` / `UserVectorEditingTests` cases that landed with
#298. Remaining native field-capture tests for this
plan: none. Run focused suites (the full bundle hangs on shared
URLProtocol stubs); builds go through the xcode-build-slot wrapper.

## Cross-cutting compliance

Privacy: nothing in this design adds a network path except the licence-gated
NSPRD envelope query, which sends only a viewport rectangle to the same
provincial endpoint the parcel identify already queries. Location never enters
share URLs, print, or evidence notes on either surface. Photos and attributes
live in IndexedDB or Application Support and leave only through explicit
user-initiated exports. Photo re-encoding strips EXIF GPS from every stored
and exported image byte. The iOS App Store privacy label (zero collected data
types) stays true.

Evidence and provenance: recorded layers say "Recorded on this device", and
one saved from the device's copy of a walk in progress says it may be cut
short; photo
layers say "From your photos · N photos"; marked points show their accuracy
(web names the device's location, not GPS; iOS callouts still say GPS);
traced features carry `nsmts:traced` and the not-a-survey caveat
permanently, including through exports. Raw fixes are never silently promoted
into the processed line; they are a separate artifact with its own export.
Distinct states stay distinct everywhere: on web, permission denied vs
timeout vs unsupported vs unavailable — timeout and unavailable are two
live-region sentences once a fix has been had, and a third before any has
arrived ("hasn't been found yet", never "lost"), none of them a "GPS signal
lost" line; on iOS, permission denied vs unavailable vs "GPS signal lost —
still trying."; quota vs
storage-failed vs unsupported-image; licence vs zoom vs dense vs error vs
an honest empty.

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
| N2 | (#283, implemented) Attributes, photos, KMZ: photo file layout + sweeps, attributes editor + photo strip + callout rendering, camera/picker wrappers + Info.plist keys, ZipArchive writer, KML ExtendedData, kmz export/import, GeoJSON note |
| N3 | (#284, implemented; photo-map follow-up #298) Snapping + photo map: envelope query + fetcher, SnapEngine + session integration + caveat + traced stamping, PhotoMapIndex + PhotoMapViewModel + clustered annotations + photo-map row states + bulk EXIF placement |

W1–W3 delivered the user's first ask (points and tracks at the current
location) as a coherent slice. W4 (snap math + parcel source, no UI),
W5 (snap engine + UI), W6 (points-to-path conversion), W7 (freeform
attributes + KML ExtendedData), W8 (photo storage + attach + display),
and W9 (KMZ photo interchange + bulk EXIF placement) have landed;
remaining web work for field-capture is done. Native N1 (#281), N2
(#283), and N3 (#284) landed; the field-capture plan is complete on nightly.

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

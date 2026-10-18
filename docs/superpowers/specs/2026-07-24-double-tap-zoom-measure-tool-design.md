# Double-tap zoom + measuring tool — design

Two interaction changes to the web map, approved together because they
interlock: the measure tool's finish gesture depends on the double-tap fix.

## Problem

Single tap on the map identifies the parcel under the cursor and selects its
PID. Leaflet's `doubleClickZoom` is already enabled, but the DOM fires
`click` → `click` → `dblclick`, so a double-tap zooms **and** runs the parcel
identify twice (the second lookup aborts the first). Users who double-tap to
zoom get a stray PID selection they never asked for.

Separately, the app offers no way to measure ad-hoc geometry. The parcel
inspector already surfaces whole-parcel acreage (NSPRD's `SHAPE.AREA`
attribute via `mappedAreaForPid` in `parcelContext.ts`), but road frontage,
distance to water, and the area of a *portion* of a lot — the cleared half,
the part above the flood line — are all due-diligence questions the map
cannot answer today.

## Goals

1. Double-tap/double-click zooms cleanly. It never selects a PID.
2. Single tap still selects a PID, with no perceptible extra latency.
3. A measure mode for distances (running total, m/km) and areas
   (hectares + acres, because NS deeds and tax-sale ads speak acres).
4. No new third-party dependencies.

## Non-goals

- Persisting measurements into the shareable URL state (`mapShareState`).
- Rendering measurements in print export. The print pipeline was just
  stabilized (#143, #144) and v1 of this feature stays out of it.
- Snapping to parcel vertices or boundaries.
- Multiple simultaneous measurements. One active measurement at a time;
  starting a new one clears the last.

## Design

### 1. Debounced parcel identify

`ParcelIdentifyController` (MapCanvas.tsx) gains a deferred click: on map
`click` it starts a ~250 ms timer; a second `click` or a `dblclick` inside the
window cancels it. Only a timer that survives fires `onIdentifyParcel`.

The 250 ms cost is invisible in practice because identify already performs an
NSPRD network round trip behind a "Finding the parcel…" status message. The
zoom-gate (`PROPERTY_BOUNDARY_MIN_ZOOM`) and `enabled` prop behave as today.

### 2. Geodesy service

New pure module `web/src/services/geodesy.ts`, tested in isolation:

- `pathDistanceMeters(points)` — sum of great-circle legs (haversine, matching
  Leaflet's `CRS.Earth` radius so on-screen scale and readouts agree).
- `polygonAreaSquareMeters(ring)` — spherical excess. A planar shoelace on raw
  lat/lng is wrong by ~40 % at Nova Scotia's latitude; spherical excess is
  exact on the sphere and ~15 lines of code.
- `formatDistance(meters)` — `m` below 1 km, `km` above.
- `formatArea(squareMeters)` — hectares and acres together
  (e.g. "2.02 ha · 4.99 ac").
- `SQUARE_METRES_PER_ACRE` moves here from `parcelContext.ts` (which
  re-imports it), so the measure tool and the inspector's mapped-acreage
  label can never drift apart.

### 3. Measure mode

A "Measure" control on the map (near the existing zoom control) with two
modes: **distance** and **area**. Measure mode is UI state owned by
`MapCanvas`; it is not global app state.

While measure mode is active:

- `ParcelIdentifyController` is disabled via its existing `enabled` prop —
  taps place vertices instead of selecting parcels.
- `doubleClickZoom` is disabled so the finish gesture doesn't zoom.
- Vertices render as small markers joined by a polyline (distance) or polygon
  (area) on a dedicated pane above parcels.
- A floating readout updates live: cumulative distance, or area once ≥ 3
  vertices exist. A cursor-following preview segment shows the next leg.
- Finish: double-tap / double-click, Enter, or tapping the first vertex
  (area mode). The completed shape and its readout stay on the map.
- Cancel: Esc, or toggling measure mode off. Both clear the shape.

A headless `MeasureController` component owns the Leaflet event wiring,
mirroring the existing controller-component pattern (`ParcelIdentifyController`,
`MapPositionController`). Geometry math lives in the geodesy service; the
controller only manages interaction state.

## Testing

- `geodesy.test.ts` — known-answer tests: equator/meridian distances, a
  surveyed 1-acre square at 45° N, hemisphere-crossing polygon, degenerate
  inputs (0–2 points), formatting thresholds.
- `MapCanvas.test.tsx` — fake-timer tests for the debounce (single click fires
  after 250 ms; double click never fires identify); measure-mode tests
  (identify suspended, vertices accumulate, Esc clears, finish freezes the
  readout).

## Rollout

Single PR into `nightly`; the hourly web deploy promotes it as usual. No data,
schema, or print changes. ARCHITECTURE.md gains a one-line note about the map
controls; README's feature list mentions measuring.

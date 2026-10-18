# Mineral-Occurrence Proximity Parcel Layer Design

## Purpose

Add an optional web-map layer that highlights Nova Scotia property parcels whose
mapped boundary falls within 1 kilometre of a record in the Province's Mineral
Occurrences Database. The layer helps property researchers discover relevant
nearby records that the existing exact-parcel intersection result does not show.

This is a screening aid. It must describe proximity to a published point, not
assert that a highlighted parcel contains minerals, has economic potential, or
may be entered or explored.

## Chosen Approach

Build the result dynamically for the visible map area at detailed zoom. Query
nearby mineral-occurrence points first, combine their coordinates into one
NSPRD multipoint proximity query, and render the returned parcel polygons as a
derived GeoJSON layer.

This approach is preferable to:

- drawing radius circles alone, which shows the search area but does not
  directly identify qualifying parcels; and
- publishing a precomputed province-wide parcel dataset, which would create a
  large derivative that must be regenerated whenever either source changes.

A July 20, 2026 live service check returned 127 NSPRD parcels within 1 kilometre
of published occurrence `F14-004`, showing that local dynamic queries are
practical while also supporting a detailed-zoom floor.

## User Experience

Add an off-by-default row under **Geology & Resources**:

> Properties within 1 km of a mineral occurrence

The row must:

- state that it is a derived parcel-proximity layer;
- require acceptance of the Province restricted geographic-services licence
  because it uses NSPRD parcel geometry;
- remain disabled, with a concise explanation, until that licence is accepted;
- become visible only at map zoom 12 or closer;
- report loading, returned parcel count, zoom requirement, empty, and source
  failure states independently of every other layer; and
- remain independently shareable through the existing map-layer URL state.

When enabled, qualifying parcels receive a visually distinct, translucent fill
and outline. The style must remain distinguishable from current and historical
tax-sale parcels, ordinary property boundaries, and the selected parcel. The
selected-parcel style must remain visually dominant.

Clicking a highlighted parcel must reuse the existing parcel selection and
inspector flow. A tooltip may identify the polygon as a parcel near a recorded
mineral occurrence, but must not describe it as a mineral property.

## Proximity Rule

A parcel qualifies when its NSPRD geometry intersects a 1,000-metre search
distance around any point returned by the official Mineral Occurrences
Database.

The distance is measured from the parcel geometry, not its centroid, civic
point, or address. A large or irregular parcel therefore qualifies when any
part of its mapped boundary is within the threshold.

The first version uses one fixed 1-kilometre threshold for every commodity. It
does not offer a radius selector or a gold-only filter.

## Map Data Flow

When the toggle is on, the licence is accepted, and the map is at zoom 12 or
closer:

1. Expand the current viewport by 1 kilometre so that an occurrence just beyond
   the screen can still qualify a visible parcel.
2. Query the Mineral Occurrences FeatureServer for point geometry and the
   existing identifying fields, including occurrence number, name, status, and
   commodity.
3. If no points are returned, clear the derived parcel collection and report a
   valid empty state.
4. Submit the returned coordinates as one `esriGeometryMultipoint` geometry to
   the NSPRD parcel query with `distance=1000` and metre units.
5. Request PID and polygon geometry in WGS84, follow ArcGIS pagination when
   needed, and deduplicate results by PID.
6. Render the returned polygons through a dedicated derived-layer component.

Requests must be abortable. Map movement, zoom changes, layer disablement, or
licence-state changes must cancel or supersede stale work so an older response
cannot replace the current viewport result.

The implementation must not make one NSPRD request per occurrence. If the
service rejects a multipoint request or exceeds a documented request-size
limit, split points into bounded batches, merge the results, and retain PID
deduplication.

## Selected-Parcel Explanation

Extend selected-parcel resource screening so Mineral Occurrences distinguishes:

- **On parcel** — returned by the existing exact polygon-intersection query;
  and
- **Within 1 km** — returned by a separate 1-kilometre polygon-distance query
  after exact matches are removed.

Each returned record must show:

- occurrence name;
- occurrence number;
- commodity list, falling back to primary commodity;
- published status, such as occurrence, placer, or past producer; and
- the relationship label above.

Exact intersections win during deduplication. The first version does not need
to calculate or display an exact metre value; the bounded relationship is the
claim supported directly by the service query.

When the source succeeds with no results, use wording equivalent to:

> No published mineral occurrence was returned on or within 1 km of this
> parcel.

When the source fails, preserve the existing failure boundary and infer no
absence. Evidence-note export must use the same relationship labels and
caveats as the visible parcel sheet.

## Catalog and Component Boundaries

Model the new entry as a derived resource layer rather than pretending it is a
fourth Province source layer.

- Keep the existing three source-backed resource IDs for Mineral Occurrences,
  Mineral Tenure, and Abandoned Mine Openings.
- Add a distinct derived-layer ID for mineral-occurrence proximity parcels.
- Allow the Geology & Resources controls and map-share state to address both
  source-backed and derived resource layers.
- Keep exact/intersection result records typed only to source-backed layers.
- Put viewport orchestration and ArcGIS request construction in a focused
  mineral-proximity service and map component rather than in `App.tsx`.
- Reuse the existing parcel selection callback instead of building a second
  inspector.

These boundaries keep the user-facing grouping intact without conflating an
official point inventory with the application's parcel classification.

## Licence, Provenance, and Wording

The result combines:

- the Province's open [Mineral Occurrences Database](https://novascotia.ca/natr/meb/download/dp002.asp);
  and
- [NSPRD parcel geometry](https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer/0)
  available under the Province restricted geographic-services licence.

The layer row and parcel sheet must link to the Mineral Occurrences source and
retain the NSPRD licence attribution already used by the map. It must identify
the highlight as application-derived rather than Province-published.

Required caveat:

> Near a published occurrence is screening context only. It does not prove
> mineralization, deposit extent, grade, recoverability, value, mineral rights,
> permission to enter or explore, or completeness of the published inventory.

The application must never transform an empty result into “no minerals” or “no
mineral occurrences.” The bounded claim is only that the queried published
dataset returned no record on or within the stated distance.

## Performance and Failure Behaviour

- Do no proximity work while the layer is off, the licence is unaccepted, or
  the map is below zoom 12.
- Re-query only after settled map movement or zoom changes, following the
  existing feature-overlay lifecycle.
- Page NSPRD results rather than silently accepting a transfer-limit subset.
- Report a valid empty viewport separately from service failure.
- If the mineral source fails, do not query NSPRD and clear stale highlights.
- If NSPRD fails, keep the mineral occurrence point layer independent and
  usable.
- Do not persist or publish a cache of derived parcel classifications.

## Testing and Verification

### Service tests

- The mineral query uses the viewport expanded by 1 kilometre and requests
  point geometry plus occurrence, status, and commodity fields.
- A valid empty mineral response skips the NSPRD request.
- Multiple occurrence points produce one multipoint NSPRD request in the normal
  path.
- The NSPRD request uses a 1,000-metre distance, returns WGS84 geometry, follows
  pagination, and deduplicates PID values.
- Failed and aborted requests remain distinguishable.

### Component and application tests

- The toggle starts off and is licence-gated.
- No requests occur below zoom 12.
- A stale response cannot replace results for a newer viewport.
- Highlighted polygons reuse normal PID selection.
- Highlight style remains distinct and selected-parcel styling wins.
- The parcel sheet lists all commodities and distinguishes exact from nearby
  records.
- Empty and error wording preserve the evidence boundary.
- Shared URLs round-trip the new layer ID.
- Evidence-note export includes the same relationship and source caveats.

### Live and visual checks

- Verify the official Mineral Occurrences and NSPRD services still support the
  required point, multipoint-distance, pagination, and GeoJSON operations.
- Confirm published occurrence `F14-004` produces nearby parcel highlights at
  close zoom without relying on a private or user-reported observation.
- Review desktop and narrow mobile layouts, keyboard interaction, screen-reader
  names, contrast, loading transitions, and map responsiveness.
- Run the complete web test, lint, and production-build gates.

## Non-Goals

- Gold-only or commodity filtering.
- A user-adjustable distance.
- User-submitted mineral finds or edits to the Province inventory.
- Province-wide precomputation or publication of derived parcel data.
- Native iOS implementation or offline availability.
- Geological interpretation, prospectivity ranking, valuation, or exploration
  advice.
- Claims about ownership of mineral rights, access, or permission.

## Acceptance Criteria

1. A licence-gated, off-by-default Geology & Resources row highlights parcels
   within 1 kilometre of any published mineral occurrence at zoom 12 or closer.
2. The dynamic query is viewport-bounded, abortable, paginated, and deduplicated
   without one NSPRD request per occurrence.
3. Clicking a highlighted polygon opens the established parcel inspector.
4. The selected parcel lists occurrence name, number, commodity, status, and
   either **On parcel** or **Within 1 km**.
5. Valid empty results, source failures, and stale requests remain distinct.
6. Wording consistently describes proximity to a published record and makes no
   mineral, economic, rights, access, or completeness conclusion.
7. Share URLs, evidence-note export, responsive layout, accessibility checks,
   tests, lint, and production build all pass.

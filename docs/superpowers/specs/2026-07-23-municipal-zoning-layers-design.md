# Municipal zoning layers — design

Date: 2026-07-23
Status: approved for phase 1 implementation

## Problem

The web companion has no zoning. A tax-sale buyer looking at an Inverness County
parcel on August 11, 2026 cannot see what the land may lawfully be used for. Nova
Scotia publishes no provincial zoning layer (verified 2026-07-23), so zoning is
necessarily per-municipality, from municipal ArcGIS services with differing
schemas, licences, and currency.

The repository's only prior position on zoning is an exclusion, in
`docs/property-context-data-candidates.md:121`: provincial land and ecology layers
"should not be presented as a complete municipal zoning or development-permission
answer." Real zoning polygons answer that gap, and the exclusion stays true — a
zoning polygon is still not a development permission.

## Verified source facts (2026-07-23)

Every endpoint below was queried live. Field names and value shapes come from the
service metadata and sampled records, not from documentation.

| Municipality | Service (FeatureServer sublayer) | Polygons | Code field | Name field |
|---|---|---:|---|---|
| Inverness | `services5.../IN_Zoning/FeatureServer/708` | 1,125 | `Zone` | `ZONETYPE` |
| Victoria | `services5.../VIZoning_Clipped/FeatureServer/707` | 901 | `Zone` | `ZONETYPE` |
| Richmond | `services5.../RI_Plan_Richmond/FeatureServer/376` | 1,284 | `Zone` | `ZONETYPE` |
| Cumberland | `services6.../Zoning_Cumberland_2018_abbr2/FeatureServer/0` | 34,281 | `ZONE` | `ZoneName` |
| Halifax | `services2.../ZoningBoundaries/FeatureServer/0` | 11,076 | `ZONE` | `DESCRIPTION` |

Findings that shape the design:

1. **The EDPC trio shares one schema** (`Zone`, `ZONETYPE`, `PLAN_`), so one
   adapter covers three counties — but the `ZONETYPE` *convention* differs.
   Inverness and Victoria store `"CR Commercial Recreation"` (code prefixed);
   Richmond stores `"Agricultural Potential"` (no prefix). Cumberland stores
   `"Agriculture (AG)"` (code suffixed). Naive display would render
   "CR — CR Commercial Recreation".
2. **Cumberland's service slug lies about its vintage.** The URL says
   `Zoning_Cumberland_2018_abbr2`; the underlying layer is named `CU_Zone_2025`.
   The layer is 2025-vintage and still predates the April 2026 consolidated LUB.
   The caveat must state the vintage, not the slug.
3. **Halifax zoning is not governed by one by-law.** Each polygon carries a
   `BYLAW_ID` (observed 7, 9, 11, 17, 20…) identifying which of HRM's many
   community land-use by-laws applies. A single "the LUB" link for Halifax would
   be wrong; it must link to HRM's by-law index.
4. **Every service returns empty `copyrightText`.** This corroborates that the
   EDPC services state no licence, so their geometry is rendered live and never
   extracted into project data.
5. **Volumes force zoom gating.** Cumberland returns 5,184 features across a
   zoom-11-sized window and Halifax 7,479; the shared fetch helper caps at 10
   pages of 2,000. The EDPC counties return ~127 at zoom 12.

## Blocking technical finding

`services/arcGISFeatureOverlay.ts` cannot serve these layers as written:

- It hardcodes `orderByFields=geo_id`. Against `IN_Zoning` this returns
  **HTTP 400 `'Invalid field: geo_id' parameter is invalid`** — verified.
- Its return type `ArcGISPointFeatureCollection` is hard-typed to
  `GeoJSON.Point`; these services return `MultiPolygon`.
- Its dedup key falls back to `JSON.stringify(feature.geometry)` when a feature
  has no `id`. These features have none, so every polygon's full ring set would
  become a hash key.

## Design

### 1. Generalize the fetch helper, do not fork it

`fetchArcGISFeatureOverlay` becomes generic over geometry, with the ordering and
identity fields as explicit required options:

```ts
export type ArcGISFeatureCollection<G extends GeoJSON.Geometry> =
  GeoJSON.FeatureCollection<G, Record<string, unknown>>;
export type ArcGISPointFeatureCollection = ArcGISFeatureCollection<GeoJSON.Point>;
```

`orderByFields` and `idField` are **required**, not defaulted. A silent default of
`geo_id` is a source-specific magic value inside a generic helper; leaving it
would let a future layer compile and then 400 at runtime. There is exactly one
existing call site (`ArcGISFeatureLayer` in `MapCanvas.tsx`), so making it
required is a three-line change that converts a runtime failure into a compile
error.

Paging, envelope clamping, abort handling, and dedup are reused unchanged — that
logic is exactly what zoning needs, and forking it would duplicate ~60 lines.

### 2. A `zoningLayerCatalog`, following the flood-hazard precedent

`FloodHazardLayerDescriptor` is the closest existing model: a separate catalog,
its own `initial*Visibility` record, and — critically — a **per-layer
`licenceUrl`**, because each source's licence differs. Zoning extends that with
the field mapping and the authority link:

```ts
export type ZoningLayerDescriptor = {
  id: ZoningLayerId;
  name: string;                      // the jurisdiction, e.g. "Inverness County"
  serviceUrl: string;                // full FeatureServer sublayer URL
  sourceUrl: string;                 // human landing page
  bylawUrl: string;                  // authoritative LUB PDF or by-law index
  bylawLabel: string;                // e.g. "Plan Inverness Land Use By-law"
  licence: "municipal-open" | "municipal-no-stated-licence";
  licenceUrl: string | null;         // null when the source states no licence
  redistribution: "permitted" | "live-query-only";
  attribution: string;
  zoneCodeField: string;
  zoneNameField: string;
  planAreaField: string | null;
  orderByFields: string;
  outFields: readonly string[];
  fillColor: string;
  strokeColor: string;
  minZoom; maxZoom; opacity;
  webCaveat; sourceDate; scale; coverage;
};
```

`redistribution: "live-query-only"` encodes the EDPC constraint in the type
system rather than in a comment. A test asserts every EDPC layer carries it and
that no zoning geometry is committed under `web/src/data/`.

Two new `licence` values are introduced because the existing unions
(`province-restricted` / `province-open` / `rumsey-reference`) have no vocabulary
for a third-party municipal source, and none for "no stated licence". Zoning sits
outside the Province licence gate entirely — like the hydro pilot, its toggle
takes no `licenceAccepted` prop.

### 3. Zone description is a pure function, tested in isolation

`services/zoning.ts` exports `describeZoningFeature(properties, descriptor)`
returning `{ code, name, planArea }`, and normalizes the three naming conventions:

- strip a leading `"<code> "` prefix (Inverness, Victoria)
- strip a trailing `" (<code>)"` suffix (Cumberland)
- otherwise pass through (Richmond, Halifax)

Keeping this pure keeps the parsing testable without a DOM or a network, matching
how the repo treats `taxSaleFormat.ts` and `nsprd.ts`.

### 4. Popups build DOM nodes, never HTML strings

The only existing popup (`MapCanvas.tsx:602-614`) interpolates values into a
template string. That is safe there because its data is a bundled local JSON
file. **Zoning attributes are untrusted third-party input**, and the repo has no
escaping helper anywhere. So the zoning popup constructs elements and assigns
`textContent`, then hands the `HTMLElement` to `bindPopup`, which Leaflet
accepts. Injection is impossible by construction rather than by escaping
correctly. The only `href` is the `bylawUrl` from our own catalog, never from the
service.

Popup content: zone code, zone name, plan area when present, and a link to the
authoritative by-law, plus the unofficial-copy disclaimer.

### 5. Honest absence

Three disclaimers are load-bearing and appear in the group source note:

- these are **not** the official municipal copies and are not for legal purposes;
- towns inside counties are separate zoning jurisdictions, so a county layer
  does not imply coverage of a town parcel;
- **absence of a polygon is not evidence that no zoning applies** — most Nova
  Scotia municipalities publish no zoning GIS at all. Pictou County (PDF only,
  plan in transition mid-2026) is the concrete example: we show nothing there
  rather than something wrong.

### 6. Zoom gating

Zoom floors are set from the measured volumes above: **12** for the three EDPC
counties, **13** for Cumberland and Halifax. Below the floor the layer reports
`{status: "zoom", minZoom}`, which the existing `layerRuntimeLabel` renders as
"Zoom to N+ to load".

## Scope

**Phase 1 (this change).** Five jurisdiction-wide zoning layers; generalized
fetch helper; zoning service + popup; collapsed, default-off layer group; share
URL support; print legend + attribution; tests; docs.

**Explicitly deferred, with reasons.**

- *Baddeck plan area (Victoria).* Measured: the county layer returns 26 polygons
  inside a Baddeck bounding box and the separate Baddeck service returns 16.
  They overlap rather than the county layer having a clean hole, so which one
  governs is unconfirmed. Shipping two overlapping zoning layers would be worse
  than shipping one. Needs confirmation from EDPC.
- *Secondary plan areas* (Inverness ×5, Richmond ×4) and *Victoria future land
  use* — policy-area boundaries, not zones; same overlap question.
- *MODL explicit "Unzoned Area" polygons* — the right long-term answer to
  "no zoning applies here", but a different modelling problem than "this parcel
  is zoned X".
- *Parcel-level zoning evidence* in the info sheet and print evidence appendix —
  roughly seven further integration points (`parcelResources.ts`,
  `printEvidenceAttribution.ts`, `evidenceNote.ts`, `ParcelInspector.tsx`).
  Worth doing, but it is a second reviewable change, not this one.

## Testing

- `layers/layerCatalog.test.ts` — catalog shape, initial visibility all-off,
  the EDPC `live-query-only` constraint, Cumberland's vintage caveat, Halifax's
  by-law-index link, per-layer `licenceUrl` nullability.
- `services/arcGISFeatureOverlay.test.ts` — `orderByFields`/`idField` are sent
  through; polygon collections page and dedup by the configured id field.
- `services/zoning.test.ts` (new) — the three name conventions, missing/blank
  attributes, and that a script-like attribute value survives as literal text.
- `styles.test.ts` — extend the hardcoded legend id list; each zoning layer needs
  a unique `.print-layer-symbol--<id>` block.

## Documentation

Per `CLAUDE.md:20` a new layer type requires doc updates: `ARCHITECTURE.md` (new
catalog paragraph + default-composition clause), `README.md` (group clause in the
online-companion enumeration), `web/README.md` (new `## Municipal zoning` section
with per-source receipts, and the `## Current boundary` inventory), and a
`plan.md` checklist item.

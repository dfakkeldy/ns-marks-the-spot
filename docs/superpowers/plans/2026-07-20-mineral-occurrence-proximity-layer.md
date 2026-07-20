# Mineral-Occurrence Proximity Parcel Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an off-by-default web-map layer that highlights NSPRD parcels within 1 kilometre of any published Nova Scotia mineral occurrence and explains exact-versus-nearby records in the selected-parcel inspector.

**Architecture:** Keep the three official resource overlays source-backed and model the new parcel highlight as a separate derived resource layer. A focused service will query occurrence points around the settled viewport, submit them to NSPRD in bounded multipoint batches, page and deduplicate parcel geometry, and feed a dedicated Leaflet component. The existing selected-parcel resource service will make a separate 1-kilometre occurrence query so inspector and evidence-note claims do not depend on what happens to be rendered.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 4, React Testing Library, Leaflet 1.9, React-Leaflet 5, ArcGIS REST FeatureServer/MapServer queries, CSS.

## Global Constraints

- The first version uses a fixed `1_000` metre threshold measured from NSPRD parcel geometry.
- Include every published mineral commodity; do not add commodity filtering or a gold-only control.
- The derived layer is off by default, restricted-services-licence-gated, and available only at zoom `12` or closer.
- Keep Mineral Occurrences, Mineral Tenure, and Abandoned Mine Openings as independent source-backed layers under the existing open-data licence boundary.
- Never label a qualifying parcel as containing minerals; say only that it is on or within 1 kilometre of a published occurrence.
- Empty results mean no record was returned by the named published source; they do not prove absence.
- Do not add third-party packages, persist derived parcel classifications, publish a province-wide derivative, or change the native iOS application.
- Preserve stale-request cancellation, source-specific failure states, map-share round trips, and the existing parcel inspector.
- Do not put a private ownership assertion, private address, or user-reported field observation in code, tests, fixtures, screenshots, or documentation.
- In a clean implementation worktree, run `npm ci` in `web/` before the first test command.

---

## File Structure

**Create:**

- `web/src/services/mineralProximity.ts` — occurrence-first, viewport-bounded multipoint NSPRD query and pagination.
- `web/src/services/mineralProximity.test.ts` — service URL/body, batching, pagination, deduplication, empty, and failure tests.
- `web/src/components/MineralProximityParcelLayer.tsx` — Leaflet lifecycle, stale-request cancellation, styling, tooltip, and PID selection.
- `web/src/components/MineralProximityParcelLayer.test.tsx` — zoom, lifecycle, stale response, status, and click tests.

**Modify:**

- `web/src/layers/layerCatalog.ts` — distinguish source-backed and derived resource IDs/descriptors.
- `web/src/layers/layerCatalog.test.ts` — catalog, licence gate, metadata, and default-off contract.
- `web/src/services/mapShareState.ts` — accept the derived layer ID in shared URLs.
- `web/src/services/mapShareState.test.ts` — derived-layer round trip and unknown-ID rejection.
- `web/src/services/arcGISFeatureOverlay.ts` — allow a metre distance around an envelope query.
- `web/src/services/arcGISFeatureOverlay.test.ts` — distance/units query contract.
- `web/src/services/parcelResources.ts` — exact and 1-kilometre occurrence relationships with exact-match precedence.
- `web/src/services/parcelResources.test.ts` — exact/near deduplication, commodity fallback, and failure boundaries.
- `web/src/components/MapCanvas.tsx` — render the derived parcel layer below the established selected/tax-sale parcel overlay.
- `web/src/components/MapCanvas.test.tsx` — derived-layer props/status integration and selected-parcel visual precedence.
- `web/src/App.tsx` — licence-gated control, effective visibility, inspector wording, metadata, sharing, and evidence export.
- `web/src/App.test.tsx` — licence flow, all-minerals copy, exact/near inspector output, empty/error wording, and share state.
- `web/src/services/evidenceNote.ts` — source-specific empty wording and proximity-safe section language.
- `web/src/services/evidenceNote.test.ts` — relationship labels, bounded empty wording, and limitations.
- `web/src/styles.css` — stacked inspector relationship/detail styling.
- `web/README.md` — user-visible layer, query, licence, and caveat contract.
- `ARCHITECTURE.md` — derived-layer data flow and component boundary.
- `docs/property-context-data-candidates.md` — mark this proximity slice as planned by the implementation plan, not shipped.

---

### Task 1: Separate Source-Backed and Derived Resource Catalog Types

**Files:**

- Modify: `web/src/layers/layerCatalog.ts:13-70,318-394`
- Test: `web/src/layers/layerCatalog.test.ts:163-232`
- Modify: `web/src/services/mapShareState.ts:3-49`
- Test: `web/src/services/mapShareState.test.ts:8-48`
- Modify: `web/src/services/parcelResources.ts:1,23-26`
- Modify: `web/src/components/MapCanvas.test.tsx:77-81`

**Interfaces:**

- Produces: `SourceResourceLayerId`, `DerivedResourceLayerId`, `ResourceLayerId`, `DerivedResourceLayerDescriptor`, `derivedResourceLayerCatalog`, `allResourceLayerCatalog`.
- Preserves: `resourceLayerCatalog` as the three official source-backed descriptors.
- Consumers: Tasks 2–5 use the new IDs and combined control catalog.

- [ ] **Step 1: Write failing catalog and share-state tests**

Add assertions that lock the fourth row, its gate, and URL identity:

```ts
expect(derivedResourceLayerCatalog).toEqual([
  expect.objectContaining({
    id: "mineral-proximity-parcels",
    name: "Properties within 1 km of a mineral occurrence",
    delivery: "derived-parcel-query",
    minZoom: 12,
    requiresProvinceLicence: true,
  }),
]);
expect(allResourceLayerCatalog).toHaveLength(4);
expect(initialResourceLayerVisibility).toEqual({
  "mineral-occurrences": false,
  "mineral-tenure": false,
  "abandoned-mines": false,
  "mineral-proximity-parcels": false,
});
```

Extend the shared state fixture:

```ts
const proximityState: MapShareState = {
  ...state,
  layerIds: ["nsprd", "mineral-proximity-parcels"],
};

expect(
  parseMapShareState(buildMapShareUrl("https://example.com/map/", proximityState)),
).toEqual(proximityState);
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
cd web
npm test -- src/layers/layerCatalog.test.ts src/services/mapShareState.test.ts
```

Expected: FAIL because `derivedResourceLayerCatalog` and `allResourceLayerCatalog` do not exist and `mineral-proximity-parcels` is not a valid shared layer ID.

- [ ] **Step 3: Add the catalog types and derived descriptor**

Use these exact public type boundaries in `layerCatalog.ts`:

```ts
export type SourceResourceLayerId =
  | "mineral-occurrences"
  | "mineral-tenure"
  | "abandoned-mines";

export type DerivedResourceLayerId = "mineral-proximity-parcels";

export type ResourceLayerId = SourceResourceLayerId | DerivedResourceLayerId;

export type DerivedResourceLayerDescriptor = {
  id: DerivedResourceLayerId;
  name: string;
  delivery: "derived-parcel-query";
  sourceUrl: string;
  minZoom: number;
  maxZoom: number;
  webCaveat: string;
  sourceDate: string;
  scale: string;
  coverage: string;
  requiresProvinceLicence: true;
};

export type ResourceControlDescriptor =
  | ResourceLayerDescriptor
  | DerivedResourceLayerDescriptor;
```

Change `ResourceLayerBase.id` to `SourceResourceLayerId`. Add the derived and combined catalogs after the existing source catalog:

```ts
export const derivedResourceLayerCatalog: readonly DerivedResourceLayerDescriptor[] = [
  {
    id: "mineral-proximity-parcels",
    name: "Properties within 1 km of a mineral occurrence",
    delivery: "derived-parcel-query",
    sourceUrl: "https://novascotia.ca/natr/meb/download/dp002.asp",
    minZoom: 12,
    maxZoom: 23,
    webCaveat: "Derived from published occurrences and NSPRD parcels; not proof of mineralization",
    sourceDate: "Mineral occurrences June 2024 · NSPRD live",
    scale: "Application-derived 1 km parcel proximity",
    coverage: "Visible Nova Scotia map area",
    requiresProvinceLicence: true,
  },
] as const;

export const allResourceLayerCatalog: readonly ResourceControlDescriptor[] = [
  ...resourceLayerCatalog,
  ...derivedResourceLayerCatalog,
];

export const initialResourceLayerVisibility: Record<ResourceLayerId, boolean> = {
  "mineral-occurrences": false,
  "mineral-tenure": false,
  "abandoned-mines": false,
  "mineral-proximity-parcels": false,
};
```

Keep selected-parcel results typed only to source-backed layers immediately, so this commit remains type-correct:

```ts
import type { SourceResourceLayerId } from "../layers/layerCatalog";

export type ParcelResourceIntersections = Record<
  SourceResourceLayerId,
  ResourceIntersectionResult
>;
```

Add the derived key to the shared `hiddenResourceLayers` test fixture:

```ts
const hiddenResourceLayers = {
  "mineral-occurrences": false,
  "mineral-tenure": false,
  "abandoned-mines": false,
  "mineral-proximity-parcels": false,
};
```

Update `mapShareState.ts` to build `validLayerIds` from `allResourceLayerCatalog` while leaving source-rendering loops on `resourceLayerCatalog`:

```ts
import {
  allResourceLayerCatalog,
  provinceLayerCatalog,
  type ProvinceLayerId,
  type ResourceLayerId,
} from "../layers/layerCatalog";

const validLayerIds = new Set<ShareLayerId>([
  "modern",
  ...provinceLayerCatalog.map(({ id }) => id),
  ...allResourceLayerCatalog.map(({ id }) => id),
]);
```

- [ ] **Step 4: Run the focused tests and verify success**

Run:

```bash
npm test -- src/layers/layerCatalog.test.ts src/services/mapShareState.test.ts
```

Expected: both test files PASS; the three official source descriptors remain unchanged and the derived ID round-trips.

- [ ] **Step 5: Run the TypeScript production build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite PASS with source-only parcel results and the four-key map visibility record.

- [ ] **Step 6: Commit the catalog boundary**

```bash
git add web/src/layers/layerCatalog.ts web/src/layers/layerCatalog.test.ts web/src/services/mapShareState.ts web/src/services/mapShareState.test.ts web/src/services/parcelResources.ts web/src/components/MapCanvas.test.tsx
git commit -m "refactor(web): model derived resource layers"
```

---

### Task 2: Build the Viewport Mineral-Proximity Query Service

**Files:**

- Modify: `web/src/services/arcGISFeatureOverlay.ts:13-55`
- Test: `web/src/services/arcGISFeatureOverlay.test.ts:19-44`
- Create: `web/src/services/mineralProximity.ts`
- Create: `web/src/services/mineralProximity.test.ts`

**Interfaces:**

- Consumes: `MapEnvelope`, `fetchArcGISFeatureOverlay`, `NsprdFeatureCollection`.
- Produces: `MINERAL_PROXIMITY_DISTANCE_METRES`, `MINERAL_PROXIMITY_MIN_ZOOM`, and `fetchMineralProximityParcels(bounds, signal?)`.
- Return type: `Promise<NsprdFeatureCollection>` containing PID polygons only.
- Consumers: Task 4's Leaflet component.

- [ ] **Step 1: Write the failing envelope-distance test**

Add this case to `arcGISFeatureOverlay.test.ts`:

```ts
it("queries a metre distance around the visible envelope when requested", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ type: "FeatureCollection", features: [] })),
  );
  vi.stubGlobal("fetch", fetchMock);

  await fetchArcGISFeatureOverlay({
    serviceUrl: "https://example.test/FeatureServer/0",
    bounds: { west: -62, south: 45, east: -60, north: 47 },
    outFields: ["geo_id"],
    distanceMetres: 1_000,
  });

  const requestUrl = new URL(fetchMock.mock.calls[0][0]);
  expect(requestUrl.searchParams.get("distance")).toBe("1000");
  expect(requestUrl.searchParams.get("units")).toBe("esriSRUnit_Meter");
});
```

- [ ] **Step 2: Add the optional envelope-distance parameter**

Extend the options and query builder exactly as follows:

```ts
type FetchArcGISFeatureOverlayOptions = {
  serviceUrl: string;
  bounds: MapEnvelope;
  outFields: readonly string[];
  distanceMetres?: number;
  signal?: AbortSignal;
};
```

Inside the query loop, after setting `spatialRel`:

```ts
if (distanceMetres !== undefined) {
  queryUrl.searchParams.set("distance", String(distanceMetres));
  queryUrl.searchParams.set("units", "esriSRUnit_Meter");
}
```

Destructure `distanceMetres` in the function arguments.

- [ ] **Step 3: Run the overlay test**

Run:

```bash
npm test -- src/services/arcGISFeatureOverlay.test.ts
```

Expected: PASS with `distance=1000` and metre units present only when requested.

- [ ] **Step 4: Write failing mineral-proximity service tests**

Create tests with these public fixtures and assertions:

```ts
const bounds = { west: -62, south: 45, east: -60, north: 47 };

const occurrence = (id: number, longitude: number) => ({
  type: "Feature" as const,
  id,
  geometry: { type: "Point" as const, coordinates: [longitude, 45.8122] },
  properties: {
    geo_id: id,
    Occ_num: `F14-${String(id).padStart(3, "0")}`,
    Name: `Occurrence ${id}`,
    Status: "Occurrence",
    Comm_list: "Au",
  },
});

const parcel = (pid: string) => ({
  type: "Feature" as const,
  properties: { PID: pid },
  geometry: {
    type: "Polygon" as const,
    coordinates: [[
      [-61.48, 45.81],
      [-61.47, 45.81],
      [-61.47, 45.82],
      [-61.48, 45.82],
      [-61.48, 45.81],
    ]],
  },
});
```

Required cases:

```ts
expect(mineralUrl.searchParams.get("distance")).toBe("1000");
expect(mineralUrl.searchParams.get("units")).toBe("esriSRUnit_Meter");
expect(mineralUrl.searchParams.get("outFields")).toContain("Comm_list");

const body = nsprdCall[1]?.body as URLSearchParams;
expect(body.get("geometryType")).toBe("esriGeometryMultipoint");
expect(body.get("distance")).toBe("1000");
expect(body.get("units")).toBe("esriSRUnit_Meter");
expect(JSON.parse(body.get("geometry") ?? "{}").points).toEqual([
  [-61.4786, 45.8122],
  [-61.4762, 45.8122],
]);
expect(result.features.map(({ properties }) => properties.PID)).toEqual([
  "90000001",
]);
```

Add the empty, batching, pagination, and failure tests explicitly:

```ts
it("skips NSPRD when the occurrence viewport is empty", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ type: "FeatureCollection", features: [] })),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await fetchMineralProximityParcels(bounds);

  expect(result).toEqual({ type: "FeatureCollection", features: [] });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("batches 501 points into two NSPRD requests", async () => {
  const occurrences = Array.from({ length: 501 }, (_, index) =>
    occurrence(index + 1, -61.5 + index / 100_000),
  );
  const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response(JSON.stringify({ type: "FeatureCollection", features: [] }))
      : new Response(JSON.stringify({ type: "FeatureCollection", features: occurrences })),
  );
  vi.stubGlobal("fetch", fetchMock);

  await fetchMineralProximityParcels(bounds);

  const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
  expect(postCalls).toHaveLength(2);
  expect(JSON.parse((postCalls[0][1]?.body as URLSearchParams).get("geometry") ?? "{}").points)
    .toHaveLength(500);
  expect(JSON.parse((postCalls[1][1]?.body as URLSearchParams).get("geometry") ?? "{}").points)
    .toHaveLength(1);
});

it("pages full NSPRD responses and deduplicates PIDs", async () => {
  const fullPage = Array.from({ length: 2_000 }, (_, index) =>
    parcel(String(90_000_000 + index)),
  );
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      type: "FeatureCollection",
      features: [occurrence(1, -61.4786)],
    })))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      type: "FeatureCollection",
      features: fullPage,
    })))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      type: "FeatureCollection",
      features: [fullPage[1_999], parcel("99999999")],
    })));
  vi.stubGlobal("fetch", fetchMock);

  const result = await fetchMineralProximityParcels(bounds);

  expect(result.features).toHaveLength(2_001);
  const finalBody = fetchMock.mock.calls[2][1]?.body as URLSearchParams;
  expect(finalBody.get("resultOffset")).toBe("2000");
});

it("rejects an NSPRD failure without partial geometry", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      type: "FeatureCollection",
      features: [occurrence(1, -61.4786)],
    })))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(fetchMineralProximityParcels(bounds)).rejects.toThrow(
    "NSPRD proximity query failed (503)",
  );
});
```

- [ ] **Step 5: Run the new service test and verify failure**

Run:

```bash
npm test -- src/services/mineralProximity.test.ts
```

Expected: FAIL because `fetchMineralProximityParcels` and its constants do not exist.

- [ ] **Step 6: Implement the bounded multipoint service**

Create `mineralProximity.ts` with these exact exports and limits:

```ts
import type { MapEnvelope } from "./arcGISFeatureOverlay";
import { fetchArcGISFeatureOverlay } from "./arcGISFeatureOverlay";
import {
  NSPRD_LAYER_URL,
  type NsprdFeatureCollection,
} from "./nsprd";

export const MINERAL_PROXIMITY_DISTANCE_METRES = 1_000;
export const MINERAL_PROXIMITY_MIN_ZOOM = 12;

export const MINERAL_OCCURRENCE_SERVICE_URL =
  "https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/mineral_occurrence_database_d002ns_UT83/FeatureServer/0";

const OCCURRENCE_FIELDS = [
  "geo_id",
  "Occ_num",
  "Name",
  "Status",
  "Comm_prim",
  "Comm_list",
] as const;
const POINTS_PER_BATCH = 500;
const PAGE_SIZE = 2_000;
const MAX_PAGES_PER_BATCH = 10;
```

Use one multipoint request for up to 500 points and bounded batches above that:

```ts
function pointBatches(points: number[][]): number[][][] {
  const batches: number[][][] = [];
  for (let index = 0; index < points.length; index += POINTS_PER_BATCH) {
    batches.push(points.slice(index, index + POINTS_PER_BATCH));
  }
  return batches;
}
```

Build each NSPRD POST body with:

```ts
const body = new URLSearchParams({
  f: "geojson",
  where: "1=1",
  geometry: JSON.stringify({
    points,
    spatialReference: { wkid: 4326 },
  }),
  geometryType: "esriGeometryMultipoint",
  inSR: "4326",
  spatialRel: "esriSpatialRelIntersects",
  distance: String(MINERAL_PROXIMITY_DISTANCE_METRES),
  units: "esriSRUnit_Meter",
  outFields: "PID",
  returnGeometry: "true",
  outSR: "4326",
  resultRecordCount: String(PAGE_SIZE),
  resultOffset: String(page * PAGE_SIZE),
  orderByFields: "PID",
});
```

The exported orchestration must use the distance-capable occurrence query and deduplicate parcel features by PID:

```ts
export async function fetchMineralProximityParcels(
  bounds: MapEnvelope,
  signal?: AbortSignal,
): Promise<NsprdFeatureCollection> {
  const occurrences = await fetchArcGISFeatureOverlay({
    serviceUrl: MINERAL_OCCURRENCE_SERVICE_URL,
    bounds,
    outFields: OCCURRENCE_FIELDS,
    distanceMetres: MINERAL_PROXIMITY_DISTANCE_METRES,
    signal,
  });
  const points = occurrences.features.map(({ geometry }) => geometry.coordinates);
  if (points.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const collections = await Promise.all(
    pointBatches(points).map((batch) => fetchParcelBatch(batch, signal)),
  );
  const seen = new Set<string>();
  return {
    type: "FeatureCollection",
    features: collections.flatMap(({ features }) =>
      features.filter(({ properties }) => {
        if (seen.has(properties.PID)) {
          return false;
        }
        seen.add(properties.PID);
        return true;
      }),
    ),
  };
}
```

Implement the bounded page loop with no partial-success fallback:

```ts
type NsprdQueryPayload = NsprdFeatureCollection & {
  error?: { message?: string };
};

async function fetchParcelBatch(
  points: number[][],
  signal?: AbortSignal,
): Promise<NsprdFeatureCollection> {
  const features: NsprdFeatureCollection["features"] = [];

  for (let page = 0; page < MAX_PAGES_PER_BATCH; page += 1) {
    const body = new URLSearchParams({
      f: "geojson",
      where: "1=1",
      geometry: JSON.stringify({
        points,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryMultipoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      distance: String(MINERAL_PROXIMITY_DISTANCE_METRES),
      units: "esriSRUnit_Meter",
      outFields: "PID",
      returnGeometry: "true",
      outSR: "4326",
      resultRecordCount: String(PAGE_SIZE),
      resultOffset: String(page * PAGE_SIZE),
      orderByFields: "PID",
    });
    const response = await fetch(`${NSPRD_LAYER_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal,
    });
    if (!response.ok) {
      throw new Error(`NSPRD proximity query failed (${response.status})`);
    }
    const payload = (await response.json()) as NsprdQueryPayload;
    if (payload.error) {
      throw new Error(payload.error.message ?? "NSPRD proximity query failed");
    }
    if (!Array.isArray(payload.features)) {
      throw new Error("NSPRD proximity query returned an invalid collection");
    }
    features.push(...payload.features);
    if (payload.features.length < PAGE_SIZE) {
      return { type: "FeatureCollection", features };
    }
  }

  throw new Error("NSPRD proximity query exceeded the safety limit");
}
```

- [ ] **Step 7: Run the focused service tests**

Run:

```bash
npm test -- src/services/arcGISFeatureOverlay.test.ts src/services/mineralProximity.test.ts
```

Expected: PASS for empty, one-batch, two-batch, pagination, deduplication, abort, and failure paths.

- [ ] **Step 8: Run the TypeScript production build**

```bash
npm run build
```

Expected: TypeScript and Vite PASS with the new service exports and response types.

- [ ] **Step 9: Commit the query service**

```bash
git add web/src/services/arcGISFeatureOverlay.ts web/src/services/arcGISFeatureOverlay.test.ts web/src/services/mineralProximity.ts web/src/services/mineralProximity.test.ts
git commit -m "feat(web): query parcels near mineral occurrences"
```

---

### Task 3: Add Exact-versus-Nearby Selected-Parcel Evidence

**Files:**

- Modify: `web/src/services/parcelResources.ts:12-165`
- Test: `web/src/services/parcelResources.test.ts:21-93`
- Modify: `web/src/services/evidenceNote.ts:9-106`
- Test: `web/src/services/evidenceNote.test.ts:4-30`

**Interfaces:**

- Consumes: `SourceResourceLayerId` from Task 1.
- Produces: optional `ResourceIntersection.relationship: "on-parcel" | "within-1km"`.
- Preserves: `ParcelResourceIntersections` has exactly the three official source-backed keys.
- Consumers: Task 5 renders and exports relationship labels.

- [ ] **Step 1: Write failing exact/near parcel-resource tests**

Change the mineral mock to distinguish exact from distance requests:

```ts
if (url.includes("mineral_occurrence_database")) {
  const body = init?.body as URLSearchParams;
  if (body.get("distance") === "1000") {
    return new Response(JSON.stringify({
      features: [
        { attributes: {
          geo_id: 7,
          Occ_num: "A01-001",
          Name: "Exact occurrence",
          Status: "Occurrence",
          Comm_list: "Au, Ag",
        } },
        { attributes: {
          geo_id: 8,
          Occ_num: "A01-002",
          Name: "Nearby occurrence",
          Status: "Placer",
          Comm_prim: "Au",
        } },
      ],
    }));
  }
  return new Response(JSON.stringify({
    features: [{ attributes: {
      geo_id: 7,
      Occ_num: "A01-001",
      Name: "Exact occurrence",
      Status: "Occurrence",
      Comm_list: "Au, Ag",
    } }],
  }));
}
```

Assert exact precedence and commodity fallback:

```ts
expect(result["mineral-occurrences"].intersections).toEqual([
  {
    id: "A01-001",
    name: "Exact occurrence",
    detail: "Occurrence · Au, Ag",
    relationship: "on-parcel",
  },
  {
    id: "A01-002",
    name: "Nearby occurrence",
    detail: "Placer · Au",
    relationship: "within-1km",
  },
]);
```

Check the proximity request:

```ts
const mineralBodies = fetchMock.mock.calls
  .filter(([input]) => String(input).includes("mineral_occurrence_database"))
  .map(([, options]) => options?.body as URLSearchParams);
expect(mineralBodies).toHaveLength(2);
expect(mineralBodies[0].has("distance")).toBe(false);
expect(mineralBodies[1].get("distance")).toBe("1000");
expect(mineralBodies[1].get("units")).toBe("esriSRUnit_Meter");
```

- [ ] **Step 2: Run the parcel-resource test and verify failure**

Run:

```bash
npm test -- src/services/parcelResources.test.ts
```

Expected: FAIL because only one occurrence query runs and no relationship exists.

- [ ] **Step 3: Implement relationship-aware occurrence queries**

Change the ID boundary and result type:

```ts
import type { SourceResourceLayerId } from "../layers/layerCatalog";

export type ResourceIntersection = {
  id: string;
  name: string;
  detail: string;
  relationship?: "on-parcel" | "within-1km";
};

export type ParcelResourceIntersections = Record<
  SourceResourceLayerId,
  ResourceIntersectionResult
>;
```

Define the shared occurrence URL and summarizer so both queries produce identical record fields:

```ts
const MINERAL_OCCURRENCE_QUERY_URL =
  "https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/mineral_occurrence_database_d002ns_UT83/FeatureServer/0/query";

function summarizeMineralOccurrence(
  attributes: ArcGISAttributes,
): ResourceIntersection {
  const id = String(attributes.Occ_num ?? attributes.geo_id ?? "Unnumbered");
  const name = String(attributes.Name ?? "Mineral occurrence").trim();
  const detail = [attributes.Status, attributes.Comm_list ?? attributes.Comm_prim]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  return { id, name, detail };
}
```

Add the fields to `ResourceQuery`:

```ts
type ResourceQuery = {
  layerId: SourceResourceLayerId;
  url: string;
  outFields: string;
  distanceMetres?: number;
  relationship?: "on-parcel" | "within-1km";
  summarize: (attributes: ArcGISAttributes) => ResourceIntersection;
};
```

Replace the inline exact mineral descriptor and add the distance descriptor immediately after it:

```ts
{
  layerId: "mineral-occurrences",
  url: MINERAL_OCCURRENCE_QUERY_URL,
  outFields: "geo_id,Occ_num,Name,Status,Comm_prim,Comm_list",
  relationship: "on-parcel",
  summarize: summarizeMineralOccurrence,
},
{
  layerId: "mineral-occurrences",
  url: MINERAL_OCCURRENCE_QUERY_URL,
  outFields: "geo_id,Occ_num,Name,Status,Comm_prim,Comm_list",
  distanceMetres: 1_000,
  relationship: "within-1km",
  summarize: summarizeMineralOccurrence,
},
```

In `runQuery`, add:

```ts
if (query.distanceMetres !== undefined) {
  body.set("distance", String(query.distanceMetres));
  body.set("units", "esriSRUnit_Meter");
}
return (payload.features ?? []).map(({ attributes }) => ({
  ...query.summarize(attributes),
  relationship: query.relationship,
}));
```

During reduction, deduplicate each layer by `id`; because the exact query appears first, it wins:

```ts
for (const intersection of outcome.value) {
  if (!result[query.layerId].intersections.some(({ id }) => id === intersection.id)) {
    result[query.layerId].intersections.push(intersection);
  }
}
```

- [ ] **Step 4: Run parcel-resource tests**

Run:

```bash
npm test -- src/services/parcelResources.test.ts
```

Expected: PASS with five source requests, exact-match precedence, `Comm_list` preference, and `Comm_prim` fallback.

- [ ] **Step 5: Write failing evidence-note tests**

Use a mineral result that carries the relationship and source-specific empty text:

```ts
resourceResults: [
  {
    name: "Mineral occurrences",
    sourceUrl: "https://example.com/minerals",
    status: "ready",
    results: ["A01-002 · Nearby occurrence · Within 1 km · Placer · Au"],
    emptyMessage: "No published mineral occurrence was returned on or within 1 km of this parcel.",
  },
],
```

Assert:

```ts
expect(note.markdown).toContain("Within 1 km");
expect(note.markdown).toContain("proximity to a published record");
expect(note.markdown).toContain("does not prove mineralization");
```

Add a second test with `results: []` and assert the exact bounded empty message appears.

- [ ] **Step 6: Implement source-specific evidence wording**

Extend `EvidenceResult`:

```ts
type EvidenceResult = {
  name: string;
  sourceUrl: string;
  status: "ready" | "error";
  results: string[];
  emptyMessage?: string;
};
```

Update the empty branch:

```ts
if (result.results.length === 0) {
  return [`- ${result.name}: ${result.emptyMessage ?? "No mapped intersection returned."}`];
}
```

Rename the section to `## Geology and resource context` and replace its limitation sentence with:

```ts
"Mapped intersections and proximity to a published record are screening evidence only. They do not prove mineralization, deposit extent, grade, recoverability, value, mineral rights, access, permission to explore, or completeness of the published inventory."
```

- [ ] **Step 7: Run focused evidence tests**

Run:

```bash
npm test -- src/services/parcelResources.test.ts src/services/evidenceNote.test.ts
```

Expected: PASS; exact and nearby occurrence claims use the same bounded language in data and export.

- [ ] **Step 8: Run the TypeScript production build**

```bash
npm run build
```

Expected: TypeScript and Vite PASS with source-only result keys and optional occurrence relationships.

- [ ] **Step 9: Commit selected-parcel evidence**

```bash
git add web/src/services/parcelResources.ts web/src/services/parcelResources.test.ts web/src/services/evidenceNote.ts web/src/services/evidenceNote.test.ts
git commit -m "feat(web): explain nearby mineral occurrences"
```

---

### Task 4: Render the Derived Parcel Layer with Stale-Request Protection

**Files:**

- Create: `web/src/components/MineralProximityParcelLayer.tsx`
- Create: `web/src/components/MineralProximityParcelLayer.test.tsx`
- Modify: `web/src/components/MapCanvas.tsx:1-76,570-759`
- Test: `web/src/components/MapCanvas.test.tsx:1-423`

**Interfaces:**

- Consumes: `fetchMineralProximityParcels`, `MINERAL_PROXIMITY_MIN_ZOOM`, `NsprdFeatureCollection`.
- Produces: `MineralProximityParcelLayer` with `visible`, `onSelectPid`, and `onStatusChange` props.
- Status type: existing `MapLayerStatus`.
- Rendering order: derived polygons first; established selected/current/historical parcel GeoJSON second.

- [ ] **Step 1: Write failing component lifecycle tests**

Mock the service and map with a captured `moveend` handler. Required cases:

```ts
const mapHandlers = {
  moveend: undefined as (() => void) | undefined,
  zoomend: undefined as (() => void) | undefined,
};
const mapMock = {
  getZoom: vi.fn(() => 11),
  getBounds: vi.fn(() => ({
    getWest: () => -62,
    getSouth: () => 45,
    getEast: () => -60,
    getNorth: () => 47,
  })),
  on: vi.fn((name: "moveend" | "zoomend", handler: () => void) => {
    mapHandlers[name] = handler;
  }),
  off: vi.fn(),
};
const onStatusChange = vi.fn();

expect(fetchMineralProximityParcels).not.toHaveBeenCalled();
expect(onStatusChange).toHaveBeenCalledWith({ status: "zoom", minZoom: 12 });
```

At zoom 12:

```ts
expect(fetchMineralProximityParcels).toHaveBeenCalledWith(
  { west: -62, south: 45, east: -60, north: 47 },
  expect.any(AbortSignal),
);
expect(onStatusChange).toHaveBeenLastCalledWith({ status: "ready", count: 1 });
```

Have the mocked `GeoJSON` call `onEachFeature` with a fake Leaflet layer and invoke its click handler:

```ts
expect(fakeLayer.bindTooltip).toHaveBeenCalledWith(
  "PID 90000001 · within 1 km of a published mineral occurrence",
  { sticky: true },
);
fakeClickHandler({ originalEvent: {} });
expect(onSelectPid).toHaveBeenCalledWith("90000001");
```

Use this deferred helper and resolve the older request last:

```ts
const parcel = (pid: string) => ({
  type: "Feature" as const,
  properties: { PID: pid },
  geometry: {
    type: "Polygon" as const,
    coordinates: [[
      [-61.48, 45.81],
      [-61.47, 45.81],
      [-61.47, 45.82],
      [-61.48, 45.82],
      [-61.48, 45.81],
    ]],
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

it("ignores a stale viewport response", async () => {
  const first = deferred<NsprdFeatureCollection>();
  const second = deferred<NsprdFeatureCollection>();
  vi.mocked(fetchMineralProximityParcels)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  mapMock.getZoom.mockReturnValue(12);

  render(
    <MineralProximityParcelLayer
      visible
      onSelectPid={vi.fn()}
      onStatusChange={onStatusChange}
    />,
  );
  act(() => mapHandlers.moveend?.());
  second.resolve({ type: "FeatureCollection", features: [parcel("90000002")] });
  await waitFor(() =>
    expect(onStatusChange).toHaveBeenLastCalledWith({ status: "ready", count: 1 }),
  );
  first.resolve({
    type: "FeatureCollection",
    features: [parcel("90000003"), parcel("90000004")],
  });
  await act(async () => Promise.resolve());
  expect(onStatusChange).toHaveBeenLastCalledWith({ status: "ready", count: 1 });
});
```

- [ ] **Step 2: Run the component test and verify failure**

Run:

```bash
npm test -- src/components/MineralProximityParcelLayer.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the dedicated Leaflet component**

Use this exact public surface and style:

```tsx
import type { MapLayerStatus } from "./MapCanvas";

type MineralProximityParcelLayerProps = {
  visible: boolean;
  onSelectPid: (pid: string) => void;
  onStatusChange?: (status: MapLayerStatus) => void;
};

export const mineralProximityParcelStyle: PathOptions = {
  color: "#72520f",
  fillColor: "#f1c453",
  fillOpacity: 0.28,
  weight: 2,
  dashArray: "5 3",
};

const EMPTY_PARCELS: NsprdFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
```

Inside `useEffect`, follow the established `ArcGISFeatureLayer` lifecycle:

```tsx
let controller: AbortController | null = null;
let requestNumber = 0;

const loadVisibleParcels = () => {
  controller?.abort();
  controller = null;
  requestNumber += 1;
  const currentRequest = requestNumber;

  if (!visible) {
    setCollection(EMPTY_PARCELS);
    onStatusChange?.({ status: "idle" });
    return;
  }
  if (map.getZoom() < MINERAL_PROXIMITY_MIN_ZOOM) {
    setCollection(EMPTY_PARCELS);
    onStatusChange?.({ status: "zoom", minZoom: MINERAL_PROXIMITY_MIN_ZOOM });
    return;
  }

  const bounds = map.getBounds();
  controller = new AbortController();
  onStatusChange?.({ status: "loading" });
  void fetchMineralProximityParcels(
    {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    },
    controller.signal,
  ).then((nextCollection) => {
    if (currentRequest !== requestNumber) {
      return;
    }
    setCollection(nextCollection);
    onStatusChange?.({ status: "ready", count: nextCollection.features.length });
  }).catch((error: unknown) => {
    if (
      currentRequest !== requestNumber ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      return;
    }
    setCollection(EMPTY_PARCELS);
    onStatusChange?.({ status: "error" });
  });
};
```

Register and remove both `moveend` and `zoomend`, abort on cleanup, and render:

```tsx
loadVisibleParcels();
map.on("moveend", loadVisibleParcels);
map.on("zoomend", loadVisibleParcels);

return () => {
  requestNumber += 1;
  controller?.abort();
  map.off("moveend", loadVisibleParcels);
  map.off("zoomend", loadVisibleParcels);
};
```

```tsx
<GeoJSON
  key={collection.features.map(({ properties }) => properties.PID).join(",")}
  data={collection}
  style={mineralProximityParcelStyle}
  onEachFeature={(feature, featureLayer) => {
    const pid = feature.properties.PID;
    featureLayer.bindTooltip(
      `PID ${pid} · within 1 km of a published mineral occurrence`,
      { sticky: true },
    );
    featureLayer.on("click", (event) => {
      L.DomEvent.stopPropagation(event.originalEvent);
      onSelectPid(pid);
    });
  }}
/>
```

- [ ] **Step 4: Run the component tests**

Run:

```bash
npm test -- src/components/MineralProximityParcelLayer.test.tsx
```

Expected: PASS for off, zoom, ready, empty, error, stale, cleanup, tooltip, and click behaviour.

- [ ] **Step 5: Write failing MapCanvas integration tests**

Extend `hiddenResourceLayers` with:

```ts
"mineral-proximity-parcels": false,
```

Mock `MineralProximityParcelLayer` as a visible test marker and assert:

```ts
expect(screen.queryByTestId("mineral-proximity-layer")).not.toBeInTheDocument();
```

Then render with the derived ID true and assert it receives `visible`, reports status under `mineral-proximity-parcels`, and its selection callback is the existing `onSelectPid`.

- [ ] **Step 6: Integrate below the established parcel overlay**

Import the component and render it immediately before the existing `visibleParcels` `<GeoJSON>`:

```tsx
<MineralProximityParcelLayer
  visible={resourceLayers["mineral-proximity-parcels"]}
  onSelectPid={onSelectPid}
  onStatusChange={(status) =>
    reportLayerStatus("mineral-proximity-parcels", status)
  }
/>
```

Change the resource status membership check to `allResourceLayerCatalog.some(...)`. Keep the existing source layer loops on `resourceLayerCatalog` so the derived descriptor is never sent to `ArcGISFeatureLayer` or `ResourceArcGISMapLayer`.

- [ ] **Step 7: Run component and MapCanvas tests**

Run:

```bash
npm test -- src/components/MineralProximityParcelLayer.test.tsx src/components/MapCanvas.test.tsx
```

Expected: PASS; the derived layer selects through the established callback and the selected/tax-sale parcel GeoJSON remains later in render order.

- [ ] **Step 8: Run the TypeScript production build**

```bash
npm run build
```

Expected: TypeScript and Vite PASS with the new component and MapCanvas integration.

- [ ] **Step 9: Commit the map rendering slice**

```bash
git add web/src/components/MineralProximityParcelLayer.tsx web/src/components/MineralProximityParcelLayer.test.tsx web/src/components/MapCanvas.tsx web/src/components/MapCanvas.test.tsx
git commit -m "feat(web): render mineral proximity parcels"
```

---

### Task 5: Integrate the Licence-Gated Control, Inspector, Sharing, and Export

**Files:**

- Modify: `web/src/App.tsx:40-131,390-412,762-811,986-1023,1025-1093,1394-1398,1618-1729,1898-1935,2162-2201`
- Test: `web/src/App.test.tsx:1-158,463-490,1014-1052`
- Modify: `web/src/styles.css:476-538,1231-1281`

**Interfaces:**

- Consumes: `allResourceLayerCatalog`, `ResourceControlDescriptor`, Task 3 relationships, Task 4 MapCanvas integration.
- Produces: licence-safe effective visibility, visible relationship labels, source-aware empty copy, and evidence-note input.
- Preserves: source-backed overlays remain usable without the restricted Province licence.

- [ ] **Step 1: Write failing licence/control tests**

Extend the MapCanvas mock output:

```tsx
; mineral proximity parcels: {resourceLayers["mineral-proximity-parcels"] ? "on" : "off"}
```

In the no-Province path, assert:

```ts
const proximityToggle = screen.getByLabelText(
  "Properties within 1 km of a mineral occurrence",
);
expect(proximityToggle).not.toBeChecked();
expect(proximityToggle).toBeDisabled();
expect(screen.getByText("Province licence required for derived parcel geometry")).toBeInTheDocument();
expect(screen.getByLabelText("Mineral occurrences")).toBeEnabled();
```

With the acceptance key set, assert the proximity toggle becomes enabled, starts off, can be checked, and MapCanvas receives it as on. Also assert the group summary says `4 optional screening layers`.

- [ ] **Step 2: Write failing selected-parcel copy tests**

Use this mineral fixture:

```ts
"mineral-occurrences": {
  status: "ready",
  intersections: [
    {
      id: "A01-001",
      name: "Exact occurrence",
      detail: "Occurrence · Au, Ag",
      relationship: "on-parcel",
    },
    {
      id: "A01-002",
      name: "Nearby occurrence",
      detail: "Placer · Au",
      relationship: "within-1km",
    },
  ],
},
```

Assert the inspector contains:

```ts
expect(within(resources).getByText("A01-001 · On parcel")).toBeInTheDocument();
expect(within(resources).getByText("A01-002 · Within 1 km")).toBeInTheDocument();
expect(within(resources).getByText("Occurrence · Au, Ag")).toBeInTheDocument();
expect(within(resources).getByText("Placer · Au")).toBeInTheDocument();
expect(within(resources).getByText(/does not prove mineralization/)).toBeInTheDocument();
```

Add an empty mineral result case and assert:

```ts
expect(
  within(resources).getByText(
    "No published mineral occurrence was returned on or within 1 km of this parcel.",
  ),
).toBeInTheDocument();
```

- [ ] **Step 3: Run App tests and verify failure**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL because the derived row, licence gate, relationship copy, and bounded empty message are absent.

- [ ] **Step 4: Implement licence-aware control state**

Import `allResourceLayerCatalog` and `ResourceControlDescriptor`. Change `ResourceLayerToggle` to accept `licenceAccepted` and `onReviewLicence`, then derive availability:

```tsx
const requiresProvinceLicence =
  "requiresProvinceLicence" in layer && layer.requiresProvinceLicence;
const enabled = !requiresProvinceLicence || licenceAccepted;

<input
  type="checkbox"
  aria-label={layer.name}
  checked={enabled && checked}
  disabled={!enabled}
  onChange={(event) => onChange(event.target.checked)}
/>
```

Use this caveat branch:

```tsx
<small>
  {enabled
    ? layer.webCaveat
    : "Province licence required for derived parcel geometry"}
</small>
```

Expose the established licence dialog from the disabled derived row:

```tsx
{!enabled ? (
  <button className="text-button" type="button" onClick={onReviewLicence}>
    Review
  </button>
) : null}
```

Pass `onReviewLicence={() => setLicenceDialogOpen(true)}` from the resource-control loop.

Iterate `allResourceLayerCatalog` in the control group, active share IDs, and initial status IDs. Keep `resourceIntersections`, parcel-sheet source groups, and selected-parcel export result loops on `resourceLayerCatalog`.

Before passing state to `MapCanvas`, build effective visibility:

```ts
const effectiveResourceLayers = useMemo<Record<ResourceLayerId, boolean>>(
  () => ({
    ...resourceLayers,
    "mineral-proximity-parcels":
      licenceAccepted && resourceLayers["mineral-proximity-parcels"],
  }),
  [licenceAccepted, resourceLayers],
);
```

Pass `effectiveResourceLayers` to `MapCanvas`, but serialize `resourceLayers` into the share URL so a shared requested layer activates only after licence acceptance.

- [ ] **Step 5: Implement inspector relationship and bounded wording**

In the mineral occurrence group, render the occurrence number and relationship before `detail`:

```tsx
{layer.id === "mineral-occurrences" ? (
  <span>
    {id} · {relationship === "on-parcel" ? "On parcel" : "Within 1 km"}
  </span>
) : null}
{detail ? <span>{detail}</span> : null}
```

Use a source-specific empty branch:

```tsx
result.intersections.length === 0 ? (
  <p>
    {layer.id === "mineral-occurrences"
      ? "No published mineral occurrence was returned on or within 1 km of this parcel."
      : "No mapped intersection was returned for this parcel."}
  </p>
) : null
```

Rename the section heading and accessible name to **Geology & resource context**. Replace the caveat with:

```tsx
<p className="resource-intersection-caveat">
  On-parcel and nearby published records are screening context only. They do
  not prove mineralization, deposit extent, grade, recoverability, value,
  mineral rights, access, permission to explore, or source completeness.
</p>
```

- [ ] **Step 6: Feed relationship-safe strings to evidence export**

Build mineral result strings as:

```ts
results: result.intersections.map(({ id, name, detail, relationship }) =>
  layer.id === "mineral-occurrences"
    ? [
        id,
        name,
        relationship === "on-parcel" ? "On parcel" : "Within 1 km",
        detail,
      ].filter(Boolean).join(" · ")
    : [name, detail].filter(Boolean).join(" · "),
),
emptyMessage: layer.id === "mineral-occurrences"
  ? "No published mineral occurrence was returned on or within 1 km of this parcel."
  : undefined,
```

When the derived layer is active, append two entries to `activeLayers`: the Mineral Occurrences source URL and `NSPRD_LAYER_URL`, each with its own source date. Do not imply that the Province publishes the derived classification.

- [ ] **Step 7: Update group copy and focused CSS**

Change the summary to:

```tsx
<small>4 optional screening layers</small>
```

Replace the source note with copy that preserves both licence boundaries:

```tsx
<p className="resource-source-note">
  Three Province geoscience overlays use open data. The derived 1 km parcel
  layer combines the open Mineral Occurrences inventory with restricted NSPRD
  geometry and therefore requires Province licence acceptance. All results are
  screening context, not mineral, legal, ownership, access, safety, or economic
  conclusions.
</p>
```

Add only the CSS needed for stacked relationship/detail spans:

```css
.parcel-resource-group li span {
  display: block;
  color: var(--muted);
}
```

- [ ] **Step 8: Run App, evidence, share, and component tests**

Run:

```bash
npm test -- src/App.test.tsx src/services/evidenceNote.test.ts src/services/mapShareState.test.ts src/components/MapCanvas.test.tsx
```

Expected: PASS; open source overlays remain licence-independent, the derived toggle is gated, inspector and export agree, and shared derived visibility is fail-closed until acceptance.

- [ ] **Step 9: Run the TypeScript production build**

```bash
npm run build
```

Expected: TypeScript and Vite PASS with the four-key visibility record, combined controls, and evidence input.

- [ ] **Step 10: Commit the integrated user experience**

```bash
git add web/src/App.tsx web/src/App.test.tsx web/src/styles.css
git commit -m "feat(web): add mineral proximity parcel control"
```

---

### Task 6: Document, Verify Live Sources, and Run Release-Quality Web Gates

**Files:**

- Modify: `web/README.md:89-144`
- Modify: `ARCHITECTURE.md:99-116,150-165`
- Modify: `docs/property-context-data-candidates.md:148-160`

**Interfaces:**

- Consumes: completed Tasks 1–5.
- Produces: current user/developer documentation and final local/live verification receipts.
- Does not produce: deployment, merge, native-app, or physical-device claims.

- [ ] **Step 1: Update user-facing documentation**

Add this bounded description to `web/README.md` under **Geology and resources**:

```markdown
The optional **Properties within 1 km of a mineral occurrence** row is an
application-derived screening layer. At zoom 12 or closer it queries published
Mineral Occurrences points around the settled viewport, then highlights NSPRD
parcels whose mapped geometry falls within 1,000 metres. It requires Province
restricted-services licence acceptance because the output uses NSPRD polygons.
Selecting a highlighted parcel lists occurrence number, name, commodity,
published status, and either **On parcel** or **Within 1 km**. Proximity does not
prove mineralization, deposit extent, grade, recoverability, value, mineral
rights, access, exploration permission, or completeness of the inventory.
```

Update the parcel-context paragraph so it says Mineral Occurrences checks exact and 1-kilometre relationships while tenure and abandoned-mine queries remain exact intersections.

- [ ] **Step 2: Update architecture documentation**

Add this data-flow summary to `ARCHITECTURE.md`:

```markdown
`MineralProximityParcelLayer` is the only derived resource renderer. It asks
`mineralProximity.ts` for occurrence points around the viewport and submits the
coordinates to NSPRD in multipoint batches of at most 500. The service pages at
2,000 parcel features, caps each batch at ten pages, deduplicates by PID, and
does not persist classifications. The component is rendered below the existing
selected/current/historical parcel GeoJSON so selection styling remains the
visual authority. Inspector proximity is queried independently from the exact
selected parcel and never inferred from the viewport layer.
```

- [ ] **Step 3: Reconcile the candidate ledger without claiming shipment**

Replace the mineral-distance roadmap sentence in `docs/property-context-data-candidates.md` with:

```markdown
The web source now includes a separate, licence-gated derived parcel layer for
properties within 1 kilometre of any published mineral occurrence, plus
exact-versus-nearby selected-parcel wording. Source implementation and local or
hosted verification do not by themselves establish merge, KinNoKi deployment,
production behaviour, or physical-device acceptance.
```

- [ ] **Step 4: Run the complete local web gates**

Run:

```bash
cd web
npm test
npm run lint
npm run build
```

Expected: every Vitest test passes, ESLint exits `0` with no warnings/errors, and Vite produces a successful production build.

- [ ] **Step 5: Run a public-source live service check**

Use published occurrence `F14-004` only; do not use a private address or ownership assertion. Verify:

```bash
curl -sS -G 'https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer/0/query' \
  --data-urlencode 'f=json' \
  --data-urlencode 'where=1=1' \
  --data-urlencode 'geometry=-61.478611189214817,45.812205951426442' \
  --data-urlencode 'geometryType=esriGeometryPoint' \
  --data-urlencode 'inSR=4326' \
  --data-urlencode 'spatialRel=esriSpatialRelIntersects' \
  --data-urlencode 'distance=1000' \
  --data-urlencode 'units=esriSRUnit_Meter' \
  --data-urlencode 'returnCountOnly=true' | jq .
```

Expected: a JSON object with a positive `count`. Record the observed count and date as a live receipt, not a permanent test assertion.

- [ ] **Step 6: Perform desktop and mobile browser QA**

Run the production preview and inspect at `1440×1024` and `390×844`:

```bash
npm run build
npm run dev -- --host 127.0.0.1
```

At both sizes verify:

1. Without Province acceptance, the three source overlays remain usable and the derived parcel row is disabled with a review path.
2. After acceptance, the derived row begins off and reports `Zoom 12+` below its floor.
3. At the published `F14-004` area and zoom 12+, highlights load and the status count is non-zero.
4. Clicking a highlighted parcel opens the established inspector and selection styling visually dominates the proximity fill.
5. The inspector shows occurrence number, commodity, status, and **On parcel** or **Within 1 km**.
6. Disabling the row clears highlights; rapid pan/zoom does not restore stale polygons.
7. The shared URL round-trips the derived layer ID without bypassing the licence gate.
8. Evidence export contains both official sources, bounded relationship wording, and no mineral-presence claim.
9. Keyboard navigation, focus indication, control label, Dynamic Type-like browser text scaling to 200%, colour contrast, and narrow-sheet scrolling remain usable.
10. The browser console contains no warnings or errors.

- [ ] **Step 7: Commit documentation and verification-ready state**

```bash
git add web/README.md ARCHITECTURE.md docs/property-context-data-candidates.md
git commit -m "docs(web): document mineral proximity screening"
```

- [ ] **Step 8: Rebase, push, and verify hosted CI**

Run:

```bash
git fetch origin
git rebase origin/nightly
git push -u origin HEAD
gh pr create --base nightly --title "feat(web): highlight parcels near mineral occurrences" --body "Implements the approved 1 km all-minerals proximity design with licence-gated derived parcel highlighting, exact-versus-nearby inspector evidence, source-bounded copy, tests, and documentation."
gh pr checks --watch
git status --short --branch
```

Expected: the worktree is clean, the PR targets `nightly`, and hosted **Web tests + build** and **Build gate + tests** both pass. If either fails, inspect the concrete job log before changing code. Do not claim merge, KinNoKi regeneration, production deployment, custom-domain proof, or physical-device acceptance.

---

## Final Acceptance Checklist

- [ ] The fourth Geology & Resources row is off by default, licence-gated, and zoom-gated at 12.
- [ ] All commodities qualify; there is no gold-only filter or adjustable radius.
- [ ] Occurrence queries include a 1-kilometre viewport margin and NSPRD uses bounded multipoint batches.
- [ ] NSPRD pagination and PID deduplication prevent silent truncation and duplicate polygons.
- [ ] Stale, aborted, empty, mineral-source-error, and NSPRD-error states remain distinct.
- [ ] Selected parcels show occurrence number, name, status, commodity, and exact-versus-nearby relationship.
- [ ] Exact occurrence matches win over duplicate proximity results.
- [ ] The selected-parcel style remains visually dominant over the derived fill.
- [ ] Share URLs and evidence notes preserve the derived layer and evidence boundaries.
- [ ] Empty wording never becomes “no minerals” or an unbounded absence claim.
- [ ] Tests, lint, production build, live public-source probe, desktop QA, mobile QA, accessibility review, and clean console all pass.
- [ ] Repository, PR, CI, merge, deployment, production, and device states are reported separately.

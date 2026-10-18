# Web Map Print and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a monochrome Letter print preview that produces a portrait parcel-research sheet with an optional evidence appendix and a landscape field map through browser Print / Save as PDF.

**Architecture:** Freeze selected-parcel identity, viewport, active layers, and matching asynchronous evidence in a capture object, then seal a template-specific immutable snapshot once required states settle or time out. Reuse Leaflet in a non-interactive print mode so cross-origin OpenStreetMap and ArcGIS images remain browser-rendered rather than canvas-read, and render research/field documents from the same snapshot and map-share state. Generate the receipt QR locally as SVG with the approved `qrcode` package and retain the complete written URL as the required fallback.

**Tech Stack:** React 19.2.7, TypeScript 5.9.3, Vite 8.1.5, Vitest 4.1.10, React Testing Library 16.3.2, Leaflet 1.9.4, React-Leaflet 5.0.0, `qrcode` 1.5.4, `@types/qrcode` 1.5.6, CSS paged-media rules.

## Global Constraints

- Version one requires a selected PID.
- Research output is US Letter portrait, uses a selected-parcel fit, and contains one summary page plus an appendix that is on by default and may span additional pages.
- Field output is one US Letter landscape page and contains the complete frozen live geographic bounds.
- Output style is monochrome; do not add colour or paper-size controls.
- Aerial imagery is off by default in print and may be explicitly included.
- Use browser Print / Save as PDF; do not add direct PDF, PNG, canvas, server-rendered, or remote screenshot export.
- Preserve returned, returned-empty, outside-coverage, below-zoom, unavailable, timeout, and tile-error states; never turn an empty result into a claim of absence.
- Print-share URLs must match the printed PID, mode, event IDs, derived position, and actual rendered layer IDs.
- Keep Province-restricted services behind the existing licence acceptance and print the exact required attribution and licence link on applicable pages.
- Retain Open Government Licence – Nova Scotia, PVSC, and OpenStreetMap attribution when their information is rendered or reported.
- Treat output as a rendered personal/research view; do not expose raw geometry, tile archives, bulk export, or a public/commercial print workflow.
- Exclude browser location, accuracy circles, location coordinates, owner names, private annotations, uploads, analytics, and generated-document storage.
- Do not alter the native iOS application or add offline printing.
- The approved QR dependency is limited to exact packages `qrcode@1.5.4` and `@types/qrcode@1.5.6`; QR generation must remain local and the complete written URL must remain when QR generation fails.
- Preserve the existing map-share URL format and Markdown evidence-note export.
- In a clean implementation worktree, run `npm ci` in `web/` before the first test command.

---

## File Structure

**Create:**

- `web/src/services/printSnapshot.ts` — capture/snapshot types, matching-evidence updates, timeout conversion, layer selection, parcel bounds, and template share-state derivation.
- `web/src/services/printSnapshot.test.ts` — capture isolation, state preservation, extent, layer, timeout, and share-state tests.
- `web/src/services/printQr.ts` — local SVG QR wrapper with a written-link fallback result.
- `web/src/services/printQr.test.ts` — local SVG success and failure tests.
- `web/src/components/print/PrintMap.tsx` — non-interactive Leaflet print map, fit-bounds lifecycle, readiness aggregation, and resolved print position.
- `web/src/components/print/PrintMap.test.tsx` — print-map props, no-location/no-interaction behavior, fit, status, and incomplete-map tests.
- `web/src/components/print/PrintEvidenceAppendix.tsx` — lossless evidence sections and source-specific limitations.
- `web/src/components/print/PrintResearchDocument.tsx` — portrait summary and optional appendix.
- `web/src/components/print/PrintFieldDocument.tsx` — landscape map-dominant sheet.
- `web/src/components/print/PrintDocuments.test.tsx` — research/field content, state wording, attribution, and privacy tests.
- `web/src/components/print/PrintPreview.tsx` — accessible preview controller, options, timeout, QR, print, cancel, and focus lifecycle.
- `web/src/components/print/PrintPreview.test.tsx` — interaction, readiness, timeout, retry, print, and focus tests.
- `docs/real-world-testing/2026-07-23-web-print-export-test-plan.md` — manual desktop, iPhone AirPrint, saved-PDF, and physical monochrome acceptance ledger.

**Modify:**

- `web/package.json` — pin the approved browser-local QR dependency and its types.
- `web/package-lock.json` — lock the approved dependency graph.
- `web/src/services/mapShareState.ts` — export shared position validation helpers needed by print state.
- `web/src/services/mapShareState.test.ts` — ensure template-derived print URLs retain existing parsing rules.
- `web/src/components/parcelStyle.ts` — add monochrome print styles for app-owned parcel geometry.
- `web/src/components/MapCanvas.tsx` — report geographic bounds and support a non-interactive print render mode and fit-bounds request.
- `web/src/components/MapCanvas.test.tsx` — viewport reporting, print mode, layer class, controls, and location exclusion.
- `web/src/App.tsx` — create/update captures, expose **Print / export**, and mount preview without changing existing share/evidence behavior.
- `web/src/App.test.tsx` — selected-PID gate, capture isolation, evidence settlement, preview lifecycle, and regression coverage.
- `web/src/styles.css` — preview layout, monochrome layer treatment, hatch definitions, Letter page geometry, and `@media print`.
- `web/src/styles.test.ts` — print isolation, page sizes, orientation, visibility, minimum type, and reduced-motion assertions.
- `web/README.md` — user flow, template behavior, evidence boundary, browser/PDF scope, and licence wording.
- `ARCHITECTURE.md` — capture/seal flow, print-map reuse, no-canvas boundary, and component ownership.
- `plan.md` — record the completed web print/export slice only after implementation acceptance.

---

### Task 1: Model Capture, Settlement, and Immutable Snapshots

**Files:**

- Create: `web/src/services/printSnapshot.ts`
- Create: `web/src/services/printSnapshot.test.ts`

**Interfaces:**

- Produces: `PrintTemplate`, `PrintLoadState<T>`, `PrintMapBounds`, `PrintMapViewport`, `PrintLayerSource`, `PrintEvent`, `PrintEvidence`, `PrintCapture`, `PrintSnapshot`, `startPrintCapture`, `updatePrintCaptureEvidence`, `printCaptureReadiness`, and `sealPrintSnapshot`.
- Consumes: existing `MapMode`, `MapPosition`, `ShareLayerId`, `NsprdFeatureCollection`, and exported service result types.
- Consumers: Tasks 2 and 4–7 use these exact names; do not duplicate capture or evidence unions inside components.

- [ ] **Step 1: Write failing capture-isolation and state-preservation tests**

Create fixtures using public, synthetic PID `01234567`. Lock token matching,
pending-state behavior, field/research requirements, and cloning:

```ts
import { describe, expect, it } from "vitest";
import {
  printCaptureReadiness,
  sealPrintSnapshot,
  startPrintCapture,
  updatePrintCaptureEvidence,
  type PrintCaptureBase,
  type PrintEvidence,
} from "./printSnapshot";

const base: PrintCaptureBase = {
  token: "capture-1",
  capturedAt: "2026-07-23T13:42:00.000Z",
  pid: "01234567",
  mode: "current",
  eventIds: ["inverness-2026-08-11"],
  events: [],
  selectedParcelGeometry: {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { PID: "01234567", "SHAPE.AREA": 1000 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-61.2, 46.4],
          [-61.1, 46.4],
          [-61.1, 46.3],
          [-61.2, 46.3],
          [-61.2, 46.4],
        ]],
      },
    }],
  },
  mapParcels: {
    type: "FeatureCollection",
    features: [],
  },
  taxSalePids: ["01234567"],
  historicalTaxSalePids: [],
  viewport: {
    position: { latitude: 46.35, longitude: -61.15, zoom: 15 },
    bounds: { north: 46.4, east: -61.1, south: 46.3, west: -61.2 },
  },
  layerIds: ["nsprd", "roads", "ns-aerial"],
  layerSources: [],
  licenceAccepted: true,
};

const pendingEvidence: PrintEvidence = {
  mappedArea: null,
  buildings: { status: "pending" },
  assessments: { status: "pending" },
  civicAddresses: { status: "pending" },
  mappedContext: { status: "pending" },
  floodHazard: { status: "pending" },
  resources: { status: "pending" },
};

describe("print capture", () => {
  it("accepts only evidence updates for its own token and PID", () => {
    const capture = startPrintCapture(base, pendingEvidence);
    const ignored = updatePrintCaptureEvidence(capture, {
      token: "capture-2",
      pid: "01234567",
      evidence: {
        ...pendingEvidence,
        buildings: { status: "error", message: "wrong capture" },
      },
    });
    expect(ignored).toBe(capture);
  });

  it("allows field output before research evidence settles", () => {
    const capture = startPrintCapture(base, pendingEvidence);
    expect(printCaptureReadiness(capture, "field")).toEqual({
      ready: true,
      pending: [],
    });
    expect(printCaptureReadiness(capture, "research").ready).toBe(false);
  });

  it("converts timed-out research slots to explicit errors", () => {
    const capture = startPrintCapture(base, pendingEvidence);
    const snapshot = sealPrintSnapshot(capture, "research", {
      timedOut: true,
      generatedAt: "2026-07-23T13:42:15.000Z",
    });
    expect(snapshot.evidence.buildings).toEqual({
      status: "error",
      message: "Source unavailable at export time.",
    });
    expect(snapshot.evidence.civicAddresses.status).toBe("error");
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
cd web
npm test -- src/services/printSnapshot.test.ts
```

Expected: FAIL because `printSnapshot.ts` and its public interfaces do not
exist.

- [ ] **Step 3: Implement the exact capture and evidence domain**

Define the public types without importing App-private state unions:

```ts
import type { CivicAddress } from "./civicAddresses";
import type { ParcelBuildingCount } from "./buildings";
import type { ParcelFloodHazardEvidence } from "./floodHazard";
import type { MapMode, MapPosition, ShareLayerId } from "./mapShareState";
import type { NsprdFeatureCollection } from "./nsprd";
import type { ParcelContext, MappedArea } from "./parcelContext";
import type { ParcelResourceIntersections } from "./parcelResources";
import type { ParcelAssessmentResult } from "./pvscAssessments";

export type PrintTemplate = "research" | "field";

export type PrintLoadState<T> =
  | { status: "pending" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

export type PrintMapBounds = {
  north: number;
  east: number;
  south: number;
  west: number;
};

export type PrintMapViewport = {
  position: MapPosition;
  bounds: PrintMapBounds;
};

export type PrintLayerSource = {
  id: ShareLayerId;
  name: string;
  sourceUrl: string;
  sourceDate: string;
  attribution: string;
  licenceUrl: string;
};

export type PrintEvent = {
  name: string;
  status: string;
  facts: Array<{ label: string; value: string }>;
  sources: Array<{ label: string; sourceUrl: string }>;
  limitation: string;
};

export type PrintEvidence = {
  mappedArea: MappedArea | null;
  buildings: PrintLoadState<ParcelBuildingCount>;
  assessments: PrintLoadState<ParcelAssessmentResult>;
  civicAddresses: PrintLoadState<CivicAddress[]>;
  mappedContext: PrintLoadState<ParcelContext>;
  floodHazard: PrintLoadState<ParcelFloodHazardEvidence>;
  resources: PrintLoadState<ParcelResourceIntersections>;
};

export type PrintCaptureBase = {
  token: string;
  capturedAt: string;
  pid: string;
  mode: MapMode;
  eventIds: string[];
  events: PrintEvent[];
  selectedParcelGeometry: NsprdFeatureCollection;
  mapParcels: NsprdFeatureCollection;
  taxSalePids: string[];
  historicalTaxSalePids: string[];
  viewport: PrintMapViewport;
  layerIds: ShareLayerId[];
  layerSources: PrintLayerSource[];
  licenceAccepted: boolean;
};

export type PrintCapture = PrintCaptureBase & {
  evidence: PrintEvidence;
};

export type PrintSnapshot = PrintCapture & {
  template: PrintTemplate;
  generatedAt: string;
};
```

Use these exact pure operations:

```ts
const RESEARCH_KEYS = [
  "buildings",
  "assessments",
  "civicAddresses",
  "mappedContext",
  "floodHazard",
  "resources",
] as const;

type EvidenceKey = (typeof RESEARCH_KEYS)[number];

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function startPrintCapture(
  base: PrintCaptureBase,
  evidence: PrintEvidence,
): PrintCapture {
  return clone({ ...base, evidence });
}

export function updatePrintCaptureEvidence(
  capture: PrintCapture,
  update: { token: string; pid: string; evidence: PrintEvidence },
): PrintCapture {
  if (update.token !== capture.token || update.pid !== capture.pid) {
    return capture;
  }
  return clone({ ...capture, evidence: update.evidence });
}

export function printCaptureReadiness(
  capture: PrintCapture,
  template: PrintTemplate,
): { ready: boolean; pending: EvidenceKey[] } {
  if (template === "field") {
    return { ready: true, pending: [] };
  }
  const pending = RESEARCH_KEYS.filter(
    (key) => capture.evidence[key].status === "pending",
  );
  return { ready: pending.length === 0, pending };
}

export function sealPrintSnapshot(
  capture: PrintCapture,
  template: PrintTemplate,
  options: { timedOut: boolean; generatedAt: string },
): PrintSnapshot {
  const unavailableIfPending = <T,>(
    state: PrintLoadState<T>,
  ): PrintLoadState<T> =>
    state.status === "pending"
      ? { status: "error", message: "Source unavailable at export time." }
      : state;
  const clonedEvidence = clone(capture.evidence);
  const evidence = template === "research" && options.timedOut
    ? {
        ...clonedEvidence,
        buildings: unavailableIfPending(clonedEvidence.buildings),
        assessments: unavailableIfPending(clonedEvidence.assessments),
        civicAddresses: unavailableIfPending(clonedEvidence.civicAddresses),
        mappedContext: unavailableIfPending(clonedEvidence.mappedContext),
        floodHazard: unavailableIfPending(clonedEvidence.floodHazard),
        resources: unavailableIfPending(clonedEvidence.resources),
      }
    : clonedEvidence;
  if (!options.timedOut && !printCaptureReadiness(capture, template).ready) {
    throw new Error("Print snapshot cannot seal while evidence is pending.");
  }
  return clone({
    ...capture,
    evidence,
    template,
    generatedAt: options.generatedAt,
  });
}
```

- [ ] **Step 4: Add focused tests for ready, empty, outside-coverage, error, and input mutation**

Add one test per evidence category using existing service result shapes. Mutate
the original fixture after `startPrintCapture` and assert the capture remains
unchanged:

```ts
it("clones inputs so live state cannot mutate the capture", () => {
  const evidence: PrintEvidence = {
    ...pendingEvidence,
    civicAddresses: { status: "ready", value: [] },
  };
  const capture = startPrintCapture(base, evidence);
  evidence.civicAddresses = { status: "error", message: "changed later" };
  expect(capture.evidence.civicAddresses).toEqual({
    status: "ready",
    value: [],
  });
});
```

- [ ] **Step 5: Run the focused tests and TypeScript build**

Run:

```bash
npm test -- src/services/printSnapshot.test.ts
npm run build
```

Expected: the focused test file and production TypeScript build PASS.

- [ ] **Step 6: Commit the snapshot domain**

```bash
git add web/src/services/printSnapshot.ts web/src/services/printSnapshot.test.ts
git commit -m "feat(web): model immutable print snapshots"
```

---

### Task 2: Capture Viewport Bounds and Derive Template Map State

**Files:**

- Modify: `web/src/services/printSnapshot.ts`
- Test: `web/src/services/printSnapshot.test.ts`
- Modify: `web/src/services/mapShareState.ts`
- Test: `web/src/services/mapShareState.test.ts`
- Modify: `web/src/components/MapCanvas.tsx:70-86,491-515,762-1013`
- Test: `web/src/components/MapCanvas.test.tsx`

**Interfaces:**

- Produces: `boundsForParcelGeometry`, `printBoundsForTemplate`,
  `printedLayerIds`, `printScaleForPosition`, `buildPrintMapShareUrl`, and
  `MapCanvasProps.onViewportChange`.
- Preserves: existing `onPositionChange` behavior for embedding compatibility.
- Consumers: `PrintMap` in Task 4 and App wiring in Task 7.

- [ ] **Step 1: Write failing parcel-bounds, layer, and share-URL tests**

Add exact expectations for multipart geometry and aerial exclusion:

```ts
it("fits every part of a multipart parcel", () => {
  const bounds = boundsForParcelGeometry({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { PID: "01234567", "SHAPE.AREA": 1000 },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[ -61.3, 46.2 ], [ -61.2, 46.2 ], [ -61.2, 46.1 ], [ -61.3, 46.1 ], [ -61.3, 46.2 ]]],
          [[[ -60.9, 46.5 ], [ -60.8, 46.5 ], [ -60.8, 46.4 ], [ -60.9, 46.4 ], [ -60.9, 46.5 ]]],
        ],
      },
    }],
  });
  expect(bounds).toEqual({
    north: 46.5,
    east: -60.8,
    south: 46.1,
    west: -61.3,
  });
});

it("removes aerial from printed layers unless explicitly included", () => {
  expect(printedLayerIds(
    ["modern", "ns-aerial", "nsprd", "roads"],
    false,
  )).toEqual(["modern", "nsprd", "roads"]);
});
```

Build a template URL with `buildPrintMapShareUrl` and assert existing
`parseMapShareState` returns its PID, mode, event, printed layer IDs, and
resolved position unchanged.

Lock the approximate scale calculation:

```ts
const scale = printScaleForPosition(
  { latitude: 46.35, longitude: -61.15, zoom: 15 },
  90,
});
expect(scale.label).toBe("200 m");
expect(scale.metres).toBe(200);
expect(scale.pixels).toBeCloseTo(60.65, 1);
```

- [ ] **Step 2: Write a failing MapCanvas viewport callback test**

Extend `mapMock` with `getCenter`, fire the registered `moveend` handler, and
assert both centre/zoom and all four bounds are reported:

```ts
expect(onViewportChange).toHaveBeenCalledWith({
  position: { latitude: 46.35, longitude: -61.15, zoom: 15 },
  bounds: { north: 47, east: -60, south: 45, west: -62 },
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
npm test -- src/services/printSnapshot.test.ts src/services/mapShareState.test.ts src/components/MapCanvas.test.tsx
```

Expected: FAIL because the print derivation helpers and viewport callback do
not exist.

- [ ] **Step 4: Implement pure bounds and share-state derivation**

Add recursive coordinate traversal that accepts Polygon and MultiPolygon
coordinates and throws for an empty collection:

```ts
export function boundsForParcelGeometry(
  collection: NsprdFeatureCollection,
): PrintMapBounds {
  const coordinates: Array<[number, number]> = [];
  const visit = (value: unknown): void => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      coordinates.push([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
    }
  };
  const visitGeometry = (geometry: GeoJSON.Geometry): void => {
    if (geometry.type === "GeometryCollection") {
      geometry.geometries.forEach(visitGeometry);
      return;
    }
    visit(geometry.coordinates);
  };
  collection.features.forEach(({ geometry }) => visitGeometry(geometry));
  if (coordinates.length === 0) {
    throw new Error("Print bounds require selected parcel geometry.");
  }
  return {
    north: Math.max(...coordinates.map(([, latitude]) => latitude)),
    east: Math.max(...coordinates.map(([longitude]) => longitude)),
    south: Math.min(...coordinates.map(([, latitude]) => latitude)),
    west: Math.min(...coordinates.map(([longitude]) => longitude)),
  };
}

export function printBoundsForTemplate(
  capture: PrintCapture,
  template: PrintTemplate,
): PrintMapBounds {
  return template === "research"
    ? boundsForParcelGeometry(capture.selectedParcelGeometry)
    : capture.viewport.bounds;
}

export function printedLayerIds(
  layerIds: ShareLayerId[],
  includeAerial: boolean,
): ShareLayerId[] {
  return layerIds.filter((id) => id !== "ns-aerial" || includeAerial);
}

export type PrintScale = {
  label: string;
  metres: number;
  pixels: number;
};

export function printScaleForPosition(
  position: MapPosition,
  maximumPixels = 90,
): PrintScale {
  const metresPerPixel =
    156_543.033_92 *
    Math.cos((position.latitude * Math.PI) / 180) /
    2 ** position.zoom;
  const targetMetres = metresPerPixel * maximumPixels;
  const magnitude = 10 ** Math.floor(Math.log10(targetMetres));
  const normalized = targetMetres / magnitude;
  const multiplier = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  const metres = multiplier * magnitude;
  return {
    label: metres >= 1_000
      ? `${metres / 1_000} km`
      : `${metres} m`,
    metres,
    pixels: metres / metresPerPixel,
  };
}

export function buildPrintMapShareUrl(
  baseUrl: string,
  snapshot: PrintSnapshot,
  position: MapPosition,
  includeAerial: boolean,
): string {
  return buildMapShareUrl(baseUrl, {
    mode: snapshot.mode,
    pid: snapshot.pid,
    eventIds: snapshot.eventIds,
    layerIds: printedLayerIds(snapshot.layerIds, includeAerial),
    position,
  });
}
```

- [ ] **Step 5: Report full viewport state from MapCanvas**

Add a public optional callback:

```ts
onViewportChange?: (viewport: PrintMapViewport) => void;
```

Update `MapPositionController` to call both callbacks on initial mount and
`moveend`:

```ts
const report = () => {
  const center = map.getCenter();
  const bounds = map.getBounds();
  const position = {
    latitude: center.lat,
    longitude: center.lng,
    zoom: map.getZoom(),
  };
  onPositionChange?.(position);
  onViewportChange?.({
    position,
    bounds: {
      north: bounds.getNorth(),
      east: bounds.getEast(),
      south: bounds.getSouth(),
      west: bounds.getWest(),
    },
  });
};
```

Keep `onPositionChange` in the public props and existing App call during this
task; Task 7 switches App to the richer callback.

- [ ] **Step 6: Run focused tests and build**

Run:

```bash
npm test -- src/services/printSnapshot.test.ts src/services/mapShareState.test.ts src/components/MapCanvas.test.tsx
npm run build
```

Expected: focused tests and production build PASS; existing share URLs remain
byte-compatible.

- [ ] **Step 7: Commit viewport and print-state derivation**

```bash
git add web/src/services/printSnapshot.ts web/src/services/printSnapshot.test.ts web/src/services/mapShareState.ts web/src/services/mapShareState.test.ts web/src/components/MapCanvas.tsx web/src/components/MapCanvas.test.tsx
git commit -m "feat(web): derive reproducible print map state"
```

---

### Task 3: Add Local SVG QR Generation

**Files:**

- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/src/services/printQr.ts`
- Create: `web/src/services/printQr.test.ts`

**Interfaces:**

- Produces: `PrintQrResult` and `buildPrintQr`.
- Consumes: one complete map-state URL.
- Consumers: `PrintPreview` in Task 6.

- [ ] **Step 1: Install the explicitly approved pinned dependencies**

Run:

```bash
cd web
npm install --save-exact qrcode@1.5.4
npm install --save-dev --save-exact @types/qrcode@1.5.6
```

Expected: `package.json` contains exact versions with no caret or tilde, and
`package-lock.json` records the local dependency graph.

- [ ] **Step 2: Write failing local success/failure tests**

Mock `qrcode.toString` and assert the URL is passed directly with SVG,
monochrome, quiet-zone, and error-correction options:

```ts
import QRCode from "qrcode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPrintQr } from "./printQr";

vi.mock("qrcode", () => ({
  default: { toString: vi.fn() },
}));

describe("print QR", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates a local monochrome SVG", async () => {
    vi.mocked(QRCode.toString).mockResolvedValue("<svg>receipt</svg>");
    await expect(buildPrintQr("https://example.com/map/?pid=01234567"))
      .resolves.toEqual({ status: "ready", svg: "<svg>receipt</svg>" });
    expect(QRCode.toString).toHaveBeenCalledWith(
      "https://example.com/map/?pid=01234567",
      {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      },
    );
  });

  it("returns a fallback state instead of hiding the written URL", async () => {
    vi.mocked(QRCode.toString).mockRejectedValue(new Error("too long"));
    await expect(buildPrintQr("https://example.com/map/?pid=01234567"))
      .resolves.toEqual({ status: "error" });
  });
});
```

- [ ] **Step 3: Run the focused test and verify failure**

Run:

```bash
npm test -- src/services/printQr.test.ts
```

Expected: FAIL because `printQr.ts` does not exist.

- [ ] **Step 4: Implement the local-only wrapper**

```ts
import QRCode from "qrcode";

export type PrintQrResult =
  | { status: "ready"; svg: string }
  | { status: "error" };

export async function buildPrintQr(url: string): Promise<PrintQrResult> {
  try {
    const svg = await QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
    return { status: "ready", svg };
  } catch {
    return { status: "error" };
  }
}
```

Do not use `fetch`, an image URL, a QR API, or `dangerouslySetInnerHTML` outside
the dedicated QR presentation boundary in Task 6.

- [ ] **Step 5: Run focused tests, dependency audit, and build**

Run:

```bash
npm test -- src/services/printQr.test.ts
npm audit --omit=dev
npm run build
```

Expected: test and build PASS; the production dependency audit reports no
known vulnerability. If the audit reports one, stop and resolve the concrete
advisory before continuing.

- [ ] **Step 6: Commit local QR generation**

```bash
git add web/package.json web/package-lock.json web/src/services/printQr.ts web/src/services/printQr.test.ts
git commit -m "feat(web): generate print receipt QR locally"
```

---

### Task 4: Reuse Leaflet as a Non-Interactive Print Map

**Files:**

- Modify: `web/src/components/parcelStyle.ts`
- Modify: `web/src/components/MapCanvas.tsx`
- Test: `web/src/components/MapCanvas.test.tsx`
- Create: `web/src/components/print/PrintMap.tsx`
- Create: `web/src/components/print/PrintMap.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**

- Produces: `MapRenderMode`, `PrintMapReadiness`, and `PrintMap`.
- Consumes: `PrintSnapshot`, `PrintMapBounds`, printed layer IDs, existing
  catalogs, and existing `MapLayerStatus`.
- Consumers: research/field document components in Task 5 and preview in Task
  6.

- [ ] **Step 1: Write failing print-style and print-mode MapCanvas tests**

Add exact black/grey style assertions:

```ts
expect(parcelStyleForFeature(selectedFeature, context, "print")).toMatchObject({
  color: "#000000",
  fillColor: "#d8d8d8",
  fillOpacity: 0.45,
  weight: 4,
  className: "print-selected-parcel",
});
expect(parcelStyleForFeature(historicalFeature, context, "print"))
  .toMatchObject({ color: "#333333", dashArray: "7 4" });
```

Render `MapCanvas` with `renderMode="print"` and assert:

- `MapContainer` receives `zoomControl={false}` and all interaction props false;
- **Use my location** is absent;
- parcel click identification is not registered;
- modern and ArcGIS tiles receive stable `print-layer-*` class names; and
- a `fitBounds` request invokes `map.fitBounds`.

- [ ] **Step 2: Write failing PrintMap readiness tests**

Mock `MapCanvas`, report loading then ready/error states, and assert:

```ts
expect(onReadinessChange).toHaveBeenLastCalledWith({
  status: "error",
  failedLayerIds: ["roads"],
  belowZoomLayerIds: ["contours"],
});
expect(onResolvedPosition).toHaveBeenCalledWith({
  latitude: 46.35,
  longitude: -61.15,
  zoom: 15,
});
```

Assert the wrapper never passes browser-location data or an identify callback
that performs work.

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
npm test -- src/components/MapCanvas.test.tsx src/components/print/PrintMap.test.tsx
```

Expected: FAIL because print render mode and `PrintMap` do not exist.

- [ ] **Step 4: Add render-mode-aware app geometry and tile classes**

Extend parcel styling without changing the default call sites:

```ts
export type MapRenderMode = "interactive" | "print";

export function parcelStyleForFeature(
  feature: GeoJSON.Feature<GeoJSON.Geometry, NsprdFeatureProperties> | undefined,
  context: ParcelStyleContext,
  renderMode: MapRenderMode = "interactive",
): PathOptions {
  if (renderMode === "print") {
    const pid = feature?.properties.PID;
    if (pid === context.selectedPid) {
      return {
        color: "#000000",
        fillColor: "#d8d8d8",
        fillOpacity: 0.45,
        weight: 4,
        className: "print-selected-parcel",
      };
    }
    if (pid && context.taxSalePids.has(pid) && context.showTaxSale) {
      return {
        color: "#111111",
        fillColor: "#eeeeee",
        fillOpacity: 0.32,
        weight: 2.5,
        className: "print-current-tax-sale-parcel",
      };
    }
    if (
      pid &&
      context.historicalTaxSalePids.has(pid) &&
      context.showHistoricalTaxSales
    ) {
      return {
        color: "#333333",
        fillColor: "#f4f4f4",
        fillOpacity: 0.3,
        weight: 2.25,
        dashArray: "7 4",
        className: "print-historical-tax-sale-parcel",
      };
    }
    return {
      color: "#777777",
      fillColor: "#ffffff",
      fillOpacity: 0.04,
      weight: 1,
      className: "print-context-parcel",
    };
  }
  return interactiveParcelStyleForFeature(feature, context);
}
```

Move the current implementation body into the private
`interactiveParcelStyleForFeature` without changing its returned values.

Add optional `renderMode` and `fitBounds` props to `MapCanvas`. In print mode:

- set `zoomControl`, `dragging`, `touchZoom`, `doubleClickZoom`, `scrollWheelZoom`,
  `boxZoom`, and `keyboard` false;
- omit `ParcelIdentifyController`, location button/message, and initial
  tax-sale/historical fit controllers;
- call `parcelStyleForFeature` with `"print"`;
- add `className="print-layer-modern"` to modern tiles; and
- pass `print-layer-${layer.id}` as the Leaflet tile class for ArcGIS layers.

Add a `PrintBoundsController`:

```ts
function PrintBoundsController({ bounds }: { bounds?: PrintMapBounds }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(
      [[bounds.south, bounds.west], [bounds.north, bounds.east]],
      { padding: [24, 24], maxZoom: 18, animate: false },
    );
  }, [bounds, map]);
  return null;
}
```

- [ ] **Step 5: Implement PrintMap status aggregation**

Use catalog-derived visibility records and track only the printed layer IDs:

```ts
export type PrintMapReadiness =
  | { status: "loading" }
  | { status: "ready"; belowZoomLayerIds: MapLayerId[] }
  | {
      status: "error";
      failedLayerIds: MapLayerId[];
      belowZoomLayerIds: MapLayerId[];
    };

export function PrintMap({
  snapshot,
  bounds,
  includeAerial,
  onReadinessChange,
  onResolvedPosition,
}: {
  snapshot: PrintSnapshot;
  bounds: PrintMapBounds;
  includeAerial: boolean;
  onReadinessChange: (value: PrintMapReadiness) => void;
  onResolvedPosition: (value: MapPosition) => void;
}) {
  const layerIds = printedLayerIds(snapshot.layerIds, includeAerial);
  const [statuses, setStatuses] = useState<Record<string, MapLayerStatus>>({});
  const updateStatus = useCallback((id: MapLayerId, status: MapLayerStatus) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  }, []);
  useEffect(() => {
    const values = layerIds.map((id) => statuses[id]);
    const failedLayerIds = layerIds.filter((id) => statuses[id]?.status === "error");
    const belowZoomLayerIds = layerIds.filter((id) => statuses[id]?.status === "zoom");
    if (failedLayerIds.length > 0) {
      onReadinessChange({ status: "error", failedLayerIds, belowZoomLayerIds });
    } else if (values.every((value) =>
      value?.status === "ready" || value?.status === "zoom"
    )) {
      onReadinessChange({ status: "ready", belowZoomLayerIds });
    } else {
      onReadinessChange({ status: "loading" });
    }
  }, [layerIds, onReadinessChange, statuses]);

  return (
    <div className="print-map" aria-label={`Printable map for PID ${snapshot.pid}`}>
      <MapCanvas
        parcels={
          snapshot.template === "research"
            ? snapshot.selectedParcelGeometry
            : snapshot.mapParcels
        }
        taxSalePids={new Set(snapshot.taxSalePids)}
        historicalTaxSalePids={new Set(snapshot.historicalTaxSalePids)}
        selectedPid={snapshot.pid}
        provinceLayers={provinceVisibilityFor(layerIds)}
        resourceLayers={resourceVisibilityFor(layerIds)}
        hydroPilotLayers={hydroVisibilityFor(layerIds)}
        floodHazardLayers={floodVisibilityFor(layerIds)}
        showModernMap={layerIds.includes("modern")}
        showTaxSale={
          snapshot.mode === "current" && snapshot.taxSalePids.length > 0
        }
        showHistoricalTaxSales={
          snapshot.mode === "historical" &&
          snapshot.historicalTaxSalePids.length > 0
        }
        onSelectPid={() => undefined}
        onIdentifyParcel={() => undefined}
        initialPosition={snapshot.viewport.position}
        onPositionChange={onResolvedPosition}
        onLayerStatusChange={updateStatus}
        renderMode="print"
        fitBounds={bounds}
      />
    </div>
  );
}
```

Implement the four visibility helpers by mapping the existing catalogs to
booleans; do not hard-code incomplete layer lists.

- [ ] **Step 6: Add monochrome map CSS**

Add stable print treatment:

```css
.print-map {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;
  border: 1px solid #222;
}

.print-map .leaflet-tile {
  filter: grayscale(1) contrast(1.18);
}

.print-map .print-layer-ns-aerial {
  filter: grayscale(1) contrast(1.35) brightness(1.08);
}

.print-selected-parcel {
  fill: url("#print-selected-parcel-hatch");
}

.print-map .leaflet-control-container,
.print-map .location-button,
.print-map .location-message {
  display: none;
}
```

The document components in Task 5 provide the SVG pattern definition with ID
`print-selected-parcel-hatch`.

- [ ] **Step 7: Run focused tests and build**

Run:

```bash
npm test -- src/components/MapCanvas.test.tsx src/components/print/PrintMap.test.tsx
npm run build
```

Expected: tests and build PASS; interactive map tests retain existing styles
and location behavior.

- [ ] **Step 8: Commit print map rendering**

```bash
git add web/src/components/parcelStyle.ts web/src/components/MapCanvas.tsx web/src/components/MapCanvas.test.tsx web/src/components/print/PrintMap.tsx web/src/components/print/PrintMap.test.tsx web/src/styles.css
git commit -m "feat(web): render a monochrome print map"
```

---

### Task 5: Render Research and Field Documents

**Files:**

- Create: `web/src/components/print/PrintEvidenceAppendix.tsx`
- Create: `web/src/components/print/PrintResearchDocument.tsx`
- Create: `web/src/components/print/PrintFieldDocument.tsx`
- Create: `web/src/components/print/PrintDocuments.test.tsx`
- Modify: `web/src/styles.css`
- Test: `web/src/styles.test.ts`

**Interfaces:**

- Produces: `PrintReceipt`, `PrintEvidenceAppendix`,
  `PrintResearchDocument`, and `PrintFieldDocument`.
- Consumes: sealed `PrintSnapshot`, `PrintMap`, resolved share URL,
  `PrintQrResult`, `PrintScale`, appendix/aerial options, and map readiness.
- Consumers: `PrintPreview` in Task 6.

- [ ] **Step 1: Write failing research and field document tests**

Render synthetic ready, empty, outside-coverage, and error snapshots. Assert:

```ts
expect(screen.getByText("PID 01234567")).toBeInTheDocument();
expect(screen.getByText("Mapped buildings")).toBeInTheDocument();
expect(screen.getByText("No mapped building feature returned.")).toBeInTheDocument();
expect(screen.getByText("Outside published river-study extents.")).toBeInTheDocument();
expect(screen.getByText("Source unavailable at export time.")).toBeInTheDocument();
expect(screen.getByText(PROVINCE_ATTRIBUTION)).toBeInTheDocument();
expect(screen.getByText("Screening evidence only.")).toBeInTheDocument();
expect(screen.queryByText(/browser location/iu)).not.toBeInTheDocument();
```

For field output, assert the map, active-layer legend, approximate scale,
written URL, QR fallback, and concise limitations are present while assessment
and appendix headings are absent.

- [ ] **Step 2: Write failing paged-media CSS tests**

Extend `styles.test.ts` to require:

```ts
expect(styles).toMatch(/@page research-sheet\\s*{[^}]*size:\\s*letter portrait/s);
expect(styles).toMatch(/@page field-sheet\\s*{[^}]*size:\\s*letter landscape/s);
expect(styles).toMatch(/@media print\\s*{/);
expect(styles).toMatch(/body\\.print-preview-open\\s+\\.app-shell\\s*{[^}]*display:\\s*none/s);
expect(styles).toMatch(/\\.print-document--inactive\\s*{[^}]*display:\\s*none/s);
expect(styles).toMatch(/font-size:\\s*9pt/);
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
npm test -- src/components/print/PrintDocuments.test.tsx src/styles.test.ts
```

Expected: FAIL because document components and print CSS do not exist.

- [ ] **Step 4: Implement shared receipt and evidence formatting**

Create a `PrintReceipt` inside `PrintResearchDocument.tsx` and export it for
field reuse:

```tsx
export function PrintReceipt({
  shareUrl,
  qr,
}: {
  shareUrl: string;
  qr: PrintQrResult;
}) {
  return (
    <footer className="print-receipt">
      <a href={shareUrl} className="print-share-url">{shareUrl}</a>
      {qr.status === "ready" ? (
        <span
          className="print-qr"
          aria-label="QR code for this exact map state"
          dangerouslySetInnerHTML={{ __html: qr.svg }}
        />
      ) : (
        <span className="print-qr-fallback">QR unavailable</span>
      )}
    </footer>
  );
}
```

This is the only allowed `dangerouslySetInnerHTML` boundary. The SVG comes only
from local `qrcode.toString` output, and the full URL is always printed.

In `PrintEvidenceAppendix`, branch on every `PrintLoadState` before reading its
value. Use these exact state labels:

- pending after timeout: **Source unavailable at export time.**
- ready with empty arrays: **No mapped record returned by the named source.**
- river outside extents: **Outside published river-study extents.**
- river within extent/no hit: **Within a published layer extent; no study
  coverage or parcel probability is implied.**
- error: **Source unavailable at export time.**

Render roads with their existing **Intersects parcel**, **Adjacent within 20
m**, and **Named by civic address** relationship wording. Render resources with
**On parcel** and **Within 1 km**. Keep assessment accounts separate.

- [ ] **Step 5: Implement research and field documents**

Both documents must include one hidden SVG definition before the map:

```tsx
<svg className="print-pattern-definitions" aria-hidden="true">
  <defs>
    <pattern
      id="print-selected-parcel-hatch"
      width="8"
      height="8"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width="8" height="8" fill="#efefef" />
      <line x1="0" y1="0" x2="0" y2="8" stroke="#777" strokeWidth="2" />
    </pattern>
  </defs>
</svg>
```

`PrintResearchDocument` renders:

```tsx
const renderedSources = snapshot.layerSources.filter(({ id }) =>
  printedLayerIds(snapshot.layerIds, includeAerial).includes(id)
);

<article className="print-document print-research-document">
  <section className="print-page print-research-summary">
    <PrintHeader snapshot={snapshot} title="Parcel research summary" />
    <div className="print-research-map-frame">{map}</div>
    <ResearchFactGrid snapshot={snapshot} />
    <EvidenceStatusGrid snapshot={snapshot} />
    <ActiveLayerLegend sources={renderedSources} />
    <ApproximateScale scale={scale} />
    <RequiredAttribution snapshot={snapshot} />
    <p className="print-general-limitations">
      Screening evidence only. Not a survey, title opinion, access conclusion,
      appraisal, or proof of absence.
    </p>
    <PrintReceipt shareUrl={shareUrl} qr={qr} />
  </section>
  {includeAppendix ? <PrintEvidenceAppendix snapshot={snapshot} /> : null}
</article>
```

`PrintFieldDocument` derives `renderedSources` with the same expression and
renders exactly one `.print-field-page`, with the map frame, active-layer
legend, mode/event line, `ApproximateScale`, required attribution, concise
limitation, and receipt. It must not render `PrintEvidenceAppendix`.

Both documents receive `belowZoomLayerIds` and render:

> Not rendered at this print scale: \<layer names\>.

This is a scale state, not a source failure or empty result.

- [ ] **Step 6: Add fixed Letter preview and print CSS**

Use named pages and millimetre dimensions:

```css
@page research-sheet {
  size: letter portrait;
  margin: 10mm;
}

@page field-sheet {
  size: letter landscape;
  margin: 10mm;
}

.print-research-summary,
.print-evidence-page {
  page: research-sheet;
  width: 195.9mm;
  min-height: 259.4mm;
}

.print-field-page {
  page: field-sheet;
  width: 259.4mm;
  min-height: 195.9mm;
}

.print-document {
  color: #000;
  background: #fff;
  font-size: 9pt;
  line-height: 1.35;
}

.print-evidence-section {
  break-inside: avoid;
}

.print-pattern-definitions {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

@media print {
  body.print-preview-open .app-shell,
  .print-preview-controls,
  .print-document--inactive {
    display: none !important;
  }

  .print-preview {
    position: static;
    overflow: visible;
    background: #fff;
  }

  .print-page {
    margin: 0;
    box-shadow: none;
    break-after: page;
  }

  .print-page:last-child {
    break-after: auto;
  }
}
```

Add screen-only scaled page previews outside `@media print`. Do not use browser
viewport dimensions for printed page size.

- [ ] **Step 7: Run focused tests and build**

Run:

```bash
npm test -- src/components/print/PrintDocuments.test.tsx src/styles.test.ts
npm run build
```

Expected: tests and build PASS; document tests preserve state and privacy
wording.

- [ ] **Step 8: Commit printable documents**

```bash
git add web/src/components/print/PrintEvidenceAppendix.tsx web/src/components/print/PrintResearchDocument.tsx web/src/components/print/PrintFieldDocument.tsx web/src/components/print/PrintDocuments.test.tsx web/src/styles.css web/src/styles.test.ts
git commit -m "feat(web): compose research and field print sheets"
```

---

### Task 6: Build the Accessible Preview and Browser Print Flow

**Files:**

- Create: `web/src/components/print/PrintPreview.tsx`
- Create: `web/src/components/print/PrintPreview.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**

- Produces: `PrintPreview`.
- Consumes: evolving `PrintCapture`, base URL, `onClose`, `PrintMap`,
  document components, `buildPrintQr`, and `sealPrintSnapshot`.
- Consumer: App integration in Task 7.

- [ ] **Step 1: Write failing interaction, focus, and timeout tests**

Use fake timers and a mocked `PrintMap`. Assert:

- research is initially selected;
- appendix is initially checked;
- aerial is initially unchecked;
- research waits while evidence is pending;
- field can become ready immediately;
- 15 seconds converts pending research evidence to explicit unavailable state;
- map error shows **Retry map** and **Print incomplete map**;
- ordinary print remains disabled on map error;
- deliberate incomplete print retains the warning in the document;
- `window.print` is called only after a resolved map position and QR attempt;
- Escape closes;
- Tab stays inside the dialog;
- close restores focus to the triggering button; and
- `body.print-preview-open` is added and removed.

Example:

```ts
it("times out pending research evidence without calling it empty", async () => {
  vi.useFakeTimers();
  render(<PrintPreview capture={pendingCapture} baseUrl="https://example.com/map/" onClose={onClose} />);
  expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();
  await act(() => vi.advanceTimersByTimeAsync(15_000));
  expect(screen.getByText("Source unavailable at export time.")).toBeInTheDocument();
  expect(screen.queryByText("No mapped record returned")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm test -- src/components/print/PrintPreview.test.tsx
```

Expected: FAIL because `PrintPreview` does not exist.

- [ ] **Step 3: Implement template options, timeout, map readiness, and QR lifecycle**

Use these state defaults:

```ts
const EVIDENCE_TIMEOUT_MS = 15_000;
const [template, setTemplate] = useState<PrintTemplate>("research");
const [includeAppendix, setIncludeAppendix] = useState(true);
const [includeAerial, setIncludeAerial] = useState(false);
const [timedOut, setTimedOut] = useState(false);
const [mapAttempt, setMapAttempt] = useState(0);
const [mapReadiness, setMapReadiness] =
  useState<PrintMapReadiness>({ status: "loading" });
const [resolvedPosition, setResolvedPosition] =
  useState<MapPosition | null>(null);
const [printIncomplete, setPrintIncomplete] = useState(false);
const [qr, setQr] =
  useState<PrintQrResult | { status: "loading" }>({ status: "loading" });
```

Start the timeout only for pending research capture. Seal with
`sealPrintSnapshot(capture, template, { timedOut, generatedAt:
new Date().toISOString() })` after readiness. Derive bounds and layer IDs using
Task 2 helpers. Calculate `PrintScale` from the resolved position and build QR
from the derived print URL whenever template, resolved position, or aerial
inclusion changes. Before starting each QR promise, set `{ status: "loading" }`;
ignore the promise result after effect cleanup.

Use `mapAttempt` as the `key` on `PrintMap` for an explicit retry. Permit
printing after map error only when `printIncomplete` is true, and render this
exact warning inside the active document:

> Incomplete map: one or more enabled layers failed to render at export time.

- [ ] **Step 4: Implement contained keyboard focus and restoration**

Use a labelled `role="dialog"` container with `aria-modal="true"`. Capture the
active element on mount, focus the heading, close on Escape, and cycle Tab
between enabled buttons, inputs, selects, and links inside the preview:

```ts
useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  document.body.classList.add("print-preview-open");
  headingRef.current?.focus();
  return () => {
    document.body.classList.remove("print-preview-open");
    previous?.focus();
  };
}, []);
```

Attach this exact key handler to the dialog container:

```ts
const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (focusable.length === 0) {
    event.preventDefault();
    headingRef.current?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};
```

Set the preview backdrop above the application, so live map controls cannot be
clicked while the capture is open.

- [ ] **Step 5: Invoke browser print only from a ready state**

The handler must be synchronous from the user's button after QR readiness has
settled:

```ts
const canPrint =
  snapshot !== null &&
  resolvedPosition !== null &&
  qr.status !== "loading" &&
  (mapReadiness.status === "ready" || printIncomplete);

const printDocument = () => {
  if (!canPrint) return;
  window.print();
};
```

Keep the preview mounted after `window.print()` returns because cancellation
and completion are not reliably distinguishable.

- [ ] **Step 6: Add responsive preview styles**

Use a two-column desktop layout with a `300px` control column and a page-dominant
stage. At `max-width: 860px`, stack controls above the page, keep every control
at least `44px` high, and allow preview scrolling without altering printed page
dimensions. Add reduced-motion rules for preview transitions.

- [ ] **Step 7: Run focused tests and build**

Run:

```bash
npm test -- src/components/print/PrintPreview.test.tsx src/styles.test.ts
npm run build
```

Expected: tests and build PASS; focus restoration and timeout tests are
deterministic under fake timers.

- [ ] **Step 8: Commit the preview flow**

```bash
git add web/src/components/print/PrintPreview.tsx web/src/components/print/PrintPreview.test.tsx web/src/styles.css
git commit -m "feat(web): add accessible print preview"
```

---

### Task 7: Wire the Selected Parcel and Evidence Capture into App

**Files:**

- Modify: `web/src/App.tsx`
- Test: `web/src/App.test.tsx`

**Interfaces:**

- Consumes: `PrintMapViewport`, `PrintCapture`, `PrintEvidence`,
  `startPrintCapture`, `updatePrintCaptureEvidence`, and `PrintPreview`.
- Produces: inspector **Print / export** entry point and matching live evidence
  settlement.
- Preserves: copy-link, Markdown evidence export, selection, and live map
  behavior.

- [ ] **Step 1: Extend the MapCanvas mock and write failing App tests**

Have the mock report one deterministic viewport through
`onViewportChange`. Add tests that:

- no print action exists without a PID;
- selecting PID `01234567` exposes **Print / export**;
- opening preview freezes PID, viewport, events, layers, and selected geometry;
- live layer toggles after open do not mutate the capture;
- matching pending evidence settles inside the open capture;
- closing preview restores the inspector action;
- browser-location strings and coordinates are absent;
- existing **Copy share link** and **Export evidence note** tests still pass;
  and
- Province attribution appears when restricted layer IDs are captured.

Example:

```ts
await user.click(screen.getByRole("button", { name: "Print / export" }));
expect(screen.getByRole("dialog", { name: "Print / export" })).toBeInTheDocument();
expect(screen.getByText("PID 01234567")).toBeInTheDocument();
expect(screen.getByText("Parcel fit")).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused App tests and verify failure**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: FAIL because App neither captures viewport bounds nor mounts
`PrintPreview`.

- [ ] **Step 3: Capture live viewport and expose the inspector action**

Replace App's `mapPosition` state with:

```ts
const [mapViewport, setMapViewport] = useState<PrintMapViewport>({
  position: initialShareState.position,
  bounds: {
    north: initialShareState.position.latitude,
    east: initialShareState.position.longitude,
    south: initialShareState.position.latitude,
    west: initialShareState.position.longitude,
  },
});
```

Use `mapViewport.position` everywhere that currently reads `mapPosition`.
Pass `onViewportChange={setMapViewport}` to `MapCanvas`.

Add `onPrintExport` to `ParcelInspector` and render:

```tsx
<button className="secondary-action" type="button" onClick={onPrintExport}>
  Print / export
</button>
```

Keep the existing evidence-note action and readiness behavior unchanged.

- [ ] **Step 4: Normalize current App evidence into PrintEvidence**

Add one pure local adapter per current state union. Example:

```ts
function printState<T>(
  state:
    | { status: "idle" | "loading" }
    | { status: "ready"; value: T }
    | { status: "error" },
): PrintLoadState<T> {
  if (state.status === "ready") return { status: "ready", value: state.value };
  if (state.status === "error") {
    return { status: "error", message: "Source unavailable at export time." };
  }
  return { status: "pending" };
}
```

Use explicit adapters for `ParcelContextState`, `CivicAddressState`, and
`ParcelResourceState`, which retain values in loading/error shapes. Do not
interpret their default empty values as successful empty responses.

Build `PrintEvidence` with mapped area, building count, assessment, civic
addresses, mapped context, flood hazard, and resource intersections.

- [ ] **Step 5: Start and update a token-bound capture**

Add:

```ts
const printCaptureSequence = useRef(0);
const [printCapture, setPrintCapture] = useState<PrintCapture | null>(null);
```

When **Print / export** is activated:

1. increment the sequence and build token `print-${sequence}`;
2. select only features whose `properties.PID === selectedPid`;
3. normalize current/historical event labels, facts, sources, and limitations;
4. derive layer IDs from what the live `MapCanvas` is actually allowed to
   render, using `effectiveResourceLayers` and excluding every
   Province-restricted layer while `licenceAccepted` is false;
5. map only those rendered layer IDs to source/licence metadata from existing
   catalogs;
6. freeze `selectedParcelGeometry` separately from `mapParcels`, and freeze
   the current filtered tax-sale and historical PID sets;
7. include the frozen `mapViewport`;
8. call `startPrintCapture`; and
9. store the capture.

While a capture is open, update only its evidence:

```ts
useEffect(() => {
  if (!printCapture || selectedPid !== printCapture.pid) return;
  setPrintCapture((current) =>
    current
      ? updatePrintCaptureEvidence(current, {
          token: current.token,
          pid: current.pid,
          evidence: currentPrintEvidence,
        })
      : null,
  );
}, [currentPrintEvidence, printCapture?.pid, printCapture?.token, selectedPid]);
```

Memoize `currentPrintEvidence` so this effect does not loop. The capture base,
geometry, viewport, event IDs, and layer IDs remain frozen.

- [ ] **Step 6: Mount and close PrintPreview**

Render after `.app-shell`:

```tsx
{printCapture ? (
  <PrintPreview
    capture={printCapture}
    baseUrl={window.location.href}
    onClose={() => setPrintCapture(null)}
  />
) : null}
```

Closing the selected parcel also closes an open print capture. Licence
revocation or clearing selected PID must not leave a restricted-layer preview
mounted.

- [ ] **Step 7: Run App regressions and full web gates**

Run:

```bash
npm test -- src/App.test.tsx src/services/evidenceNote.test.ts src/services/mapShareState.test.ts
npm test
npm run lint
npm run build
```

Expected: focused and full tests, lint, and build PASS. Existing selection,
share-link, evidence-note, licence, mobile, and layer behavior remains green.

- [ ] **Step 8: Commit App integration**

```bash
git add web/src/App.tsx web/src/App.test.tsx
git commit -m "feat(web): connect parcel print exports"
```

---

### Task 8: Document, Validate, and Record Physical Acceptance

**Files:**

- Modify: `web/README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `plan.md`
- Create: `docs/real-world-testing/2026-07-23-web-print-export-test-plan.md`
- Modify if implementation details changed: `docs/superpowers/specs/2026-07-23-web-map-print-export-design.md`

**Interfaces:**

- Consumes: the completed behavior from Tasks 1–7.
- Produces: durable user documentation, architecture boundary, acceptance
  ledger, and accurate project-plan status.

- [ ] **Step 1: Write the manual acceptance ledger before running it**

Create a table with columns:

```markdown
| ID | Surface | Fixture | Expected | Result | Evidence |
|---|---|---|---|---|---|
| PRINT-01 | Chrome macOS | Research, appendix on | Letter portrait; no clipping | Pending | |
| PRINT-02 | Safari macOS | Research, appendix off | One portrait page | Pending | |
| PRINT-03 | Chrome macOS | Field map | One landscape page; complete bounds | Pending | |
| PRINT-04 | Safari iPhone | AirPrint preview | Correct orientation and readable controls | Pending | |
| PRINT-05 | Saved PDF | Research + field | Reopens; links clickable; QR matches URL | Pending | |
| PRINT-06 | Monochrome printer | Research + field | Hatch, lines, 9 pt text, attribution readable | Pending | |
| PRINT-07 | Failed evidence source | Research | Unavailable, not empty | Pending | |
| PRINT-08 | Failed map layer | Both | Warning, retry, deliberate incomplete print | Pending | |
| PRINT-09 | Privacy | Browser location enabled before preview | No location marker or coordinates in output | Pending | |
```

Use only public/synthetic parcel fixtures in committed prose or screenshots.
Keep actual test addresses and personal location out of the repository.

- [ ] **Step 2: Update user and architecture documentation**

Add to `web/README.md`:

- selected-PID requirement;
- research and field template behavior;
- hybrid extent rules;
- monochrome and aerial defaults;
- browser Print / Save as PDF boundary;
- QR/written receipt;
- error/empty/coverage distinctions;
- restricted/open/PVSC/OSM attribution; and
- no raw data or location export.

Add to `ARCHITECTURE.md`:

- capture token and evidence settlement;
- immutable template snapshot;
- display-only Leaflet print mode;
- browser rendering instead of canvas;
- derived print position/share URL;
- local QR boundary; and
- component ownership.

Do not mark `plan.md` complete before the manual acceptance ledger passes.

- [ ] **Step 3: Run final automated gates from a clean install**

Run:

```bash
cd web
npm ci
npm test
npm run lint
npm run build
git diff --check
```

Expected: clean install succeeds; full test, lint, build, and whitespace checks
PASS.

- [ ] **Step 4: Run desktop and saved-PDF acceptance**

On Chrome and Safari:

1. open a public test PID;
2. enable representative property, roads, water, contour, and open-data layers;
3. open research preview with appendix on and off;
4. save both to PDF;
5. open each PDF in Preview;
6. verify orientation, page count, margins, text, link, QR, layers,
   attribution, and limitations;
7. repeat with field output;
8. induce one source error and one tile error through test interception or the
   existing mocked acceptance harness; and
9. record exact pass/fail results without publishing a private parcel or user
   location.

- [ ] **Step 5: Run iPhone AirPrint preview and physical monochrome acceptance**

Use Safari on iPhone for AirPrint preview. On the physical monochrome printer,
print one research packet and one field sheet. Verify:

- selected parcel hatch remains visible;
- current, historical, road, water, contour, and context lines remain
  distinguishable;
- 9 pt body text and attribution are readable;
- appendix sections do not orphan headings;
- field output is exactly one page;
- QR scans to the written map-state URL; and
- browser-location information is absent.

Record the printer model only if it is not a device identifier or sensitive
asset detail. A failed physical print blocks acceptance even when saved PDFs
look correct.

- [ ] **Step 6: Update status honestly**

After every ledger row passes, check the print/export item in `plan.md`. If any
row fails or cannot be run, leave it unchecked and state the exact remaining
gate in the ledger. Do not call local tests, saved PDF, AirPrint preview, or
physical print equivalent to hosted CI, merge, deployment, or production
availability.

- [ ] **Step 7: Commit documentation and acceptance evidence**

```bash
git add web/README.md ARCHITECTURE.md plan.md docs/real-world-testing/2026-07-23-web-print-export-test-plan.md docs/superpowers/specs/2026-07-23-web-map-print-export-design.md
git commit -m "docs(web): record print export acceptance"
```

If the design spec did not change during implementation, omit it from
`git add`.

- [ ] **Step 8: Rebase, push, open the feature PR, and inspect hosted CI**

Run:

```bash
git fetch origin
git rebase origin/nightly
git push -u origin codex/web-print-export-design
gh pr create \
  --base nightly \
  --head codex/web-print-export-design \
  --title "feat(web): add monochrome parcel print exports" \
  --body-file /tmp/ns-marks-print-export-pr-body.md
```

The PR body must state:

- research and field template behavior;
- exact dependency additions;
- restricted/open-data attribution boundary;
- automated gate results;
- saved-PDF, iPhone AirPrint, and physical monochrome receipts;
- no direct file/raw GIS export;
- no deployment claim; and
- the exact head SHA reviewed.

Inspect hosted CI with `gh pr checks --watch`. If a required check fails,
inspect the failing job log, fix the concrete failure, rerun all relevant local
gates, commit, rebase if needed, push, and recheck CI. Report CI as passing,
failing, pending, or blocked; a green PR is not a merge or deployment.

---

## Plan Self-Review Checklist

- [x] Every requirement in
  `docs/superpowers/specs/2026-07-23-web-map-print-export-design.md` maps to a
  task above.
- [x] No task introduces direct PDF/PNG generation, a remote QR service, raw
  GIS export, browser-location output, or a new map-share format.
- [x] `PrintCapture`, `PrintEvidence`, `PrintSnapshot`, `PrintMapBounds`, and
  `PrintMapViewport` names and shapes remain consistent across tasks.
- [x] Research and field readiness requirements remain distinct.
- [x] All source states and attribution boundaries have explicit tests.
- [x] Every implementation task follows red-green-refactor discipline and ends
  in one coherent Conventional Commit.
- [x] Final acceptance distinguishes automated tests, saved PDF, AirPrint,
  physical monochrome printing, hosted CI, merge, and deployment.

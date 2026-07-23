import { describe, expect, it } from "vitest";
import {
  boundsForParcelGeometry,
  buildPrintMapShareUrl,
  printBoundsForTemplate,
  printCaptureReadiness,
  printScaleForPosition,
  printedLayerIds,
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

  it("seals a snapshot whose nested graph cannot be mutated", () => {
    const snapshot = sealPrintSnapshot(
      startPrintCapture(base, pendingEvidence),
      "field",
      { timedOut: false, generatedAt: "2026-07-23T13:42:15.000Z" },
    );
    const mutableSnapshot = snapshot as unknown as {
      pid: string;
      viewport: { position: { zoom: number } };
      layerIds: string[];
      evidence: { civicAddresses: { status: string } };
    };

    expect(() => {
      mutableSnapshot.pid = "76543210";
    }).toThrow(TypeError);
    expect(() => {
      mutableSnapshot.viewport.position.zoom = 1;
    }).toThrow(TypeError);
    expect(() => {
      mutableSnapshot.layerIds.push("modern");
    }).toThrow(TypeError);
    expect(() => {
      mutableSnapshot.evidence.civicAddresses.status = "ready";
    }).toThrow(TypeError);
  });

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

  it("preserves ready building evidence when sealing research output", () => {
    const capture = startPrintCapture(base, {
      ...pendingEvidence,
      buildings: { status: "ready", value: { count: 3, pointCount: 2, polygonCount: 1 } },
      assessments: { status: "ready", value: { matchMethod: "spatial", accounts: [] } },
      civicAddresses: { status: "ready", value: [] },
      mappedContext: { status: "ready", value: { roads: [], water: [] } },
      floodHazard: {
        status: "ready",
        value: {
          river: { status: "within-published-layer-extent", aep: [] },
          coastal: [],
        },
      },
      resources: {
        status: "ready",
        value: {
          "mineral-occurrences": { status: "ready", intersections: [] },
          "mineral-tenure": { status: "ready", intersections: [] },
          "abandoned-mines": { status: "ready", intersections: [] },
        },
      },
    });

    const snapshot = sealPrintSnapshot(capture, "research", {
      timedOut: false,
      generatedAt: "2026-07-23T13:42:15.000Z",
    });

    expect(snapshot.evidence.buildings).toEqual({
      status: "ready",
      value: { count: 3, pointCount: 2, polygonCount: 1 },
    });
    expect(snapshot.evidence.civicAddresses).toEqual({ status: "ready", value: [] });
    expect(snapshot.evidence.floodHazard).toEqual({
      status: "ready",
      value: {
        river: { status: "within-published-layer-extent", aep: [] },
        coastal: [],
      },
    });
  });

  it("preserves an outside-coverage flood result and settled source errors", () => {
    const capture = startPrintCapture(base, {
      ...pendingEvidence,
      buildings: { status: "ready", value: { count: 0, pointCount: 0, polygonCount: 0 } },
      assessments: { status: "error", message: "Assessment source unavailable." },
      civicAddresses: { status: "ready", value: [] },
      mappedContext: { status: "ready", value: { roads: [], water: [] } },
      floodHazard: {
        status: "ready",
        value: {
          river: { status: "outside-published-layer-extents", aep: [] },
          coastal: [],
        },
      },
      resources: {
        status: "ready",
        value: {
          "mineral-occurrences": { status: "error", intersections: [] },
          "mineral-tenure": { status: "ready", intersections: [] },
          "abandoned-mines": { status: "ready", intersections: [] },
        },
      },
    });

    expect(printCaptureReadiness(capture, "research")).toEqual({
      ready: true,
      pending: [],
    });
    expect(sealPrintSnapshot(capture, "research", {
      timedOut: false,
      generatedAt: "2026-07-23T13:42:15.000Z",
    }).evidence.floodHazard).toEqual({
      status: "ready",
      value: {
        river: { status: "outside-published-layer-extents", aep: [] },
        coastal: [],
      },
    });
  });
});

describe("print map derivation", () => {
  it("fits every part of a multipart parcel", () => {
    const bounds = boundsForParcelGeometry({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { PID: "01234567", "SHAPE.AREA": 1000 },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [[[-61.3, 46.2], [-61.2, 46.2], [-61.2, 46.1], [-61.3, 46.1], [-61.3, 46.2]]],
            [[[-60.9, 46.5], [-60.8, 46.5], [-60.8, 46.4], [-60.9, 46.4], [-60.9, 46.5]]],
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

  it("uses parcel bounds for research and the captured viewport for field output", () => {
    const capture = startPrintCapture(base, pendingEvidence);

    expect(printBoundsForTemplate(capture, "research")).toEqual({
      north: 46.4,
      east: -61.1,
      south: 46.3,
      west: -61.2,
    });
    expect(printBoundsForTemplate(capture, "field")).toEqual(capture.viewport.bounds);
  });

  it("removes aerial from printed layers unless explicitly included", () => {
    expect(printedLayerIds(
      ["modern", "ns-aerial", "nsprd", "roads"],
      false,
    )).toEqual(["modern", "nsprd", "roads"]);
  });

  it("uses a stable scale bar for a printed map position", () => {
    const scale = printScaleForPosition(
      { latitude: 46.35, longitude: -61.15, zoom: 15 },
      90,
    );

    expect(scale.label).toBe("200 m");
    expect(scale.metres).toBe(200);
    expect(scale.pixels).toBeCloseTo(60.65, 1);
  });

  it("builds a printable share URL with optional aerial imagery", () => {
    const snapshot = sealPrintSnapshot(
      startPrintCapture(base, pendingEvidence),
      "field",
      { timedOut: false, generatedAt: "2026-07-23T13:42:15.000Z" },
    );

    expect(buildPrintMapShareUrl(
      "https://example.com/map/",
      snapshot,
      { latitude: 46.35, longitude: -61.15, zoom: 15 },
      false,
    )).toBe(
      "https://example.com/map/?mode=current&pid=01234567&event=inverness-2026-08-11&layers=nsprd%2Croads&position=46.35%2C-61.15%2C15",
    );
  });
});

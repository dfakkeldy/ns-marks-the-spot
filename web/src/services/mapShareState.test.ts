import { describe, expect, it } from "vitest";
import {
  buildMapShareUrl,
  DEFAULT_MAP_POSITION,
  hasRecognizedMapShareState,
  isShareLayerId,
  parseMapShareState,
  type MapShareState,
} from "./mapShareState";
import {
  buildPrintMapShareUrl,
  type PrintSnapshot,
} from "./printSnapshot";

describe("map share state", () => {
  const state: MapShareState = {
    taxSaleEnabled: true,
    mode: "current",
    pid: "15234636",
    eventIds: ["cbrm-2026-07-21"],
    layerIds: [
      "fletcher",
      "nsprd",
      "roads",
      "mineral-occurrences",
      "inverness-hydro-potential",
      "coastal-flood-2050",
      "ns-well-logs",
    ],
    position: { latitude: 46.18845, longitude: -60.02123, zoom: 15 },
  };

  it("recognizes only layer IDs that can appear in shared map state", () => {
    expect(isShareLayerId("modern")).toBe(true);
    expect(isShareLayerId("not-a-layer")).toBe(false);
    expect(isShareLayerId(42)).toBe(false);
  });

  it("keeps Tax Sale off on a first visit", () => {
    expect(parseMapShareState("https://example.test/").taxSaleEnabled).toBe(false);
  });

  it("restores the explicit Tax Sale field", () => {
    expect(
      parseMapShareState("https://example.test/?taxSale=on").taxSaleEnabled,
    ).toBe(true);
    expect(
      parseMapShareState("https://example.test/?taxSale=off&mode=historical")
        .taxSaleEnabled,
    ).toBe(false);
  });

  it("enables Tax Sale for legacy mode and event links", () => {
    expect(
      parseMapShareState("https://example.test/?mode=current").taxSaleEnabled,
    ).toBe(true);
    expect(
      parseMapShareState("https://example.test/?event=cbrm-2026-07-21")
        .taxSaleEnabled,
    ).toBe(true);
  });

  it("writes the explicit field for every new link", () => {
    expect(buildMapShareUrl("https://example.test/", {
      taxSaleEnabled: false,
      mode: "current",
      pid: null,
      eventIds: [],
      layerIds: ["modern"],
      position: DEFAULT_MAP_POSITION,
    })).toContain("taxSale=off");
  });

  it("omits stale event IDs while Tax Sale is off", () => {
    const url = new URL(buildMapShareUrl("https://example.test/", {
      taxSaleEnabled: false,
      mode: "current",
      pid: null,
      eventIds: ["cbrm-2026-07-21"],
      layerIds: ["modern"],
      position: DEFAULT_MAP_POSITION,
    }));

    expect(url.searchParams.has("event")).toBe(false);
  });

  it("distinguishes a first visit from recognized shared state", () => {
    expect(hasRecognizedMapShareState("https://example.test/")).toBe(false);
    expect(
      hasRecognizedMapShareState("https://example.test/?layers=modern"),
    ).toBe(true);
    expect(
      hasRecognizedMapShareState("https://example.test/?taxSale=off"),
    ).toBe(true);
  });

  it("puts PID, event, layers, and position into one shareable URL", () => {
    const url = new URL(buildMapShareUrl("https://example.com/map/", state));

    expect(url.searchParams.get("pid")).toBe("15234636");
    expect(url.searchParams.get("event")).toBe("cbrm-2026-07-21");
    expect(url.searchParams.get("layers")).toBe(
      "fletcher,nsprd,roads,mineral-occurrences,inverness-hydro-potential,coastal-flood-2050,ns-well-logs",
    );
    expect(url.searchParams.get("position")).toBe("46.18845,-60.02123,15");
  });

  it("round-trips a historical map state", () => {
    const historicalState: MapShareState = {
      ...state,
      mode: "historical",
      eventIds: ["hrm-2022-03-08"],
    };

    expect(parseMapShareState(buildMapShareUrl("https://example.com/map/", historicalState)))
      .toEqual(historicalState);
  });

  it("round-trips the derived mineral-proximity layer", () => {
    const proximityState: MapShareState = {
      ...state,
      layerIds: ["nsprd", "mineral-proximity-parcels"],
    };

    expect(
      parseMapShareState(buildMapShareUrl("https://example.com/map/", proximityState)),
    ).toEqual(proximityState);
  });

  it("round-trips independently selected flood-hazard layers", () => {
    const floodState: MapShareState = {
      ...state,
      layerIds: ["published-river-flood-zones", "coastal-flood-current", "coastal-flood-2100"],
    };

    expect(parseMapShareState(buildMapShareUrl("https://example.com/map/", floodState)))
      .toEqual(floodState);
  });

  it("round-trips independently selected environmental health screens", () => {
    const screeningState: MapShareState = {
      ...state,
      layerIds: [
        "arsenic-risk-wells",
        "uranium-risk-wells",
        "manganese-risk-wells",
        "surficial-aquifers",
      ],
    };

    expect(
      parseMapShareState(
        buildMapShareUrl("https://example.com/map/", screeningState),
      ),
    ).toEqual(screeningState);
  });

  it("round-trips the old-growth policy layer", () => {
    const forestryState: MapShareState = {
      ...state,
      layerIds: ["nsprd", "old-growth-policy"],
    };

    expect(
      parseMapShareState(
        buildMapShareUrl("https://example.com/map/", forestryState),
      ),
    ).toEqual(forestryState);
  });

  it("ignores unknown events and layers while clamping the map position", () => {
    const parsed = parseMapShareState(
      "https://example.com/map/?mode=current&pid=15-234-636&event=unknown&layers=roads,unknown&position=99,-200,40",
    );

    expect(parsed.pid).toBe("15234636");
    expect(parsed.eventIds).toEqual([]);
    expect(parsed.layerIds).toEqual(["roads"]);
    expect(parsed.position).toEqual({ latitude: 47.5, longitude: -66.5, zoom: 23 });
  });

  it("parses a printable URL with its resolved map state unchanged", () => {
    const snapshot = {
      taxSaleEnabled: true,
      mode: "historical",
      pid: "01234567",
      eventIds: ["hrm-2022-03-08"],
      layerIds: ["modern", "ns-aerial", "nsprd", "roads"],
    } as unknown as PrintSnapshot;
    const position = { latitude: 46.35, longitude: -61.15, zoom: 15 };

    expect(parseMapShareState(buildPrintMapShareUrl(
      "https://example.com/map/",
      snapshot,
      position,
      ["modern", "nsprd", "roads"],
    ))).toEqual({
      basemapStyle: "osm",
      taxSaleEnabled: true,
      mode: "historical",
      pid: "01234567",
      eventIds: ["hrm-2022-03-08"],
      layerIds: ["modern", "nsprd", "roads"],
      position,
    });
  });
});

describe("basemap style in shared links", () => {
  it("carries the Fletcher style and drops unknown styles", () => {
    expect(parseMapShareState("https://example.test/?basemap=fletcher").basemapStyle).toBe("fletcher");
    expect(parseMapShareState("https://example.test/?basemap=night").basemapStyle).toBe("night");
    expect(parseMapShareState("https://example.test/?basemap=sepia").basemapStyle).toBeUndefined();
  });
});

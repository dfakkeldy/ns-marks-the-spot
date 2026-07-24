import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyWellAccuracy,
  fetchWellLogs,
  formatWellCompletionDate,
  printWellLogMarkerStyle,
  toWellLogProperties,
  wellAccuracyLabel,
  wellAccuracyStatement,
  wellAccuracyWhereClause,
  wellLogMarkerRadius,
  wellLogMarkerStyle,
  wellLogPopupHtml,
  wellLogTooltipHtml,
  WELL_ACCURACY_BANDS,
  WELL_LOG_OUT_FIELDS,
  type WellLocationAccuracy,
} from "./wellLogs";

const bounds = { west: -63.75, south: 44.6, east: -63.45, north: 44.75 };
const SERVICE_URL = "https://example.test/FeatureServer/0";

function wellFeature(overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    id: 22,
    geometry: { type: "Point", coordinates: [-63.68, 45.3] },
    properties: {
      OBJECTID: 22,
      WELLNUM: "000025",
      DATE: 950140800000,
      DEPTH: 18.27,
      CASING: 7.92,
      BEDROCK: 6.09,
      STATIC: 4.57,
      YIELD_LPM: 45.4,
      GEOREF_A: 39.45904,
      GEOREF_S: "NSPRD",
      ...overrides,
    },
  };
}

function collectionResponse(features: unknown[]) {
  return new Response(
    JSON.stringify({ type: "FeatureCollection", features }),
    { status: 200 },
  );
}

describe("well location accuracy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies each documented accuracy band at its boundary", () => {
    const cases: [number, WellLocationAccuracy][] = [
      [5, "surveyed"],
      [15, "surveyed"],
      [50, "surveyed"],
      [50.0001, "map-referenced"],
      [707, "map-referenced"],
      [800, "map-referenced"],
      [800.0001, "sheet-referenced"],
      [1130, "sheet-referenced"],
      [1500, "sheet-referenced"],
      [1500.0001, "community"],
      [7829, "community"],
    ];

    for (const [metres, expected] of cases) {
      expect(classifyWellAccuracy(metres), `${metres} m`).toBe(expected);
    }
  });

  it("treats a zero or missing estimate as unknown rather than as a precise well", () => {
    expect(classifyWellAccuracy(0)).toBe("unknown");
    expect(classifyWellAccuracy(-12)).toBe("unknown");
    expect(classifyWellAccuracy(Number.NaN)).toBe("unknown");
    expect(classifyWellAccuracy(null)).toBe("unknown");
    expect(classifyWellAccuracy(undefined)).toBe("unknown");
  });

  it("describes coarse records as a nearby report and never as a located well", () => {
    const surveyed = wellAccuracyStatement("surveyed", 40);
    expect(surveyed).toContain("Surveyed");
    expect(surveyed).toContain("±40 m");
    expect(surveyed).not.toContain("near here");

    for (const accuracy of [
      "map-referenced",
      "sheet-referenced",
      "community",
    ] as const) {
      const statement = wellAccuracyStatement(accuracy, 1_130);
      expect(statement).toContain("reported within");
      expect(statement).toContain("not the well location");
    }

    expect(wellAccuracyStatement("unknown", 0)).toContain(
      "no location-accuracy estimate",
    );
  });

  it("states coarse distances in kilometres once they pass a kilometre", () => {
    expect(wellAccuracyStatement("sheet-referenced", 1_130)).toContain("1.1 km");
    expect(wellAccuracyStatement("community", 8_000)).toContain("8 km");
    expect(wellAccuracyStatement("map-referenced", 707)).toContain("707 m");
  });

  it("labels every band and keeps the band table ordered coarsest last", () => {
    const accuracies: WellLocationAccuracy[] = [
      "surveyed",
      "map-referenced",
      "sheet-referenced",
      "community",
      "unknown",
    ];
    for (const accuracy of accuracies) {
      expect(wellAccuracyLabel(accuracy).length).toBeGreaterThan(0);
    }

    expect(WELL_ACCURACY_BANDS.map(({ accuracy }) => accuracy)).toEqual(
      accuracies,
    );
    expect(WELL_ACCURACY_BANDS[0].maxMetres).toBe(50);
    expect(WELL_ACCURACY_BANDS[1].maxMetres).toBe(800);
    expect(WELL_ACCURACY_BANDS[2].maxMetres).toBe(1_500);
  });

  it("fills only the surveyed marker and draws every coarser band hollow", () => {
    const surveyed = wellLogMarkerStyle("surveyed");
    expect(surveyed.fillOpacity).toBeGreaterThan(0.5);
    expect(surveyed.dashArray).toBeUndefined();
    expect(wellLogMarkerRadius("surveyed")).toBeGreaterThan(
      wellLogMarkerRadius("community"),
    );

    for (const accuracy of [
      "map-referenced",
      "sheet-referenced",
      "community",
      "unknown",
    ] as const) {
      const style = wellLogMarkerStyle(accuracy);
      expect(style.fillOpacity, accuracy).toBeLessThan(0.25);
      expect(style.dashArray, accuracy).toBeDefined();
    }
  });

  it("keeps the same filled-versus-hollow distinction in monochrome print", () => {
    expect(printWellLogMarkerStyle("surveyed").fillOpacity).toBeGreaterThan(0.5);
    expect(printWellLogMarkerStyle("surveyed").dashArray).toBeUndefined();
    expect(printWellLogMarkerStyle("community").fillOpacity).toBe(0);
    expect(printWellLogMarkerStyle("community").dashArray).toBeDefined();
  });
});

describe("well log records", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Pinned as an exact list rather than "does not contain ADDRESS": a wildcard
   * `["*"]` would satisfy a negative assertion while shipping owner addresses.
   */
  it("requests an exact field list that excludes the owner address column", () => {
    expect([...WELL_LOG_OUT_FIELDS]).toEqual([
      "OBJECTID",
      "WELLNUM",
      "DATE",
      "DEPTH",
      "CASING",
      "BEDROCK",
      "STATIC",
      "YIELD_LPM",
      "GEOREF_A",
      "GEOREF_S",
    ]);
  });

  it("filters to surveyed records in the query so hidden records are never transferred", () => {
    expect(wellAccuracyWhereClause("surveyed")).toBe(
      "GEOREF_A > 0 AND GEOREF_A <= 50",
    );
    expect(wellAccuracyWhereClause("all")).toBe("1=1");
  });

  it("converts epoch completion dates and tolerates missing measurements", () => {
    expect(formatWellCompletionDate(950140800000)).toBe("2000-02-10");
    expect(formatWellCompletionDate(null)).toBeNull();
    expect(formatWellCompletionDate("2000-02-10")).toBeNull();

    const sparse = toWellLogProperties({
      WELLNUM: "  000025  ",
      GEOREF_A: 39.45904,
      GEOREF_S: "   ",
    });
    expect(sparse.wellNumber).toBe("000025");
    expect(sparse.coordinateSource).toBeNull();
    expect(sparse.depthMetres).toBeNull();
    expect(sparse.completedOn).toBeNull();
    expect(sparse.accuracy).toBe("surveyed");
  });

  it("drops the -9999 no-data marker instead of reporting it as a measurement", () => {
    const properties = toWellLogProperties({
      WELLNUM: "000283",
      GEOREF_A: 707,
      DEPTH: 97.4,
      CASING: -9999,
      BEDROCK: -9999,
      STATIC: -9999,
      YIELD_LPM: -9999,
    });

    expect(properties.depthMetres).toBe(97.4);
    expect(properties.casingMetres).toBeNull();
    expect(properties.bedrockDepthMetres).toBeNull();
    expect(properties.staticLevelMetres).toBeNull();
    expect(properties.yieldLitresPerMinute).toBeNull();
    expect(wellLogPopupHtml(properties)).not.toContain("9999");
  });

  it("keeps genuine above-ground static levels for flowing wells", () => {
    const properties = toWellLogProperties({
      WELLNUM: "000284",
      GEOREF_A: 15,
      STATIC: -0.61,
    });

    expect(properties.staticLevelMetres).toBe(-0.61);
  });

  it("maps the published columns onto the app's shape", () => {
    const properties = toWellLogProperties(wellFeature().properties);

    expect(properties).toEqual({
      wellNumber: "000025",
      completedOn: "2000-02-10",
      depthMetres: 18.27,
      casingMetres: 7.92,
      bedrockDepthMetres: 6.09,
      staticLevelMetres: 4.57,
      yieldLitresPerMinute: 45.4,
      accuracyMetres: 39.45904,
      accuracy: "surveyed",
      coordinateSource: "NSPRD",
    });
    expect(properties).not.toHaveProperty("ADDRESS");
  });

  it("queries the visible envelope in WGS84 without the address column", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(collectionResponse([wellFeature()]));

    const collection = await fetchWellLogs({ serviceUrl: SERVICE_URL, bounds, filter: "surveyed" });

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties.accuracy).toBe("surveyed");

    const requested = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(requested.searchParams.get("where")).toBe(
      "GEOREF_A > 0 AND GEOREF_A <= 50",
    );
    expect(requested.searchParams.get("outSR")).toBe("4326");
    expect(requested.searchParams.get("orderByFields")).toBe("OBJECTID");
    expect(requested.searchParams.get("outFields")).not.toContain("ADDRESS");
    expect(requested.searchParams.get("geometry")).toBe(
      "-63.75,44.6,-63.45,44.75",
    );
  });

  it("asks for every record once approximate locations are included", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(collectionResponse([]));

    await fetchWellLogs({ serviceUrl: SERVICE_URL, bounds, filter: "all" });

    const requested = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(requested.searchParams.get("where")).toBe("1=1");
  });

  it("classifies a coarse record returned by the service", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      collectionResponse([
        wellFeature({ GEOREF_A: 7829, GEOREF_S: "Gazeteer" }),
      ]),
    );

    const collection = await fetchWellLogs({ serviceUrl: SERVICE_URL, bounds, filter: "all" });

    expect(collection.features[0].properties.accuracy).toBe("community");
    expect(collection.features[0].properties.coordinateSource).toBe("Gazeteer");
  });

  /**
   * Leaflet assigns string tooltips with innerHTML, so an unescaped well number
   * from the live service would execute.
   */
  it("escapes the tooltip as well as the popup", () => {
    const hostile = toWellLogProperties({
      WELLNUM: '<img src=x onerror="alert(1)">',
      GEOREF_A: 15,
    });

    const tooltip = wellLogTooltipHtml(hostile);
    expect(tooltip).not.toContain("<img");
    expect(tooltip).toContain("&lt;img");
    expect(tooltip).toContain("Surveyed");
  });

  it("leads the popup with the accuracy statement and escapes service text", () => {
    const coarse = wellLogPopupHtml(
      toWellLogProperties({
        WELLNUM: '00<script>"x"</script>',
        GEOREF_A: 7829,
        GEOREF_S: "Gazeteer",
        DEPTH: 18.27,
      }),
    );

    expect(coarse).not.toContain("<script>");
    expect(coarse).toContain("&lt;script&gt;");
    expect(coarse).toContain("&quot;");
    expect(coarse).toContain("not the well location");
    expect(coarse).toContain("well-log-popup--community");
    expect(coarse.indexOf("well-log-popup-accuracy")).toBeLessThan(
      coarse.indexOf("<dl>"),
    );
    expect(coarse).toContain("18.3 m");
    expect(coarse).toContain("Not recorded");
  });

  it("surfaces a failing service as an error rather than an empty result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 503 }),
    );

    await expect(fetchWellLogs({ serviceUrl: SERVICE_URL, bounds, filter: "surveyed" })).rejects.toThrow(/503/);
  });
});

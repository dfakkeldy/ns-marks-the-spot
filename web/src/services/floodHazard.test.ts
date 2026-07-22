import { afterEach, describe, expect, it, vi } from "vitest";
import type { NsprdFeatureCollection } from "./nsprd";
import {
  fetchCoastalFloodEvidence,
  fetchPublishedRiverFloodEvidence,
  summarizeRasterAlpha,
} from "./floodHazard";

const parcelFeatures: NsprdFeatureCollection["features"] = [
  {
    type: "Feature",
    properties: { PID: "12345678", "SHAPE.AREA": 800 },
    geometry: {
      type: "Polygon",
      coordinates: [
        [[-63.7, 44.74], [-63.68, 44.74], [-63.68, 44.76], [-63.7, 44.76], [-63.7, 44.74]],
        [[-63.695, 44.745], [-63.69, 44.745], [-63.69, 44.75], [-63.695, 44.75], [-63.695, 44.745]],
      ],
    },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("published river flood evidence", () => {
  it("preserves parcel rings and reports published AEP intersections without inventing a parcel probability", async () => {
    const requests: URLSearchParams[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      requests.push(body);
      const layerId = Number(new URL(String(input)).pathname.split("/").at(-2));
      return new Response(JSON.stringify({
        features: layerId === 8 || layerId === 10 ? [{ attributes: { OBJECTID: 1 } }] : [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await fetchPublishedRiverFloodEvidence(parcelFeatures);

    expect(result.status).toBe("published-intersection");
    expect(result.aep).toEqual([
      { annualExceedanceProbabilityPercent: 5, relationship: "area", places: ["Bedford / Sackville"] },
      { annualExceedanceProbabilityPercent: 1, relationship: "area", places: ["Bedford / Sackville"] },
    ]);
    const geometry = JSON.parse(requests[0].get("geometry") ?? "{}") as { rings: number[][][] };
    expect(geometry.rings).toHaveLength(2);
    expect(geometry.rings[1]).toHaveLength(5);
    expect(requests[0].get("resultRecordCount")).toBeNull();
    expect(result).not.toHaveProperty("probability");
  });

  it("keeps boundary-only 5% mapping distinct from polygon exposure", async () => {
    const pictouFeatures: NsprdFeatureCollection["features"] = [
      {
        ...parcelFeatures[0],
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-62.67, 45.52], [-62.65, 45.52], [-62.65, 45.54],
            [-62.67, 45.54], [-62.67, 45.52],
          ]],
        },
      },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const layerId = Number(new URL(String(input)).pathname.split("/").at(-2));
      return new Response(JSON.stringify({
        features: layerId === 12 ? [{ attributes: { OBJECTID: 7 } }] : [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await fetchPublishedRiverFloodEvidence(pictouFeatures);

    expect(result.status).toBe("published-intersection");
    expect(result.aep).toEqual([
      { annualExceedanceProbabilityPercent: 5, relationship: "boundary", places: ["Pictou"] },
    ]);
  });

  it("does not query study layers for a parcel outside every published extent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const outsideFeatures: NsprdFeatureCollection["features"] = [
      {
        ...parcelFeatures[0],
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-61.3, 46.1], [-61.2, 46.1], [-61.2, 46.2],
            [-61.3, 46.2], [-61.3, 46.1],
          ]],
        },
      },
    ];

    await expect(fetchPublishedRiverFloodEvidence(outsideFeatures)).resolves.toEqual({
      status: "outside-published-layer-extents",
      aep: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not turn a service failure into no flood hazard", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));

    await expect(fetchPublishedRiverFloodEvidence(parcelFeatures)).resolves.toMatchObject({
      status: "error",
    });
  });
});

describe("coastal raster sampling", () => {
  it("counts only parcel pixels, including holes, and measures flooded exposure", () => {
    const alpha = new Uint8ClampedArray(4 * 4 * 4);
    for (let pixel = 0; pixel < 16; pixel += 1) {
      alpha[pixel * 4 + 3] = pixel % 2 === 0 ? 255 : 0;
    }

    const result = summarizeRasterAlpha({
      rgba: alpha,
      width: 4,
      height: 4,
      bounds: { west: -63.7, south: 44.74, east: -63.68, north: 44.76 },
      features: parcelFeatures,
      mappedAreaSquareMetres: 800,
    });

    expect(result.sampledParcelPixels).toBeGreaterThan(0);
    expect(result.floodedParcelPixels).toBeLessThan(result.sampledParcelPixels);
    expect(result.approximateAffectedPercent).toBeGreaterThan(0);
    expect(result.approximateAffectedPercent).toBeLessThan(100);
    expect(result.approximateAffectedSquareMetres).toBe(
      Math.round(800 * result.approximateAffectedPercent) / 100,
    );
  });

  it("keeps current, 2050, and 2100 source states independent", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("2050")) return new Response("unavailable", { status: 503 });
      return new Response(url.includes("Current_Day") ? "flooded" : "clear", { status: 200 });
    }));

    const result = await fetchCoastalFloodEvidence(
      parcelFeatures,
      800,
      undefined,
      async (blob) => {
        const flooded = (await blob.text()) === "flooded";
        const rgba = new Uint8ClampedArray(4 * 4 * 4);
        if (flooded) {
          for (let pixel = 0; pixel < 4; pixel += 1) rgba[pixel * 4 + 3] = 255;
        }
        return { rgba, width: 4, height: 4 };
      },
    );

    expect(result.map(({ scenario, status }) => ({ scenario, status }))).toEqual([
      { scenario: "current", status: "intersects" },
      { scenario: "2050", status: "error" },
      { scenario: "2100", status: "no-intersection" },
    ]);
    expect(result[0]).toMatchObject({
      stormAnnualExceedanceProbabilityPercent: 1,
    });
    expect(result[0].status === "intersects" && result[0].approximateAffectedSquareMetres)
      .toBeGreaterThan(0);
    expect(result[2]).not.toHaveProperty("probability");
  });
});

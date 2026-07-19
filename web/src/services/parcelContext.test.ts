import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchParcelContext,
  mappedAreaForPid,
  type ParcelContext,
} from "./parcelContext";
import type { NsprdFeatureCollection } from "./nsprd";

const parcels: NsprdFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { PID: "50334317", "SHAPE.AREA": 100_000 },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-61.2, 46.4],
            [-61.1, 46.4],
            [-61.1, 46.3],
            [-61.2, 46.3],
            [-61.2, 46.4],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { PID: "50334317", "SHAPE.AREA": 11_057.27135 },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-61.3, 46.4],
            [-61.2, 46.4],
            [-61.2, 46.3],
            [-61.3, 46.3],
            [-61.3, 46.4],
          ],
        ],
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parcel acreage and mapped context", () => {
  it("sums multi-part NSPRD parcels and formats acres", () => {
    expect(mappedAreaForPid(parcels, "50334317")).toEqual({
      squareMetres: 111_057.27135,
      acres: 27.44,
      label: "27.44 acres",
    });
    expect(mappedAreaForPid(parcels, "00000000")).toBeNull();
  });

  it("queries every relevant Province sublayer with the selected geometry", async () => {
    const responses: Record<string, { features: unknown[] }> = {
      "road:5": {
        features: [
          {
            attributes: {
              STREET: "Cabot Trail",
              ROADC_DESC: "Arterial",
              FEAT_DESC: "Bridge",
            },
          },
        ],
      },
      "road:8": {
        features: [
          {
            attributes: {
              STREET: "Cabot Trail",
              ROADC_DESC: "Arterial",
              FEAT_DESC: "Road",
            },
          },
        ],
      },
      "road:10": {
        features: [{ attributes: { FEAT_DESC: "CULVERT line" } }],
      },
      "water:4": {
        features: [
          {
            attributes: {
              RIVNAME_1: "Mabou River",
              FEAT_DESC: "River or stream line",
            },
          },
        ],
      },
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = new URLSearchParams(String(init?.body));
      const layerId = url.pathname.match(/\/(\d+)\/query$/)?.[1];
      const source = url.pathname.includes("Water_WM84") ? "water" : "road";

      expect(init?.method).toBe("POST");
      expect(body.get("geometryType")).toBe("esriGeometryPolygon");
      expect(body.get("spatialRel")).toBe("esriSpatialRelIntersects");
      expect(JSON.parse(body.get("geometry") ?? "{}").rings).toHaveLength(2);

      return new Response(
        JSON.stringify(responses[`${source}:${layerId}`] ?? { features: [] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const context: ParcelContext = await fetchParcelContext(parcels.features);

    expect(fetchMock).toHaveBeenCalledTimes(14);
    expect(context.roads).toEqual([
      { name: "Cabot Trail", kind: "Arterial" },
      { name: "Culvert", kind: "Non-vehicle feature" },
    ]);
    expect(context.water).toEqual([
      { name: "Mabou River", kind: "River or stream" },
    ]);
  });

  it("surfaces a Province intersection-service failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));

    await expect(fetchParcelContext(parcels.features)).rejects.toThrow(
      "mapped feature request failed with status 503",
    );
  });
});

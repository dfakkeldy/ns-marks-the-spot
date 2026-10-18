import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchParcelBuildingCount } from "./buildings";
import type { NsprdFeatureCollection } from "./nsprd";

const parcels: NsprdFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { PID: "15234636" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-60.02, 46.18],
            [-60.01, 46.18],
            [-60.01, 46.17],
            [-60.02, 46.17],
            [-60.02, 46.18],
          ],
        ],
      },
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parcel building count", () => {
  it("sums classified points, unclassified points, and polygons intersecting the PID", async () => {
    const counts = new Map([
      ["2", 1],
      ["3", 2],
      ["4", 3],
    ]);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const layerId = url.pathname.match(/\/(\d+)\/query$/u)?.[1] ?? "";
      const body = new URLSearchParams(String(init?.body));

      expect(init?.method).toBe("POST");
      expect(body.get("geometryType")).toBe("esriGeometryPolygon");
      expect(body.get("spatialRel")).toBe("esriSpatialRelIntersects");
      expect(body.get("returnCountOnly")).toBe("true");
      expect(JSON.parse(body.get("geometry") ?? "{}").rings).toHaveLength(1);

      return new Response(JSON.stringify({ count: counts.get(layerId) ?? 0 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchParcelBuildingCount(parcels.features)).resolves.toEqual({
      count: 6,
      pointCount: 3,
      polygonCount: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns zero without querying when parcel geometry is unavailable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchParcelBuildingCount([])).resolves.toEqual({
      count: 0,
      pointCount: 0,
      polygonCount: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a building-service failure instead of manufacturing zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 503 })),
    );

    await expect(fetchParcelBuildingCount(parcels.features)).rejects.toThrow(
      "building request failed with status 503",
    );
  });
});

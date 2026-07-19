import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NSPRD_LAYER_URL,
  buildPointQueryUrl,
  buildPidQueryUrl,
  fetchParcelAtPoint,
  fetchParcels,
  normalizePid,
} from "./nsprd";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NSPRD PID queries", () => {
  it("normalizes common PID formatting without guessing missing digits", () => {
    expect(normalizePid("50 20-3256")).toBe("50203256");
    expect(normalizePid("5020325")).toBeNull();
    expect(normalizePid("50203256 extra")).toBeNull();
  });

  it("builds a geometry-enabled GeoJSON query with unique PIDs", () => {
    const url = new URL(
      buildPidQueryUrl(["50203256", "50000462", "50203256"]),
    );

    expect(`${url.origin}${url.pathname}`).toBe(`${NSPRD_LAYER_URL}/query`);
    expect(url.searchParams.get("where")).toBe(
      "PID IN ('50203256','50000462')",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "PID,UPDAT_DATE,SHAPE.AREA",
    );
    expect(url.searchParams.get("returnGeometry")).toBe("true");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("geojson");
  });

  it("rejects an empty or malformed PID query", () => {
    expect(() => buildPidQueryUrl([])).toThrow("at least one valid PID");
    expect(() => buildPidQueryUrl(["not-a-pid"])).toThrow(
      "at least one valid PID",
    );
  });

  it("builds a point-intersection query for a tapped map coordinate", () => {
    const url = new URL(buildPointQueryUrl(46.059488, -61.414138));

    expect(`${url.origin}${url.pathname}`).toBe(`${NSPRD_LAYER_URL}/query`);
    expect(url.searchParams.get("geometry")).toBe("-61.414138,46.059488");
    expect(url.searchParams.get("geometryType")).toBe("esriGeometryPoint");
    expect(url.searchParams.get("inSR")).toBe("4326");
    expect(url.searchParams.get("spatialRel")).toBe(
      "esriSpatialRelIntersects",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "PID,UPDAT_DATE,SHAPE.AREA",
    );
    expect(url.searchParams.get("returnGeometry")).toBe("true");
    expect(url.searchParams.get("outSR")).toBe("4326");
    expect(url.searchParams.get("f")).toBe("geojson");
  });

  it("rejects invalid map coordinates before querying NSPRD", () => {
    expect(() => buildPointQueryUrl(91, -61)).toThrow("valid latitude");
    expect(() => buildPointQueryUrl(46, -181)).toThrow("valid longitude");
  });

  it("returns the parcel containing a tapped map point", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { PID: "50251750" },
              geometry: {
                type: "Polygon",
                coordinates: [],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const collection = await fetchParcelAtPoint(46.059488, -61.414138);

    expect(collection.features.map(({ properties }) => properties.PID)).toEqual([
      "50251750",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("batches large exact-PID catalogs and merges returned geometry", async () => {
    const pids = Array.from({ length: 81 }, (_, index) =>
      String(10_000_000 + index),
    );
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const requestedPids = url.searchParams.get("where")?.match(/\d{8}/g) ?? [];

      return new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: requestedPids.map((pid) => ({
            type: "Feature",
            properties: { PID: pid },
            geometry: { type: "Point", coordinates: [-60, 46] },
          })),
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const collection = await fetchParcels(pids);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(collection.features).toHaveLength(81);
    expect(collection.features.map(({ properties }) => properties.PID)).toEqual(
      pids,
    );
  });
});

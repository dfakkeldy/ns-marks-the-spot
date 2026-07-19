import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchArcGISFeatureOverlay } from "./arcGISFeatureOverlay";

const feature = (id: number, longitude = -61.2) => ({
  type: "Feature" as const,
  id,
  geometry: {
    type: "Point" as const,
    coordinates: [longitude, 46.1],
  },
  properties: { geo_id: id, Name: `Record ${id}` },
});

describe("ArcGIS feature overlays", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queries only the visible WGS84 map envelope and requested fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ type: "FeatureCollection", features: [feature(1)] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchArcGISFeatureOverlay({
      serviceUrl: "https://example.test/FeatureServer/0",
      bounds: { west: -62, south: 45, east: -60, north: 47 },
      outFields: ["geo_id", "Name"],
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.pathname).toBe("/FeatureServer/0/query");
    expect(requestUrl.searchParams.get("geometry")).toBe("-62,45,-60,47");
    expect(requestUrl.searchParams.get("geometryType")).toBe(
      "esriGeometryEnvelope",
    );
    expect(requestUrl.searchParams.get("inSR")).toBe("4326");
    expect(requestUrl.searchParams.get("outSR")).toBe("4326");
    expect(requestUrl.searchParams.get("outFields")).toBe("geo_id,Name");
    expect(requestUrl.searchParams.get("f")).toBe("geojson");
  });

  it("continues through full pages and removes duplicate records", async () => {
    const fullPage = Array.from({ length: 2_000 }, (_, index) => feature(index));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ type: "FeatureCollection", features: fullPage }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "FeatureCollection",
            features: [feature(1_999), feature(2_000)],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const collection = await fetchArcGISFeatureOverlay({
      serviceUrl: "https://example.test/FeatureServer/0",
      bounds: { west: -62, south: 45, east: -60, north: 47 },
      outFields: ["geo_id", "Name"],
    });

    expect(collection.features).toHaveLength(2_001);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new URL(fetchMock.mock.calls[1][0]).searchParams.get("resultOffset"),
    ).toBe("2000");
  });

  it("surfaces a source failure without returning partial data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );

    await expect(
      fetchArcGISFeatureOverlay({
        serviceUrl: "https://example.test/FeatureServer/0",
        bounds: { west: -62, south: 45, east: -60, north: 47 },
        outFields: ["geo_id"],
      }),
    ).rejects.toThrow("ArcGIS feature query failed (503)");
  });
});

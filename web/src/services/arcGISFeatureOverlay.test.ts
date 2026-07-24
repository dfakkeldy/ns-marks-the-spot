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
      orderByFields: "geo_id",
      idField: "geo_id",
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.pathname).toBe("/FeatureServer/0/query");
    expect(requestUrl.searchParams.get("orderByFields")).toBe("geo_id");
    expect(requestUrl.searchParams.get("geometry")).toBe("-62,45,-60,47");
    expect(requestUrl.searchParams.get("geometryType")).toBe(
      "esriGeometryEnvelope",
    );
    expect(requestUrl.searchParams.get("inSR")).toBe("4326");
    expect(requestUrl.searchParams.get("outSR")).toBe("4326");
    expect(requestUrl.searchParams.get("outFields")).toBe("geo_id,Name");
    expect(requestUrl.searchParams.get("f")).toBe("geojson");
    expect(requestUrl.searchParams.get("distance")).toBeNull();
    expect(requestUrl.searchParams.get("units")).toBeNull();
  });

  it("queries a metre distance around the visible envelope when requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: "FeatureCollection", features: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchArcGISFeatureOverlay({
      serviceUrl: "https://example.test/FeatureServer/0",
      bounds: { west: -62, south: 45, east: -60, north: 47 },
      outFields: ["geo_id"],
      orderByFields: "geo_id",
      idField: "geo_id",
      distanceMetres: 1_000,
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.searchParams.get("distance")).toBe("1000");
    expect(requestUrl.searchParams.get("units")).toBe("esriSRUnit_Meter");
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
      orderByFields: "geo_id",
      idField: "geo_id",
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
        orderByFields: "geo_id",
        idField: "geo_id",
      }),
    ).rejects.toThrow("ArcGIS feature query failed (503)");
  });

  it("sorts and deduplicates polygon sources by their own identity field", async () => {
    // Municipal zoning services reject geo_id and return polygons without a
    // GeoJSON feature id, so paging has to sort and dedupe on OBJECTID.
    const zone = (objectId: number) => ({
      type: "Feature" as const,
      geometry: {
        type: "MultiPolygon" as const,
        coordinates: [[[[-61.2, 46.1], [-61.1, 46.1], [-61.1, 46.2], [-61.2, 46.1]]]],
      },
      properties: { OBJECTID: objectId, Zone: "CR" },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [zone(11), zone(11), zone(12)],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const collection = await fetchArcGISFeatureOverlay<GeoJSON.MultiPolygon>({
      serviceUrl: "https://example.test/FeatureServer/708",
      bounds: { west: -62, south: 45, east: -60, north: 47 },
      outFields: ["OBJECTID", "Zone"],
      orderByFields: "OBJECTID",
      idField: "OBJECTID",
    });

    expect(
      new URL(fetchMock.mock.calls[0][0]).searchParams.get("orderByFields"),
    ).toBe("OBJECTID");
    expect(collection.features).toHaveLength(2);
    expect(collection.features[0].geometry.type).toBe("MultiPolygon");
  });
});

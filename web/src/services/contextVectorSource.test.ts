import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContextLayerDescriptor } from "../layers/contextLayerTypes";
import { ContextAreaTooLargeError, ContextOutsideCoverageError, fetchContextFeatures } from "./contextVectorSource";

const bounds = { west: -62, south: 45, east: -61, north: 46 };
const point = (id: string, x = -61.4) => ({ type: "Feature", properties: { source_id: id, name: "Public site" }, geometry: { type: "Point", coordinates: [x, 45.8] } });
const collection = (features: unknown[]) => ({ type: "FeatureCollection", features });
const base = {
  id: "test-source", name: "Source", serviceUrl: "https://example.test/FeatureServer/0", idField: "source_id", outFields: ["source_id", "name"],
  category: "water-terrain", sourceUrl: "https://example.test/source", licenceUrl: "https://example.test/licence", licence: "canada-open",
  sourceDate: "2026", scale: "Published coordinates", coverage: "Test coverage", webCaveat: "Source records only", minZoom: 10, maxZoom: 23, opacity: 1, zIndex: 220, exportOptions: { transparent: true }, legend: [],
} satisfies ContextLayerDescriptor;
const socrata: ContextLayerDescriptor = { ...base, idField: "source_row_id", vectorSource: {
  kind: "socrata-points", dataset: "abcd-1234", latitudeField: "latitude", longitudeField: "longitude", fields: ["name"],
} };
const staticLayer: ContextLayerDescriptor = { ...base, vectorSource: { kind: "geojson", url: "./ecology/public.geojson" } };
const mockFetch = (...values: unknown[]) => {
  const mock = vi.fn();
  for (const value of values) mock.mockResolvedValueOnce(new Response(JSON.stringify(value)));
  vi.stubGlobal("fetch", mock);
  return mock;
};
afterEach(() => vi.unstubAllGlobals());

describe("bounded context vector sources", () => {
  it("queries numeric public coordinates only in the viewport and preserves source identity", async () => {
    const mock = mockFetch([{ source_row_id: "row-1", latitude: "45.8", longitude: "-61.4", name: "<b>site</b>" }]);
    const signal = new AbortController().signal;
    const result = await fetchContextFeatures(socrata, bounds, signal);
    const url = new URL(mock.mock.calls[0][0]);
    expect(url.pathname).toBe("/resource/abcd-1234.json");
    expect(url.searchParams.get("$where")).toContain("latitude between 45 and 46");
    expect(url.searchParams.get("$where")).toContain("longitude between -62 and -61");
    expect(url.searchParams.get("$select")).toBe(":id as source_row_id,latitude,longitude,name");
    expect(url.searchParams.get("$order")).toBe(":id");
    expect(mock.mock.calls[0][1].signal).toBe(signal);
    expect(result.features[0]).toMatchObject({ id: "row-1", geometry: { type: "Point", coordinates: [-61.4, 45.8] }, properties: { source_row_id: "row-1", name: "<b>site</b>" } });
  });

  it("continues full Socrata pages and refuses duplicate identifiers", async () => {
    const page = Array.from({ length: 2000 }, (_, i) => ({ source_row_id: String(i), latitude: 45.8, longitude: -61.4 }));
    const mock = mockFetch(page, [{ ...page[0] }]);
    await expect(fetchContextFeatures(socrata, bounds)).rejects.toThrow(/duplicate|pagination/i);
    expect(new URL(mock.mock.calls[1][0]).searchParams.get("$offset")).toBe("2000");
  });

  it.each([null, "", " ", "not-a-coordinate", 999])("refuses malformed coordinates (%s) instead of manufacturing a point", async (latitude) => {
    mockFetch([{ source_row_id: "1", latitude, longitude: -61.4 }]);
    await expect(fetchContextFeatures(socrata, bounds)).rejects.toThrow(/coordinate/i);
  });

  it("does not quietly accept records outside the requested viewport", async () => {
    mockFetch([{ source_row_id: "1", latitude: 42, longitude: -65 }]);
    await expect(fetchContextFeatures(socrata, bounds)).rejects.toThrow(/viewport/i);
  });

  it("keeps a successful empty response distinct from an HTTP or schema error", async () => {
    mockFetch([]);
    expect((await fetchContextFeatures(socrata, bounds)).features).toEqual([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(fetchContextFeatures(socrata, bounds)).rejects.toThrow(/503/);
    mockFetch({ error: "source failure" });
    await expect(fetchContextFeatures(socrata, bounds)).rejects.toThrow(/invalid/i);
  });

  it("filters a public snapshot by viewport while retaining original geometry", async () => {
    const inside = point("one");
    mockFetch(collection([inside, point("outside", -66)]));
    const result = await fetchContextFeatures({ ...staticLayer }, bounds);
    expect(result.features).toEqual([{ ...inside, id: "one" }]);
  });

  it("validates an entire snapshot before using any of its records", async () => {
    mockFetch(collection([point("one"), { ...point("bad"), geometry: null }]));
    await expect(fetchContextFeatures({ ...staticLayer }, bounds)).rejects.toThrow(/geometry/i);
  });

  it("refuses transfer-limited or oversized snapshots, rather than drawing a partial layer", async () => {
    mockFetch({ ...collection([point("one")]), exceededTransferLimit: true });
    await expect(fetchContextFeatures({ ...staticLayer }, bounds)).rejects.toThrow(/incomplete/i);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { headers: { "content-length": String(30 * 1024 * 1024) } })));
    await expect(fetchContextFeatures({ ...staticLayer }, bounds)).rejects.toBeInstanceOf(ContextAreaTooLargeError);
  });

  it("rejects invalid bounds, cancelled loads and known outside-coverage views without fetching", async () => {
    const mock = mockFetch();
    await expect(fetchContextFeatures(base, { ...bounds, west: NaN })).rejects.toThrow(/bounds/i);
    const controller = new AbortController(); controller.abort();
    await expect(fetchContextFeatures(base, bounds, controller.signal)).rejects.toThrow();
    await expect(fetchContextFeatures({ ...base, coverageBounds: { west: -70, east: -65, south: 40, north: 43 } }, bounds)).rejects.toBeInstanceOf(ContextOutsideCoverageError);
    expect(mock).not.toHaveBeenCalled();
  });

  it("passes the declared ArcGIS filter and source fields to the existing adapter", async () => {
    const mock = mockFetch(collection([point("one")]));
    await fetchContextFeatures({ ...base, featureWhere: "Status = 'Final'" }, bounds);
    const url = new URL(mock.mock.calls[0][0]);
    expect(url.searchParams.get("where")).toBe("Status = 'Final'");
    expect(url.searchParams.get("outFields")).toBe("source_id,name");
  });

  it("pages OGC feature collections in the requested bbox and retains their original IDs", async () => {
    const ogc = { ...base, serviceUrl: "https://example.test/collections/stations/items", vectorSource: { kind: "ogc-features" as const } };
    const mock = mockFetch(
      { ...collection([point("one")]), links: [{ rel: "next", href: "https://example.test/collections/stations/items?offset=1" }] },
      collection([point("two")]),
    );
    const result = await fetchContextFeatures(ogc, bounds);
    expect(new URL(mock.mock.calls[0][0]).searchParams.get("bbox")).toBe("-62,45,-61,46");
    expect(new URL(mock.mock.calls[0][0]).searchParams.get("f")).toBe("json");
    expect(result.features.map(f => f.id)).toEqual(["one", "two"]);
  });

  it("refuses unexpected OGC next-page origins and repeat pages", async () => {
    const ogc = { ...base, serviceUrl: "https://example.test/collections/stations/items", vectorSource: { kind: "ogc-features" as const } };
    mockFetch({ ...collection([point("one")]), links: [{ rel: "next", href: "https://unrelated.test/items" }] });
    await expect(fetchContextFeatures(ogc, bounds)).rejects.toThrow(/pagination/i);
    mockFetch({ ...collection([point("one")]), links: [{ rel: "next", href: "https://example.test/collections/stations/items?offset=1" }] }, collection([point("one")]));
    await expect(fetchContextFeatures(ogc, bounds)).rejects.toThrow(/duplicate/i);
  });
});

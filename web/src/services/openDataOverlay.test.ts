import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpenDataOverlay, openDataQuery } from "./openDataOverlay";

const bounds = { west: -61.5, east: -61.4, south: 45.8, north: 45.9 };
const source = { parts: [{ dataset: "458x-dmz3", fields: ["feat_desc"], where: "feat_desc = 'Falls -  On a single line river point'" }], color: "#0078ff" };
const feature = (id: string) => ({ type: "Feature", geometry: { type: "Point", coordinates: [-61.45, 45.85] }, properties: { source_row_id: id, feat_desc: "Falls" } });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("open-government viewport downloads", () => {
  it("queries only the requested bounds and source classes with stable row identifiers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "FeatureCollection", features: [feature("one")] })));
    vi.stubGlobal("fetch", fetcher);
    const result = await fetchOpenDataOverlay(source, bounds);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.origin).toBe("https://data.novascotia.ca");
    expect(url.searchParams.get("$where")).toContain("intersects(the_geom");
    expect(url.searchParams.get("$where")).toContain(source.parts[0].where);
    expect(url.searchParams.get("$select")).toContain(":id as source_row_id");
    expect(result.features[0].id).toBe("458x-dmz3:one");
  });
  it("fails the whole layer when a constituent dataset fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ type: "FeatureCollection", features: [feature("one")] }))).mockResolvedValueOnce(new Response("unavailable", { status: 503 })));
    await expect(fetchOpenDataOverlay({ ...source, parts: [...source.parts, { dataset: "fpca-jrmt", fields: ["feat_desc"] }] }, bounds)).rejects.toThrow("503");
  });
  it("rejects missing geometry rather than claiming complete coverage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "FeatureCollection", features: [{ ...feature("bad"), geometry: null }] }))));
    await expect(fetchOpenDataOverlay(source, bounds)).rejects.toThrow("geometry");
  });
  it("rejects invalid bounds before issuing a request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(fetchOpenDataOverlay(source, { ...bounds, east: NaN })).rejects.toThrow("bounds");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it("detects a repeated page rather than returning incomplete or duplicated features", async () => {
  const page = Array.from({ length: 5000 }, (_, i) => feature(String(i)));
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ type: "FeatureCollection", features: page })));
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchOpenDataOverlay(source, bounds)).rejects.toThrow("pagination changed");
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("$offset")).toBe("5000");
});
it("enforces its download budget before parsing or drawing a partial collection", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(25 * 1024 * 1024))));
  await expect(fetchOpenDataOverlay(source, bounds)).rejects.toThrow("zoom in");
});
it("does not request close-range constituents at overview scale", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "FeatureCollection", features: [] })));
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchOpenDataOverlay({ ...source, parts: [...source.parts, { dataset: "x8jw-yjc2", fields: [], minZoom: 16 }] }, bounds, undefined, 10)).resolves.toEqual({ type: "FeatureCollection", features: [] });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("honours cancellation before any source is queried", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController(); controller.abort();
  await expect(fetchOpenDataOverlay(source, bounds, controller.signal)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('names the exact failed dataset, including its HTTP status', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));
  await expect(fetchOpenDataOverlay(source, bounds)).rejects.toThrow(/458x-dmz3.*HTTP 503/);
});

it.each([9, 10, 13, 14, 15, 18])('retains original NSRN road bends at zoom %s', (zoom) => {
  expect(new URL(openDataQuery({ dataset: '484g-adjn', fields: ['street'] }, bounds, 0, zoom)).searchParams.get('$select')).toBe(':id as source_row_id,the_geom,street');
});
it.each([10, 13, 17])('keeps polygon simplification below ten metres in geographic units at zoom %s', (zoom) => {
  const query = new URL(openDataQuery({ dataset: 'h8jb-hzrm', fields: [] }, bounds, 0, zoom));
  const tolerance = Number(query.searchParams.get('$select')!.match(/the_geom,([0-9.]+)\)/)![1]);
  expect(tolerance).toBeGreaterThan(0);
  expect(tolerance * 111_320).toBeLessThanOrEqual(10.001);
  expect(query.searchParams.get('$where')).toContain('intersects(the_geom,');
});
const roadSource = () => ({ roads: true, parts: [{ dataset: '484g-adjn', fields: ['street'] }], color: '#654735' });
const roadResponse = (id = 'bend') => new Response(JSON.stringify({ type: 'FeatureCollection', features: [{
  type: 'Feature', geometry: { type: 'LineString', coordinates: [[-61.49, 45.81], [-61.46, 45.86], [-61.42, 45.82]] },
  properties: { source_row_id: id, street: 'Test road' },
}] }));
it('reuses complete road geometry for a small pan without another download', async () => {
  const roads = roadSource();
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(roadResponse()));
  vi.stubGlobal('fetch', fetcher);
  const first = await fetchOpenDataOverlay(roads, bounds, undefined, 13);
  const moved = await fetchOpenDataOverlay(roads, { ...bounds, west: -61.495, east: -61.395 }, undefined, 13);
  expect(moved).toEqual(first);
  expect(moved.features[0].geometry).toMatchObject({ coordinates: [[-61.49, 45.81], [-61.46, 45.86], [-61.42, 45.82]] });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('refreshes roads outside the cached area, at a new zoom, or after expiry', async () => {
  vi.useFakeTimers();
  const roads = roadSource(); let id = 0;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(roadResponse(String(++id)))));
  const initial = await fetchOpenDataOverlay(roads, bounds, undefined, 13);
  const outside = await fetchOpenDataOverlay(roads, { ...bounds, west: -61.6 }, undefined, 13);
  const zoomed = await fetchOpenDataOverlay(roads, bounds, undefined, 16);
  vi.advanceTimersByTime(60_001);
  const expired = await fetchOpenDataOverlay(roads, bounds, undefined, 16);
  expect([initial, outside, zoomed, expired].map(c => c.features[0].id)).toEqual(['484g-adjn:1', '484g-adjn:2', '484g-adjn:3', '484g-adjn:4']);
});
it('never caches a failed road download or serves cached data to an aborted request', async () => {
  const roads = roadSource();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('error', { status: 503 })).mockImplementation(() => Promise.resolve(roadResponse()));
  vi.stubGlobal('fetch', fetcher);
  await expect(fetchOpenDataOverlay(roads, bounds, undefined, 13)).rejects.toThrow('503');
  await expect(fetchOpenDataOverlay(roads, bounds, undefined, 13)).resolves.toHaveProperty('features.length', 1);
  const controller = new AbortController(); controller.abort();
  await expect(fetchOpenDataOverlay(roads, bounds, controller.signal, 13)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not mix full roads and filtered main-road collections', async () => {
  const roads = roadSource();
  const main = { ...roadSource(), parts: [{ ...roads.parts[0], where: "roadc_desc = 'Highway'" }] };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(roadResponse('all')).mockResolvedValueOnce(roadResponse('main')));
  await fetchOpenDataOverlay(roads, bounds, undefined, 13);
  expect((await fetchOpenDataOverlay(main, bounds, undefined, 13)).features[0].id).toBe('484g-adjn:main');
});

it('retries the exact road viewport if its buffer exceeds the download budget', async () => {
  const roads = roadSource();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array(25 * 1024 * 1024)))
    .mockImplementation(() => Promise.resolve(roadResponse()));
  vi.stubGlobal('fetch', fetcher);
  const result = await fetchOpenDataOverlay(roads, bounds, undefined, 13);
  expect(result.features[0].id).toBe('484g-adjn:bend');
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('$where')).toBe("intersects(the_geom, 'POLYGON((-61.5 45.8,-61.4 45.8,-61.4 45.9,-61.5 45.9,-61.5 45.8))')");
  await fetchOpenDataOverlay(roads, { ...bounds, east: -61.395 }, undefined, 13);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('does not retain large complete road responses in memory for reuse', async () => {
  const roads = roadSource();
  const json = JSON.stringify({ type: 'FeatureCollection', features: [feature('large')] });
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(json + ' '.repeat(8 * 1024 * 1024))));
  vi.stubGlobal('fetch', fetcher);
  expect((await fetchOpenDataOverlay(roads, bounds, undefined, 13)).features).toHaveLength(1);
  await fetchOpenDataOverlay(roads, bounds, undefined, 13);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

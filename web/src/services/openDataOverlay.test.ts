import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpenDataOverlay } from "./openDataOverlay";

const bounds = { west: -61.5, east: -61.4, south: 45.8, north: 45.9 };
const source = { parts: [{ dataset: "458x-dmz3", fields: ["feat_desc"], where: "feat_desc = 'Falls -  On a single line river point'" }], color: "#0078ff" };
const feature = (id: string) => ({ type: "Feature", geometry: { type: "Point", coordinates: [-61.45, 45.85] }, properties: { source_row_id: id, feat_desc: "Falls" } });
afterEach(() => vi.unstubAllGlobals());
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

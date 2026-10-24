import { afterEach, expect, it, vi } from "vitest";
import { renderOpenData } from "./renderOpenData";
import { composeMapImage } from "../print/pdf/mapCompositor";
const bounds = { west: -62, east: -61, south: 45, north: 46 };
const source = { parts: [{ dataset: "3nka-59nz", fields: ["dnr_id"] }], color: "#268744", fillOpacity: 1 };
const geometry = { type: "Polygon", coordinates: [
  [[-62,45],[-61,45],[-61,46],[-62,46],[-62,45]],
  [[-61.6,45.4],[-61.4,45.4],[-61.4,45.6],[-61.6,45.6],[-61.6,45.4]],
] };
afterEach(() => vi.unstubAllGlobals());
it("preserves holes in the open polygon cartography", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry, properties: { source_row_id: "crown-1" } }] }))));
  const { canvas, count } = await renderOpenData(source, bounds, { width: 200, height: 200 }, 14);
  const context = canvas.getContext("2d")!;
  expect(count).toBe(1);
  expect([...context.getImageData(30,30,1,1).data]).toEqual([38,135,68,255]);
  expect(context.getImageData(100,100,1,1).data[3]).toBe(0);
});
it("includes the open overlay in PDF composition and reports source failure distinctly from empty", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry, properties: { source_row_id: "crown-1" } }] }))).mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const layers = [{ kind: "open-data" as const, id: "crown-lands", name: "Crown Lands", source, opacity: 1 }];
  const rendered = await composeMapImage(bounds, { widthPx: 200, heightPx: 200 }, layers);
  expect(rendered.statuses[0].status).toBe("rendered");
  expect([...rendered.canvas.getContext("2d")!.getImageData(30,30,1,1).data]).toEqual([38,135,68,255]);
  const failed = await composeMapImage(bounds, { widthPx: 200, heightPx: 200 }, layers);
  expect(failed.statuses[0].status).toBe("failed");
});
it("draws a cased line light on a light map and dark on the night map", async () => {
  const line = { type: "LineString", coordinates: [[-62, 45.5], [-61, 45.5]] };
  const cased = { parts: [{ dataset: "yjmz-hpnc", fields: ["feat_desc"] }], color: "#6f3fa6", lineWidth: 2.4, casing: "rgba(255, 255, 255, 1)" };
  const respond = () => vi.fn().mockImplementation(async () => new Response(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: line, properties: { source_row_id: "line-1" } }] })));
  /** The pixels in column 100 from the line's lowest exact-colour row down to 5 px below it. */
  const belowLine = (context: CanvasRenderingContext2D) => {
    let last = -1;
    for (let y = 0; y < 200; y += 1) {
      const [r, g, b] = context.getImageData(100, y, 1, 1).data;
      if (r === 0x6f && g === 0x3f && b === 0xa6) last = y;
    }
    expect(last).toBeGreaterThan(0);
    return Array.from({ length: 5 }, (_, i) => [...context.getImageData(100, last + 1 + i, 1, 1).data]);
  };
  vi.stubGlobal("fetch", respond());
  const day = belowLine((await renderOpenData(cased, bounds, { width: 200, height: 200 }, 14)).canvas.getContext("2d")!);
  expect(day.some(([r, g, b, a]) => Math.min(r, g, b) > 200 && a > 200)).toBe(true);
  vi.stubGlobal("fetch", respond());
  const night = belowLine((await renderOpenData(cased, bounds, { width: 200, height: 200 }, 14, undefined, { night: true })).canvas.getContext("2d")!);
  expect(night.some(([r, g, b, a]) => Math.max(r, g, b) < 40 && a > 100)).toBe(true);
  expect(night.some(([r, g, b, a]) => Math.min(r, g, b) > 200 && a > 200)).toBe(false);
});

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

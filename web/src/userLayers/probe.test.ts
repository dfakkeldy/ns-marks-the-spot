import { describe, expect, it, vi } from "vitest";
import { probeLayer } from "./probe";
import type { UserLayerRecord } from "./types";
describe("probe licence gate", () => {
  it("makes no requests before acceptance or for a query-locked source", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const aerial = { url: "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer", kind: "arcgis-map" } as UserLayerRecord;
    await expect(probeLayer(aerial, false, { lat: 46, lng: -61 }, 10)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
  });
});

describe("probe diagnostics", () => {
  it("distinguishes HTTP failures from projection refusal", async () => {
    class FailedImage { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { queueMicrotask(() => this.onerror?.()); } removeAttribute() {} }
    vi.stubGlobal("Image", FailedImage);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const layer = { url: "https://example.org/wms", kind: "wms", minZoom: 0, maxNativeZoom: 19, tileSize: 256 } as UserLayerRecord;
    try {
      fetchSpy.mockResolvedValueOnce(new Response("missing", { status: 404 }));
      expect((await probeLayer(layer, true, { lat: 46, lng: -61 }, 10)).diagnostic).toContain("HTTP 404");
      fetchSpy.mockResolvedValueOnce(new Response("<ServiceException>InvalidCRS</ServiceException>", { headers: { "content-type": "text/xml" } }));
      expect((await probeLayer(layer, true, { lat: 46, lng: -61 }, 10)).diagnostic).toContain("projection");
    } finally { fetchSpy.mockRestore(); vi.unstubAllGlobals(); }
  });
});

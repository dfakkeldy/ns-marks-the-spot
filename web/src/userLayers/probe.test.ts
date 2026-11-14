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

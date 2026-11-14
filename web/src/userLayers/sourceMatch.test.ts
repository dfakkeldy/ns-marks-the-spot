import { describe, expect, it, vi } from "vitest";
import { infrastructureLayers } from "../layers/infrastructureLayers";
import { fletcherTileUrl } from "../layers/fletcherLayer";
import { nativeProvinceLayerCatalog, provinceLayerCatalog, zoningLayerCatalog } from "../layers/layerCatalog";
import { reproductionLockReason } from "../licensing/layerUse";
import { matchCatalogueSource, sourceKey, userLayerUse } from "./sourceMatch";
import type { UserLayerRecord } from "./types";

const aerial = "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer";
const record = (url: string) => ({ url } as UserLayerRecord);
describe("catalogue matching", () => {
  it("recognizes service, WMS, export and tile variants on either host", () => {
    for (const url of [aerial, `${aerial}/export?token=secret`, `${aerial}/tile/{z}/{y}/{x}`, aerial.replace("/rest/services/", "/services/") + "/WMSServer", aerial.replace("nsgiwa.", "nsgiwa2.")]) {
      expect(sourceKey(url)).toBe(sourceKey(aerial));
      expect(matchCatalogueSource(url).map(x => x.layerId)).toContain("ns-aerial");
    }
  });
  it("holds restricted imagery, excluded forestry and Fletcher", () => {
    expect(userLayerUse(record(aerial)).view).toBe("needs-acceptance");
    expect(userLayerUse(record(aerial), "same-lock", true)).toMatchObject({ view: "allowed", export: "held", reason: reproductionLockReason("ns-aerial") });
    expect(userLayerUse(record("https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_WetAreasMapping_UT83/MapServer"), "same-lock", true).view).toBe("refused");
    expect(userLayerUse(record(fletcherTileUrl()!)).export).toBe("held");
  });
  it("keeps restricted raster and municipal query locks", () => {
    const roads = nativeProvinceLayerCatalog.find(x => x.id === "roads")!;
    expect(userLayerUse(record(roads.serviceUrl), "same-lock", true).export).toBe("held");
    const zoning = zoningLayerCatalog.find(x => x.id === "zoning-inverness")!;
    expect(userLayerUse(record(zoning.serviceUrl), "same-lock", true).view).toBe("refused");
    expect(userLayerUse(record("https://tiles.example.org/{z}/{x}/{y}.png")).export).toBe("allowed");
  });
  it("matches original infrastructure and distinct open replacements", () => {
    const original = infrastructureLayers.find(x => x.serviceUrl.includes("BASE_NSTDB_10k_Utilities_UT83"))!;
    expect(userLayerUse(record(original.serviceUrl)).view).toBe("needs-acceptance");
    expect(userLayerUse(record(original.serviceUrl), "same-lock", true).export).toBe("held");
    const roads = provinceLayerCatalog.find(x => x.id === "roads")!;
    expect(matchCatalogueSource(roads.serviceUrl).map(x => x.layerId)).toContain("roads");
    expect(userLayerUse(record(roads.serviceUrl), "same-lock", true).export).toBe("allowed");
  });
  it("normalizes benign host and path variants, and fails closed for unimplemented policies", () => {
    expect(sourceKey(aerial.replace("nsgiwa.novascotia.ca/", "nsgiwa.novascotia.ca./").replace("/BASE/", "//BASE//"))).toBe(sourceKey(aerial));
    expect(sourceKey(aerial.replace(".ca/", ".ca:6443/"))).toBe(sourceKey(aerial));
    for (const policy of ["owner-build", "user-responsibility"] as const) expect(userLayerUse(record("https://tiles.example.org/{z}/{x}/{y}.png"), policy).view).toBe("refused");
  });
  it("holds configured canopy tiles without matching the lookup service", async () => {
    vi.stubEnv("VITE_CHM_TILE_BASE_URL", "http://localhost:8080/canopy");
    vi.resetModules();
    try {
      const { lidarCanopyLayer } = await import("../layers/lidarCanopy");
      const { userLayerUse: matchUse } = await import("./sourceMatch");
      expect(matchUse(record(lidarCanopyLayer.tileUrl!), "same-lock", true).export).toBe("held");
      expect(matchUse(record(lidarCanopyLayer.serviceUrl), "same-lock", true).matched.some(x => x.layerId === "lidar-canopy-height")).toBe(false);
    } finally { vi.unstubAllEnvs(); vi.resetModules(); }
  });
  it("holds historical Fletcher revisions without claiming other tiles", () => {
    const old = "https://tiles.kinnokilabs.com/fletcher-seams-20250101/{z}/{x}/{y}.png";
    expect(userLayerUse(record(old), "same-lock", true).export).toBe("held");
    expect(matchCatalogueSource("https://tiles.kinnokilabs.com/other/{z}/{x}/{y}.png")).toEqual([]);
  });
  it("does not crash on an invalid Fletcher hosting configuration", async () => {
    vi.stubEnv("VITE_FLETCHER_TILE_BASE_URL", "javascript:bad"); vi.resetModules();
    try {
      const { userLayerUse: check } = await import("./sourceMatch");
      expect(check(record("https://tiles.example.org/{z}/{x}/{y}.png")).view).toBe("allowed");
    } finally { vi.unstubAllEnvs(); vi.resetModules(); }
  });
  it("does not conflate ArcGIS Online account paths", () => {
    expect(sourceKey("https://services.arcgis.com/a/arcgis/rest/services/foo/MapServer")).not.toBe(sourceKey("https://services.arcgis.com/b/arcgis/rest/services/foo/MapServer"));
  });
});

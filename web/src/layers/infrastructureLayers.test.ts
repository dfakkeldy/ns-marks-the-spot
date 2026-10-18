import { describe, expect, it } from "vitest";
import { PROVINCE_LICENSE_URL } from "../licensing/provinceLicense";
import { arcGISExportUrlForTile } from "./arcGISExport";
import type { ContextLayerDescriptor } from "./contextLayerTypes";
import { infrastructureLayers } from "./infrastructureLayers";

type Selection = {
  id: number;
  source: { type: string; mapLayerId: number };
  definitionExpression: string;
  drawingInfo?: unknown;
};
const catalog: readonly ContextLayerDescriptor[] = infrastructureLayers;
function layer(id: string) {
  const descriptor = catalog.find((entry) => entry.id === id);
  if (!descriptor) throw new Error(`Missing infrastructure layer: ${id}`);
  return descriptor;
}
function selections(id: string): Selection[] {
  return JSON.parse(layer(id).exportOptions.dynamicLayers ?? "[]");
}
function descriptions(id: string) {
  return selections(id).flatMap(({ definitionExpression }) =>
    Array.from(definitionExpression.matchAll(/'((?:[^']|'')*)'/g), (match) => match[1].replaceAll("''", "'")),
  );
}

describe("NSTDB infrastructure and mapped places", () => {
  it("uses an opaque provincial topographic background below research overlays", () => {
    const background = layer("ns-topographic");
    expect(background.category).toBe("background-maps");
    expect(background.serviceUrl).toContain("BASE_NSTDB_10k_Colour_UT83");
    expect(background.exportOptions).toEqual({ transparent: false });
    expect(background.opacity).toBe(1);
    expect(background.zIndex).toBe(145);
  });

  it("keeps direct NSTDB services gated, attributed and dated separately from open downloads", () => {
    expect(new Set(catalog.map(({ id }) => id)).size).toBe(catalog.length);
    for (const descriptor of catalog) {
      expect(descriptor.licence).toBe("province-restricted");
      expect(descriptor.licenceUrl).toBe(PROVINCE_LICENSE_URL);
      expect(descriptor.sourceUrl).toBe(descriptor.serviceUrl);
      expect(descriptor.sourceDate).toContain("capture dates vary");
      expect(descriptor.scale).toContain("1:10,000");
      expect(descriptor.coverage).toContain("omissions are not evidence of absence");
      expect(descriptor.maxZoom).toBe(23);
      expect(descriptor.maxNativeZoom).toBe(19);
    }
  });

  it("forwards exact class filters through the real image-export URL and excludes callout duplicates", () => {
    for (const descriptor of catalog.filter(({ id }) => id !== "ns-topographic")) {
      const url = new URL(arcGISExportUrlForTile(
        { serviceUrl: descriptor.serviceUrl, ...descriptor.exportOptions },
        { x: 10697, y: 23718, z: 16 },
      ));
      expect(url.searchParams.get("f")).toBe("image");
      expect(url.searchParams.get("transparent")).toBe("true");
      expect(url.searchParams.get("format")).toBe("png32");
      const selected: Selection[] = JSON.parse(url.searchParams.get("dynamicLayers") ?? "[]");
      expect(selected).toEqual(selections(descriptor.id));
      expect(selected.length).toBeGreaterThan(0);
      for (const selection of selected) {
        expect(selection.source.type).toBe("mapLayer");
        expect(selection.source.mapLayerId).not.toBe(0);
        expect(selection.id).toBe(selection.source.mapLayerId);
        expect(selection.definitionExpression).toMatch(/^FEAT_DESC IN \('/);
        expect(selection.definitionExpression).not.toMatch(/LIKE| OR |1=1/);
        expect(selection.drawingInfo).toBeUndefined();
      }
      expect(descriptor.legend.map(({ label }) => label)).toEqual(descriptions(descriptor.id));
      expect(descriptor.zIndex).toBeGreaterThanOrEqual(185);
      expect(descriptor.zIndex).toBeLessThanOrEqual(245);
    }
  });

  it("separates electricity from pipelines and keeps overhead/underground source classes", () => {
    expect(descriptions("transmission-lines")).toEqual(["TRANSMISSION LINE (electrical) line"]);
    expect(descriptions("pipelines")).toEqual([
      "PIPELINE (cross country) line",
      "PIPELINE (cross country) overhead line",
      "PIPELINE (cross country) underground line",
    ]);
    expect(descriptions("substations")).toEqual([
      "SUBSTATION (transformer) polygon", "SUBSTATION (transformer) point",
    ]);
    expect(descriptions("tanks")).toContain("TANK indefinite/approximate point");
    expect(descriptions("towers")).toContain("TOWER (all except transmission line towers) indefinite/approximate point");
  });

  it("preserves the source's significant double space in sewage pond values", () => {
    expect(descriptions("sewage-settling-ponds")).toEqual([
      "SEWAGE SETTLING POND  (over 15m diameter) polygon",
      "SEWAGE SETTLING POND  (6-15m diameter) point",
    ]);
    expect(descriptions("sewage-treatment-plants")).toEqual(["SEWAGE TREATMENT PLANT polygon"]);
  });

  it("does not misclassify reclamation fill as waste or inactive workings as current", () => {
    expect(descriptions("waste-salvage-sites")).toEqual([
      "DUMP / SANITARY LANDFILL polygon", "AUTO SALVAGE YARD polygon",
    ]);
    const workings = descriptions("pits-quarries-surface-workings");
    for (const type of ["PIT", "QUARRY", "MINE/OPEN PIT"]) {
      expect(workings).toContain(`${type} polygon`);
      expect(workings).toContain(`${type} ruin/inactive/abandoned polygon`);
    }
    expect(workings).toHaveLength(8);
    expect(workings).not.toContain("MINE UNDERGROUND polygon");
  });

  it("uses water-theme coastal structures once and preserves construction/inactive wharves", () => {
    expect(layer("wharves-coastal-structures").serviceUrl).toContain("10k_Water_UT83");
    expect(selections("wharves-coastal-structures").map(({ source }) => source.mapLayerId)).toEqual([6, 3]);
    expect(descriptions("wharves-coastal-structures")).toEqual([
      "Breakwater polygon", "Dry Dock polygon", "Slipway polygon", "Wharf polygon",
      "Wharf - Ruin/Inactive/Abandoned polygon", "Wharf - Under Construction polygon",
      "Breakwater line", "Wharf - Single Line",
    ]);
  });

  it("includes all requested mapped places without implying public access", () => {
    for (const id of ["mapped-gates", "campgrounds", "cemeteries", "lookouts-rest-areas", "shooting-ranges"]) {
      expect(layer(id).category).toBe("roads-places");
      expect(layer(id).webCaveat).toMatch(/permission|right of access/);
    }
    expect(descriptions("mapped-gates")).toContain("GATE indefinite/approximate point");
    expect(descriptions("campgrounds")).toEqual(["CAMPGROUND polygon"]);
    expect(descriptions("cemeteries")).toEqual(["CEMETERY polygon"]);
    expect(descriptions("shooting-ranges")).toEqual(["SHOOTING RANGE polygon"]);
    expect(descriptions("lookouts-rest-areas")).toHaveLength(4);
    expect(descriptions("lookouts-rest-areas").every((value) => /^(SCENIC LOOKOUT|REST AREA) (paved|unpaved) \(along highways\) polygon$/.test(value))).toBe(true);
  });
});

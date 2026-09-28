import { describe, expect, it } from "vitest";
import { communityResearchLayers } from "./communityResearchLayers";
import type { ContextLayerDescriptor } from "./contextLayerTypes";
import { openDataQuery } from "../services/openDataOverlay";

describe("community research source receipts", () => {
  it("keeps source IDs unique and publicly attributable", () => {
    expect(new Set(communityResearchLayers.map(({ id }) => id)).size).toBe(communityResearchLayers.length);
    for (const layer of communityResearchLayers) {
      expect(layer.sourceUrl).toMatch(/^https:\/\//);
      expect(layer.licenceUrl).toMatch(/^https:\/\//);
      expect(layer.sourceDate).toMatch(/202[456]/);
      expect(layer.zIndex).toBeLessThan(300);
    }
  });

  it("queries traffic section geometry within the visible bounds without implying joined counts", () => {
    const layer: ContextLayerDescriptor | undefined = communityResearchLayers.find(({ id }) => id === "traffic-survey-sections");
    expect(layer?.openData?.parts).toHaveLength(1);
    const query = new URL(openDataQuery(layer!.openData!.parts[0], {
      west: -61.52, south: 45.69, east: -61.28, north: 45.9,
    }, 0, 13));
    expect(query.pathname).toBe("/resource/vg5n-eehf.geojson");
    expect(query.searchParams.get("$where")).toContain("intersects(the_geom");
    expect(query.searchParams.get("$select")).toContain("section_id");
    expect(query.searchParams.get("$select")).not.toMatch(/aadt|ptrucks/);
  });

  it("keeps heritage public record identity separate from private parcel fields", () => {
    const layer: ContextLayerDescriptor | undefined = communityResearchLayers.find(({ id }) => id === "registered-heritage-properties");
    expect(layer?.vectorSource?.kind).toBe("socrata-points");
    expect(layer?.outFields).toContain("unique_identifier_file_no");
    expect(layer?.outFields).not.toContain("pid");
    expect(layer?.outFields).not.toContain("civic_address");
  });

  it("identifies the NPRI reporting year and facility record without inventing pollution values", () => {
    const layer: ContextLayerDescriptor | undefined = communityResearchLayers.find(({ id }) => id === "npri-reporting-facilities-2024");
    expect(layer?.idField).toBe("OBJECTID_1");
    expect(layer?.outFields).toEqual(["OBJECTID_1", "NpriID", "FacilityName", "CompanyName", "ReportYear", "SectorDescriptionEn"]);
    expect(layer?.sourceDate).toContain("2024 reporting year");
    expect(layer?.webCaveat).toContain("does not show pollutant quantities");
  });
});

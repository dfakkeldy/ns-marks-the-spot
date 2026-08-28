import { describe, expect, it } from "vitest";
import { zoningLayerCatalog } from "../layers/layerCatalog";
import { describeZoningFeature, zoningFeatureLabel } from "./zoning";

const layerById = (id: string) => {
  const layer = zoningLayerCatalog.find((entry) => entry.id === id);
  if (!layer) {
    throw new Error(`missing zoning layer ${id}`);
  }
  return layer;
};

describe("zoning feature descriptions", () => {
  it("strips the code Inverness and Victoria repeat inside the zone name", () => {
    expect(
      describeZoningFeature(
        { Zone: "CR", ZONETYPE: "CR Commercial Recreation", PLAN_: "Inverness County" },
        layerById("zoning-inverness"),
      ),
    ).toEqual({
      code: "CR",
      name: "Commercial Recreation",
      planArea: "Inverness County",
    });
  });

  it("keeps a Richmond name that does not repeat the code", () => {
    expect(
      describeZoningFeature(
        { Zone: "AP", ZONETYPE: "Agricultural Potential", PLAN_: "Plan Richmond" },
        layerById("zoning-richmond"),
      ),
    ).toEqual({
      code: "AP",
      name: "Agricultural Potential",
      planArea: "Plan Richmond",
    });
  });

  it("strips the trailing bracketed code Cumberland appends", () => {
    expect(
      describeZoningFeature(
        { ZONE: "AG", ZoneName: "Agriculture (AG)" },
        layerById("zoning-cumberland"),
      ),
    ).toEqual({ code: "AG", name: "Agriculture", planArea: null });
  });

  it("reads Halifax's separate code and description fields", () => {
    expect(
      describeZoningFeature(
        { ZONE: "MRR-1", DESCRIPTION: "Mixed Rural Residential", BYLAW_ID: 20 },
        layerById("zoning-halifax"),
      ),
    ).toEqual({ code: "MRR-1", name: "Mixed Rural Residential", planArea: null });
  });

  it("treats blank and missing attributes as absent rather than empty text", () => {
    // Richmond returns a single space for unset plan-area style fields.
    expect(
      describeZoningFeature(
        { Zone: "AP", ZONETYPE: "Agricultural Potential", PLAN_: " " },
        layerById("zoning-richmond"),
      ).planArea,
    ).toBeNull();

    expect(
      describeZoningFeature({}, layerById("zoning-inverness")),
    ).toEqual({ code: null, name: null, planArea: null });
  });

  it("keeps hostile attribute values as literal text for the caller to escape", () => {
    const description = describeZoningFeature(
      { ZONE: "<script>alert(1)</script>", DESCRIPTION: "Mixed Use" },
      layerById("zoning-halifax"),
    );

    expect(description.code).toBe("<script>alert(1)</script>");
    expect(zoningFeatureLabel(description)).toBe(
      "<script>alert(1)</script> — Mixed Use",
    );
  });
});

describe("zoning feature labels", () => {
  it("joins the code and name when both are present", () => {
    expect(
      zoningFeatureLabel({ code: "RG", name: "Rural General", planArea: null }),
    ).toBe("RG — Rural General");
  });

  it("falls back to whichever value the source published", () => {
    expect(
      zoningFeatureLabel({ code: "RG", name: null, planArea: null }),
    ).toBe("RG");
    expect(
      zoningFeatureLabel({ code: null, name: "Rural General", planArea: null }),
    ).toBe("Rural General");
    expect(
      zoningFeatureLabel({ code: null, name: null, planArea: null }),
    ).toBe("Zone not stated");
  });
});

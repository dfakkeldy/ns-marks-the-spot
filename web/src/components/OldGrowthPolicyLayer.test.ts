import { describe, expect, it } from "vitest";
import { forestryLayerCatalog } from "../layers/layerCatalog";
import {
  buildOldGrowthPolicyPopup,
  oldGrowthPolicyStyle,
} from "./oldGrowthPolicyPresentation";

const layer = forestryLayerCatalog[0];

describe("old-growth policy rendering", () => {
  it("uses a distinct map style for every policy status", () => {
    expect(
      oldGrowthPolicyStyle({ old_growth: "1" }, layer, "interactive"),
    ).toMatchObject({
      color: layer.statusColors.confirmedOldGrowth,
      fillColor: layer.statusColors.confirmedOldGrowth,
    });
    expect(
      oldGrowthPolicyStyle({ old_growth: "2" }, layer, "interactive"),
    ).toMatchObject({
      color: layer.statusColors.restorationOpportunity,
      fillColor: layer.statusColors.restorationOpportunity,
    });
    expect(
      oldGrowthPolicyStyle({ old_growth: "0" }, layer, "interactive"),
    ).toMatchObject({
      color: layer.statusColors.unknown,
      fillColor: layer.statusColors.unknown,
      fillOpacity: 0.22,
      dashArray: "4 3",
    });
  });

  it("builds a safe, sourced popup without promoting the polygon to a complete inventory", () => {
    const popup = buildOldGrowthPolicyPopup(
      {
        old_growth: "1",
        hectares: "12.45",
        selmethtxt: "<script>Desktop analysis</script>",
      },
      layer,
    );

    expect(popup.textContent).toContain("Confirmed old growth");
    expect(popup.textContent).toContain("12.45 ha");
    expect(popup.textContent).toContain(
      "<script>Desktop analysis</script>",
    );
    expect(popup.textContent).toContain("not a complete inventory");
    expect(popup.querySelector("script")).toBeNull();
    expect(popup.querySelector("a")).toHaveAttribute(
      "href",
      layer.sourceUrl,
    );
  });
});

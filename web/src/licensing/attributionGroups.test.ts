import { describe, expect, it } from "vitest";
import { contextLayerCatalog } from "../layers/contextLayerCatalog";
import { COASTAL_HAZARD_NOTICES } from "../layers/layerCatalog";
import { groupAttributions, OPEN_LICENCE_NOVA_SCOTIA } from "./attributionGroups";
import { OPEN_GOVERNMENT_ATTRIBUTION, PROVINCE_ATTRIBUTION } from "./provinceLicense";

const canada = "Contains information licensed under the Open Government Licence – Canada.";

describe("groupAttributions", () => {
  it("states a shared licence once, with each source named under it", () => {
    const { groups, other } = groupAttributions([
      `${OPEN_LICENCE_NOVA_SCOTIA} Source: Nova Scotia Hydrographic Network, Province of Nova Scotia.`,
      "Source: Nova Scotia Public Works, Structures Database; Open Government Licence – Nova Scotia.",
      OPEN_GOVERNMENT_ATTRIBUTION,
      OPEN_GOVERNMENT_ATTRIBUTION,
      `${canada} Source: Water Survey of Canada hydrometric station inventory, Environment and Climate Change Canada.`,
    ]);
    expect(other).toEqual([]);
    expect(groups).toEqual([
      {
        licence: OPEN_LICENCE_NOVA_SCOTIA,
        sources: [
          "Source: Nova Scotia Hydrographic Network, Province of Nova Scotia.",
          "Source: Nova Scotia Public Works, Structures Database.",
        ],
      },
      { licence: canada, sources: ["Source: Water Survey of Canada hydrometric station inventory, Environment and Climate Change Canada."] },
    ]);
  });

  it("keeps a sentence that follows the licence in a source-first credit", () => {
    const { groups } = groupAttributions([
      "Environment and Climate Change Canada, Canadian Wildlife Service; Open Government Licence – Canada. The inventory harmonizes underlying provincial and other source datasets.",
    ]);
    expect(groups[0].sources).toEqual([
      "Source: Environment and Climate Change Canada, Canadian Wildlife Service. The inventory harmonizes underlying provincial and other source datasets.",
    ]);
  });

  it("names a source that carries the Province licence under that licence", () => {
    expect(groupAttributions([`Elections Nova Scotia (GeoNOVA). ${PROVINCE_ATTRIBUTION}`]).groups).toEqual([
      { licence: PROVINCE_ATTRIBUTION, sources: ["Elections Nova Scotia (GeoNOVA)."] },
    ]);
  });

  it("leaves an unrecognised credit whole, and only drops an exact repeat", () => {
    const eox = "EOxCloudless — https://cloudless.eox.at by EOX IT Services GmbH · CC BY 4.0";
    expect(groupAttributions([eox, eox]).other).toEqual([eox]);
  });

  it("keeps a licence heading asked for when no plain-text credit names it", () => {
    expect(groupAttributions([], [OPEN_LICENCE_NOVA_SCOTIA]).groups).toEqual([{ licence: OPEN_LICENCE_NOVA_SCOTIA, sources: [] }]);
  });

  it("loses no source from any real catalogue credit or coastal notice", () => {
    const lines = [
      ...contextLayerCatalog.flatMap((layer) => (layer.attribution ? [layer.attribution] : [])),
      ...COASTAL_HAZARD_NOTICES,
    ];
    const { groups, other } = groupAttributions(lines);
    const printed = [...groups.flatMap(({ licence, sources }) => [licence, ...sources]), ...other].join("\n");
    for (const line of lines) {
      // Every word of every credit survives apart from the licence wording
      // the group heading now states.
      const stripped = line
        .replace(/Contains information licensed under the Open Government Licence – (Nova Scotia|Canada)\.?/u, "")
        .replace(/; Open Government Licence – (Nova Scotia|Canada)\./u, "")
        .replace(PROVINCE_ATTRIBUTION, "")
        .replace(/^Source: /u, "")
        .trim();
      for (const word of stripped.split(/\s+/u)) expect(printed).toContain(word);
    }
    expect(new Set(printed.split("\n")).size).toBe(printed.split("\n").length);
  });
});

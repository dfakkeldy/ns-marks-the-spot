import { describe, expect, it } from "vitest";
import type { PdfRegistrationCandidate } from "../types";
import type { GeoPdfMetadataExtraction } from "./geoPdfMetadata";
import {
  selectGeoPdfFrame,
  type ApprovedGeoPdfRule,
} from "./geoPdfFrameSelection";

function candidate(
  id: string,
  embeddedLabel = id,
  flavor: "measure" | "lgidict" = "measure",
): PdfRegistrationCandidate {
  return {
    id,
    flavor,
    embeddedLabel,
    sourceRect: { x: 0, y: 0, width: 100, height: 80 },
    gcps: [
      { id: `${id}-1`, pixel: { x: 0, y: 0 }, map: { lat: 46, lng: -63 } },
      { id: `${id}-2`, pixel: { x: 100, y: 0 }, map: { lat: 46, lng: -62 } },
      { id: `${id}-3`, pixel: { x: 0, y: 80 }, map: { lat: 45, lng: -63 } },
    ],
  };
}

const labels = [
  "Adjoining Sheet Diagram",
  "Map Layers",
  "Quadrangle Location",
];

function extraction(
  candidates: PdfRegistrationCandidate[],
  overrides: Partial<GeoPdfMetadataExtraction> = {},
): GeoPdfMetadataExtraction {
  return {
    producer: "Esri ArcSOC 10.8.1.14362",
    pageStructure: {
      family: "measure",
      structureId: "measure-vp-geo-v1",
      completeLabels: labels,
      registrationCount: 3,
    },
    candidates,
    rejected: [],
    ...overrides,
  };
}

const approvedRule: ApprovedGeoPdfRule = {
  ruleId: "usgs-ustopo-map-layers-v1",
  producer: "Esri ArcSOC 10.8.1.14362",
  family: "measure",
  structureId: "measure-vp-geo-v1",
  registrationCount: 3,
  completeLabels: labels,
};

const threeCandidates = [
  candidate("main", "Map Layers"),
  candidate("location", "Quadrangle Location"),
  candidate("adjoining", "Adjoining Sheet Diagram"),
];

describe("selectGeoPdfFrame", () => {
  it("selects the only independently valid registration", () => {
    expect(selectGeoPdfFrame(extraction([candidate("map")]))).toMatchObject({
      status: "automatic",
      selection: { kind: "sole" },
      selected: { id: "map" },
    });
  });

  it("preserves all candidates when no exact producer rule matches", () => {
    expect(
      selectGeoPdfFrame(
        extraction(threeCandidates, { producer: "Unknown producer" }),
      ),
    ).toMatchObject({
      status: "selection-required",
      candidates: [{ id: "main" }, { id: "location" }, { id: "adjoining" }],
    });
  });

  it("uses fixed diagnostic precedence when no candidate is valid", () => {
    expect(
      selectGeoPdfFrame(
        extraction([], {
          pageStructure: null,
          rejected: [
            { flavor: "measure", reason: "unsupported-crs" },
            { flavor: "measure", reason: "invalid" },
          ],
        }),
      ),
    ).toEqual({ status: "manual", reason: "invalid" });
  });

  it("selects exactly one Map Layers frame for an approved exact signature", () => {
    expect(
      selectGeoPdfFrame(extraction(threeCandidates), [approvedRule]),
    ).toMatchObject({
      status: "automatic",
      selection: {
        kind: "producer-rule",
        ruleId: "usgs-ustopo-map-layers-v1",
      },
      selected: { id: "main" },
    });
  });

  it("does not use candidate order or rectangle size as a rank", () => {
    const changed = [
      { ...threeCandidates[2], sourceRect: { x: 0, y: 0, width: 1, height: 1 } },
      { ...threeCandidates[0], sourceRect: { x: 0, y: 0, width: 5, height: 5 } },
      threeCandidates[1],
    ];
    expect(
      selectGeoPdfFrame(extraction(changed), [approvedRule]),
    ).toMatchObject({ status: "automatic", selected: { id: "main" } });
  });

  it.each([
    ["producer", { producer: "Esri ArcSOC 10.8.1" }],
    [
      "family",
      {
        pageStructure: {
          ...extraction([]).pageStructure!,
          family: "lgidict" as const,
        },
      },
    ],
    [
      "structure",
      {
        pageStructure: {
          ...extraction([]).pageStructure!,
          structureId: "measure-other",
        },
      },
    ],
    [
      "complete label multiset",
      {
        pageStructure: {
          ...extraction([]).pageStructure!,
          completeLabels: ["Map Layers", "Quadrangle Location"],
        },
      },
    ],
  ])("refuses a %s-only near match", (_name, overrides) => {
    expect(
      selectGeoPdfFrame(extraction(threeCandidates, overrides), [approvedRule]),
    ).toMatchObject({ status: "selection-required" });
  });

  it("refuses duplicate Map Layers candidates", () => {
    const duplicate = [
      threeCandidates[0],
      candidate("second-main", "Map Layers"),
      threeCandidates[2],
    ];
    expect(
      selectGeoPdfFrame(extraction(duplicate), [approvedRule]),
    ).toMatchObject({ status: "selection-required" });
  });

  it("refuses an exact signature when a sibling was rejected", () => {
    expect(
      selectGeoPdfFrame(
        extraction(threeCandidates.slice(0, 2), {
          rejected: [{ flavor: "measure", reason: "invalid" }],
        }),
        [approvedRule],
      ),
    ).toMatchObject({ status: "selection-required" });
  });
});

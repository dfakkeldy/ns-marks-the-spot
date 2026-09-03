import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  OPEN_GOVERNMENT_ATTRIBUTION,
  OPEN_GOVERNMENT_LICENCE_URL,
} from "../../services/civicAddresses";
import { COASTAL_HAZARD_ATTRIBUTION } from "../../layers/layerCatalog";
import { PVSC_OPEN_DATA_ATTRIBUTION } from "../../services/pvscAssessments";
import { PVSC_DWELLING_DATASET_URL } from "../../services/pvscDwellings";
import {
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_URL,
} from "../../licensing/provinceLicense";
import {
  RUMSEY_ATTRIBUTION,
  RUMSEY_LICENCE_URL,
} from "../../licensing/rumseyLicense";
import {
  PRINT_SOURCE_UNANSWERED,
  type PrintLayerSource,
  type PrintSnapshot,
} from "../../services/printSnapshot";
import { ADJACENT_ROAD_DISTANCE_METRES } from "../../services/parcelContext";
import { PrintFieldDocument } from "./PrintFieldDocument";
import { PrintResearchDocument } from "./PrintResearchDocument";

const shareUrl = "https://example.test/map/?pid=01234567";
const scale = { label: "200 m", metres: 200, pixels: 80 };
const qr = { status: "error" as const };
const readyQr = {
  status: "ready" as const,
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h2v2H0z"/></svg>',
};
const allLayerIds = [
  "modern", "ns-aerial", "nsprd", "crown-lands", "flood-risk", "waterfalls",
  "water-features", "roads", "buildings", "contours", "mineral-occurrences",
  "mineral-tenure", "abandoned-mines", "mineral-proximity-parcels",
  "inverness-hydro-potential", "old-growth-policy", "published-river-flood-zones",
  "coastal-flood-current", "coastal-flood-2050", "coastal-flood-2100",
] as const;
const openStreetMapAttribution = "© OpenStreetMap contributors";
const openStreetMapLicenceUrl = "https://www.openstreetmap.org/copyright";
const unrestrictedProvinceLicenceUrl =
  "https://nsgiwa.novascotia.ca/documents/licenses/unrestricted/unrestrictedLicense.pdf";

const actualFieldCatalogSources: PrintLayerSource[] = [
  ["modern", "Modern map", "Live OpenStreetMap tiles", openStreetMapAttribution, openStreetMapLicenceUrl],
  ["ns-aerial", "NS Aerial", "Imagery dates vary · service checked July 20, 2026", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["nsprd", "NS Property Boundaries", "Live service · checked July 20, 2026", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["crown-lands", "Crown Lands", "Live service · checked July 20, 2026", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["flood-risk", "Watersheds", "Live service · checked July 20, 2026", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["waterfalls", "Waterfalls", "Live service · checked July 20, 2026", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["water-features", "Water features", "Live service · checked July 20, 2026", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["roads", "Roads, trails & culverts", "Live service · checked July 20, 2026", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["buildings", "Buildings", "NSTDB updated May 5, 2026 · service checked July 22, 2026", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["contours", "Contours", "NSTDB updated May 5, 2026 · service checked July 22, 2026", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["mineral-occurrences", "Mineral occurrences", "June 2024 · version 12", OPEN_GOVERNMENT_ATTRIBUTION, OPEN_GOVERNMENT_LICENCE_URL],
  ["mineral-tenure", "Mineral tenure", "Live NovaROC · checked July 20, 2026", OPEN_GOVERNMENT_ATTRIBUTION, OPEN_GOVERNMENT_LICENCE_URL],
  ["abandoned-mines", "Abandoned mine openings", "2024 · version 9", OPEN_GOVERNMENT_ATTRIBUTION, OPEN_GOVERNMENT_LICENCE_URL],
  ["mineral-proximity-parcels", "Properties within 1 km of a mineral occurrence", "Mineral occurrences June 2024 · NSPRD live", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["inverness-hydro-potential", "Inverness micro-hydro screen", "Watersheds 2021 · NSHN retrieved July 21, 2026", OPEN_GOVERNMENT_ATTRIBUTION, OPEN_GOVERNMENT_LICENCE_URL],
  ["old-growth-policy", "Old-growth policy areas", "Policy layer as of October 24, 2025 · updated October 27, 2025", OPEN_GOVERNMENT_ATTRIBUTION, OPEN_GOVERNMENT_LICENCE_URL],
  ["published-river-flood-zones", "Published river flood zones", "NSGC 2006-era mapping · service checked July 22, 2026", PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL],
  ["coastal-flood-current", "Coastal flooding — current", "Live Coastal Hazard Map · checked July 22, 2026", COASTAL_HAZARD_ATTRIBUTION, unrestrictedProvinceLicenceUrl],
  ["coastal-flood-2050", "Coastal flooding — 2050", "Live Coastal Hazard Map · checked July 22, 2026", COASTAL_HAZARD_ATTRIBUTION, unrestrictedProvinceLicenceUrl],
  ["coastal-flood-2100", "Coastal flooding — 2100", "Live Coastal Hazard Map · checked July 22, 2026", COASTAL_HAZARD_ATTRIBUTION, unrestrictedProvinceLicenceUrl],
].map(([id, name, sourceDate, attribution, licenceUrl]) => ({
  id: id as PrintLayerSource["id"],
  name,
  sourceUrl: `https://example.test/catalog/${id}`,
  sourceDate,
  attribution,
  licenceUrl,
}));

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    pid: "01234567",
    taxSaleEnabled: true,
    mode: "current",
    eventIds: ["inverness-2026"],
    events: [{
      id: "inverness-2026",
      name: "Inverness County tax sale",
      status: "Listed in official notice",
      facts: [{ label: "Auction", value: "August 11, 2026" }],
      sources: [{ label: "Official notice", sourceUrl: "https://example.test/notice" }],
      limitation: "Verify the official notice before acting.",
    }],
    template: "research",
    layerIds: ["nsprd", "buildings", "roads"],
    layerSources: [{
      id: "nsprd",
      name: "NS Property Boundaries",
      sourceUrl: "https://example.test/nsprd",
      sourceDate: "Checked July 23, 2026",
      attribution: PROVINCE_ATTRIBUTION,
      licenceUrl: "https://example.test/licence",
    }, {
      id: "buildings",
      name: "Buildings",
      sourceUrl: "https://example.test/buildings",
      sourceDate: "Checked July 23, 2026",
      attribution: PROVINCE_ATTRIBUTION,
      licenceUrl: "https://example.test/licence",
    }, {
      id: "roads",
      name: "Roads, trails & culverts",
      sourceUrl: "https://example.test/roads",
      sourceDate: "Checked July 23, 2026",
      attribution: PROVINCE_ATTRIBUTION,
      licenceUrl: "https://example.test/licence",
    }],
    licenceAccepted: true,
    capturedAt: "2026-07-23T13:42:00.000Z",
    generatedAt: "2026-07-23T13:42:15.000Z",
    selectedParcelGeometry: { type: "FeatureCollection", features: [] },
    mapParcels: { type: "FeatureCollection", features: [] },
    taxSalePids: [],
    historicalTaxSalePids: [],
    viewport: {
      position: { latitude: 46.35, longitude: -61.15, zoom: 15 },
      bounds: { north: 46.4, east: -61.1, south: 46.3, west: -61.2 },
    },
    evidence: {
      mappedArea: { squareMetres: 1000, acres: 0.25, label: "0.25 acres" },
      buildings: { status: "ready", value: { count: 2, pointCount: 1, polygonCount: 1 } },
      assessments: { status: "ready", value: { matchMethod: "spatial", accounts: [] } },
      dwellings: {
        status: "ready",
        value: [{
          aan: "00603988",
          dwellings: [{
            yearBuilt: 2018,
            style: "Two Storey",
            squareFeetLivingArea: 1600,
            livingUnits: 1,
            bathrooms: 2,
            garage: true,
            underConstruction: false,
          }],
        }],
      },
      civicAddresses: {
        status: "ready",
        value: { addresses: [], unreadableRows: 0 },
      },
      mappedContext: { status: "ready", value: { roads: [], water: [] } },
      riverFlood: {
        status: "ready",
        value: { status: "within-published-layer-extent", aep: [] },
      },
      coastalFlood: { status: "ready", value: [] },
      resources: {
        status: "ready",
        value: {
          "mineral-occurrences": { status: "ready", intersections: [] },
          "mineral-tenure": { status: "ready", intersections: [] },
          "abandoned-mines": { status: "ready", intersections: [] },
        },
      },
    },
    ...overrides,
  } as unknown as PrintSnapshot;
}

const map = <div aria-label="Printable map">Captured map</div>;

describe("print documents", () => {
  it("removes current tax-sale presentation from a tax-off research document", () => {
    const { container } = render(
      <PrintResearchDocument
        snapshot={snapshot({
          taxSaleEnabled: false,
          mode: "current",
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(container.querySelector(".print-capture-context")).toHaveTextContent("Map state");
    expect(container).not.toHaveTextContent("Current map state");
    expect(container).not.toHaveTextContent("Historical map state");
    expect(container).not.toHaveTextContent(/tax[- ]sale/i);
    expect(container).not.toHaveTextContent("Listed in official notice");
    const appendix = screen.getByRole("region", { name: "Evidence appendix" });
    expect(within(appendix).getByRole("heading", {
      name: "Mapped parcel area",
    })).toBeInTheDocument();
    expect(within(appendix).getByRole("heading", {
      name: "Assessment accounts",
    })).toBeInTheDocument();
    expect(within(appendix).getByText("PID 01234567")).toBeInTheDocument();
    expect(screen.getByLabelText("Printable map")).toBeInTheDocument();
    const legend = screen.getByLabelText("Active map layers");
    expect(within(legend).getByText("Selected parcel")).toBeInTheDocument();
    expect(within(legend).getByText("NS Property Boundaries")).toBeInTheDocument();
    expect(within(legend).queryByText("Current tax-sale parcel")).not.toBeInTheDocument();
    expect(legend.querySelector(".print-layer-symbol--current-tax-sale")).toBeNull();
  });

  it("removes historical tax-sale presentation from a tax-off field document", () => {
    const { container } = render(
      <PrintFieldDocument
        snapshot={snapshot({
          taxSaleEnabled: false,
          mode: "historical",
          template: "field",
        })}
        map={map}
        includeAerial={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(container.querySelector(".print-capture-context")).toHaveTextContent("Map state");
    expect(container).not.toHaveTextContent("Current map state");
    expect(container).not.toHaveTextContent("Historical map state");
    expect(container).not.toHaveTextContent(/tax[- ]sale/i);
    expect(container).not.toHaveTextContent("Listed in official notice");
    expect(screen.getByText("PID 01234567")).toBeInTheDocument();
    expect(screen.getByLabelText("Printable map")).toBeInTheDocument();
    const legend = screen.getByLabelText("Active map layers");
    expect(within(legend).getByText("Selected parcel")).toBeInTheDocument();
    expect(within(legend).getByText("NS Property Boundaries")).toBeInTheDocument();
    expect(within(legend).queryByText("Historical tax-sale parcel")).not.toBeInTheDocument();
    expect(legend.querySelector(".print-layer-symbol--historical-tax-sale")).toBeNull();
  });

  it("prints Fletcher imagery attribution and licence as a separate map source", () => {
    const fletcherSource: PrintLayerSource = {
      id: "fletcher",
      name: "Fletcher",
      sourceUrl:
        "https://tiles.example.test/fletcher-direct-rumsey-20260828.1/source.json",
      sourceDate: "Hugh Fletcher · 1882–1884 source sheets",
      attribution: RUMSEY_ATTRIBUTION,
      licenceUrl: RUMSEY_LICENCE_URL,
    };

    render(
      <PrintResearchDocument
        snapshot={snapshot({
          layerIds: ["fletcher"],
          layerSources: [fletcherSource],
        })}
        map={map}
        includeAerial={false}
        includeAppendix={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["fletcher"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(screen.getByText(RUMSEY_ATTRIBUTION)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Fletcher licence" }),
    ).toHaveAttribute("href", RUMSEY_LICENCE_URL);
    expect(
      screen
        .getByLabelText("Active map layers")
        .querySelector('[data-symbol-kind="historical-raster"]'),
    ).toBeInTheDocument();
  });

  it("renders a research summary with sealed evidence, licence material, and no browser location", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot()}
        map={map}
        includeAerial={false}
        includeAppendix={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={readyQr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(screen.getByText("PID 01234567")).toBeInTheDocument();
    expect(screen.getByText("Mapped buildings")).toBeInTheDocument();
    expect(screen.getByText("Assessment: 0 accounts captured")).toBeInTheDocument();
    expect(
      screen.getByText("Dwelling characteristics: 1 account captured"),
    ).toBeInTheDocument();
    expect(screen.getByText("RESEARCH")).toBeInTheDocument();
    expect(screen.getByText("23 Jul 2026 · 13:42 UTC")).toBeInTheDocument();
    expect(screen.getByText("23 Jul 2026 · 13:42 UTC").closest("time")).toHaveAttribute(
      "datetime",
      "2026-07-23T13:42:15.000Z",
    );
    expect(
      document.querySelector(".print-research-summary > .print-pattern-definitions"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "QR code for this exact map state" }),
    ).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
    expect(document.querySelector(".print-qr svg")).not.toBeInTheDocument();
    expect(document.querySelector(".print-capture-context")).toHaveTextContent("Current map stateInverness County tax sale: Listed in official notice");
    expect(screen.getByText(PROVINCE_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByText(OPEN_GOVERNMENT_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByText(PVSC_OPEN_DATA_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Civic address evidence licence" })).toHaveAttribute("href", OPEN_GOVERNMENT_LICENCE_URL);
    expect(screen.getByText("Screening evidence only.")).toBeInTheDocument();
    expect(screen.queryByText(/browser location/iu)).not.toBeInTheDocument();
  });

  it("uses bounded wording for a valid empty building result", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            buildings: {
              status: "ready",
              value: { count: 0, pointCount: 0, polygonCount: 0 },
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={[]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    const facts = screen.getByLabelText("Parcel facts");
    expect(within(facts).getByText("No mapped building feature returned."))
      .toBeInTheDocument();
    expect(within(facts).queryByText("0")).not.toBeInTheDocument();
  });

  it("keeps non-empty building point and polygon counts precise", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot()}
        map={map}
        includeAerial={false}
        includeAppendix={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={[]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(
      within(screen.getByLabelText("Parcel facts")).getByText(
        "2 mapped features (1 point, 1 polygon).",
      ),
    ).toBeInTheDocument();
  });

  it("keeps PVSC and open-data provenance for unavailable evidence", () => {
    const unavailableEvidence = {
      ...snapshot().evidence,
      assessments: { status: "error", message: "offline" },
      civicAddresses: { status: "error", message: "offline" },
      resources: { status: "error", message: "offline" },
    };
    const { rerender } = render(
      <PrintResearchDocument
        snapshot={snapshot({ evidence: unavailableEvidence })}
        map={map}
        includeAerial={false}
        includeAppendix={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={[]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(screen.getByText("Assessment: unavailable")).toBeInTheDocument();
    expect(screen.getByText(PVSC_OPEN_DATA_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByText(OPEN_GOVERNMENT_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PVSC assessment evidence source" }))
      .toHaveAttribute("href", expect.stringContaining("bt58-qu28"));
    expect(screen.getByRole("link", { name: "Civic address evidence source" }))
      .toHaveAttribute("href", expect.stringContaining("tntn-er5g"));

    rerender(
      <PrintResearchDocument
        snapshot={snapshot()}
        map={map}
        includeAerial={false}
        includeAppendix={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={[]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(screen.getByText("Assessment: 0 accounts captured")).toBeInTheDocument();
    expect(screen.getByText(PVSC_OPEN_DATA_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByText(OPEN_GOVERNMENT_ATTRIBUTION)).toBeInTheDocument();
  });

  it("keeps worst-case controlled layers, events, and receipt on one compact page without duplicates", () => {
    const allSources = allLayerIds.map((id) => ({
      id,
      name: `Layer ${id}`,
      sourceUrl: `https://example.test/${id}`,
      sourceDate: "Checked July 23, 2026",
      attribution: `Attribution ${id}`,
      licenceUrl: `https://example.test/${id}/licence`,
    }));
    const eventIds = Array.from({ length: 8 }, (_, index) => `event-${index + 1}`);
    const events = [...eventIds, "unselected-event"].map((id) => ({
      id,
      name: `Controlled event ${id}`,
      status: "Listed",
      facts: [],
      sources: [],
      limitation: "Verify the official notice.",
    }));
    const longReceipt = `https://example.test/map/?${new URLSearchParams({
      layers: allLayerIds.join(","), event: eventIds.join(","), receipt: "x".repeat(240),
    })}`;

    render(
      <PrintFieldDocument
        snapshot={snapshot({ layerIds: allLayerIds, layerSources: [...allSources, allSources[0]], eventIds, events, template: "field" })}
        map={map}
        includeAerial
        scale={scale}
        shareUrl={longReceipt}
        qr={qr}
        renderedLayerIds={[...allLayerIds, "nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(document.querySelectorAll(".print-field-page")).toHaveLength(1);
    expect(
      document.querySelector(".print-field-page > .print-pattern-definitions"),
    ).toBeInTheDocument();
    expect(screen.getByText("Layer nsprd")).toBeInTheDocument();
    expect(screen.getAllByText("Layer nsprd")).toHaveLength(1);
    expect(document.querySelector(".print-capture-context")).toHaveTextContent("Controlled event event-8: Listed");
    expect(document.querySelector(".print-capture-context")).not.toHaveTextContent("Controlled event unselected-event: Listed");
    expect(screen.getByText(longReceipt)).toBeInTheDocument();
  });

  it("compacts the actual field layer catalogue without losing required acknowledgements or licences", () => {
    const catalogIds = actualFieldCatalogSources.map(({ id }) => id);
    const props = {
      snapshot: snapshot({ layerIds: catalogIds, layerSources: actualFieldCatalogSources }),
      map,
      includeAerial: true,
      scale,
      shareUrl,
      qr,
      renderedLayerIds: catalogIds,
      belowZoomLayerIds: [],
      failedLayerIds: [],
    };
    const { rerender } = render(<PrintFieldDocument {...props} />);

    const fieldLegend = screen.getByLabelText("Active map layers");
    for (const source of actualFieldCatalogSources) {
      expect(within(fieldLegend).getByText(source.name)).toBeInTheDocument();
      expect(within(fieldLegend).queryByText(source.sourceDate)).not.toBeInTheDocument();
    }
    expect(screen.getAllByText(PROVINCE_ATTRIBUTION)).toHaveLength(1);
    expect(screen.getAllByText(OPEN_GOVERNMENT_ATTRIBUTION)).toHaveLength(1);
    expect(screen.getByText(openStreetMapAttribution)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /licence$/i }).filter(
      (link) => link.getAttribute("href") === PROVINCE_LICENSE_URL,
    )).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /licence$/i }).filter(
      (link) => link.getAttribute("href") === OPEN_GOVERNMENT_LICENCE_URL,
    )).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /licence$/i }).filter(
      (link) => link.getAttribute("href") === openStreetMapLicenceUrl,
    )).toHaveLength(1);
    expect(screen.queryByRole("link", { name: / source$/i })).not.toBeInTheDocument();

    rerender(<PrintResearchDocument {...props} includeAppendix={false} />);
    const researchLegend = screen.getByLabelText("Active map layers");
    expect(within(researchLegend).getByText(actualFieldCatalogSources[0].sourceDate)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Modern map source" })).toHaveAttribute(
      "href",
      actualFieldCatalogSources[0].sourceUrl,
    );
  });

  it("prints only selected event IDs in the captured event-ID order", () => {
    const selectedEventIds = ["event-2", "event-1", "event-2"];
    const events = [
      { id: "unselected", name: "Unselected event", status: "Do not print" },
      { id: "event-1", name: "First selected event", status: "Listed first" },
      { id: "event-3", name: "Another unselected event", status: "Do not print" },
      { id: "event-2", name: "Second selected event", status: "Listed second" },
    ].map((event) => ({
      ...event,
      facts: [],
      sources: [],
      limitation: "Verify the official notice.",
    }));

    render(
      <PrintFieldDocument
        snapshot={snapshot({ eventIds: selectedEventIds, events, template: "field" })}
        map={map}
        includeAerial={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={[]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    const context = document.querySelector(".print-event-context");
    expect(context).not.toBeNull();
    expect(Array.from(context!.querySelectorAll(":scope > span"), ({ textContent }) => textContent)).toEqual([
      "Second selected event: Listed second",
      "First selected event: Listed first",
    ]);
    expect(context).not.toHaveTextContent("Unselected event: Do not print");
    expect(context).not.toHaveTextContent("Another unselected event: Do not print");
  });

  it("preserves empty, outside-coverage, and source-error evidence states in its appendix", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            buildings: { status: "ready", value: { count: 0, pointCount: 0, polygonCount: 0 } },
            riverFlood: {
              status: "ready",
              value: { status: "outside-published-layer-extents", aep: [] },
            },
            coastalFlood: { status: "ready", value: [] },
            assessments: {
              status: "error",
              message: "PVSC assessment source unavailable at export time.",
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(
      within(screen.getByRole("region", { name: "Evidence appendix" }))
        .getByText("No mapped building feature returned."),
    ).toBeInTheDocument();
    expect(screen.getByText("Outside published river-study extents.")).toBeInTheDocument();
    // The section prints the state's own reason, not one fixed sentence.
    expect(
      screen.getByText("PVSC assessment source unavailable at export time."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No civic address on this parcel names a road the mapped road layers did not already return.",
      ),
    ).toBeInTheDocument();
  });

  // A road the reader saw on screen as "Named by civic address" was absent
  // from the printed sheet: the appendix rendered only the NSTDB roads.
  it("prints the roads only a civic address names, credited to the address file", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            mappedContext: {
              status: "ready",
              value: {
                roads: [
                  { name: "Cabot Trail", kind: "Arterial", relationship: "intersects" },
                ],
                water: [],
              },
            },
            civicAddresses: {
              status: "ready",
              value: {
                addresses: [{
                  pntid: "100",
                  coordinates: [-61.15, 46.35],
                  label: "12 Main St, Mabou",
                  properties: {
                    pntid: "100", civicnum: "12", civsuffix: null,
                    unit_num: null, add_loc: null, strprefix: null,
                    strname: "Main", strsuffix: "St", strdir: null,
                    comm: "Mabou", mun: "Inverness", county: "Inverness",
                  },
                }],
                unreadableRows: 0,
              },
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    const section = screen
      .getByRole("heading", { name: "Roads named by civic address" })
      .closest("section");
    expect(section).not.toBeNull();
    const civic = within(section as HTMLElement);
    expect(civic.getByText(/Main St/)).toBeInTheDocument();
    expect(civic.getByText(/Named by civic address/)).toBeInTheDocument();
    // Credited to the file that named it, not to the roads service.
    expect(civic.getByText(OPEN_GOVERNMENT_ATTRIBUTION)).toBeInTheDocument();
    expect(civic.getByRole("link", { name: OPEN_GOVERNMENT_LICENCE_URL }))
      .toHaveAttribute("href", OPEN_GOVERNMENT_LICENCE_URL);
    expect(civic.queryByText(/Cabot Trail/)).not.toBeInTheDocument();
    expect(screen.getByText(/Cabot Trail/)).toBeInTheDocument();
  });

  // The panel derives this label from the query distance. A printed sheet that
  // spelled the distance out on its own could outlive the query it describes.
  it("prints the adjacency distance the road query actually used", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            mappedContext: {
              status: "ready",
              value: {
                roads: [
                  { name: "Shore Road", kind: "Local", relationship: "adjacent" },
                ],
                water: [],
              },
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    const section = screen
      .getByRole("heading", { name: "Mapped roads" })
      .closest("section");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText(
        `Shore Road (Local) — Adjacent within ${ADJACENT_ROAD_DISTANCE_METRES} m`,
      ),
    ).toBeInTheDocument();
  });

  it("does not read a partial civic answer as no addressed road", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            mappedContext: {
              status: "ready",
              value: { roads: [], water: [] },
            },
            civicAddresses: {
              status: "ready",
              value: { addresses: [], unreadableRows: 2 },
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(
      screen.getByText(
        "A civic address point here could not be read, so a road named only by that address would not be listed.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No civic address on this parcel names a road/),
    ).not.toBeInTheDocument();
  });

  it("does not read a failed civic lookup as no addressed road", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            mappedContext: {
              status: "ready",
              value: { roads: [], water: [] },
            },
            civicAddresses: { status: "error", message: "offline" },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    // The reason printed here is the state's own, so it cannot contradict the
    // civic section above it.
    expect(
      screen.getByText(
        /offline A road named only by a civic address on this parcel would not be listed\./u,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No civic address on this parcel names a road/),
    ).not.toBeInTheDocument();
  });

  it("keeps mandatory NSPRD and evidence attribution when no optional layer rendered", () => {
    const unavailableEvidence = {
      ...snapshot().evidence,
      buildings: { status: "error", message: "offline" },
      assessments: { status: "error", message: "offline" },
      civicAddresses: { status: "error", message: "offline" },
      mappedContext: { status: "error", message: "offline" },
      riverFlood: { status: "error", message: "offline" },
      coastalFlood: { status: "error", message: "offline" },
      resources: { status: "error", message: "offline" },
    };

    render(
      <PrintResearchDocument
        snapshot={snapshot({
          layerIds: [],
          layerSources: [],
          evidence: unavailableEvidence,
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={[]}
        belowZoomLayerIds={["nsprd"]}
        failedLayerIds={[]}
      />,
    );

    expect(screen.getAllByText(PROVINCE_ATTRIBUTION).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "NSPRD selected geometry licence" })[0])
      .toHaveAttribute("href", PROVINCE_LICENSE_URL);
    expect(screen.getAllByText(/NSPRD geometry is approximate and is not a legal survey\./u).length)
      .toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Building evidence source" }))
      .toHaveAttribute("href", expect.stringContaining("tz45-5mz7"));
    expect(screen.getByRole("link", { name: "Road evidence source" }))
      .toHaveAttribute("href", expect.stringContaining("Roads_UT83"));
    expect(screen.getByRole("link", { name: "Water evidence source" }))
      .toHaveAttribute("href", expect.stringContaining("Water_WM84"));
    expect(screen.getByRole("link", { name: "Published river flood evidence source" }))
      .toHaveAttribute("href", expect.stringContaining("flood_risk_areas"));
    expect(screen.getByRole("link", { name: "Coastal flood evidence source" }))
      .toHaveAttribute("href", "https://nsgi.novascotia.ca/chm");
    // The coastal data is open, but under the Unrestricted Map Services
    // licence. The appendix printed the OGL-NS sentence directly above a link
    // to the unrestricted PDF — one licence named, another quoted, over the
    // same findings.
    expect(screen.getAllByText(COASTAL_HAZARD_ATTRIBUTION).length)
      .toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Coastal flood evidence licence" })[0],
    ).toHaveAttribute("href", expect.stringContaining("unrestrictedLicense.pdf"));
  });

  it("renders captured event facts, sources, limitations, mapped-area detail, and assessment match method", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot()}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={[]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    const appendix = screen.getByRole("region", { name: "Evidence appendix" });
    expect(within(appendix).getByText("Inverness County tax sale")).toBeInTheDocument();
    expect(within(appendix).getByText("Auction: August 11, 2026")).toBeInTheDocument();
    expect(within(appendix).getByRole("link", { name: "Official notice" }))
      .toHaveAttribute("href", "https://example.test/notice");
    expect(within(appendix).getByText("Verify the official notice before acting."))
      .toBeInTheDocument();
    expect(within(appendix).getByText("1,000 m²")).toBeInTheDocument();
    expect(within(appendix).getByText("0.25 acres")).toBeInTheDocument();
    expect(within(appendix).getByText("Matched by published account points inside the mapped parcel geometry."))
      .toBeInTheDocument();
    expect(
      within(appendix).getByRole("heading", {
        name: "PVSC dwelling characteristics",
      }),
    ).toBeInTheDocument();
    expect(within(appendix).getByText("AAN 00603988")).toBeInTheDocument();
    expect(within(appendix).getByText("Built 2018")).toBeInTheDocument();
    expect(
      within(appendix).getByText(
        "Two Storey · 1,600 sq ft living area · 1 living unit · 2 bathrooms · Garage",
      ),
    ).toBeInTheDocument();
    expect(
      within(appendix).getByRole("link", {
        name: "PVSC dwelling evidence",
      }),
    ).toHaveAttribute("href", PVSC_DWELLING_DATASET_URL);
    expect(
      within(appendix).getAllByText("Dataset updated January 12, 2026"),
    ).toHaveLength(2);
    expect(within(appendix).getAllByText("Captured for print: 2026-07-23T13:42:00.000Z").length)
      .toBeGreaterThan(0);
  });

  it.each([
    {
      river: { status: "outside-published-layer-extents", aep: [] },
      riverText: "Outside published river-study extents.",
    },
    {
      river: { status: "within-published-layer-extent", aep: [] },
      riverText: "Within a published layer extent; no study coverage or parcel probability is implied.",
    },
    {
      river: { status: "error", aep: [], message: "offline" },
      riverText: "Published river source unavailable at export time; no absence is inferred.",
    },
  ])("renders coastal evidence independently when river state is $river.status", ({ river, riverText }) => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            riverFlood: { status: "ready", value: river },
            coastalFlood: {
              status: "ready",
              value: [{
                scenario: "2050",
                status: "no-intersection",
                stormAnnualExceedanceProbabilityPercent: 1,
                approximateAffectedPercent: 0,
                approximateAffectedSquareMetres: 0,
                sampledParcelPixels: 72,
              }],
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={[]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(screen.getByText(riverText)).toBeInTheDocument();
    expect(screen.getByText("Coastal scenarios")).toBeInTheDocument();
    expect(screen.getByText("No 2050 map pixels intersected this parcel; this is not proof of no coastal hazard."))
      .toBeInTheDocument();
  });

  // A printed document outlives the session. A parcel that took no sample
  // must not print a 0% share as though the scenario had been read off it.
  it("prints an unsampled coastal scenario as nothing measured", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            riverFlood: { status: "ready", value: { status: "outside-published-layer-extents", aep: [] } },
            coastalFlood: { status: "ready", value: [
                  {
                    scenario: "2050",
                    status: "not-sampled",
                    stormAnnualExceedanceProbabilityPercent: 1,
                    sampledParcelPixels: 0,
                  },
                  {
                    scenario: "2100",
                    status: "geometry-unavailable",
                    stormAnnualExceedanceProbabilityPercent: 1,
                  },
                ] },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={[]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(
      screen.getByText(/2050: this parcel is too small at the sampled resolution/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2100: not evaluated — this parcel had no usable outline/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/parcel pixels sampled/)).not.toBeInTheDocument();
    expect(screen.queryByText(/map pixels intersected this parcel/)).not.toBeInTheDocument();
  });

  // "Unavailable" and "did not answer" are different receipts, and the page
  // used to give both the same one.
  it("tells a source that never answered apart from one that failed", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            civicAddresses: {
              status: "unanswered",
              message: PRINT_SOURCE_UNANSWERED,
            },
            assessments: {
              status: "error",
              message: "Source unavailable at export time.",
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    const receipt = within(
      screen.getByRole("region", { name: "Evidence receipt status" }),
    );
    expect(receipt.getByText("Civic addresses: did not answer")).toBeInTheDocument();
    expect(receipt.getByText("Assessment: unavailable")).toBeInTheDocument();
    expect(screen.getAllByText(PRINT_SOURCE_UNANSWERED).length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "This page was made while Civic addresses had not answered. The appendix names each of them as unanswered, which is not a finding about this parcel.",
      ),
    ).toBeInTheDocument();
  });

  it("prints a source's own reason for not being evaluated", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            buildings: {
              status: "error",
              message: "Not evaluated — this PID's NSPRD geometry is unavailable.",
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    // Once on the fact grid, once in the appendix section.
    expect(
      screen.getAllByText("Not evaluated — this PID's NSPRD geometry is unavailable."),
    ).toHaveLength(2);
    expect(
      screen.queryByText("Source unavailable at export time."),
    ).not.toBeInTheDocument();
  });

  it("keeps the flood no-absence guard when the lookup never answered", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            riverFlood: {
              status: "unanswered",
              message: PRINT_SOURCE_UNANSWERED,
            },
            coastalFlood: {
              status: "unanswered",
              message: PRINT_SOURCE_UNANSWERED,
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(screen.getAllByText(PRINT_SOURCE_UNANSWERED).length).toBeGreaterThan(0);
    expect(
      screen.getByText("No absence of published river mapping is inferred."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No absence of coastal hazard is inferred."),
    ).toBeInTheDocument();
  });

  it("says nothing about unanswered sources when every source answered", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot()}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(screen.queryByText(/had not answered/u)).not.toBeInTheDocument();
  });

  // A lookup that was never run is not a source that failed. The receipt used
  // to call all three "unavailable".
  it("says a dwelling dataset was not asked rather than unavailable", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            dwellings: {
              status: "not-asked",
              message:
                "No PVSC assessment account was matched to this parcel, so the dwelling dataset could not be asked about it.",
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    const receipt = within(
      screen.getByRole("region", { name: "Evidence receipt status" }),
    );
    expect(receipt.getByText("Dwelling characteristics: not asked")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No PVSC assessment account was matched to this parcel, so the dwelling dataset could not be asked about it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/had not answered/u)).not.toBeInTheDocument();
  });

  // The flood and resource slots answer ready with per-query states inside
  // them, so "captured" could sit on the front page over a source that was
  // down — the appendix's own collapse, one level up.
  it("says a slot was partially captured when one of its sources failed", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            riverFlood: { status: "ready", value: { status: "error", aep: [], message: "offline" } },
            coastalFlood: { status: "ready", value: [
                  { scenario: "current", status: "no-intersection", stormAnnualExceedanceProbabilityPercent: 1, approximateAffectedPercent: 0, approximateAffectedSquareMetres: 0, sampledParcelPixels: 72 },
                  { scenario: "2100", status: "error", stormAnnualExceedanceProbabilityPercent: 1, message: "offline" },
                ] },
            resources: {
              status: "ready",
              value: {
                "mineral-occurrences": { status: "error", intersections: [] },
                "mineral-tenure": { status: "ready", intersections: [] },
                "abandoned-mines": { status: "ready", intersections: [] },
              },
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    const receipt = within(
      screen.getByRole("region", { name: "Evidence receipt status" }),
    );
    // Two slots now, because one hanging raster must not seal an answered
    // river result as a source that went silent.
    expect(receipt.getByText("Published river mapping: unavailable")).toBeInTheDocument();
    expect(
      receipt.getByText("Coastal scenarios: partially captured; Coastal 2100 unavailable"),
    ).toBeInTheDocument();
    expect(
      receipt.getByText(
        "Resource evidence: partially captured; Mineral occurrences unavailable",
      ),
    ).toBeInTheDocument();
    expect(receipt.queryByText("Coastal scenarios: captured")).not.toBeInTheDocument();
  });

  // A document printed without the appendix would otherwise carry no sign at
  // all that the civic list is a floor.
  it("puts the civic shortfall on the front page even with no appendix", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            civicAddresses: {
              status: "ready",
              value: { addresses: [], unreadableRows: 2 },
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(
      within(screen.getByRole("region", { name: "Evidence receipt status" }))
        .getByText("Civic addresses: partially captured; 2 returned rows unreadable"),
    ).toBeInTheDocument();
  });

  it("says nothing was captured when every named source in a slot failed", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            resources: {
              status: "ready",
              value: {
                "mineral-occurrences": { status: "error", intersections: [] },
                "mineral-tenure": { status: "error", intersections: [] },
                "abandoned-mines": { status: "error", intersections: [] },
              },
            },
          },
        })}
        map={map}
        includeAerial={false}
        includeAppendix
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    const receipt = within(
      screen.getByRole("region", { name: "Evidence receipt status" }),
    );
    expect(
      receipt.getByText(/^Resource evidence: unavailable; .* all failed$/u),
    ).toBeInTheDocument();
    expect(receipt.queryByText(/Resource evidence: partially/u)).not.toBeInTheDocument();
  });

  it("prints monochrome legend samples and a north indicator", () => {
    render(
      <PrintFieldDocument
        snapshot={snapshot({
          template: "field",
          layerIds: ["nsprd", "inverness-hydro-potential"],
          layerSources: [
            snapshot().layerSources[0],
            actualFieldCatalogSources.find(({ id }) => id === "inverness-hydro-potential")!,
          ],
        })}
        map={map}
        includeAerial={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd", "inverness-hydro-potential"]}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    expect(screen.getByLabelText("North")).toHaveTextContent("N");
    const legend = screen.getByLabelText("Active map layers");
    expect(legend.querySelector(".print-layer-symbol--nsprd")).not.toBeNull();
    expect(legend.querySelector(".print-layer-symbol--inverness-hydro-potential")).not.toBeNull();
    expect(legend.querySelectorAll(".print-hydro-class-sample")).toHaveLength(7);
  });

  it("maps every printable layer to a semantic monochrome legend treatment", () => {
    const { rerender } = render(
      <PrintFieldDocument
        snapshot={snapshot({
          template: "field",
          layerIds: allLayerIds,
          layerSources: actualFieldCatalogSources,
        })}
        map={map}
        includeAerial
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={allLayerIds}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );

    const legend = screen.getByLabelText("Active map layers");
    const symbolKinds = allLayerIds.map((id) => {
      const symbol = legend.querySelector(`.print-layer-symbol--${id}`);
      expect(symbol).not.toBeNull();
      const kind = symbol?.getAttribute("data-symbol-kind");
      expect(kind).not.toBeNull();
      return kind;
    });

    const selectedSymbol = legend.querySelector(
      ".print-layer-symbol--selected-parcel",
    );
    const currentSymbol = legend.querySelector(
      ".print-layer-symbol--current-tax-sale",
    );
    expect(selectedSymbol).toHaveAttribute(
      "data-symbol-kind",
      "selected-parcel-hatch",
    );
    expect(currentSymbol).toHaveAttribute(
      "data-symbol-kind",
      "current-notice-parcel",
    );
    expect(new Set([
      ...symbolKinds,
      selectedSymbol?.getAttribute("data-symbol-kind"),
      currentSymbol?.getAttribute("data-symbol-kind"),
    ])).toHaveLength(allLayerIds.length + 2);
    expect(
      legend.querySelector(".print-layer-symbol--nsprd"),
    ).toHaveAttribute("data-symbol-kind", "parcel-boundary");
    expect(
      legend.querySelector(".print-layer-symbol--roads"),
    ).toHaveAttribute("data-symbol-kind", "road-corridor");
    expect(
      legend.querySelector(".print-layer-symbol--water-features"),
    ).toHaveAttribute("data-symbol-kind", "water-lines");
    expect(
      legend.querySelector(".print-layer-symbol--buildings"),
    ).toHaveAttribute("data-symbol-kind", "building-footprints");
    expect(
      legend.querySelector(".print-layer-symbol--coastal-flood-2100"),
    ).toHaveAttribute("data-symbol-kind", "coastal-2100");
    expect(
      legend.querySelector(".print-layer-symbol--old-growth-policy"),
    ).toHaveAttribute("data-symbol-kind", "old-growth-policy-statuses");

    rerender(
      <PrintFieldDocument
        snapshot={snapshot({
          mode: "historical",
          template: "field",
          layerIds: allLayerIds,
          layerSources: actualFieldCatalogSources,
        })}
        map={map}
        includeAerial
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={allLayerIds}
        belowZoomLayerIds={[]}
        failedLayerIds={[]}
      />,
    );
    expect(
      screen
        .getByLabelText("Active map layers")
        .querySelector(".print-layer-symbol--historical-tax-sale"),
    ).toHaveAttribute("data-symbol-kind", "historical-record-parcel");
  });

  it("keeps the field sheet to one bounded page with only rendered layers and concise limits", () => {
    render(
      <PrintFieldDocument
        snapshot={snapshot({ template: "field" })}
        map={map}
        includeAerial={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        renderedLayerIds={["nsprd"]}
        belowZoomLayerIds={["buildings"]}
        failedLayerIds={["roads"]}
      />,
    );

    expect(screen.getByLabelText("Printable map")).toBeInTheDocument();
    expect(screen.getByText("Active map layers")).toBeInTheDocument();
    expect(screen.getByText("FIELD SHEET")).toBeInTheDocument();
    expect(screen.getByText("23 Jul 2026 · 13:42 UTC")).toBeInTheDocument();
    expect(document.querySelector(".print-capture-context")).toHaveTextContent("Current map stateInverness County tax sale: Listed in official notice");
    expect(screen.getByText("Approximate scale")).toBeInTheDocument();
    expect(screen.getByText(shareUrl)).toBeInTheDocument();
    expect(screen.getByText("QR unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Not rendered at this print scale: Buildings\./)).toBeInTheDocument();
    expect(screen.getByText(/Map rendering incomplete: Roads, trails & culverts source failed at export time\./)).toBeInTheDocument();
    const legend = screen.getByLabelText("Active map layers");
    expect(within(legend).getByText("NS Property Boundaries")).toBeInTheDocument();
    expect(within(legend).queryByText("Buildings")).not.toBeInTheDocument();
    expect(within(legend).queryByText("Roads, trails & culverts")).not.toBeInTheDocument();
    expect(screen.getAllByText(PROVINCE_ATTRIBUTION)).toHaveLength(1);
    expect(screen.getAllByRole("region", { name: /Source attribution and licences/i })).toHaveLength(1);
    expect(screen.getByText(
      "Field screening/reference material only. Not a survey or an access conclusion.",
    )).toBeInTheDocument();
    expect(
      document.querySelector(
        ".print-field-support > .print-field-required-attribution",
      ),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".print-field-footer > .print-receipt"),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".print-field-page")).toHaveLength(1);
    expect(screen.queryByText(/Assessment accounts/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/Evidence appendix/iu)).not.toBeInTheDocument();
  });
});

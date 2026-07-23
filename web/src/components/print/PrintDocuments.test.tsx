import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  OPEN_GOVERNMENT_ATTRIBUTION,
  OPEN_GOVERNMENT_LICENCE_URL,
} from "../../services/civicAddresses";
import { PVSC_OPEN_DATA_ATTRIBUTION } from "../../services/pvscAssessments";
import { PROVINCE_ATTRIBUTION } from "../../licensing/provinceLicense";
import type { PrintSnapshot } from "../../services/printSnapshot";
import { PrintFieldDocument } from "./PrintFieldDocument";
import { PrintResearchDocument } from "./PrintResearchDocument";

const shareUrl = "https://example.test/map/?pid=01234567";
const scale = { label: "200 m", metres: 200, pixels: 80 };
const qr = { status: "error" as const };
const allLayerIds = [
  "modern", "ns-aerial", "nsprd", "crown-lands", "flood-risk", "waterfalls",
  "water-features", "roads", "buildings", "contours", "mineral-occurrences",
  "mineral-tenure", "abandoned-mines", "mineral-proximity-parcels",
  "inverness-hydro-potential", "published-river-flood-zones",
  "coastal-flood-current", "coastal-flood-2050", "coastal-flood-2100",
] as const;

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    pid: "01234567",
    mode: "current",
    eventIds: ["inverness-2026"],
    events: [{
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
      civicAddresses: { status: "ready", value: [] },
      mappedContext: { status: "ready", value: { roads: [], water: [] } },
      floodHazard: {
        status: "ready",
        value: { river: { status: "within-published-layer-extent", aep: [] }, coastal: [] },
      },
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
  it("renders a research summary with sealed evidence, licence material, and no browser location", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot()}
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

    expect(screen.getByText("PID 01234567")).toBeInTheDocument();
    expect(screen.getByText("Mapped buildings")).toBeInTheDocument();
    expect(screen.getByText("Assessment: 0 accounts captured")).toBeInTheDocument();
    expect(screen.getByText("Generated: 2026-07-23T13:42:15.000Z")).toBeInTheDocument();
    expect(document.querySelector(".print-capture-context")).toHaveTextContent("Current map stateInverness County tax sale: Listed in official notice");
    expect(screen.getByText(PROVINCE_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByText(OPEN_GOVERNMENT_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByText(PVSC_OPEN_DATA_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Civic address evidence licence" })).toHaveAttribute("href", OPEN_GOVERNMENT_LICENCE_URL);
    expect(screen.getByText("Screening evidence only.")).toBeInTheDocument();
    expect(screen.queryByText(/browser location/iu)).not.toBeInTheDocument();
  });

  it("shows PVSC and open-data attribution only for visibly reported ready evidence", () => {
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
    expect(screen.queryByText(PVSC_OPEN_DATA_ATTRIBUTION)).not.toBeInTheDocument();
    expect(screen.queryByText(OPEN_GOVERNMENT_ATTRIBUTION)).not.toBeInTheDocument();

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
    expect(screen.getByText("Layer nsprd")).toBeInTheDocument();
    expect(screen.getAllByText("Layer nsprd")).toHaveLength(1);
    expect(document.querySelector(".print-capture-context")).toHaveTextContent("Controlled event event-8: Listed");
    expect(document.querySelector(".print-capture-context")).not.toHaveTextContent("Controlled event unselected-event: Listed");
    expect(screen.getByText(longReceipt)).toBeInTheDocument();
  });

  it("preserves empty, outside-coverage, and source-error evidence states in its appendix", () => {
    render(
      <PrintResearchDocument
        snapshot={snapshot({
          evidence: {
            ...snapshot().evidence,
            buildings: { status: "ready", value: { count: 0, pointCount: 0, polygonCount: 0 } },
            floodHazard: {
              status: "ready",
              value: { river: { status: "outside-published-layer-extents", aep: [] }, coastal: [] },
            },
            assessments: { status: "error", message: "offline" },
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

    expect(screen.getByText("No mapped building feature returned.")).toBeInTheDocument();
    expect(screen.getByText("Outside published river-study extents.")).toBeInTheDocument();
    expect(screen.getByText("Source unavailable at export time.")).toBeInTheDocument();
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
    expect(screen.getByText("Generated: 2026-07-23T13:42:15.000Z")).toBeInTheDocument();
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
    expect(document.querySelectorAll(".print-field-page")).toHaveLength(1);
    expect(screen.queryByText(/Assessment accounts/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/Evidence appendix/iu)).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PROVINCE_ATTRIBUTION } from "../../licensing/provinceLicense";
import type { PrintSnapshot } from "../../services/printSnapshot";
import { PrintFieldDocument } from "./PrintFieldDocument";
import { PrintResearchDocument } from "./PrintResearchDocument";

const shareUrl = "https://example.test/map/?pid=01234567";
const scale = { label: "200 m", metres: 200, pixels: 80 };
const qr = { status: "error" as const };

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
        belowZoomLayerIds={[]}
      />,
    );

    expect(screen.getByText("PID 01234567")).toBeInTheDocument();
    expect(screen.getByText("Mapped buildings")).toBeInTheDocument();
    expect(screen.getByText(PROVINCE_ATTRIBUTION)).toBeInTheDocument();
    expect(screen.getByText("Screening evidence only.")).toBeInTheDocument();
    expect(screen.queryByText(/browser location/iu)).not.toBeInTheDocument();
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
        belowZoomLayerIds={[]}
      />,
    );

    expect(screen.getByText("No mapped building feature returned.")).toBeInTheDocument();
    expect(screen.getByText("Outside published river-study extents.")).toBeInTheDocument();
    expect(screen.getByText("Source unavailable at export time.")).toBeInTheDocument();
  });

  it("keeps the field sheet to the map, active layers, scale, receipt, and concise limits", () => {
    render(
      <PrintFieldDocument
        snapshot={snapshot({ template: "field" })}
        map={map}
        includeAerial={false}
        scale={scale}
        shareUrl={shareUrl}
        qr={qr}
        belowZoomLayerIds={["buildings"]}
      />,
    );

    expect(screen.getByLabelText("Printable map")).toBeInTheDocument();
    expect(screen.getByText("Active map layers")).toBeInTheDocument();
    expect(screen.getByText("Approximate scale")).toBeInTheDocument();
    expect(screen.getByText(shareUrl)).toBeInTheDocument();
    expect(screen.getByText("QR unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Not rendered at this print scale: Buildings\./)).toBeInTheDocument();
    expect(screen.queryByText(/Assessment accounts/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/Evidence appendix/iu)).not.toBeInTheDocument();
  });
});

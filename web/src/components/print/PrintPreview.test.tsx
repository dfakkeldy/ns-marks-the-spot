import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapPosition } from "../../services/mapShareState";
import type { PrintMapReadiness } from "./PrintMap";
import type { PrintCapture } from "../../services/printSnapshot";
import { PrintPreview } from "./PrintPreview";

const printMap = vi.hoisted(() => ({
  onReadinessChange: undefined as ((value: PrintMapReadiness) => void) | undefined,
  onResolvedPosition: undefined as ((value: MapPosition) => void) | undefined,
}));

const buildQr = vi.hoisted(() => vi.fn());

vi.mock("./PrintMap", () => ({
  PrintMap: ({
    onReadinessChange,
    onResolvedPosition,
  }: {
    onReadinessChange: (value: PrintMapReadiness) => void;
    onResolvedPosition: (value: MapPosition) => void;
  }) => {
    printMap.onReadinessChange = onReadinessChange;
    printMap.onResolvedPosition = onResolvedPosition;
    return <div data-testid="print-map">Map preview</div>;
  },
}));

vi.mock("../../services/printQr", () => ({
  buildPrintQr: buildQr,
}));

const mapPosition = { latitude: 46.35, longitude: -61.15, zoom: 15 };

function capture(pending = false): PrintCapture {
  const state = pending ? { status: "pending" as const } : { status: "ready" as const, value: [] };
  return {
    token: "capture-1",
    capturedAt: "2026-07-23T13:42:00.000Z",
    pid: "01234567",
    mode: "current",
    eventIds: [],
    events: [],
    selectedParcelGeometry: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[[-61.2, 46.3], [-61.1, 46.3], [-61.1, 46.4], [-61.2, 46.3]]],
        },
      }],
    },
    mapParcels: { type: "FeatureCollection", features: [] },
    taxSalePids: [],
    historicalTaxSalePids: [],
    viewport: {
      position: mapPosition,
      bounds: { north: 46.4, east: -61.1, south: 46.3, west: -61.2 },
    },
    layerIds: ["modern"],
    layerSources: [],
    licenceAccepted: true,
    evidence: {
      mappedArea: null,
      buildings: pending ? { status: "pending" } : { status: "ready", value: { count: 0, pointCount: 0, polygonCount: 0 } },
      assessments: pending ? { status: "pending" } : { status: "ready", value: { matchMethod: "spatial", accounts: [] } },
      civicAddresses: state,
      mappedContext: pending ? { status: "pending" } : { status: "ready", value: { roads: [], water: [] } },
      floodHazard: pending ? { status: "pending" } : { status: "ready", value: { river: { status: "within-published-layer-extent", aep: [] }, coastal: [] } },
      resources: pending ? { status: "pending" } : {
        status: "ready",
        value: {
          "mineral-occurrences": { status: "ready", intersections: [] },
          "mineral-tenure": { status: "ready", intersections: [] },
          "abandoned-mines": { status: "ready", intersections: [] },
        },
      },
    },
  } as unknown as PrintCapture;
}

function markMapReady() {
  act(() => {
    printMap.onResolvedPosition?.(mapPosition);
    printMap.onReadinessChange?.({ status: "ready", belowZoomLayerIds: [] });
  });
}

describe("PrintPreview", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    buildQr.mockResolvedValue({ status: "ready", svg: "<svg />" });
    vi.stubGlobal("print", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    onClose.mockReset();
    buildQr.mockReset();
    printMap.onReadinessChange = undefined;
    printMap.onResolvedPosition = undefined;
  });

  it("defaults to research with its appendix and aerial excluded", () => {
    render(<PrintPreview capture={capture()} baseUrl="https://example.com/map/" onClose={onClose} />);

    expect(screen.getByLabelText("Document template")).toHaveValue("research");
    expect(screen.getByLabelText("Include evidence appendix")).toBeChecked();
    expect(screen.getByLabelText("Include aerial imagery")).not.toBeChecked();
  });

  it("waits for research evidence but lets a field sheet become ready", async () => {
    const user = userEvent.setup();
    render(<PrintPreview capture={capture(true)} baseUrl="https://example.com/map/" onClose={onClose} />);
    markMapReady();

    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Document template"), "field");
    markMapReady();

    await waitFor(() => expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeEnabled());
  });

  it("times out pending research evidence without calling it empty", async () => {
    vi.useFakeTimers();
    render(<PrintPreview capture={capture(true)} baseUrl="https://example.com/map/" onClose={onClose} />);
    markMapReady();
    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(15_000));

    expect(screen.getAllByText("Source unavailable at export time.").length).toBeGreaterThan(0);
    expect(screen.queryByText("No mapped record returned")).not.toBeInTheDocument();
  });

  it("requires an explicit incomplete-map decision after a map error", async () => {
    render(<PrintPreview capture={capture()} baseUrl="https://example.com/map/" onClose={onClose} />);
    act(() => {
      printMap.onResolvedPosition?.(mapPosition);
      printMap.onReadinessChange?.({ status: "error", failedLayerIds: ["modern"], belowZoomLayerIds: [] });
    });

    expect(screen.getByRole("button", { name: "Retry map" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Print incomplete map" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();

    await userEvent.setup().click(screen.getByRole("button", { name: "Print incomplete map" }));

    expect(screen.getByText("Incomplete map: one or more enabled layers failed to render at export time.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeEnabled());
  });

  it("calls browser print only after map position and QR attempt settle", async () => {
    let resolveQr: ((value: { status: "ready"; svg: string }) => void) | undefined;
    buildQr.mockImplementationOnce(() => new Promise((resolve) => { resolveQr = resolve; }));
    render(<PrintPreview capture={capture()} baseUrl="https://example.com/map/" onClose={onClose} />);
    act(() => printMap.onReadinessChange?.({ status: "ready", belowZoomLayerIds: [] }));

    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();
    act(() => printMap.onResolvedPosition?.(mapPosition));
    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();

    await act(async () => resolveQr?.({ status: "ready", svg: "<svg />" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Print / Save PDF" }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape, traps Tab, restores focus, and removes its body marker", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open preview";
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(<PrintPreview capture={capture()} baseUrl="https://example.com/map/" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Print preview" });

    expect(document.body).toHaveClass("print-preview-open");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    const last = screen.getByRole("link", { name: "https://example.com/map/" });
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText("Document template"));

    unmount();
    expect(document.body).not.toHaveClass("print-preview-open");
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

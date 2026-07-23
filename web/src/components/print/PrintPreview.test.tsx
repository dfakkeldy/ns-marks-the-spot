import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapPosition } from "../../services/mapShareState";
import type { PrintMapReadiness } from "./PrintMap";
import type { PrintCapture } from "../../services/printSnapshot";
import { PrintPreview } from "./PrintPreview";

const printMap = vi.hoisted(() => ({
  onReadinessChange: undefined as ((value: PrintMapReadiness) => void) | undefined,
  onResolvedPosition: undefined as ((value: MapPosition) => void) | undefined,
  attempts: [] as Array<{
    onReadinessChange: (value: PrintMapReadiness) => void;
    onResolvedPosition: (value: MapPosition) => void;
  }>,
  emitFromMount: false,
  mountPosition: { latitude: 46.47, longitude: -61.28, zoom: 16 } as MapPosition,
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
    printMap.attempts.push({ onReadinessChange, onResolvedPosition });
    useEffect(() => {
      if (!printMap.emitFromMount) return;
      printMap.emitFromMount = false;
      onResolvedPosition(printMap.mountPosition);
      onReadinessChange(readiness({
        status: "ready",
        renderedLayerIds: ["modern"],
        belowZoomLayerIds: [],
      }));
    }, [onReadinessChange, onResolvedPosition]);
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
    printMap.onReadinessChange?.(readiness({
      status: "ready",
      renderedLayerIds: ["modern"],
      belowZoomLayerIds: [],
    }));
  });
}

function readiness(value: Record<string, unknown>): PrintMapReadiness {
  return value as PrintMapReadiness;
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
    printMap.attempts = [];
    printMap.emitFromMount = false;
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

  it("keeps the first timed-out research snapshot when same-token evidence arrives late", async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <PrintPreview capture={capture(true)} baseUrl="https://example.com/map/" onClose={onClose} />,
    );

    await act(() => vi.advanceTimersByTimeAsync(15_000));
    const lateEvidence = capture(false);
    lateEvidence.evidence.buildings = {
      status: "ready",
      value: { count: 7, pointCount: 4, polygonCount: 3 },
    };
    rerender(<PrintPreview capture={lateEvidence} baseUrl="https://example.com/map/" onClose={onClose} />);

    expect(screen.getAllByText("Source unavailable at export time.").length).toBeGreaterThan(0);
    expect(screen.queryByText("7")).not.toBeInTheDocument();
  });

  it("starts a new map attempt when switching templates and accepts only its callbacks", async () => {
    const user = userEvent.setup();
    render(<PrintPreview capture={capture()} baseUrl="https://example.com/map/" onClose={onClose} />);
    const researchAttempt = printMap.attempts.at(-1)!;
    markMapReady();
    await waitFor(() => expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeEnabled());

    await user.selectOptions(screen.getByLabelText("Document template"), "field");
    const fieldAttempt = printMap.attempts.at(-1)!;
    expect(fieldAttempt).not.toBe(researchAttempt);
    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();

    act(() => {
      researchAttempt.onResolvedPosition({ latitude: 46.1, longitude: -61.4, zoom: 13 });
      researchAttempt.onReadinessChange(readiness({
        status: "ready",
        renderedLayerIds: ["modern"],
        belowZoomLayerIds: [],
      }));
    });
    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();

    act(() => fieldAttempt.onReadinessChange(readiness({
      status: "ready",
      renderedLayerIds: ["modern"],
      belowZoomLayerIds: [],
    })));
    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();
    act(() => fieldAttempt.onResolvedPosition({ latitude: 46.22, longitude: -61.33, zoom: 14 }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeEnabled());
    expect(buildQr).toHaveBeenLastCalledWith(expect.stringContaining("position=46.22%2C-61.33%2C14"));
  });

  it("uses only explicitly rendered layers for an incomplete document and its share QR", async () => {
    const partialCapture = capture();
    partialCapture.layerIds = ["modern", "roads", "contours"];
    partialCapture.layerSources = [
      { id: "modern", name: "Modern map", sourceUrl: "https://example.com/modern", sourceDate: "now", attribution: "OpenStreetMap", licenceUrl: "https://example.com/modern/licence" },
      { id: "roads", name: "Roads", sourceUrl: "https://example.com/roads", sourceDate: "now", attribution: "Province", licenceUrl: "https://example.com/roads/licence" },
      { id: "contours", name: "Contours", sourceUrl: "https://example.com/contours", sourceDate: "now", attribution: "Province", licenceUrl: "https://example.com/contours/licence" },
    ];
    render(<PrintPreview capture={partialCapture} baseUrl="https://example.com/map/" onClose={onClose} />);
    act(() => {
      printMap.onResolvedPosition?.(mapPosition);
      printMap.onReadinessChange?.(readiness({
        status: "error",
        renderedLayerIds: ["modern"],
        failedLayerIds: ["roads"],
        belowZoomLayerIds: [],
      }));
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Print incomplete map" }));

    expect(screen.getByText("Modern map")).toBeInTheDocument();
    expect(screen.queryByText("Contours")).not.toBeInTheDocument();
    await waitFor(() => expect(buildQr).toHaveBeenLastCalledWith(expect.stringContaining("layers=modern")));
  });

  it("requires an explicit incomplete-map decision after a map error", async () => {
    render(<PrintPreview capture={capture()} baseUrl="https://example.com/map/" onClose={onClose} />);
    act(() => {
      printMap.onResolvedPosition?.(mapPosition);
      printMap.onReadinessChange?.(readiness({
        status: "error",
        renderedLayerIds: [],
        failedLayerIds: ["modern"],
        belowZoomLayerIds: [],
      }));
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
    act(() => printMap.onReadinessChange?.(readiness({
      status: "ready",
      renderedLayerIds: ["modern"],
      belowZoomLayerIds: [],
    })));

    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();
    act(() => printMap.onResolvedPosition?.(mapPosition));
    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeDisabled();

    await act(async () => resolveQr?.({ status: "ready", svg: "<svg />" }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Print / Save PDF" }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("accepts the initial position and ready state emitted from PrintMap mount effects", async () => {
    printMap.emitFromMount = true;
    render(<PrintPreview capture={capture()} baseUrl="https://example.com/map/" onClose={onClose} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeEnabled());
    expect(buildQr).toHaveBeenLastCalledWith(expect.stringContaining("position=46.47%2C-61.28%2C16"));
  });

  it("closes on Escape, traps Tab, restores focus, and removes its body marker", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open preview";
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(<PrintPreview capture={capture()} baseUrl="https://example.com/map/" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Print / export" });

    expect(document.body).toHaveClass("print-preview-open");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "https://example.com/map/" }));

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

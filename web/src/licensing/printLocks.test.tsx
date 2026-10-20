import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PrintPreview } from "../components/print/PrintPreview";
import { PrintMap } from "../components/print/PrintMap";
import type { PrintCapture, PrintSnapshot } from "../services/printSnapshot";

const blank = { pid: "", layerIds: ["modern"],
  selectedParcelGeometry: { type: "FeatureCollection", features: [] },
  mapParcels: { type: "FeatureCollection", features: [] },
} as unknown as PrintCapture;
afterEach(() => vi.unstubAllGlobals());

it.each(["pid", "selectedParcelGeometry", "mapParcels"])("refuses retained %s independently of layer switches", key => {
  vi.stubGlobal("print", vi.fn());
  const capture = { ...blank, [key]: key === "pid" ? "12345678" : { type: "FeatureCollection", features: [{}] } } as PrintCapture;
  const onClose = vi.fn();
  render(<PrintPreview capture={capture} baseUrl="https://example.test" onClose={onClose} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/permission/i);
  expect(screen.queryByRole("button", { name: "Print / Save PDF" })).toBeNull();
  expect(window.print).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("refuses a direct PrintMap caller before any restricted map is mounted", () => {
  render(<PrintMap snapshot={{ ...blank, layerIds: ["nsprd"] } as unknown as PrintSnapshot}
    bounds={{ north: 46.4, south: 46.2, west: -61.3, east: -61.1 }} includeAerial={false}
    onReadinessChange={vi.fn()} onResolvedPosition={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/permission/i);
  expect(document.querySelector(".leaflet-container")).toBeNull();
});

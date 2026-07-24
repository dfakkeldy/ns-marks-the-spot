import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type CSSProperties, type PropsWithChildren, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeasureTool, type MeasureMode } from "./MeasureTool";

const mapMock = vi.hoisted(() => ({
  doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
}));

const mapEvents = vi.hoisted(() => ({
  current: {} as {
    click?: (event: { latlng: { lat: number; lng: number } }) => void;
    dblclick?: () => void;
    mousemove?: (event: { latlng: { lat: number; lng: number } }) => void;
  },
}));

vi.mock("react-leaflet", () => ({
  CircleMarker: ({
    center,
    eventHandlers,
    interactive,
  }: {
    center: { lat: number; lng: number };
    eventHandlers?: { click?: (event: unknown) => void };
    interactive?: boolean;
  }) => (
    <button
      type="button"
      data-testid="measure-vertex"
      data-center={`${center.lat},${center.lng}`}
      data-interactive={interactive}
      onClick={(event) =>
        eventHandlers?.click?.({ originalEvent: event.nativeEvent })
      }
    />
  ),
  Pane: ({ children }: PropsWithChildren<{ name: string; style?: CSSProperties }>) => (
    <div data-testid="measure-pane">{children}</div>
  ),
  Polygon: ({ positions }: { positions: Array<{ lat: number; lng: number }> }) => (
    <div data-testid="measure-polygon" data-count={positions.length} />
  ),
  Polyline: ({ positions }: { positions: Array<{ lat: number; lng: number }> }) => (
    <div data-testid="measure-line" data-count={positions.length} />
  ),
  useMap: () => mapMock,
  useMapEvents: (handlers: typeof mapEvents.current) => {
    mapEvents.current = handlers;
    return mapMock;
  },
}));

function Harness({ initialMode = "off" }: { initialMode?: MeasureMode }) {
  const [mode, setMode] = useState<MeasureMode>(initialMode);
  return <MeasureTool mode={mode} onModeChange={setMode} />;
}

const clickAt = (lat: number, lng: number) =>
  act(() => mapEvents.current.click?.({ latlng: { lat, lng } }));

beforeEach(() => {
  vi.clearAllMocks();
  mapEvents.current = {};
});

describe("MeasureTool controls", () => {
  it("captures nothing while off", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Measure distance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Measure area" })).toBeInTheDocument();
    expect(mapEvents.current.click).toBeUndefined();
    expect(mapMock.doubleClickZoom.disable).not.toHaveBeenCalled();
  });

  it("suspends double-click zoom only while a mode is active", () => {
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: "Measure distance" });
    // fireEvent, not userEvent: the control now disables dblclick
    // propagation (Fix 1), and userEvent's realistic click simulation
    // treats two quick clicks on the same element as a double-click
    // candidate, which jsdom then fails to deliver once dblclick's
    // propagation is stopped on an ancestor — an artifact of the
    // simulation, not of real browsers.
    fireEvent.click(toggle);
    expect(mapMock.doubleClickZoom.disable).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle);
    expect(mapMock.doubleClickZoom.enable).toHaveBeenCalledTimes(1);
  });
});

describe("distance measuring", () => {
  it("accumulates vertices and reads out the running total", () => {
    render(<Harness initialMode="distance" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tap the map to measure distance",
    );

    clickAt(45, -61);
    clickAt(46, -61); // one degree of latitude ≈ 111.19 km
    expect(screen.getByRole("status")).toHaveTextContent("111.19 km");
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(2);
    expect(screen.getByTestId("measure-line")).toHaveAttribute("data-count", "2");
  });

  it("previews the next leg from the cursor without committing it", () => {
    render(<Harness initialMode="distance" />);
    clickAt(45, -61);
    act(() => mapEvents.current.mousemove?.({ latlng: { lat: 46, lng: -61 } }));
    expect(screen.getByTestId("measure-line")).toHaveAttribute("data-count", "2");
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(1);
    // Readout only reflects committed points.
    expect(screen.getByRole("status")).not.toHaveTextContent("km");
  });

  it("finishes on double-click, dropping the double-click's duplicate vertex", () => {
    render(<Harness initialMode="distance" />);
    clickAt(45, -61);
    clickAt(46, -61);
    // The second click of the double-click pair lands before dblclick fires.
    clickAt(46, -61);
    act(() => mapEvents.current.dblclick?.());
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("111.19 km");

    // After finishing, a fresh click starts a new measurement.
    clickAt(45, -60);
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(1);
  });

  it("finishes on Enter and clears on Escape", () => {
    render(<Harness initialMode="distance" />);
    clickAt(45, -61);
    clickAt(46, -61);
    act(() => {
      fireEvent.keyDown(window, { key: "Enter" });
    });
    expect(screen.getByRole("status")).toHaveTextContent("111.19 km");

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryAllByTestId("measure-vertex")).toHaveLength(0);
    // A second Escape with nothing measured exits measure mode, unmounting
    // the capture layer (observable via the double-click zoom restore —
    // the stale mapEvents capture cannot show the unmount).
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(mapMock.doubleClickZoom.enable).toHaveBeenCalledTimes(1);
  });

  it("ignores Enter and Escape typed into an unrelated input", () => {
    render(<Harness initialMode="distance" />);
    clickAt(45, -61);
    clickAt(46, -61);

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    // Enter from the input must not finish the measurement: a further map
    // click should still extend it (a finished measurement would instead
    // start a fresh one, collapsing back to 1 vertex).
    clickAt(45, -60);
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(3);
    expect(screen.getByRole("status")).not.toHaveTextContent("111.19 km");

    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    // Escape from the input must not clear the in-progress measurement.
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(3);

    input.remove();
  });
});

describe("area measuring", () => {
  it("reads out hectares and acres once a ring exists", () => {
    render(<Harness initialMode="area" />);
    clickAt(45, -61);
    clickAt(45, -60.99);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Tap the map to outline an area",
    );
    clickAt(45.01, -60.99);
    expect(screen.getByRole("status")).toHaveTextContent(/ha · .* ac/);
    expect(screen.getByTestId("measure-polygon")).toHaveAttribute("data-count", "3");
  });

  it("finishes when the first vertex is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness initialMode="area" />);
    clickAt(45, -61);
    clickAt(45, -60.99);
    clickAt(45.01, -60.99);
    const [firstVertex] = screen.getAllByTestId("measure-vertex");
    expect(firstVertex).toHaveAttribute("data-interactive", "true");
    await user.click(firstVertex);
    // Finished: further clicks start a new ring rather than extending this one.
    clickAt(45.02, -60.98);
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(1);
  });

  it("keeps absorbing clicks on the first vertex after the ring is finished", async () => {
    const user = userEvent.setup();
    render(<Harness initialMode="area" />);
    clickAt(45, -61);
    clickAt(45, -60.99);
    clickAt(45.01, -60.99);
    const [firstVertex] = screen.getAllByTestId("measure-vertex");

    await user.click(firstVertex);
    expect(screen.getByRole("status")).toHaveTextContent(/ha · .* ac/);

    // The second click of what would be a double-click on the first vertex
    // must still be absorbed by the vertex — not fall through to the map,
    // which would restart the measurement and then get wiped by the
    // trailing dblclick.
    await user.click(firstVertex);
    expect(screen.getAllByTestId("measure-vertex")).toHaveLength(3);
    expect(screen.getByRole("status")).toHaveTextContent(/ha · .* ac/);
    expect(firstVertex).toHaveAttribute("data-interactive", "true");
  });
});

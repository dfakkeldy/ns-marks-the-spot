import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import type { UserVectorLayerRecord } from "../types";
import { VectorEditPanel, type EditMode } from "./VectorEditPanel";

const record: UserVectorLayerRecord = {
  id: "layer-1",
  name: "Field notes",
  source: "drawn",
  origin: { kind: "drawn", createdAt: "2026-07-31T00:00:00.000Z" },
  createdAt: "2026-07-31T00:00:00.000Z",
  revision: 3,
  style: { color: "#d55e00" },
  featureCount: 2,
  bbox: [-64, 44, -63, 45],
};

const data: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "f1",
      geometry: { type: "Point", coordinates: [-63.5, 44.5] },
      properties: { name: "Gate", description: "<b>Locked</b>" },
    },
    {
      type: "Feature",
      id: "f2",
      geometry: { type: "Point", coordinates: [-63.4, 44.6] },
      properties: {},
    },
  ],
};

function panel(overrides: Partial<Parameters<typeof VectorEditPanel>[0]> = {}) {
  const props = {
    record,
    data,
    selectedFeatureId: null as string | null,
    drawMode: null as EditMode | null,
    storageError: null as string | null,
    onDrawMode: vi.fn(),
    onRename: vi.fn(),
    onUpdateFeature: vi.fn(),
    onDeleteFeature: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
  render(<VectorEditPanel {...props} />);
  return props;
}

describe("VectorEditPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("offers the draw tools the phase supports", () => {
    panel();
    for (const tool of ["Point", "Line", "Area"]) {
      expect(screen.getByRole("button", { name: `Draw ${tool.toLowerCase()}` })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Reshape" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete features" })).toBeInTheDocument();
  });

  it("reports which tool the user picked", async () => {
    const props = panel();
    await userEvent.click(screen.getByRole("button", { name: "Draw area" }));
    expect(props.onDrawMode).toHaveBeenCalledWith("Polygon");
  });

  it("marks the active tool for assistive technology", () => {
    panel({ drawMode: "Polygon" });
    expect(screen.getByRole("button", { name: "Draw area" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Draw point" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  // These fields are controlled by props the parent owns, so a per-keystroke
  // `type()` would replay each character against a value that never updates
  // in an isolated render. fireEvent.change states the contract directly:
  // when the field's value becomes X, the callback receives X.
  it("renames the layer", () => {
    const props = panel();
    fireEvent.change(screen.getByLabelText("Layer name"), {
      target: { value: "Site visit" },
    });
    expect(props.onRename).toHaveBeenLastCalledWith("Site visit");
  });

  it("prompts to pick a feature when none is selected", () => {
    panel();
    expect(screen.getByText(/select a feature/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Feature name")).not.toBeInTheDocument();
  });

  it("edits the selected feature's name and description", () => {
    const props = panel({ selectedFeatureId: "f1" });
    expect(screen.getByLabelText("Feature name")).toHaveValue("Gate");

    fireEvent.change(screen.getByLabelText("Feature name"), {
      target: { value: "Back gate" },
    });
    expect(props.onUpdateFeature).toHaveBeenLastCalledWith("f1", {
      name: "Back gate",
    });

    fireEvent.change(screen.getByLabelText("Feature description"), {
      target: { value: "<b>Locked</b>!" },
    });
    expect(props.onUpdateFeature).toHaveBeenLastCalledWith("f1", {
      description: "<b>Locked</b>!",
    });
  });

  it("shows an imported description as text, never as markup", () => {
    panel({ selectedFeatureId: "f1" });
    const field = screen.getByLabelText("Feature description");
    expect(field).toHaveValue("<b>Locked</b>");
    expect(field.querySelector?.("b")).toBeFalsy();
  });

  it("deletes the selected feature only after confirmation", async () => {
    const props = panel({ selectedFeatureId: "f1" });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    await userEvent.click(screen.getByRole("button", { name: "Delete this feature" }));
    expect(props.onDeleteFeature).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete this feature" }));
    expect(props.onDeleteFeature).toHaveBeenCalledWith("f1");
  });

  it("closes the session", async () => {
    const props = panel();
    await userEvent.click(screen.getByRole("button", { name: "Done editing" }));
    expect(props.onDone).toHaveBeenCalled();
  });

  it("surfaces a storage failure without hiding the tools", () => {
    panel({ storageError: "Storage is full." });
    expect(screen.getByRole("alert")).toHaveTextContent("Storage is full.");
    // Editing must keep working when persistence fails.
    expect(screen.getByRole("button", { name: "Draw point" })).toBeEnabled();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import type { UserVectorLayerRecord } from "../types";
import { featureCorners, type VertexEditOutcome } from "./featureCorners";
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

const baseData: FeatureCollection = {
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

const lineData: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "line-1",
      geometry: {
        type: "LineString",
        coordinates: [
          [-63.5, 44.5],
          [-63.4, 44.5],
          [-63.4, 44.6],
        ],
      },
      properties: { name: "Fence" },
    },
  ],
};

function panel(overrides: Partial<Parameters<typeof VectorEditPanel>[0]> = {}) {
  const data = (overrides.data ?? baseData) as FeatureCollection;
  const props = {
    record,
    data,
    selectedFeatureId: null as string | null,
    drawMode: null as EditMode | null,
    storageError: null as string | null,
    snap: { enabled: true, myFeatures: true, parcels: false },
    parcelSnapStatus: { status: "idle" } as const,
    licenceAccepted: true,
    onSnapChange: vi.fn(),
    onRequestParcelSnapLicence: vi.fn(),
    convertShape: null as "line" | "area" | null,
    conversionPlan: null,
    onConvertShape: vi.fn(),
    onConvertCreate: vi.fn(),
    lastConversion: null as { label: string } | null,
    onUndoConversion: vi.fn(),
    onDrawMode: vi.fn(),
    onRename: vi.fn(),
    onUpdateFeature: vi.fn(),
    onPatchAttributes: vi.fn(),
    photoManager: {
      attachPhotos: vi.fn(async () => []),
      removePhoto: vi.fn(async () => true),
      loadThumbUrl: vi.fn(async () => null),
      loadFullBlob: vi.fn(async () => null),
    },
    onSetFeaturePhotos: vi.fn(),
    onAttachFeaturePhotos: vi.fn(() => []),
    onPhotoCleanupFailed: vi.fn(),
    onMoveFeaturePoint: vi.fn(),
    onFeatureCorners: vi.fn((featureId: string) =>
      featureCorners(
        data.features.find((feature) => String(feature.id) === featureId)
          ?.geometry ?? null,
      ),
    ),
    onMoveVertex: vi.fn(
      (): VertexEditOutcome => ({ status: "done", crossingChecked: true }),
    ),
    onInsertVertex: vi.fn(
      (): VertexEditOutcome => ({ status: "done", crossingChecked: true }),
    ),
    mapCentre: [-63.4, 44.4] as [number, number] | null,
    onOpenPhoto: vi.fn(),
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

  // Done closes the session, and an attach that finishes afterwards has no
  // feature left to land on: its bytes are deleted and the reader loses a
  // photo they watched being added.
  it("holds Done while a photo is still being processed", async () => {
    let finishAttach: ((outcomes: never[]) => void) | undefined;
    panel({
      selectedFeatureId: "f2",
      photoManager: {
        attachPhotos: vi.fn(
          () =>
            new Promise<never[]>((resolve) => {
              finishAttach = resolve;
            }),
        ),
        removePhoto: vi.fn(async () => true),
        loadThumbUrl: vi.fn(async () => null),
        loadFullBlob: vi.fn(async () => null),
      },
    });

    // Two inputs carry that label — the file picker and the camera; the
    // picker is the first.
    fireEvent.change(screen.getAllByLabelText("Add photos from files")[0], {
      target: { files: [new File(["bytes"], "IMG_1.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Finishing a photo…" }),
      ).toBeDisabled(),
    );

    await act(async () => {
      finishAttach?.([]);
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Done editing" })).toBeEnabled(),
    );
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

describe("VectorEditPanel snapping controls", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the pinned not-a-survey caveat whenever the parcels control is visible", () => {
    panel();
    expect(screen.getByLabelText("Parcel boundaries (NSPRD)")).toBeInTheDocument();
    expect(
      screen.getByText("Traced boundaries are not a survey."),
    ).toBeInTheDocument();
    // Both hints ship and styles.css shows exactly one, chosen by pointer
    // type: "Hold Alt" is a keyboard modifier a phone cannot press, so a
    // touch user is pointed at the master toggle above instead.
    expect(
      screen.getByText("Hold Alt to place a vertex without snapping."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Turn off Snap while drawing to place a vertex freely."),
    ).toBeInTheDocument();
  });

  it("hides the target choices, caveat included, when snapping is off entirely", () => {
    panel({ snap: { enabled: false, myFeatures: true, parcels: false } });
    expect(screen.getByLabelText("Snap while drawing")).not.toBeChecked();
    expect(screen.queryByLabelText("Parcel boundaries (NSPRD)")).toBeNull();
    expect(
      screen.queryByText("Traced boundaries are not a survey."),
    ).toBeNull();
  });

  it("routes the parcels toggle through the licence gate before acceptance", async () => {
    const user = userEvent.setup();
    const props = panel({ licenceAccepted: false });
    await user.click(screen.getByLabelText("Parcel boundaries (NSPRD)"));
    expect(props.onRequestParcelSnapLicence).toHaveBeenCalledTimes(1);
    expect(props.onSnapChange).not.toHaveBeenCalled();
  });

  it("toggles parcels directly once the licence is accepted", async () => {
    const user = userEvent.setup();
    const props = panel({ licenceAccepted: true });
    await user.click(screen.getByLabelText("Parcel boundaries (NSPRD)"));
    expect(props.onSnapChange).toHaveBeenCalledWith({
      enabled: true,
      myFeatures: true,
      parcels: true,
    });
    expect(props.onRequestParcelSnapLicence).not.toHaveBeenCalled();
  });

  it("renders each distinct parcel status as its own message", () => {
    const cases = [
      [{ status: "loading" } as const, "Loading parcels…"],
      [{ status: "zoom", minZoom: 16 } as const, "Parcels load at zoom 16+"],
      [
        { status: "dense", count: 900, max: 600 } as const,
        "Too many parcels here (900) — zoom in to snap",
      ],
      [{ status: "error" } as const, "Parcels didn't load"],
      [{ status: "ready", count: 0 } as const, "0 parcels snappable"],
      [{ status: "ready", count: 41 } as const, "41 parcels snappable"],
    ] as const;
    for (const [status, text] of cases) {
      panel({
        snap: { enabled: true, myFeatures: true, parcels: true },
        parcelSnapStatus: status,
      });
      expect(screen.getByText(text)).toBeInTheDocument();
      cleanup();
    }
  });
});

describe("VectorEditPanel points-to-path", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const viablePlan = {
    positions: [
      [-63.5, 44.5],
      [-63.4, 44.6],
    ] as [number, number][],
    sourcePointCount: 2,
    viable: true,
    lengthM: 1234,
    areaM2: null,
    selfIntersects: false,
    traced: false,
  };

  it("offers the section only when the layer has two or more points", () => {
    panel();
    expect(
      screen.getByRole("button", { name: "Line from points" }),
    ).toBeInTheDocument();
    cleanup();
    panel({
      data: {
        type: "FeatureCollection",
        features: baseData.features.slice(0, 1),
      },
    });
    expect(
      screen.queryByRole("button", { name: "Line from points" }),
    ).toBeNull();
  });

  it("arms a shape and shows the plan's stats", async () => {
    const user = userEvent.setup();
    const props = panel();
    await user.click(screen.getByRole("button", { name: "Area from points" }));
    expect(props.onConvertShape).toHaveBeenCalledWith("area");
    cleanup();

    panel({ convertShape: "line", conversionPlan: viablePlan });
    expect(screen.getByText(/2 points → 1\.23 km/)).toBeInTheDocument();
  });

  it("creates with the keep-source default and cancels cleanly", async () => {
    const user = userEvent.setup();
    const props = panel({ convertShape: "line", conversionPlan: viablePlan });
    await user.click(screen.getByRole("button", { name: "Create line" }));
    expect(props.onConvertCreate).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onConvertShape).toHaveBeenCalledWith(null);
  });

  it("disables Create and explains when the plan is not viable", () => {
    panel({
      convertShape: "area",
      conversionPlan: { ...viablePlan, viable: false, areaM2: null },
    });
    expect(
      screen.getByText("An area needs at least 3 distinct points."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create area" })).toBeDisabled();
  });

  it("warns about a self-crossing path", () => {
    panel({
      convertShape: "area",
      conversionPlan: { ...viablePlan, selfIntersects: true, areaM2: 100 },
    });
    expect(
      screen.getByText(/crosses itself — check the numbered order/),
    ).toBeInTheDocument();
  });

  it("shows the one-shot undo affordance", async () => {
    const user = userEvent.setup();
    const props = panel({ lastConversion: { label: "Converted 3 points" } });
    expect(screen.getByText("Converted 3 points")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(props.onUndoConversion).toHaveBeenCalled();
  });
});

describe("VectorEditPanel's corner mover", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // The whole point of the control: a corner reaches a new position with no
  // drag and no 10px target, because the map's own centre is the pointer.
  it("moves the chosen corner to the map centre without asking for a drag", async () => {
    const user = userEvent.setup();
    const props = panel({
      data: lineData,
      selectedFeatureId: "line-1",
      mapCentre: [-63.45, 44.55],
    });

    await user.selectOptions(
      screen.getByLabelText("Corner"),
      "2",
    );
    await user.click(screen.getByRole("button", { name: "Move corner here" }));

    expect(props.onMoveVertex).toHaveBeenCalledWith("line-1", 2, [
      -63.45, 44.55,
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Corner 2 moved to the centre of the map.",
    );
  });

  it("adds a corner after the chosen one", async () => {
    const user = userEvent.setup();
    const props = panel({
      data: lineData,
      selectedFeatureId: "line-1",
      mapCentre: [-63.45, 44.55],
    });

    await user.click(screen.getByRole("button", { name: "Add a corner here" }));

    expect(props.onInsertVertex).toHaveBeenCalledWith("line-1", 1, [
      -63.45, 44.55,
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "A corner was added here, after corner 1.",
    );
  });

  it("says the corner has not moved when the move would cross the shape", async () => {
    const user = userEvent.setup();
    panel({
      data: lineData,
      selectedFeatureId: "line-1",
      mapCentre: [-63.45, 44.55],
      onMoveVertex: vi.fn(
        (): VertexEditOutcome => ({ status: "would-cross" }),
      ),
    });

    await user.click(screen.getByRole("button", { name: "Move corner here" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Corner 1 has not moved: putting it there would make this shape cross itself.",
    );
  });

  // A cap that goes unmentioned reads as "checked and fine".
  it("repeats that a long shape was not checked for crossings", async () => {
    const user = userEvent.setup();
    panel({
      data: lineData,
      selectedFeatureId: "line-1",
      mapCentre: [-63.45, 44.55],
      onMoveVertex: vi.fn(
        (): VertexEditOutcome => ({ status: "done", crossingChecked: false }),
      ),
    });

    await user.click(screen.getByRole("button", { name: "Move corner here" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "too many corners to check whether it now crosses itself",
    );
  });

  it("offers a Point the move but not the insert", () => {
    panel({ selectedFeatureId: "f1", mapCentre: [-63.45, 44.55] });
    expect(
      screen.getByRole("button", { name: "Move corner here" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Add a corner here" }),
    ).toBeDisabled();
  });

  // Nothing to point at yet, so nothing is offered — and the reason is said
  // rather than left as two dead buttons.
  it("waits for the map to settle before offering to place a corner", () => {
    panel({
      data: lineData,
      selectedFeatureId: "line-1",
      mapCentre: null,
    });
    expect(
      screen.getByRole("button", { name: "Move corner here" }),
    ).toBeDisabled();
    expect(screen.getByText(/The map has not settled yet/)).toBeInTheDocument();
  });

  it("offers no corner mover for geometry the live layer could not follow", () => {
    panel({
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "mp",
            geometry: {
              type: "MultiPoint",
              coordinates: [
                [-63.5, 44.5],
                [-63.4, 44.6],
              ],
            },
            properties: {},
          },
        ],
      },
      selectedFeatureId: "mp",
      mapCentre: [-63.45, 44.55],
    });
    expect(screen.queryByLabelText("Corner")).toBeNull();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeatureCollection } from "geojson";
import type { PhotoAttachOutcome } from "../photos/usePhotoManager";
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
  const { rerender } = render(<VectorEditPanel {...props} />);
  return Object.assign(props, {
    /** Renders again with the same callbacks and these props changed. */
    rerender(next: Partial<Parameters<typeof VectorEditPanel>[0]>) {
      Object.assign(props, next);
      rerender(<VectorEditPanel {...props} />);
    },
  });
}

/**
 * A photo manager whose attaches finish when the test says so, one answer
 * per attach, in the order they were asked for.
 */
function heldPhotoManager() {
  const answers: Array<(outcomes: PhotoAttachOutcome[]) => void> = [];
  return {
    answers,
    attachPhotos: vi.fn(
      () =>
        new Promise<PhotoAttachOutcome[]>((resolve) => {
          answers.push(resolve);
        }),
    ),
    removePhoto: vi.fn(async () => true),
    loadThumbUrl: vi.fn(async () => null),
    loadFullBlob: vi.fn(async () => null),
  };
}

/**
 * Picks a file through the strip's hidden input, as the "Add photos" button's
 * picker would. Reaching the input directly skips the button, so it also
 * shows whether the strip itself refuses a pick while it is held.
 */
function pickPhoto(fileName: string) {
  fireEvent.change(screen.getByLabelText("Add photos from files"), {
    target: { files: [new File(["bytes"], fileName, { type: "image/jpeg" })] },
  });
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
    const photoManager = heldPhotoManager();
    panel({ selectedFeatureId: "f2", photoManager });

    pickPhoto("IMG_1.jpg");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Finishing a photo…" }),
      ).toBeDisabled(),
    );
    // Done already says it; the strip doing the attach adds no second note.
    expect(screen.queryByText(/Another photo is still being added/)).toBeNull();

    await act(async () => {
      photoManager.answers[0]([]);
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Done editing" })).toBeEnabled(),
    );
  });

  // The offer's button moves whichever point the strip is showing. A photo
  // taken at the first feature's spot must never become an offer to move the
  // second one there.
  it("keeps a photo's location offer with the feature it was added to", async () => {
    const photoManager = heldPhotoManager();
    const props = panel({ selectedFeatureId: "f1", photoManager });

    pickPhoto("IMG_1.jpg");
    await waitFor(() => expect(photoManager.answers).toHaveLength(1));

    props.rerender({ selectedFeatureId: "f2" });
    await act(async () => {
      photoManager.answers[0]([
        {
          fileName: "IMG_1.jpg",
          ok: true,
          descriptor: { id: "p1", sourceName: "IMG_1.jpg", width: 10, height: 10 },
          gps: { lon: -60.91, lat: 46.12 },
        },
        { fileName: "bad.heic", ok: false, message: "Unsupported." },
      ]);
    });

    // The photo still lands on the feature it was added to.
    expect(props.onAttachFeaturePhotos).toHaveBeenCalledWith("layer-1", "f1", [
      { id: "p1", sourceName: "IMG_1.jpg", width: 10, height: 10 },
    ]);
    // But nothing from that attach is shown on the feature now selected.
    expect(
      screen.queryByRole("button", { name: "Move point to photo's location" }),
    ).toBeNull();
    expect(screen.queryByText(/bad\.heic/)).toBeNull();
  });

  // Each selection mounts its own strip, and an attach outlives the strip it
  // began in. While it runs, Done stays held (a photo that finishes after the
  // session closes is lost) and no strip starts another: the photo limits
  // are counted when an attach starts, so two running together could each
  // count without the other's photos and pass the limit between them.
  // Coming back to the same feature is the case that matters for the
  // per-feature limit, and it mounts a new strip under the same id. Going
  // through no selection at all mounted a fresh strip even before strips
  // were keyed.
  it.each<[string, Array<string | null>]>([
    ["another feature", ["f2"]],
    ["the same feature, selected again", ["f2", "f1"]],
    ["no feature, then another", [null, "f2"]],
  ])("starts no other photo attach until the running one ends (%s)", async (_, selections) => {
    const photoManager = heldPhotoManager();
    const props = panel({ selectedFeatureId: "f1", photoManager });

    pickPhoto("IMG_1.jpg");
    await waitFor(() => expect(photoManager.answers).toHaveLength(1));

    for (const selectedFeatureId of selections) {
      props.rerender({ selectedFeatureId });
    }
    expect(
      screen.getByRole("button", { name: "Finishing a photo…" }),
    ).toBeDisabled();
    for (const name of ["Add photos", "Take photo"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      // Heard at the button, not only read in page order.
      expect(button).toHaveAccessibleDescription(
        /Another photo is still being added/,
      );
    }
    pickPhoto("IMG_2.jpg");
    expect(photoManager.attachPhotos).toHaveBeenCalledTimes(1);

    // The strip that started it has gone; its end still releases both.
    await act(async () => {
      photoManager.answers[0]([]);
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Done editing" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "Add photos" })).toBeEnabled();
    expect(screen.queryByText(/Another photo is still being added/)).toBeNull();

    pickPhoto("IMG_3.jpg");
    await waitFor(() => expect(photoManager.answers).toHaveLength(2));
    expect(
      screen.getByRole("button", { name: "Finishing a photo…" }),
    ).toBeDisabled();
    expect(screen.queryByText(/Another photo is still being added/)).toBeNull();
    await act(async () => {
      photoManager.answers[1]([]);
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Done editing" })).toBeEnabled(),
    );
  });

  // A full feature's buttons stay disabled after the other attach ends, so
  // "you can add more when it has finished" would not be true there.
  it("tells a full feature nothing about waiting for another photo", async () => {
    const photoManager = heldPhotoManager();
    const full: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        baseData.features[0],
        {
          ...baseData.features[1],
          properties: {
            "nsmts:photos": Array.from({ length: 20 }, (_, index) => ({
              id: `full-${index}`,
            })),
          },
        },
      ],
    };
    const props = panel({ data: full, selectedFeatureId: "f1", photoManager });

    pickPhoto("IMG_1.jpg");
    await waitFor(() => expect(photoManager.answers).toHaveLength(1));
    props.rerender({ selectedFeatureId: "f2" });

    expect(screen.getByRole("button", { name: "Add photos" })).toBeDisabled();
    expect(screen.queryByText(/Another photo is still being added/)).toBeNull();
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

  // Distance alone does not identify a corner: every corner of a square
  // centred on the map is the same distance away, and the handles on screen
  // carry no numbers.
  it("says which way the chosen corner lies, not only how far", async () => {
    const user = userEvent.setup();
    panel({
      data: lineData,
      selectedFeatureId: "line-1",
      // South-east of the first corner at [-63.5, 44.5].
      mapCentre: [-63.6, 44.6],
    });
    expect(screen.getByText(/south-east of the centre of the map/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Corner"), "3");
    // [-63.4, 44.6] is due east of [-63.6, 44.6].
    expect(screen.getByText(/east of the centre of the map/)).toBeInTheDocument();
  });

  it("says a corner already at the centre is at the centre", () => {
    panel({
      data: lineData,
      selectedFeatureId: "line-1",
      mapCentre: [-63.5, 44.5],
    });
    expect(
      screen.getByText(/Corner 1 is at the centre of the map/),
    ).toBeInTheDocument();
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

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserVectorLayerRecord } from "../types";
import type { UserVectorLayersApi } from "../useUserVectorLayers";
import { UserVectorControls, UserVectorRows } from "./UserVectorRows";

function record(id: string, overrides: Partial<UserVectorLayerRecord> = {}): UserVectorLayerRecord {
  return {
    id,
    name: `Layer ${id}`,
    source: "geojson",
    origin: {
      kind: "imported",
      filename: `${id}.geojson`,
      importedAt: "2026-07-30T00:00:00.000Z",
    },
    createdAt: "2026-07-30T00:00:00.000Z",
    revision: 0,
    style: { color: "#d55e00" },
    featureCount: 3,
    bbox: [-64, 44, -63, 45],
    ...overrides,
  };
}

function api(overrides: Partial<UserVectorLayersApi> = {}): UserVectorLayersApi {
  return {
    records: [],
    uiState: {},
    visibleLayers: [],
    fitRequest: null,
    importing: false,
    importingLabel: null,
    storageError: null,
    outcomes: [],
    importFiles: vi.fn(async () => {}),
    removeLayer: vi.fn(async () => {}),
    setEnabled: vi.fn(),
    exportLayer: vi.fn(async () => {}),
    exportRawRecording: vi.fn(async () => {}),
    createDrawnLayer: vi.fn(async () => "new-layer"),
    ensureFieldNotesLayer: vi.fn(async () => "field-notes"),
    createRecordedLayer: vi.fn(async () => record("recorded-layer")),
    appendFeatures: vi.fn(async () => null),
    createPhotoLayer: vi.fn(async () => ({ id: null, notes: [] })),
    applyLayerEdit: vi.fn(),
    geometries: {},
    putVectorLayer: vi.fn(async () => true),
    ...overrides,
  };
}

describe("UserVectorRows", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("exposes the controls without owning another category disclosure", () => {
    const onNewLayer = vi.fn();
    render(<UserVectorControls api={api()} onNewLayer={onNewLayer} />);

    expect(screen.queryByText("Your data")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New drawing layer" })).toBeInTheDocument();
  });

  it("renders nothing but the group shell when no layers exist", () => {
    render(<UserVectorRows api={api()} />);
    expect(screen.getByText("Your data")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows each layer with its user-loaded provenance and feature count", () => {
    render(
      <UserVectorRows
        api={api({
          records: [record("camps")],
          uiState: { camps: { enabled: true } },
        })}
      />,
    );
    expect(screen.getByText("Layer camps")).toBeInTheDocument();
    expect(screen.getByText(/Your file · camps\.geojson · 3 features/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Layer camps" })).toBeChecked();
  });

  it("labels drawn layers as drawn on this device", () => {
    render(
      <UserVectorRows
        api={api({
          records: [
            record("sketch", {
              source: "drawn",
              origin: { kind: "drawn", createdAt: "2026-07-30T00:00:00.000Z" },
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/Drawn on this device · 3 features/)).toBeInTheDocument();
  });

  it("offers GPX export on every row and Raw GPX only on recorded layers", async () => {
    const user = userEvent.setup();
    const layers = api({
      records: [
        record("camps"),
        record("walk", {
          source: "recorded",
          origin: {
            kind: "recorded",
            startedAt: "2026-08-29T14:00:00.000Z",
            endedAt: "2026-08-29T14:20:00.000Z",
          },
        }),
      ],
    });
    render(<UserVectorRows api={layers} />);

    expect(
      screen.getByRole("button", {
        name: "Export Layer camps as GPX (points and tracks only)",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Download the raw recording for Layer camps",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Download the raw recording for Layer walk",
      }),
    );
    expect(layers.exportRawRecording).toHaveBeenCalledWith("walk");
  });

  it("labels recorded layers as recorded on this device", () => {
    render(
      <UserVectorRows
        api={api({
          records: [
            record("walk", {
              source: "recorded",
              origin: {
                kind: "recorded",
                startedAt: "2026-08-28T14:00:00.000Z",
                endedAt: "2026-08-28T14:20:00.000Z",
              },
            }),
          ],
        })}
      />,
    );
    expect(
      screen.getByText(/Recorded on this device · 3 features/),
    ).toBeInTheDocument();
  });

  it("toggles a layer through setEnabled", async () => {
    const layers = api({
      records: [record("camps")],
      uiState: { camps: { enabled: false } },
    });
    render(<UserVectorRows api={layers} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Layer camps" }));
    expect(layers.setEnabled).toHaveBeenCalledWith("camps", true);
  });

  it("removes only after the user confirms", async () => {
    const layers = api({ records: [record("camps")] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<UserVectorRows api={layers} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove Layer camps" }));
    expect(layers.removeLayer).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Remove Layer camps" }));
    expect(layers.removeLayer).toHaveBeenCalledWith("camps");
  });

  it("offers GeoJSON and KML export per layer", async () => {
    const layers = api({ records: [record("camps")] });
    render(<UserVectorRows api={layers} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Export Layer camps as GeoJSON" }),
    );
    expect(layers.exportLayer).toHaveBeenCalledWith("camps", "geojson");

    await userEvent.click(
      screen.getByRole("button", { name: "Export Layer camps as KML" }),
    );
    expect(layers.exportLayer).toHaveBeenCalledWith("camps", "kml");
  });

  it("offers KMZ export with photos embedded per layer", async () => {
    const layers = api({ records: [record("camps")] });
    render(<UserVectorRows api={layers} />);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Export Layer camps as KMZ with photos embedded",
      }),
    );
    expect(layers.exportLayer).toHaveBeenCalledWith("camps", "kmz");
    // The photo-free formats say so instead of silently dropping photos.
    expect(
      screen.getByRole("button", { name: "Export Layer camps as GeoJSON" }),
    ).toHaveAttribute("title", expect.stringContaining("use KMZ"));
    expect(
      screen.getByRole("button", { name: "Export Layer camps as KML" }),
    ).toHaveAttribute("title", expect.stringContaining("use KMZ"));
  });

  it("labels photo-import layers with their photo provenance", () => {
    render(
      <UserVectorRows
        api={api({
          records: [
            record("snaps", {
              source: "photos",
              origin: {
                kind: "photo-import",
                count: 3,
                importedAt: "2026-08-30T00:00:00.000Z",
              },
            }),
          ],
        })}
      />,
    );
    expect(
      screen.getByText(/From your photos · 3 photos · 3 features/),
    ).toBeInTheDocument();
  });

  it("offers bulk photo placement when the app wires it", async () => {
    const onBulkPhotos = vi.fn();
    render(<UserVectorRows api={api()} onBulkPhotos={onBulkPhotos} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Add photos to map" }),
    );
    expect(onBulkPhotos).toHaveBeenCalled();
  });

  it("starts an edit session for a layer", async () => {
    const onEdit = vi.fn();
    render(<UserVectorRows api={api({ records: [record("camps")] })} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Layer camps" }));
    expect(onEdit).toHaveBeenCalledWith("camps");
  });

  it("offers a new drawing layer even with nothing loaded", async () => {
    const onNewLayer = vi.fn();
    render(<UserVectorRows api={api()} onNewLayer={onNewLayer} />);
    await userEvent.click(screen.getByRole("button", { name: "New drawing layer" }));
    expect(onNewLayer).toHaveBeenCalled();
  });

  it("marks the layer currently being edited", () => {
    render(
      <UserVectorRows
        api={api({ records: [record("camps"), record("wells")] })}
        onEdit={vi.fn()}
        editingId="camps"
      />,
    );
    expect(screen.getByRole("button", { name: "Edit Layer camps" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Edit Layer wells" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("labels a drawn layer as edited once it has been changed", () => {
    render(
      <UserVectorRows
        api={api({
          records: [
            record("sketch", {
              source: "drawn",
              origin: { kind: "drawn", createdAt: "2026-07-31T00:00:00.000Z" },
              modifiedAt: "2026-07-31T12:00:00.000Z",
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/Drawn on this device · edited/)).toBeInTheDocument();
  });

  it("surfaces the vector store's storage error", () => {
    render(
      <UserVectorRows
        api={api({ storageError: "Saved data layers are unavailable in this browser session." })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/unavailable/);
  });
});

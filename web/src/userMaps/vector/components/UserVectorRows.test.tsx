import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserVectorLayerRecord } from "../types";
import type { UserVectorLayersApi } from "../useUserVectorLayers";
import { UserVectorRows } from "./UserVectorRows";

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
    ...overrides,
  };
}

describe("UserVectorRows", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

  it("surfaces the vector store's storage error", () => {
    render(
      <UserVectorRows
        api={api({ storageError: "Saved data layers are unavailable in this browser session." })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/unavailable/);
  });
});

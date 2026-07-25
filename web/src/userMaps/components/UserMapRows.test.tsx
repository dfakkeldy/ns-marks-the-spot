import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UserMapsApi } from "../useUserMaps";
import type { UserMapRecord } from "../types";
import { UserMapRows } from "./UserMapRows";

const record: UserMapRecord = {
  id: "a",
  name: "Church survey",
  source: "geotiff",
  createdAt: "2026-07-24T00:00:00.000Z",
  pixelSize: { width: 8, height: 6 },
  georef: {
    kind: "embedded",
    crs: "EPSG:26920",
    geotransform: [500000, 10, 0, 5000000, 0, -10],
  },
};

function api(overrides: Partial<UserMapsApi> = {}): UserMapsApi {
  return {
    records: [],
    uiState: {},
    visibleMaps: [],
    importing: false,
    importingLabel: null,
    storageError: null,
    outcomes: [],
    importFiles: vi.fn(async () => {}),
    removeMap: vi.fn(async () => {}),
    renameMap: vi.fn(async () => {}),
    setEnabled: vi.fn(),
    setOpacity: vi.fn(),
    ...overrides,
  };
}

describe("UserMapRows", () => {
  it("shows the privacy promise verbatim", () => {
    render(<UserMapRows api={api()} />);
    expect(
      screen.getByText("Files stay on this device — nothing is uploaded."),
    ).toBeInTheDocument();
  });

  it("imports the chosen files", async () => {
    const testApi = api();
    render(<UserMapRows api={testApi} />);
    const input = screen.getByLabelText("Add a map file");
    await userEvent.upload(input, new File(["x"], "survey.tif"));
    expect(testApi.importFiles).toHaveBeenCalledTimes(1);
  });

  it("imports files dropped onto the import area", () => {
    const testApi = api();
    render(<UserMapRows api={testApi} />);
    const dropZone = screen.getByTestId("user-map-drop-zone");
    const file = new File(["x"], "survey.tif");
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    expect(testApi.importFiles).toHaveBeenCalledWith([file]);
  });

  it("shows the storage banner when persistence is unavailable", () => {
    render(
      <UserMapRows
        api={api({ storageError: "Saved maps are unavailable in this browser session." })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
  });

  it("renders a toggle and an Opacity slider per map", () => {
    const testApi = api({
      records: [record],
      uiState: { a: { enabled: true, opacity: 0.7 } },
    });
    render(<UserMapRows api={testApi} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Church survey" }));
    expect(testApi.setEnabled).toHaveBeenCalledWith("a", false);

    const slider = screen.getByLabelText("Church survey opacity");
    fireEvent.change(slider, { target: { value: "30" } });
    expect(testApi.setOpacity).toHaveBeenCalledWith("a", 0.3);
  });

  it("asks for confirmation before deleting", () => {
    const testApi = api({
      records: [record],
      uiState: { a: { enabled: true, opacity: 0.7 } },
    });
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<UserMapRows api={testApi} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Church survey" }));
    expect(testApi.removeMap).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("lists import failures with their messages", () => {
    render(
      <UserMapRows
        api={api({
          outcomes: [
            { fileName: "plan.pdf", ok: false, message: "Coming with the georeferencer." },
          ],
        })}
      />,
    );
    expect(screen.getByText(/plan\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Coming with the georeferencer\./)).toBeInTheDocument();
  });
});

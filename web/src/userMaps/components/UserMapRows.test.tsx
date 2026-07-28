import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  needsFrameSelection,
  needsGeoreferencing,
  type UserMapsApi,
} from "../useUserMaps";
import type { Gcp, UserMapRecord } from "../types";
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
    setEnabled: vi.fn(),
    setOpacity: vi.fn(),
    georeferencingId: null,
    editingMap: null,
    frameChoosingId: null,
    frameChoosingMap: null,
    beginGeoreference: vi.fn(),
    endGeoreference: vi.fn(),
    beginFrameSelection: vi.fn(),
    endFrameSelection: vi.fn(),
    selectPdfFrame: vi.fn(async () => {}),
    saveGcps: vi.fn(async () => {}),
    setGeorefMethod: vi.fn(async () => {}),
    // The real predicate, not a stub: a row's draft/placed appearance is
    // decided by actual GCP counts, so a fake here would let a wrong one pass.
    needsGeoreferencing,
    needsFrameSelection,
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

  // --- Overlapping imports ---------------------------------------------------
  //
  // Dropping/selecting a second file while the first is still parsing used to
  // start a second concurrent importFiles run: the first import's `finally`
  // would clear the progress indicator mid-flight, and the second batch's
  // outcomes would overwrite the first's, so the user never saw confirmation
  // their first map imported. The fix disables the file input and ignores
  // drops while `importing` is true, so a second run can never start.

  it("disables the file input while an import is already in progress", () => {
    render(
      <UserMapRows
        api={api({ importing: true, importingLabel: 'Reading "survey.tif"…' })}
      />,
    );
    expect(screen.getByLabelText("Add a map file")).toBeDisabled();
  });

  it("ignores a file dropped while an import is already in progress", () => {
    const testApi = api({ importing: true, importingLabel: 'Reading "survey.tif"…' });
    render(<UserMapRows api={testApi} />);
    const dropZone = screen.getByTestId("user-map-drop-zone");
    const file = new File(["x"], "second.tif");
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    expect(testApi.importFiles).not.toHaveBeenCalled();
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

  it("removes the map once the user confirms", () => {
    const testApi = api({
      records: [record],
      uiState: { a: { enabled: true, opacity: 0.7 } },
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<UserMapRows api={testApi} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Church survey" }));
    expect(testApi.removeMap).toHaveBeenCalledWith("a");
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

const NEEDS_WORK: UserMapRecord = {
  id: "scan",
  name: "Church of Inverness 1888",
  source: "image",
  createdAt: "2026-07-25T00:00:00.000Z",
  pixelSize: { width: 1200, height: 800 },
  georef: { kind: "gcp", method: "affine", gcps: [] },
};

const PLACED_GCPS: Gcp[] = [
  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
  { id: "b", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
  { id: "c", pixel: { x: 0, y: 800 }, map: { lat: 46.0, lng: -61.2 } },
];

describe("georeferencing affordance", () => {
  it("says a scan cannot be drawn yet, and why", () => {
    render(<UserMapRows api={api({ records: [NEEDS_WORK] })} />);
    expect(screen.getByText("Needs georeferencing")).toBeInTheDocument();
    // A checkbox that turns on a layer which then draws nothing is a lie.
    expect(
      screen.getByRole("checkbox", { name: NEEDS_WORK.name }),
    ).toBeDisabled();
    // …and neither is an opacity slider for a map with no placement. The
    // spec puts the Georeference button exactly where that slider sits.
    expect(
      screen.queryByLabelText(`${NEEDS_WORK.name} opacity`),
    ).toBeNull();
  });

  it("opens the georeferencer for the map that was clicked", async () => {
    const beginGeoreference = vi.fn();
    render(
      <UserMapRows
        api={api({ records: [NEEDS_WORK], beginGeoreference })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Georeference Church of Inverness 1888" }),
    );
    expect(beginGeoreference).toHaveBeenCalledWith("scan");
  });

  it("still refuses to draw a half-placed draft", () => {
    // The test that separates the real predicate (< MIN_GCPS_FOR_AFFINE) from
    // a plausible `gcps.length === 0`. Two points solve nothing, so the row
    // must stay in the needs-work state — otherwise its checkbox turns on a
    // layer that `visibleMaps` refuses to include and nothing is drawn.
    render(
      <UserMapRows
        api={api({
          records: [
            {
              ...NEEDS_WORK,
              georef: {
                kind: "gcp",
                method: "affine",
                gcps: PLACED_GCPS.slice(0, 2),
              },
            },
          ],
          uiState: { scan: { enabled: true, opacity: 0.7 } },
        })}
      />,
    );
    expect(screen.getByText("Needs georeferencing")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: NEEDS_WORK.name }),
    ).toBeDisabled();
  });

  it("refuses to draw three points that do not solve, not just too few", () => {
    // The test that separates PLACEABILITY from a pure count. These three
    // points sit on the scan's top neatline — affine.ts calls that "the
    // layout users actually produce" — so the point cloud's condition ratio
    // is 0 and solveAffineFromGcps refuses them. meshForRecord returns null
    // for exactly this record (recordMesh.test.ts proves it in its own file),
    // so a count-only `gcps.length < MIN_GCPS_FOR_AFFINE` predicate hands it
    // an ENABLED checkbox, an opacity slider and no badge — then nothing is
    // ever drawn. Both of the other fixtures in this describe have 0 or 2
    // points, so neither can catch that.
    render(
      <UserMapRows
        api={api({
          records: [
            {
              ...NEEDS_WORK,
              georef: {
                kind: "gcp",
                method: "affine",
                gcps: [
                  { id: "a", pixel: { x: 0, y: 0 }, map: { lat: 46.1, lng: -61.2 } },
                  { id: "b", pixel: { x: 600, y: 0 }, map: { lat: 46.1, lng: -61.1 } },
                  { id: "c", pixel: { x: 1200, y: 0 }, map: { lat: 46.1, lng: -61.0 } },
                ],
              },
            },
          ],
          uiState: { scan: { enabled: true, opacity: 0.7 } },
        })}
      />,
    );
    expect(screen.getByText("Needs georeferencing")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: NEEDS_WORK.name }),
    ).toBeDisabled();
    expect(
      screen.queryByLabelText(`${NEEDS_WORK.name} opacity`),
    ).toBeNull();
    // The button offers a fresh start, not "Adjust points": these points are
    // saved, but they place nothing.
    expect(
      screen.getByRole("button", { name: `Georeference ${NEEDS_WORK.name}` }),
    ).toBeInTheDocument();
  });

  it("offers a placed map its points back rather than a fresh start", () => {
    // Copy matches the spec: "Adjust points", not "Edit points".
    render(
      <UserMapRows
        api={api({
          records: [
            { ...NEEDS_WORK, georef: { kind: "gcp", method: "affine", gcps: PLACED_GCPS } },
          ],
          uiState: { scan: { enabled: true, opacity: 0.7 } },
        })}
      />,
    );
    expect(screen.queryByText("Needs georeferencing")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adjust points for Church of Inverness 1888" }),
    ).toBeInTheDocument();
    // A placed map draws, so it keeps its slider.
    expect(
      screen.getByLabelText("Church of Inverness 1888 opacity"),
    ).toBeInTheDocument();
  });

  it("offers no point editing for a map that carries its own georeferencing", () => {
    // An embedded GeoTIFF has a geotransform, not control points. There is
    // nothing for the GCP editor to edit. The field is `geotransform`
    // (lower-case, a 6-tuple) — read types.ts / projection.ts, and note the
    // fixture at the top of this very file already has one to copy.
    render(
      <UserMapRows
        api={api({
          records: [
            {
              ...NEEDS_WORK,
              source: "geotiff",
              georef: {
                kind: "embedded",
                crs: "EPSG:26920",
                geotransform: [500000, 10, 0, 5000000, 0, -10],
              },
            },
          ],
        })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Georeference|Adjust points/ }),
    ).toBeNull();
  });
});

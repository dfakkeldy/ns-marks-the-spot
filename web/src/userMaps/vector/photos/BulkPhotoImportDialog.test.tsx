import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BulkPhotoImportDialog } from "./BulkPhotoImportDialog";
import type { readPhotoExif } from "./exif";

const BOUNDS = { west: -64, south: 44, east: -63, north: 45 };

type ExifResult = Awaited<ReturnType<typeof readPhotoExif>>;

function exifByName(byName: Record<string, ExifResult>) {
  return async (file: File): Promise<ExifResult> =>
    byName[file.name] ?? { gps: null, capturedAt: null };
}

function pickFiles(files: File[]) {
  const input = screen.getByLabelText("Choose photos to place");
  fireEvent.change(input, { target: { files } });
}

describe("BulkPhotoImportDialog", () => {
  afterEach(cleanup);

  it("classifies picked photos and creates points only for the confirmed ones", async () => {
    const onCreate = vi.fn(async () => ({ id: "layer-1", notes: [] }));
    render(
      <BulkPhotoImportDialog
        bounds={BOUNDS}
        onCreate={onCreate}
        onClose={vi.fn()}
        readExif={exifByName({
          "inside.jpg": {
            gps: { lon: -63.5, lat: 44.5 },
            capturedAt: "2026-08-20T12:00:00Z",
          },
          "outside.jpg": { gps: { lon: -60, lat: 46 }, capturedAt: null },
          "untagged.jpg": { gps: null, capturedAt: null },
        })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Choose photos" }));
    pickFiles([
      new File([], "inside.jpg"),
      new File([], "outside.jpg"),
      new File([], "untagged.jpg"),
    ]);

    await waitFor(() =>
      expect(screen.getByText("In current view")).toBeInTheDocument(),
    );
    expect(screen.getByText("Outside current view")).toBeInTheDocument();
    expect(screen.getByText("No location in this photo")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[2]).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Create 1 point" }),
    );
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith([
      expect.objectContaining({
        gps: { lon: -63.5, lat: 44.5 },
        capturedAt: "2026-08-20T12:00:00Z",
      }),
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Points created/,
    );
  });

  it("lets the user check an out-of-view photo before creating", async () => {
    const onCreate = vi.fn(async () => ({ id: "layer-1", notes: [] }));
    render(
      <BulkPhotoImportDialog
        bounds={BOUNDS}
        onCreate={onCreate}
        onClose={vi.fn()}
        readExif={exifByName({
          "outside.jpg": { gps: { lon: -60, lat: 46 }, capturedAt: null },
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Choose photos" }));
    pickFiles([new File([], "outside.jpg")]);
    await waitFor(() =>
      expect(screen.getByText("Outside current view")).toBeInTheDocument(),
    );

    expect(
      screen.getByRole("button", { name: "Create 0 points" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Create 1 point" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
  });

  it("shows outcome notes without claiming success when no layer was created", async () => {
    const onCreate = vi.fn(async () => ({
      id: null,
      notes: ["Photo storage is unavailable."],
    }));
    render(
      <BulkPhotoImportDialog
        bounds={BOUNDS}
        onCreate={onCreate}
        onClose={vi.fn()}
        readExif={exifByName({
          "inside.jpg": { gps: { lon: -63.5, lat: 44.5 }, capturedAt: null },
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Choose photos" }));
    pickFiles([new File([], "inside.jpg")]);
    await waitFor(() =>
      expect(screen.getByText("In current view")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Create 1 point" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // The create button stays available for a retry.
    expect(
      screen.getByRole("button", { name: "Create 1 point" }),
    ).toBeInTheDocument();
  });

  it("closes from the backdrop and the cancel button", async () => {
    const onClose = vi.fn();
    render(
      <BulkPhotoImportDialog bounds={null} onCreate={vi.fn()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

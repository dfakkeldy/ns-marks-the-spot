import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExportDialog, type ExportDialogProps } from "./ExportDialog";
import type { CompositorResult } from "./mapCompositor";

/** Lets a real (non-mocked) in-flight microtask/macrotask chain — like the
 * real `canvasToJpegBytes` encode path — settle before we assert on it. */
function flush(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };

function renderDialog(overrides: Partial<ExportDialogProps> = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const props: ExportDialogProps = {
    orientation: "portrait",
    bounds,
    layers: [],
    defaultTitle: "Parcel 50123456",
    attributionLines: ["Base map © OpenStreetMap contributors"],
    shareUrl: "https://kinnokilabs.com/map?mode=explore",
    onClose: vi.fn(),
    composeImage: vi.fn().mockResolvedValue({
      canvas,
      statuses: [{ id: "modern", name: "OpenStreetMap base map", status: "rendered" }],
    }),
    composePdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
    saveFile: vi.fn(),
    ...overrides,
  };
  return { ...render(<ExportDialog {...props} />), props };
}

describe("ExportDialog", () => {
  it("prefills the title and lets the user edit fields", async () => {
    renderDialog();
    const title = screen.getByLabelText("Title");
    expect(title).toHaveValue("Parcel 50123456");
    await userEvent.clear(title);
    await userEvent.type(title, "Mabou Harbour");
    expect(title).toHaveValue("Mabou Harbour");
  });

  it("downloads when every layer renders", async () => {
    const { props } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(props.saveFile).toHaveBeenCalledTimes(1));
    const [, filename] = vi.mocked(props.saveFile!).mock.calls[0];
    expect(filename).toMatch(/^parcel-50123456-\d{4}-\d{2}-\d{2}\.pdf$/u);
  });

  it("names failed layers and requires an explicit choice", async () => {
    const canvas = document.createElement("canvas");
    const { props } = renderDialog({
      composeImage: vi.fn().mockResolvedValue({
        canvas,
        statuses: [
          { id: "modern", name: "OpenStreetMap base map", status: "rendered" },
          { id: "fletcher-14", name: "Fletcher sheet 14", status: "failed",
            detail: "3 of 12 tiles failed to load" },
        ],
      }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(
      await screen.findByText(/Fletcher sheet 14/u),
    ).toBeInTheDocument();
    expect(props.saveFile).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Download anyway" }),
    );
    await waitFor(() => expect(props.saveFile).toHaveBeenCalledTimes(1));
  });

  it("omits the legend when toggled off", async () => {
    const { props } = renderDialog();
    await userEvent.click(screen.getByLabelText("Include legend"));
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(props.composePdf).toHaveBeenCalled());
    expect(vi.mocked(props.composePdf!).mock.calls[0][0].legend).toBeNull();
  });

  it("names a visible user map that will be skipped, without blocking download", async () => {
    const { props } = renderDialog({
      omittedUserMapNames: ["My scanned survey plan"],
    });
    expect(screen.getByText(/My scanned survey plan/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(props.saveFile).toHaveBeenCalledTimes(1));
  });

  it("closes when Cancel is clicked or Escape is pressed", async () => {
    const { props } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("downloads immediately when a layer is merely empty, never touching the failure gate", async () => {
    const canvas = document.createElement("canvas");
    const { props } = renderDialog({
      composeImage: vi.fn().mockResolvedValue({
        canvas,
        statuses: [
          { id: "modern", name: "OpenStreetMap base map", status: "rendered" },
          { id: "fletcher-14", name: "Fletcher sheet 14", status: "empty" },
        ],
      }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(props.saveFile).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("button", { name: "Download anyway" }),
    ).not.toBeInTheDocument();
  });

  it("never downloads if Cancel is clicked while the image is still rendering", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    let resolveCompose!: (result: CompositorResult) => void;
    const composeImage = vi.fn(
      () =>
        new Promise<CompositorResult>((resolve) => {
          resolveCompose = resolve;
        }),
    );
    const { props } = renderDialog({ composeImage });

    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // The in-flight render finishes *after* the user cancelled.
    resolveCompose({
      canvas,
      statuses: [{ id: "modern", name: "OpenStreetMap base map", status: "rendered" }],
    });
    await flush();

    expect(props.composePdf).not.toHaveBeenCalled();
    expect(props.saveFile).not.toHaveBeenCalled();
  });

  it("never downloads if Escape is pressed while the image is still rendering", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    let resolveCompose!: (result: CompositorResult) => void;
    const composeImage = vi.fn(
      () =>
        new Promise<CompositorResult>((resolve) => {
          resolveCompose = resolve;
        }),
    );
    const { props } = renderDialog({ composeImage });

    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await userEvent.keyboard("{Escape}");

    resolveCompose({
      canvas,
      statuses: [{ id: "modern", name: "OpenStreetMap base map", status: "rendered" }],
    });
    await flush();

    expect(props.composePdf).not.toHaveBeenCalled();
    expect(props.saveFile).not.toHaveBeenCalled();
  });

  it("never downloads if Cancel is clicked from the failure-confirmation phase, even mid-resume", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const { props } = renderDialog({
      composeImage: vi.fn().mockResolvedValue({
        canvas,
        statuses: [
          { id: "modern", name: "OpenStreetMap base map", status: "rendered" },
          { id: "fletcher-14", name: "Fletcher sheet 14", status: "failed",
            detail: "3 of 12 tiles failed to load" },
        ],
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    const downloadAnyway = await screen.findByRole(
      "button", { name: "Download anyway" },
    );

    // Resume ("Download anyway") and cancel back-to-back, synchronously —
    // the resumed finishExport pipeline has a real async gap (JPEG
    // encoding) that a click dispatched in the same tick lands ahead of.
    fireEvent.click(downloadAnyway);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await flush();

    expect(props.saveFile).not.toHaveBeenCalled();
  });
});

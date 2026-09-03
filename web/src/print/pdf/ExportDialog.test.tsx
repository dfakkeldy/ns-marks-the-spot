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

  it("reports a failure from Download anyway instead of leaving the dialog stuck", async () => {
    const canvas = document.createElement("canvas");
    const { props } = renderDialog({
      composeImage: vi.fn().mockResolvedValue({
        canvas,
        statuses: [
          { id: "fletcher-14", name: "Fletcher sheet 14", status: "failed",
            detail: "3 of 12 tiles failed to load" },
        ],
      }),
      composePdf: vi.fn().mockRejectedValue(new Error("PDF compose ran out of memory")),
    });
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await screen.findByRole("button", { name: "Download anyway" });

    // The confirm path runs the same fallible pipeline as the happy path;
    // bare, its rejection went nowhere and the button just looked dead.
    await userEvent.click(
      screen.getByRole("button", { name: "Download anyway" }),
    );
    expect(
      await screen.findByText(/PDF compose ran out of memory/u),
    ).toBeInTheDocument();
    expect(props.saveFile).not.toHaveBeenCalled();
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
      omittedLayerNames: ["My scanned survey plan"],
    });
    expect(screen.getByText(/My scanned survey plan/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(props.saveFile).toHaveBeenCalledTimes(1));
  });

  it("names every visible layer the export will not contain, without blocking download", async () => {
    // MapCanvas renders seven layer families the compositor does not carry.
    // Turn on zoning or flood layers, export, and they were simply absent
    // from the page with nothing said. This notice is the honest short form:
    // the omission is visible, and the user still decides.
    const { props } = renderDialog({
      omittedLayerNames: [
        "Inverness zoning",
        "Published river flood zones",
        "My scanned survey plan",
      ],
    });
    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent(/will not be in the exported PDF/u);
    for (const name of [
      "Inverness zoning",
      "Published river flood zones",
      "My scanned survey plan",
    ]) {
      expect(notice).toHaveTextContent(name);
    }

    // A notice, not a gate: Download stays live and goes straight through,
    // with no "Download anyway" confirmation step in between.
    const download = screen.getByRole("button", { name: "Download PDF" });
    expect(download).toBeEnabled();
    await userEvent.click(download);
    await waitFor(() => expect(props.saveFile).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("button", { name: "Download anyway" }),
    ).not.toBeInTheDocument();
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

  it("saves through the shared primitive when nothing overrides saveFile", async () => {
    // Every test above injects `saveFile`, so the implementation a real user
    // gets was never run — App renders <ExportDialog> without the prop. It
    // clicked a DETACHED anchor and revoked the object URL synchronously,
    // the two Safari failures `services/downloadFile.ts` exists to prevent.
    //
    // `defineProperty` rather than `stubGlobal("URL", …)`: jsdom implements
    // neither method, and replacing the global would also take away the real
    // `URL` constructor. Left defined afterwards (as App.test.tsx does) so
    // the deferred revoke — still pending on a real ten-second timer — has
    // something harmless to land on; Vitest isolates the file either way.
    const createObjectURL = vi.fn<(blob: Blob) => string>(
      () => `blob:pdf-export-${Math.random()}`,
    );
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true, value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true, value: revokeObjectURL,
    });

    // A real `function`, not an arrow, so `this` is the clicked anchor:
    // `link.click()` triggers a navigation jsdom does not implement, so the
    // anchor is the only place the filename and its in-DOM state survive.
    const captured = { download: "", inDom: false };
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        captured.download = this.download;
        captured.inDom = this.isConnected;
      });

    renderDialog({ saveFile: undefined });
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));

    // The composed bytes reach the blob unchanged, typed as a PDF.
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("application/pdf");
    expect(new Uint8Array(await blob.arrayBuffer()))
      .toEqual(new Uint8Array([37, 80, 68, 70]));

    // Safari has historically ignored detached-anchor downloads…
    expect(captured.inDom).toBe(true);
    expect(captured.download)
      .toMatch(/^parcel-50123456-\d{4}-\d{2}-\d{2}\.pdf$/u);

    // …and starts fetching the blob URL only after the click task, so the
    // revoke has to outlive it. downloadFile.test.ts pins that it does fire,
    // with the created URL, after DOWNLOAD_REVOKE_DELAY_MS.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();

    anchorClick.mockRestore();
  });
});

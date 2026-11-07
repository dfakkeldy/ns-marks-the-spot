import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoStrip } from "./PhotoStrip";
import type { PhotoAttachOutcome, PhotoManagerApi } from "./usePhotoManager";

function manager(overrides: Partial<PhotoManagerApi> = {}): PhotoManagerApi {
  return {
    attachPhotos: vi.fn(async () => []),
    removePhoto: vi.fn(async () => true),
    loadThumbUrl: vi.fn(async () => "blob:thumb"),
    loadFullBlob: vi.fn(async () => null),
    ...overrides,
  };
}

describe("PhotoStrip", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("attaches picked files, appends descriptors, and offers the geotag move", async () => {
    const api = manager({
      attachPhotos: vi.fn(async () => [
        {
          fileName: "IMG_1.jpg",
          ok: true as const,
          descriptor: { id: "p1", sourceName: "IMG_1.jpg", width: 10, height: 10 },
          gps: { lon: -60.91, lat: 46.12 },
        },
      ]),
    });
    const onDescriptors = vi.fn();
    const onAttachDescriptors = vi.fn(() => []);
    const onMovePoint = vi.fn();
    render(
      <PhotoStrip
        descriptors={[]}
        pointPosition={[-60.9105, 46.1205]}
        layerId="layer-1"
        manager={api}
        onDescriptors={onDescriptors}
        onAttachDescriptors={onAttachDescriptors}
        onPhotoCleanupFailed={vi.fn()}
        onMovePoint={onMovePoint}
        onOpenPhoto={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Add photos from files");
    const file = new File(["bytes"], "IMG_1.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onAttachDescriptors).toHaveBeenCalledWith([
        { id: "p1", sourceName: "IMG_1.jpg", width: 10, height: 10 },
      ]),
    );
    // Only what is new: what the feature already held is the session's own
    // business by the time this answers.
    expect(onDescriptors).not.toHaveBeenCalled();
    expect(api.attachPhotos).toHaveBeenCalledWith("layer-1", 0, expect.anything());
    expect(
      await screen.findByText(/This photo is geotagged, .* from this point\./),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Move point to photo's location" }),
    );
    expect(onMovePoint).toHaveBeenCalledWith([-60.91, 46.12]);
  });

  it("shows per-file failures distinctly", async () => {
    const api = manager({
      attachPhotos: vi.fn(async () => [
        {
          fileName: "bad.heic",
          ok: false as const,
          message: "This photo format can't be displayed in this browser.",
        },
      ]),
    });
    render(
      <PhotoStrip
        descriptors={[]}
        pointPosition={null}
        layerId="layer-1"
        manager={api}
        onDescriptors={vi.fn()}
        onAttachDescriptors={vi.fn(() => [])}
        onPhotoCleanupFailed={vi.fn()}
        onMovePoint={vi.fn()}
        onOpenPhoto={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Add photos from files"), {
      target: { files: [new File(["x"], "bad.heic", { type: "image/heic" })] },
    });
    expect(
      await screen.findByText(/bad\.heic: This photo format/),
    ).toBeInTheDocument();
  });

  it("removes a photo after confirmation: descriptor first, then the blobs", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = manager();
    const onDescriptors = vi.fn();
    const user = userEvent.setup();
    render(
      <PhotoStrip
        descriptors={[
          { id: "p1", width: 10, height: 10 },
          { id: "p2", width: 10, height: 10 },
        ]}
        pointPosition={null}
        layerId="layer-1"
        manager={api}
        onDescriptors={onDescriptors}
        onAttachDescriptors={vi.fn(() => [])}
        onPhotoCleanupFailed={vi.fn()}
        onMovePoint={vi.fn()}
        onOpenPhoto={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove photo 1" }));
    expect(onDescriptors).toHaveBeenCalledWith([{ id: "p2", width: 10, height: 10 }]);
    expect(api.removePhoto).toHaveBeenCalledWith("p1");
  });

  it("opens the lightbox from a thumbnail with its position label", async () => {
    const onOpenPhoto = vi.fn();
    const user = userEvent.setup();
    render(
      <PhotoStrip
        descriptors={[{ id: "p1", sourceName: "IMG_1.jpg", width: 10, height: 10 }]}
        pointPosition={null}
        layerId="layer-1"
        manager={manager()}
        onDescriptors={vi.fn()}
        onAttachDescriptors={vi.fn(() => [])}
        onPhotoCleanupFailed={vi.fn()}
        onMovePoint={vi.fn()}
        onOpenPhoto={onOpenPhoto}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Open photo 1 of 1: IMG_1.jpg" }),
    );
    expect(onOpenPhoto).toHaveBeenCalledWith({
      id: "p1",
      sourceName: "IMG_1.jpg",
      width: 10,
      height: 10,
    });
  });

  it("takes a photo the session could not place back out of the store", async () => {
    const api = manager({
      attachPhotos: vi.fn(async () => [
        {
          fileName: "IMG_2.jpg",
          ok: true as const,
          descriptor: { id: "p2", sourceName: "IMG_2.jpg", width: 10, height: 10 },
          gps: { lon: -60.91, lat: 46.12 },
        },
      ]),
    });
    // The session's answer when the feature went away mid-attach.
    const onAttachDescriptors = vi.fn(() => [
      { id: "p2", sourceName: "IMG_2.jpg", width: 10, height: 10 },
    ]);
    const onDescriptors = vi.fn();
    const onPhotoCleanupFailed = vi.fn();
    render(
      <PhotoStrip
        descriptors={[{ id: "p1", width: 10, height: 10 }]}
        pointPosition={[-60.9105, 46.1205]}
        layerId="layer-1"
        manager={api}
        onDescriptors={onDescriptors}
        onAttachDescriptors={onAttachDescriptors}
        onPhotoCleanupFailed={onPhotoCleanupFailed}
        onMovePoint={vi.fn()}
        onOpenPhoto={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Add photos from files"), {
      target: { files: [new File(["bytes"], "IMG_2.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => expect(api.removePhoto).toHaveBeenCalledWith("p2"));
    expect(onDescriptors).not.toHaveBeenCalled();
    expect(onPhotoCleanupFailed).not.toHaveBeenCalled();

    // Nothing was attached, so there is no point to offer to move.
    expect(
      screen.queryByRole("button", { name: "Move point to photo's location" }),
    ).not.toBeInTheDocument();
  });

  // No layer lists this row, so no later sweep will find it: a delete the
  // device refuses has to be said out loud rather than assumed.
  it("says so when a discarded photo's copy could not be taken off the device", async () => {
    const api = manager({
      attachPhotos: vi.fn(async () => [
        {
          fileName: "IMG_3.jpg",
          ok: true as const,
          descriptor: { id: "p3", sourceName: "IMG_3.jpg", width: 10, height: 10 },
          gps: null,
        },
      ]),
      removePhoto: vi.fn(async () => false),
    });
    const onPhotoCleanupFailed = vi.fn();
    render(
      <PhotoStrip
        descriptors={[]}
        pointPosition={null}
        layerId="layer-1"
        manager={api}
        onDescriptors={vi.fn()}
        onAttachDescriptors={vi.fn(() => [
          { id: "p3", sourceName: "IMG_3.jpg", width: 10, height: 10 },
        ])}
        onPhotoCleanupFailed={onPhotoCleanupFailed}
        onMovePoint={vi.fn()}
        onOpenPhoto={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Add photos from files"), {
      target: { files: [new File(["bytes"], "IMG_3.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => expect(onPhotoCleanupFailed).toHaveBeenCalledWith("p3"));
  });

  // Taking the descriptor off the feature is half of what Remove promises.
  // The other half is the copy on the device, and a refusal there was silent.
  it("says so when a removed photo's copy is still on this device", async () => {
    const api = manager({ removePhoto: vi.fn(async () => false) });
    render(
      <PhotoStrip
        descriptors={[{ id: "p1", sourceName: "IMG_1.jpg", width: 10, height: 10 }]}
        pointPosition={null}
        layerId="layer-1"
        manager={api}
        onDescriptors={vi.fn()}
        onAttachDescriptors={vi.fn(() => [])}
        onPhotoCleanupFailed={vi.fn()}
        onMovePoint={vi.fn()}
        onOpenPhoto={vi.fn()}
      />,
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    fireEvent.click(screen.getByRole("button", { name: /Remove photo 1/ }));

    expect(
      await screen.findByText(/wouldn't delete its copy/),
    ).toBeInTheDocument();
  });

  // The strip can go — its feature deselected, or the test file torn down —
  // while the device is still writing. The work and the session's callbacks
  // must still finish; only the strip's own screen is no longer there to
  // update, and once the page is gone setState throws.
  describe("after the strip has unmounted", () => {
    it("still hands a late attach to the session and cleans up what it discarded", async () => {
      const answers: ((outcomes: PhotoAttachOutcome[]) => void)[] = [];
      const api = manager({
        attachPhotos: vi.fn(
          () => new Promise<PhotoAttachOutcome[]>((resolve) => answers.push(resolve)),
        ),
        removePhoto: vi.fn(async () => false),
      });
      // The feature went with the strip, so the session has nowhere to put it.
      const onAttachDescriptors = vi.fn(() => [
        { id: "p4", sourceName: "IMG_4.jpg", width: 10, height: 10 },
      ]);
      const onPhotoCleanupFailed = vi.fn();
      const onBusyChange = vi.fn();
      const { unmount } = render(
        <PhotoStrip
          descriptors={[]}
          pointPosition={[-60.9105, 46.1205]}
          layerId="layer-1"
          manager={api}
          onDescriptors={vi.fn()}
          onAttachDescriptors={onAttachDescriptors}
          onPhotoCleanupFailed={onPhotoCleanupFailed}
          onBusyChange={onBusyChange}
          onMovePoint={vi.fn()}
          onOpenPhoto={vi.fn()}
        />,
      );
      fireEvent.change(screen.getByLabelText("Add photos from files"), {
        target: {
          files: [
            new File(["bytes"], "IMG_4.jpg", { type: "image/jpeg" }),
            new File(["x"], "bad.heic", { type: "image/heic" }),
          ],
        },
      });
      expect(answers).toHaveLength(1);
      expect(onBusyChange).toHaveBeenLastCalledWith(true);
      unmount();

      const unhandled = await afterThePageIsGone(() =>
        answers[0]([
          {
            fileName: "IMG_4.jpg",
            ok: true,
            descriptor: { id: "p4", sourceName: "IMG_4.jpg", width: 10, height: 10 },
            gps: null,
          },
          { fileName: "bad.heic", ok: false, message: "Unsupported." },
        ]),
      );

      expect(unhandled).toEqual([]);
      expect(onAttachDescriptors).toHaveBeenCalledWith([
        { id: "p4", sourceName: "IMG_4.jpg", width: 10, height: 10 },
      ]);
      expect(api.removePhoto).toHaveBeenCalledWith("p4");
      expect(onPhotoCleanupFailed).toHaveBeenCalledWith("p4");
      // The panel holds Done while photos are processing; it must hear that
      // they have stopped even though the strip is gone.
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
    });

    it("drops a late geotag offer for a photo that did land", async () => {
      const answers: ((outcomes: PhotoAttachOutcome[]) => void)[] = [];
      const api = manager({
        attachPhotos: vi.fn(
          () => new Promise<PhotoAttachOutcome[]>((resolve) => answers.push(resolve)),
        ),
      });
      const onAttachDescriptors = vi.fn(() => []);
      const onBusyChange = vi.fn();
      const onMovePoint = vi.fn();
      const { unmount } = render(
        <PhotoStrip
          descriptors={[]}
          pointPosition={[-60.9105, 46.1205]}
          layerId="layer-1"
          manager={api}
          onDescriptors={vi.fn()}
          onAttachDescriptors={onAttachDescriptors}
          onPhotoCleanupFailed={vi.fn()}
          onBusyChange={onBusyChange}
          onMovePoint={onMovePoint}
          onOpenPhoto={vi.fn()}
        />,
      );
      fireEvent.change(screen.getByLabelText("Add photos from files"), {
        target: { files: [new File(["bytes"], "IMG_5.jpg", { type: "image/jpeg" })] },
      });
      expect(answers).toHaveLength(1);
      unmount();

      const unhandled = await afterThePageIsGone(() =>
        answers[0]([
          {
            fileName: "IMG_5.jpg",
            ok: true,
            descriptor: { id: "p5", sourceName: "IMG_5.jpg", width: 10, height: 10 },
            gps: { lon: -60.91, lat: 46.12 },
          },
        ]),
      );

      expect(unhandled).toEqual([]);
      expect(onAttachDescriptors).toHaveBeenCalledWith([
        { id: "p5", sourceName: "IMG_5.jpg", width: 10, height: 10 },
      ]);
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
      // The offer is the strip's own screen; with the strip gone it is
      // dropped, never acted on.
      expect(onMovePoint).not.toHaveBeenCalled();
    });

    it("drops a late refusal to delete a removed photo's copy", async () => {
      const answers: ((removed: boolean) => void)[] = [];
      const api = manager({
        removePhoto: vi.fn(
          () => new Promise<boolean>((resolve) => answers.push(resolve)),
        ),
      });
      const onDescriptors = vi.fn();
      const { unmount } = render(
        <PhotoStrip
          descriptors={[{ id: "p1", sourceName: "IMG_1.jpg", width: 10, height: 10 }]}
          pointPosition={null}
          layerId="layer-1"
          manager={api}
          onDescriptors={onDescriptors}
          onAttachDescriptors={vi.fn(() => [])}
          onPhotoCleanupFailed={vi.fn()}
          onMovePoint={vi.fn()}
          onOpenPhoto={vi.fn()}
        />,
      );
      vi.spyOn(window, "confirm").mockReturnValue(true);
      fireEvent.click(screen.getByRole("button", { name: /Remove photo 1/ }));
      expect(onDescriptors).toHaveBeenCalledWith([]);
      expect(answers).toHaveLength(1);
      unmount();

      const unhandled = await afterThePageIsGone(() => answers[0](false));

      expect(unhandled).toEqual([]);
    });
  });
});

/**
 * Takes the page away the way Vitest does when a test file ends — it deletes
 * `window` from the global scope — then lets the device answer, and returns
 * whatever went unhandled. The page is put back before this returns.
 * Same approach as the helper in `location/useTrackRecording.test.ts`.
 */
async function afterThePageIsGone(answer: () => void): Promise<unknown[]> {
  const unhandled: unknown[] = [];
  const record = (reason: unknown) => {
    unhandled.push(reason);
  };
  const page = globalThis.window;
  process.on("unhandledRejection", record);
  Reflect.deleteProperty(globalThis, "window");
  try {
    expect(typeof window).toBe("undefined");
    answer();
    // A real macrotask, not act(): React must not run while the page is
    // gone. The answers' callbacks, and Node's report of any rejection they
    // leave behind, both happen before it fires.
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    globalThis.window = page;
    process.off("unhandledRejection", record);
  }
  return unhandled;
}

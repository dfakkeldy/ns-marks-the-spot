import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoStrip } from "./PhotoStrip";
import type { PhotoManagerApi } from "./usePhotoManager";

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
});

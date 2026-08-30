import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoStrip } from "./PhotoStrip";
import type { PhotoManagerApi } from "./usePhotoManager";

function manager(overrides: Partial<PhotoManagerApi> = {}): PhotoManagerApi {
  return {
    attachPhotos: vi.fn(async () => []),
    removePhoto: vi.fn(async () => {}),
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
    const onMovePoint = vi.fn();
    render(
      <PhotoStrip
        descriptors={[]}
        pointPosition={[-60.9105, 46.1205]}
        layerId="layer-1"
        manager={api}
        onDescriptors={onDescriptors}
        onMovePoint={onMovePoint}
        onOpenPhoto={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Add photos from files");
    const file = new File(["bytes"], "IMG_1.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onDescriptors).toHaveBeenCalledWith([
        { id: "p1", sourceName: "IMG_1.jpg", width: 10, height: 10 },
      ]),
    );
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
});

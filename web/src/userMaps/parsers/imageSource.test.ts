import { describe, expect, it, vi } from "vitest";
import { UserMapImportError } from "../errors";
import { parseImage, type DecodedImage, type RescaleImage } from "./imageSource";

/** jsdom has no createImageBitmap, so both seams are always injected here. */
function fakeDecode(width: number, height: number) {
  const close = vi.fn();
  const decoded: DecodedImage = {
    width,
    height,
    source: {} as CanvasImageSource,
    close,
  };
  return { decode: vi.fn(async () => decoded), close, decoded };
}

// Typed as RescaleImage (rather than left to infer from the zero-arg
// implementation) so `rescale.mock.calls[0]` is a [DecodedImage, PixelSize]
// tuple instead of `[]` — the "downsamples past the preview cap" test below
// indexes into it to assert the size argument.
const fakeRescale = () =>
  vi.fn<RescaleImage>(async () => new Blob(["rescaled"], { type: "image/png" }));

describe("parseImage", () => {
  it("reports ORIGINAL pixel dimensions, which are GCP space", async () => {
    const { decode } = fakeDecode(1200, 800);
    const blob = new Blob(["png-bytes"], { type: "image/png" });
    const parsed = await parseImage(blob, { decode, rescale: fakeRescale() });
    expect(parsed.pixelSize).toEqual({ width: 1200, height: 800 });
  });

  it("reuses the original blob when the image is already small enough", async () => {
    // Re-encoding a 1200px PNG through a canvas would cost memory and a
    // generation of quality for nothing. Under the cap, the file IS the
    // preview.
    const { decode } = fakeDecode(1200, 800);
    const rescale = fakeRescale();
    const blob = new Blob(["png-bytes"], { type: "image/png" });
    const parsed = await parseImage(blob, { decode, rescale });
    expect(parsed.preview).toBe(blob);
    expect(parsed.previewSize).toEqual({ width: 1200, height: 800 });
    expect(rescale).not.toHaveBeenCalled();
  });

  it("downsamples past the preview cap, preserving aspect ratio", async () => {
    const { decode } = fakeDecode(8192, 4096);
    const rescale = fakeRescale();
    const parsed = await parseImage(new Blob(["big"]), { decode, rescale });
    expect(parsed.pixelSize).toEqual({ width: 8192, height: 4096 });
    expect(parsed.previewSize).toEqual({ width: 4096, height: 2048 });
    expect(rescale).toHaveBeenCalledTimes(1);
    expect(rescale.mock.calls[0][1]).toEqual({ width: 4096, height: 2048 });
  });

  it("caps on the LONGEST edge, whichever way the image is oriented", async () => {
    const { decode } = fakeDecode(2048, 8192);
    const parsed = await parseImage(new Blob(["tall"]), {
      decode,
      rescale: fakeRescale(),
    });
    expect(parsed.previewSize).toEqual({ width: 1024, height: 4096 });
  });

  it("never produces a zero-size preview for an extreme aspect ratio", async () => {
    const { decode } = fakeDecode(40000, 3);
    const parsed = await parseImage(new Blob(["strip"]), {
      decode,
      rescale: fakeRescale(),
    });
    expect(parsed.previewSize.width).toBe(4096);
    expect(parsed.previewSize.height).toBeGreaterThanOrEqual(1);
  });

  it("releases the decoded image even when rescaling throws", async () => {
    const { decode, close } = fakeDecode(8192, 4096);
    const rescale = vi.fn(async () => {
      throw new Error("canvas exploded");
    });
    await expect(
      parseImage(new Blob(["big"]), { decode, rescale }),
    ).rejects.toBeInstanceOf(UserMapImportError);
    expect(close).toHaveBeenCalled();
  });

  it("surfaces a decode failure as corrupt-file", async () => {
    const decode = vi.fn(async () => {
      throw new Error("not an image");
    });
    await expect(
      parseImage(new Blob(["junk"]), { decode, rescale: fakeRescale() }),
    ).rejects.toMatchObject({ code: "corrupt-file" });
  });

  it("closes the decoded image on the happy path too", async () => {
    const { decode, close } = fakeDecode(1200, 800);
    await parseImage(new Blob(["png"]), { decode, rescale: fakeRescale() });
    expect(close).toHaveBeenCalled();
  });
});

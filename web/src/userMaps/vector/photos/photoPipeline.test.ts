import { describe, expect, it, vi } from "vitest";
import { UserMapImportError } from "../../errors";
import {
  FULL_JPEG_QUALITY,
  THUMB_JPEG_QUALITY,
  processPhoto,
  targetDimensions,
} from "./photoPipeline";

function fakeBitmap(width: number, height: number): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

describe("targetDimensions", () => {
  it("scales the long edge down and never up", () => {
    expect(targetDimensions(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(targetDimensions(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 });
    expect(targetDimensions(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    expect(targetDimensions(4032, 3024, 256)).toEqual({ width: 256, height: 192 });
  });
});

describe("processPhoto", () => {
  it("re-encodes full and thumb through the seams and reports full dimensions", async () => {
    const encodeJpeg = vi.fn(
      async (_image: ImageBitmap, width: number, height: number, quality: number) =>
        new Blob([`${width}x${height}@${quality}`], { type: "image/jpeg" }),
    );
    const decodeImage = vi.fn(async () => fakeBitmap(4032, 3024));
    const file = new File(["bytes"], "IMG_1.jpg", { type: "image/jpeg" });

    const processed = await processPhoto(file, { decodeImage, encodeJpeg });
    expect(processed.width).toBe(2048);
    expect(processed.height).toBe(1536);
    expect(encodeJpeg).toHaveBeenCalledTimes(2);
    expect(encodeJpeg).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      2048,
      1536,
      FULL_JPEG_QUALITY,
    );
    expect(encodeJpeg).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      256,
      192,
      THUMB_JPEG_QUALITY,
    );
    expect(processed.full.type).toBe("image/jpeg");
  });

  it("maps a decode failure to the distinct unsupported-image code", async () => {
    const file = new File(["bytes"], "IMG_1.HEIC", { type: "image/heic" });
    await expect(
      processPhoto(file, {
        decodeImage: async () => {
          throw new Error("no decoder");
        },
        encodeJpeg: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "unsupported-image" });
  });

  it("refuses a pathological file before reading it", async () => {
    const huge = { name: "big.jpg", size: 51 * 1024 * 1024 } as File;
    await expect(
      processPhoto(huge, { decodeImage: vi.fn(), encodeJpeg: vi.fn() }),
    ).rejects.toBeInstanceOf(UserMapImportError);
  });
});

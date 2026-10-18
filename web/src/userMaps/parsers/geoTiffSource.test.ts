import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GeoTIFFImage } from "geotiff";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserMapImportError } from "../errors";
import { chooseImageIndex, parseGeoTiff } from "./geoTiffSource";

function fixtureBuffer(): ArrayBuffer {
  const raw = readFileSync(
    join(__dirname, "..", "..", "test", "fixtures", "utm20-8x6.tif"),
  );
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
}

/** jsdom has no canvas, so tests always inject a fake preview maker. */
const fakePreview = () =>
  vi.fn(async (rgb: Uint8Array, width: number, height: number) => {
    void rgb;
    void width;
    void height;
    return new Blob(["fake-preview"], { type: "image/png" });
  });

async function plainTiff(metadata: Record<string, unknown>): Promise<ArrayBuffer> {
  const { writeArrayBuffer } = await import("geotiff");
  return writeArrayBuffer(new Uint8Array([1, 2, 3]), {
    width: 1,
    height: 1,
    SamplesPerPixel: 3,
    BitsPerSample: [8, 8, 8],
    PhotometricInterpretation: 2,
    ...metadata,
  }) as ArrayBuffer;
}

/**
 * geotiff@2.1.3's writeArrayBuffer/encodeImage always sizes and fills the
 * pixel strip as `width * height * samplesPerPixel` bytes — one byte per
 * sample, regardless of BitsPerSample — and wrapping a Uint16Array in
 * `new Uint8Array(values)` truncates each 16-bit value to its low byte
 * rather than reinterpreting the underlying bytes. For
 * `BitsPerSample: [16, 16, 16]` this produces a file whose declared
 * StripByteCounts and backing buffer are both too small for what the
 * *reader* expects from BitsPerSample (verified: readRasters/readRGB throw
 * "Offset is outside the bounds of the DataView"). This patches a
 * writeArrayBuffer output in place using plain TIFF-spec byte layout (not a
 * geotiff.js internal): it locates the StripOffsets/StripByteCounts IFD
 * entries, corrects StripByteCounts, and replaces the pixel strip with
 * correctly-sized 16-bit samples in the file's own byte order.
 */
function patchSixteenBitStrip(buffer: ArrayBuffer, samples: number[]): ArrayBuffer {
  const view = new DataView(buffer);
  const littleEndian = view.getUint8(0) === 0x49; // "II" vs "MM"
  const ifdOffset = view.getUint32(4, littleEndian);
  const entryCount = view.getUint16(ifdOffset, littleEndian);
  let stripOffset: number | null = null;
  let stripByteCountsField: number | null = null;
  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = ifdOffset + 2 + i * 12;
    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag === 273) {
      // StripOffsets
      stripOffset = view.getUint32(entryOffset + 8, littleEndian);
    } else if (tag === 279) {
      // StripByteCounts
      stripByteCountsField = entryOffset + 8;
    }
  }
  if (stripOffset === null || stripByteCountsField === null) {
    throw new Error("fixture is missing StripOffsets/StripByteCounts");
  }
  const byteCount = samples.length * 2;
  view.setUint32(stripByteCountsField, byteCount, littleEndian);

  const out = new Uint8Array(stripOffset + byteCount);
  out.set(new Uint8Array(buffer, 0, stripOffset), 0);
  const outView = new DataView(out.buffer);
  samples.forEach((value, i) => {
    outView.setUint16(stripOffset + i * 2, value, littleEndian);
  });
  return out.buffer;
}

describe("chooseImageIndex", () => {
  it("picks the smallest overview still covering the target", () => {
    const sizes = [
      { width: 20000, height: 15000 },
      { width: 10000, height: 7500 },
      { width: 5000, height: 3750 },
      { width: 2500, height: 1875 },
    ];
    // Target 4096: 5000x3750 is the smallest whose max dimension >= 4096.
    expect(chooseImageIndex(sizes, 4096)).toBe(2);
  });

  it("falls back to the smallest image when none covers the target", () => {
    const sizes = [
      { width: 3000, height: 2000 },
      { width: 1500, height: 1000 },
    ];
    expect(chooseImageIndex(sizes, 4096)).toBe(0);
  });

  it("uses the sole image when there are no overviews", () => {
    expect(chooseImageIndex([{ width: 8, height: 6 }], 4096)).toBe(0);
  });
});

describe("parseGeoTiff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts pixel size, CRS, and geotransform from the fixture", async () => {
    const parsed = await parseGeoTiff(fixtureBuffer(), {
      makePreview: fakePreview(),
    });
    expect(parsed.pixelSize).toEqual({ width: 8, height: 6 });
    expect(parsed.georef).toEqual({
      kind: "embedded",
      crs: "EPSG:26920",
      geotransform: [500000, 10, 0, 5000000, 0, -10],
    });
  });

  it("feeds full-resolution RGB to the preview maker for a small raster", async () => {
    const makePreview = fakePreview();
    const parsed = await parseGeoTiff(fixtureBuffer(), { makePreview });
    expect(makePreview).toHaveBeenCalledTimes(1);
    const [rgb, width, height] = makePreview.mock.calls[0];
    expect(width).toBe(8);
    expect(height).toBe(6);
    expect(rgb).toHaveLength(8 * 6 * 3);
    expect(rgb[0]).toBe(0); // top-left red
    expect(rgb[(8 - 1) * 3]).toBe(255); // top-right red
    expect(parsed.previewSize).toEqual({ width: 8, height: 6 });
    expect(parsed.preview.type).toBe("image/png");
  });

  it("applies the half-pixel shift for PixelIsPoint rasters", async () => {
    const buffer = await plainTiff({
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [0, 0, 0, 500000, 5000000, 0],
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
      GTRasterTypeGeoKey: 2, // PixelIsPoint
    });
    const parsed = await parseGeoTiff(buffer, { makePreview: fakePreview() });
    if (!parsed.georef) {
      expect.unreachable("fixture is georeferenced");
    }
    // Tiepoint marks the CENTRE of pixel (0,0), so the area origin shifts
    // back half a pixel: x - 5, y + 5 (north-up negative y resolution).
    expect(parsed.georef.geotransform[0]).toBeCloseTo(499995, 6);
    expect(parsed.georef.geotransform[3]).toBeCloseTo(5000005, 6);
  });

  it("returns a null georef for TIFFs without georeferencing", async () => {
    // PR 2 changed this from a hard failure: a plain TIFF scan is now a
    // georeferencer job, and geotiff.js is the only thing that can decode it.
    // ProjectedCSTypeGeoKey: 0 is load-bearing, and is why the old test used
    // it too: geotiff@2.1.3's writer auto-injects a whole-globe WGS84
    // georeference unless one of the CRS geokeys is an own property, so
    // plainTiff({}) round-trips as a GEOREFERENCED file and this assertion
    // would fail. Keep the argument exactly as the replaced test had it.
    const buffer = await plainTiff({ ProjectedCSTypeGeoKey: 0 });
    const parsed = await parseGeoTiff(buffer, { makePreview: fakePreview() });
    expect(parsed.georef).toBeNull();
    expect(parsed.preview.type).toBe("image/png");
  });

  it("returns a null georef for a truncated ModelTransformation", async () => {
    const buffer = await plainTiff({
      ModelTransformation: [1, 0, 0, 0, 0, 1, 0, 0], // 8 of 16 doubles
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
    });
    const parsed = await parseGeoTiff(buffer, { makePreview: fakePreview() });
    expect(parsed.georef).toBeNull();
  });

  it("returns a null georef for multiple tiepoints without a matrix", async () => {
    const buffer = await plainTiff({
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [
        0, 0, 0, 500000, 5000000, 0,
        8, 6, 0, 500080, 4999940, 0,
      ],
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
    });
    const parsed = await parseGeoTiff(buffer, { makePreview: fakePreview() });
    expect(parsed.georef).toBeNull();
  });

  it("rejects garbage bytes as corrupt-file", async () => {
    const garbage = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0xff, 0xff]).buffer;
    await expect(
      parseGeoTiff(garbage, { makePreview: fakePreview() }),
    ).rejects.toMatchObject({ code: "corrupt-file" });
  });

  it("surfaces unsupported CRS with the EPSG code in the message", async () => {
    const buffer = await plainTiff({
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [0, 0, 0, 500000, 5000000, 0],
      ProjectedCSTypeGeoKey: 32633,
      GTModelTypeGeoKey: 1,
    });
    try {
      await parseGeoTiff(buffer, { makePreview: fakePreview() });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UserMapImportError);
      expect((error as UserMapImportError).code).toBe("unsupported-crs");
      expect((error as UserMapImportError).userMessage).toContain("32633");
    }
  });

  it("scales 16-bit samples into the 8-bit preview instead of truncating", async () => {
    const { writeArrayBuffer } = await import("geotiff");
    // writeArrayBuffer can't itself produce a valid BitsPerSample: 16 file
    // (see patchSixteenBitStrip) — generate its (undersized) output, then
    // patch in a correctly-sized 16-bit strip.
    const buggyBuffer = writeArrayBuffer(new Uint8Array([1, 2, 3]), {
      width: 1,
      height: 1,
      SamplesPerPixel: 3,
      BitsPerSample: [16, 16, 16],
      PhotometricInterpretation: 2,
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [0, 0, 0, 500000, 5000000, 0],
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
    }) as ArrayBuffer;
    // One pixel, RGB, 16-bit: mid-grey 0x8000 must become ~0x80, not 0x00.
    const buffer = patchSixteenBitStrip(buggyBuffer, [0x8000, 0x8000, 0x8000]);
    const makePreview = fakePreview();
    await parseGeoTiff(buffer, { makePreview });
    const [rgb] = makePreview.mock.calls[0];
    expect(rgb[0]).toBe(0x80);
  });

  // --- Decode-failure classification (large-but-valid vs. actually corrupt) -
  //
  // PREVIEW_MAX_DIMENSION caps the RETAINED preview, not what geotiff has to
  // materialize while decoding. A valid raster with no internal overview
  // small enough to cover the target can throw mid-decode from sheer size;
  // that must not be reported as "corrupt". These three tests pin: (1) a
  // decode-time UserMapImportError passes through unchanged, (2) a huge
  // chosen image reports "too-large" with an honest, actionable message, and
  // (3) a small image failing for an unrelated reason still reports
  // "corrupt-file" — proving the two outcomes are actually distinguished by
  // size, not just always "too-large" or always "corrupt-file".

  it("passes a UserMapImportError thrown while decoding straight through unchanged", async () => {
    const decodeError = new UserMapImportError("quota", "custom decode-time message");
    vi.spyOn(GeoTIFFImage.prototype, "readRGB").mockRejectedValueOnce(decodeError);
    await expect(
      parseGeoTiff(fixtureBuffer(), { makePreview: fakePreview() }),
    ).rejects.toBe(decodeError);
  });

  it("reports too-large when the chosen image is huge and decoding fails", async () => {
    // The fixture itself is a tiny 8x6 file; stub the reported dimensions
    // to simulate a multi-hundred-megapixel raster with no overview small
    // enough to cover PREVIEW_MAX_DIMENSION, so chooseImageIndex has to
    // fall back to this huge "base" image.
    vi.spyOn(GeoTIFFImage.prototype, "getWidth").mockReturnValue(20000);
    vi.spyOn(GeoTIFFImage.prototype, "getHeight").mockReturnValue(15000);
    vi.spyOn(GeoTIFFImage.prototype, "readRGB").mockRejectedValueOnce(
      new RangeError("Invalid typed array length"),
    );
    try {
      await parseGeoTiff(fixtureBuffer(), { makePreview: fakePreview() });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UserMapImportError);
      expect((error as UserMapImportError).code).toBe("too-large");
      const message = (error as UserMapImportError).userMessage;
      expect(message).not.toContain("corrupt");
      expect(message.toLowerCase()).toContain("too large");
      expect(message).toContain("500 MB");
    }
  });

  it("still reports corrupt-file when a small image fails to decode", async () => {
    // Same failure, but the fixture's real (tiny) dimensions apply — proves
    // the "too-large" branch above is keyed on pixel count, not merely on
    // "readRGB threw".
    vi.spyOn(GeoTIFFImage.prototype, "readRGB").mockRejectedValueOnce(
      new Error("Offset is outside the bounds of the DataView"),
    );
    await expect(
      parseGeoTiff(fixtureBuffer(), { makePreview: fakePreview() }),
    ).rejects.toMatchObject({
      code: "corrupt-file",
      userMessage: "The image data in this GeoTIFF could not be decoded.",
    });
  });

  it("rejects a CRS/tiepoint pairing that projects outside the coordinate system's domain", async () => {
    // EPSG:26920 (UTM zone 20N) is on the supported allowlist, so
    // validateCrs passes — but this tiepoint (50,000,000 mE) is nowhere
    // near a real UTM easting for that zone. proj4 doesn't throw for that;
    // it returns non-finite coordinates. parseGeoTiff must catch this at
    // import time, not let it through as if it were valid.
    const buffer = await plainTiff({
      ModelPixelScale: [10, 10, 0],
      ModelTiepoint: [0, 0, 0, 50_000_000, 5_000_000, 0],
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
    });
    await expect(
      parseGeoTiff(buffer, { makePreview: fakePreview() }),
    ).rejects.toMatchObject({ code: "invalid-georeferencing" });
  });
});

describe("GeoTIFF transparency", () => {
  it.each([
    { extra: 2, samples: [120, 60, 30, 0, 120, 60, 30, 128], expected: [120, 60, 30, 0, 120, 60, 30, 128] },
    { extra: 1, samples: [0, 0, 0, 0, 60, 30, 15, 128], expected: [0, 0, 0, 0, 120, 60, 30, 128] },
    { extra: 0, samples: [120, 60, 30, 0, 120, 60, 30, 128], expected: [120, 60, 30, 255, 120, 60, 30, 255] },
  ])("honours ExtraSamples=$extra without making non-alpha bands transparent", async ({extra, samples, expected}) => {
    const { writeArrayBuffer } = await import("geotiff");
    const { rgbToRgba } = await import("./geoTiffSource");
    const buffer = writeArrayBuffer(new Uint8Array(samples), {
      width: 2, height: 1, SamplesPerPixel: 4, BitsPerSample: [8,8,8,8],
      PhotometricInterpretation: 2, ExtraSamples: [extra],
    }) as ArrayBuffer;
    const makePreview = fakePreview();
    await parseGeoTiff(buffer, {makePreview});
    const [pixels,width,height] = makePreview.mock.calls[0];
    expect([...rgbToRgba(pixels,width,height)]).toEqual(expected);
  });
});

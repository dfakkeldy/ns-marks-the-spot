import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
    // Tiepoint marks the CENTRE of pixel (0,0), so the area origin shifts
    // back half a pixel: x - 5, y + 5 (north-up negative y resolution).
    expect(parsed.georef.geotransform[0]).toBeCloseTo(499995, 6);
    expect(parsed.georef.geotransform[3]).toBeCloseTo(5000005, 6);
  });

  it("rejects TIFFs without georeferencing as no-georeferencing", async () => {
    // geotiff@2.1.3's writeArrayBuffer auto-injects a whole-globe WGS84
    // georeference (GeographicTypeGeoKey 4326 + ModelTiepoint) whenever
    // neither GeographicTypeGeoKey nor ProjectedCSTypeGeoKey is an own
    // property of the metadata (see the `if (!metadata.hasOwnProperty(...))`
    // block in geotiffwriter.js) — so plainTiff({}) alone round-trips as a
    // *georeferenced* file, not an ungeoreferenced one. Passing
    // ProjectedCSTypeGeoKey: 0 (present, but not a real EPSG code) satisfies
    // that hasOwnProperty check and suppresses the auto-injection, so
    // ModelTiepoint stays unset and crsFrom()'s epsg check is falsy — the
    // file the parser is actually supposed to reject.
    const buffer = await plainTiff({ ProjectedCSTypeGeoKey: 0 });
    await expect(
      parseGeoTiff(buffer, { makePreview: fakePreview() }),
    ).rejects.toMatchObject({ code: "no-georeferencing" });
  });

  it("rejects a truncated ModelTransformation as no-georeferencing", async () => {
    const buffer = await plainTiff({
      ModelTransformation: [1, 0, 0, 0, 0, 1, 0, 0], // 8 of 16 doubles
      ProjectedCSTypeGeoKey: 26920,
      GTModelTypeGeoKey: 1,
    });
    await expect(
      parseGeoTiff(buffer, { makePreview: fakePreview() }),
    ).rejects.toMatchObject({ code: "no-georeferencing" });
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
});

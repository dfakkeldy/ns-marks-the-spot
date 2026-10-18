import { describe, expect, it } from "vitest";
import { sniffFileType } from "./sniff";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("sniffFileType", () => {
  it("detects little-endian TIFF (II*\\0)", () => {
    expect(sniffFileType(bytes(0x49, 0x49, 0x2a, 0x00, 0x08))).toBe("geotiff");
  });

  it("detects big-endian TIFF (MM\\0*)", () => {
    expect(sniffFileType(bytes(0x4d, 0x4d, 0x00, 0x2a, 0x00))).toBe("geotiff");
  });

  it("detects little-endian BigTIFF (II+\\0)", () => {
    expect(sniffFileType(bytes(0x49, 0x49, 0x2b, 0x00))).toBe("geotiff");
  });

  it("detects PDF (%PDF)", () => {
    expect(sniffFileType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("pdf");
  });

  it("detects PNG", () => {
    expect(
      sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe("png");
  });

  it("detects JPEG", () => {
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
  });

  it("returns unknown for anything else", () => {
    expect(sniffFileType(bytes(0x00, 0x01, 0x02, 0x03))).toBe("unknown");
  });

  it("returns unknown for a buffer shorter than any signature", () => {
    expect(sniffFileType(bytes(0x49))).toBe("unknown");
  });
});

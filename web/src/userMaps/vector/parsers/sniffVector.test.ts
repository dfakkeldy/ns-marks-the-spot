import { describe, expect, it } from "vitest";
import { sniffVectorType } from "./sniffVector";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("sniffVectorType", () => {
  it("recognizes zip archives by magic bytes", () => {
    expect(sniffVectorType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe("zip");
  });

  it("recognizes JSON by a leading brace", () => {
    expect(sniffVectorType(bytes('{"type":"FeatureCollection"}'))).toBe("geojson-candidate");
  });

  it("tolerates a UTF-8 BOM and leading whitespace before JSON", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('  \n\t{"type":"Feature"}')]);
    expect(sniffVectorType(bom)).toBe("geojson-candidate");
  });

  it("recognizes XML by a leading angle bracket", () => {
    expect(sniffVectorType(bytes('<?xml version="1.0"?><kml/>'))).toBe("xml-candidate");
    expect(sniffVectorType(bytes("<kml xmlns='...'>"))).toBe("xml-candidate");
  });

  it("tolerates a BOM and whitespace before XML", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("\n <gpx>")]);
    expect(sniffVectorType(bom)).toBe("xml-candidate");
  });

  it("returns unknown for anything else", () => {
    expect(sniffVectorType(bytes("PID,123456"))).toBe("unknown");
    expect(sniffVectorType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("unknown");
    expect(sniffVectorType(new Uint8Array())).toBe("unknown");
  });
});

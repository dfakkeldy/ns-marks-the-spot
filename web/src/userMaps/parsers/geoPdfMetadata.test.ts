import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPdfViewport,
  extractGeoPdfMetadata,
  type PdfViewportGeometry,
} from "./geoPdfMetadata";

function fixture(name: string): Uint8Array {
  const bytes = readFileSync(
    join(__dirname, "..", "..", "test", "fixtures", "geopdf", name),
  );
  return new Uint8Array(bytes);
}

function viewport(
  width: number,
  height: number,
): PdfViewportGeometry {
  return {
    width,
    height,
    transform: [1, 0, 0, -1, 0, height],
    viewBox: [0, 0, width, height],
  };
}

describe("extractGeoPdfMetadata", () => {
  it("returns every valid Measure viewport in stable document order", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("adobe_style_geospatial.pdf"),
      viewport(612, 792),
    );
    expect(result.candidates.map((candidate) => candidate.embeddedLabel)).toEqual([
      "Layers\u0000",
      "New Data Frame\u0000",
    ]);
    expect(result.candidates).toHaveLength(2);
  });

  it("extracts a sole projected Measure registration", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("ns-utm20-iso.pdf"),
      viewport(8, 6),
    );
    expect(result.rejected).toEqual([]);
    expect(result.pageStructure).toMatchObject({
      family: "measure",
      structureId: "measure-vp-geo-v1",
      registrationCount: 1,
      completeLabels: ["Layer"],
    });
    expect(result.candidates[0]).toMatchObject({
      flavor: "measure",
      embeddedLabel: "Layer",
      sourceRect: { x: 0, y: 0, width: 8, height: 6 },
    });
    expect(result.candidates[0].gcps).toHaveLength(4);
  });

  it("matches the ISO Measure fixture's independent GDAL corner", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("test_iso32000.pdf"),
      viewport(20, 20),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].gcps[0]).toMatchObject({
      pixel: { x: 0, y: 0 },
      map: { lat: 49, lng: 2 },
    });
  });

  it("extracts CTM-only LGIDict registrations", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("ns-utm20-lgidict.pdf"),
      viewport(8, 6),
    );
    expect(result.rejected).toEqual([]);
    expect(result.pageStructure).toMatchObject({
      family: "lgidict",
      registrationCount: 1,
    });
    expect(result.candidates[0]).toMatchObject({
      flavor: "lgidict",
      embeddedLabel: "NAD83 / UTM zone 20N",
      sourceRect: { x: 0, y: 0, width: 8, height: 6 },
    });
  });

  it("matches the OGC LGIDict fixture's independent GDAL corner", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("test_ogc_bp.pdf"),
      viewport(20, 20),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].gcps[0]).toMatchObject({
      pixel: { x: 0, y: 0 },
      map: { lat: 49, lng: 2 },
    });
  });

  it("returns absence only when page 1 has no geospatial dictionary", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("plain.pdf"),
      viewport(300, 200),
    );
    expect(result).toMatchObject({
      pageStructure: null,
      candidates: [],
      rejected: [],
    });
  });

  it("classifies unreadable bytes without guessing a registration family", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("corrupt.pdf"),
      viewport(300, 200),
    );
    expect(result).toMatchObject({
      pageStructure: null,
      candidates: [],
      rejected: [{ flavor: null, reason: "unreadable" }],
    });
  });

  it("uses only page 1 registration dictionaries", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("registration-page-2.pdf"),
      viewport(300, 200),
    );
    expect(result.candidates).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("preserves unsupported CRS as a typed diagnostic", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("unsupported-crs.pdf"),
      viewport(300, 200),
    );
    expect(result.candidates).toEqual([]);
    expect(result.rejected).toEqual([
      { flavor: "measure", reason: "unsupported-crs" },
    ]);
  });

  it("rejects malformed Measure point cardinality", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("malformed-measure.pdf"),
      viewport(300, 200),
    );
    expect(result.candidates).toEqual([]);
    expect(result.rejected).toEqual([
      { flavor: "measure", reason: "invalid" },
    ]);
  });

  it("applies crop and rotation from the supplied PDF.js viewport", async () => {
    const result = await extractGeoPdfMetadata(
      fixture("rotated-cropped.pdf"),
      {
        width: 100,
        height: 200,
        transform: [0, 1, 1, 0, -40, -50],
        viewBox: [50, 40, 250, 140],
      },
    );
    expect(result.candidates[0].sourceRect).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 200,
    });
  });

  it("maps PDF user-space coordinates through the viewport transform", () => {
    expect(applyPdfViewport([0, 1, 1, 0, -40, -50], 250, 140)).toEqual({
      x: 100,
      y: 200,
    });
  });
});

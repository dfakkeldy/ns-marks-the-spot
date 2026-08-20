import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
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

async function measureWithExtendedLocalPoints(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([1728, 2088]);
  const measure = document.context.obj({
    Type: "Measure",
    Subtype: "GEO",
    Bounds: [0, 0, 0, 1, 1, 1, 1, 0],
    LPTS: [
      0.00032, 1.01537,
      -0.02238, 0.00035,
      0.99968, -0.01537,
      1.02238, 0.99965,
    ],
    GPTS: [
      42.85448, -70.65044,
      43.01304, -70.65468,
      43.01551, -70.47446,
      42.85693, -70.47068,
    ],
    GCS: {
      Type: "GEOGCS",
      EPSG: 4326,
    },
  });
  const registration = document.context.obj({
    Type: "Viewport",
    BBox: [10.79975, 2088, 1708.16044, 38.69368],
    Name: PDFHexString.fromText("Map Layers"),
    Measure: measure,
  });
  page.node.set(PDFName.of("VP"), document.context.obj([registration]));
  return document.save({ useObjectStreams: false });
}

/**
 * The same four ordinary Halifax corners a working sheet would carry, with
 * `LPTS` written in page units rather than as fractions of the BBox — a
 * hundred times too large. Every downstream check passes on this file: the
 * affine is well conditioned and the mesh corners are valid latitudes and
 * longitudes, because the mesh only asks that much.
 */
async function measureWithPageUnitLocalPoints(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const measure = document.context.obj({
    Type: "Measure",
    Subtype: "GEO",
    Bounds: [0, 0, 0, 1, 1, 1, 1, 0],
    LPTS: [
      0, 0,
      0, 100,
      100, 100,
      100, 0,
    ],
    GPTS: [
      44.62, -63.62,
      44.68, -63.62,
      44.68, -63.54,
      44.62, -63.54,
    ],
    GCS: {
      Type: "GEOGCS",
      EPSG: 4326,
    },
  });
  const registration = document.context.obj({
    Type: "Viewport",
    BBox: [0, 0, 612, 792],
    Name: PDFHexString.fromText("Map Layers"),
    Measure: measure,
  });
  page.node.set(PDFName.of("VP"), document.context.obj([registration]));
  return document.save({ useObjectStreams: false });
}

async function terraGo23Registrations(
  neatlineOverride?: number[],
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([100, 100]);
  const nestedNad83 = document.context.obj({
    Description: PDFHexString.fromText("North_American_Datum_1983"),
    Ellipsoid: {
      Description: PDFHexString.fromText("GRS 1980"),
      InvFlattening: PDFHexString.fromText("298.257222101"),
      SemiMajorAxis: PDFHexString.fromText("6378137"),
    },
    ToWGS84: {
      Description: PDFHexString.fromText("Custom To WGS84 Parameters"),
      dx: PDFHexString.fromText("0.9738"),
      dy: PDFHexString.fromText("-1.9453"),
      dz: PDFHexString.fromText("-0.5486"),
    },
  });
  const neatline = neatlineOverride ?? [
    0, 0,
    100, 0.0000000001,
    99.9999999999, 100,
    0.0000000001, 99.9999999999,
    0, 0,
  ];
  const registration = (
    description: string,
    ctm: number[],
    projection: object,
  ) =>
    document.context.obj({
      Type: PDFName.of("LGIDict"),
      Version: PDFHexString.fromText("2.3"),
      Description: PDFHexString.fromText(description),
      CTM: ctm,
      Neatline: neatline,
      Projection: document.context.obj({
        Type: PDFName.of("Projection"),
        ...projection,
      }),
    });

  page.node.set(
    PDFName.of("LGIDict"),
    document.context.obj([
      registration(
        "Quadrangle Location",
        [1_000, 0, 0, 1_000, 0, 0],
        {
          ProjectionType: PDFHexString.fromText("MC"),
          Datum: PDFHexString.fromText("WGE"),
          Units: PDFHexString.fromText("m"),
          CentralMeridian: PDFHexString.fromText("0"),
          OriginLatitude: PDFHexString.fromText("0"),
          FalseEasting: PDFHexString.fromText("0"),
          FalseNorthing: PDFHexString.fromText("0"),
          ScaleFactor: PDFHexString.fromText("0"),
        },
      ),
      registration(
        "Map Layers",
        [10, 0, 0, 10, 500_000, 5_000_000],
        {
          ProjectionType: PDFHexString.fromText("UT"),
          Datum: nestedNad83,
          Hemisphere: PDFHexString.fromText("N"),
          Zone: 19,
          Units: PDFHexString.fromText("m"),
        },
      ),
      registration(
        "Adjoining Quadrangles Diagram",
        [0.001, 0, 0, 0.001, -126, 37],
        {
          ProjectionType: PDFHexString.fromText("GEOGRAPHIC"),
          Datum: nestedNad83,
          Units: PDFHexString.fromText("deg"),
        },
      ),
    ]),
  );
  return document.save({ useObjectStreams: false });
}

describe("extractGeoPdfMetadata", () => {
  it("keeps a valid rotated Measure frame whose local points extend beyond the unit square", async () => {
    const result = await extractGeoPdfMetadata(
      await measureWithExtendedLocalPoints(),
      viewport(1728, 2088),
    );

    expect(result.rejected).toEqual([]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      flavor: "measure",
      embeddedLabel: "Map Layers",
    });
    expect(result.candidates[0].gcps).toHaveLength(4);
    // The point of this fixture: its control points really do land off the
    // rendered raster, so a guard on where they land has to admit them. Pinned
    // in raster fractions rather than left implicit, because the number here is
    // what says how much room the page-unit guard below must leave.
    const excursions = result.candidates[0].gcps.map(({ pixel }) =>
      Math.max(
        0,
        -pixel.x / 1728,
        (pixel.x - 1728) / 1728,
        -pixel.y / 2088,
        (pixel.y - 2088) / 2088,
      ),
    );
    expect(Math.max(...excursions)).toBeCloseTo(0.0157, 4);
  });

  it("rejects a Measure frame whose local points were written in page units", async () => {
    const result = await extractGeoPdfMetadata(
      await measureWithPageUnitLocalPoints(),
      viewport(612, 792),
    );

    expect(result.candidates).toEqual([]);
    expect(result.rejected).toEqual([
      { flavor: "measure", reason: "invalid" },
    ]);
  });

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

  it("extracts the evidenced TerraGo 2.3 Mercator, NAD83 UTM, and geographic frames", async () => {
    const result = await extractGeoPdfMetadata(
      await terraGo23Registrations(),
      viewport(100, 100),
    );

    expect(result.rejected).toEqual([]);
    expect(result.pageStructure).toMatchObject({
      family: "lgidict",
      registrationCount: 3,
      completeLabels: [
        "Quadrangle Location",
        "Map Layers",
        "Adjoining Quadrangles Diagram",
      ],
    });
    expect(result.candidates.map(({ embeddedLabel }) => embeddedLabel)).toEqual([
      "Quadrangle Location",
      "Map Layers",
      "Adjoining Quadrangles Diagram",
    ]);
    expect(result.candidates[0].gcps[0].map).toMatchObject({
      lat: 0,
      lng: 0,
    });
    expect(result.candidates[1].gcps[0].map.lat).toBeCloseTo(45.153, 2);
    expect(result.candidates[1].gcps[0].map.lng).toBeCloseTo(-69, 2);
    expect(result.candidates[2].gcps[0].map.lat).toBeCloseTo(37, 3);
    expect(result.candidates[2].gcps[0].map.lng).toBeCloseTo(-126, 3);
  });

  it("does not reduce a skewed TerraGo neatline to its bounding box", async () => {
    const result = await extractGeoPdfMetadata(
      await terraGo23Registrations([
        0, 0,
        100, 10,
        100, 100,
        0, 100,
        0, 0,
      ]),
      viewport(100, 100),
    );

    expect(result.candidates).toEqual([]);
    expect(result.rejected).toEqual([
      { flavor: "lgidict", reason: "unsupported" },
      { flavor: "lgidict", reason: "unsupported" },
      { flavor: "lgidict", reason: "unsupported" },
    ]);
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

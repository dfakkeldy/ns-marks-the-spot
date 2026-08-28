import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractGeoPdfMetadata,
  type PdfViewportGeometry,
} from "../../userMaps/parsers/geoPdfMetadata";
import {
  EARTH_RADIUS_METRES,
  toMercator,
  type MercatorPoint,
} from "../../userMaps/transform/webMercator";
import { attachGeoRegistration } from "./geoRegistration";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };
const mapFrame = { x: 28, y: 192, width: 556, height: 500 };

function viewport(width: number, height: number): PdfViewportGeometry {
  return {
    width,
    height,
    transform: [1, 0, 0, -1, 0, height],
    viewBox: [0, 0, width, height],
  };
}

async function writtenBytes(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  attachGeoRegistration(document, page, bounds, mapFrame);
  return document.save({ useObjectStreams: false });
}

// Rendered at 72 dpi with a top-left origin: PDF (x, y) → pixel (x, 792 − y).
const frameTopPx = 792 - (mapFrame.y + mapFrame.height); // 100
const frameBottomPx = 792 - mapFrame.y; // 600
const frameLeftPx = mapFrame.x; // 28
const frameRightPx = mapFrame.x + mapFrame.width; // 584

describe("attachGeoRegistration round-trips through the app's own parser", () => {
  it("yields one accepted candidate per flavour and nothing rejected", async () => {
    const extraction = await extractGeoPdfMetadata(
      await writtenBytes(),
      viewport(612, 792),
    );
    expect(extraction.rejected).toEqual([]);
    expect(extraction.candidates.map(({ flavor }) => flavor).sort())
      .toEqual(["lgidict", "measure"]);
  });

  it.each(["measure", "lgidict"] as const)(
    "%s corners are exact",
    async (flavor) => {
      const extraction = await extractGeoPdfMetadata(
        await writtenBytes(),
        viewport(612, 792),
      );
      const candidate = extraction.candidates.find(
        (entry) => entry.flavor === flavor,
      );
      expect(candidate).toBeDefined();
      const byPixel = (x: number, y: number) =>
        candidate!.gcps.find(
          (gcp) =>
            Math.abs(gcp.pixel.x - x) < 1e-6 &&
            Math.abs(gcp.pixel.y - y) < 1e-6,
        );
      const sw = byPixel(frameLeftPx, frameBottomPx);
      const ne = byPixel(frameRightPx, frameTopPx);
      expect(sw?.map.lat).toBeCloseTo(bounds.south, 9);
      expect(sw?.map.lng).toBeCloseTo(bounds.west, 9);
      expect(ne?.map.lat).toBeCloseTo(bounds.north, 9);
      expect(ne?.map.lng).toBeCloseTo(bounds.east, 9);
    },
  );
});

// --- Helpers for reading the raw written PDF structure directly, rather ---
// --- than through the app's own parser, which normalizes both a correct ---
// --- EPSG:3857 writer and a wrong EPSG:4326 writer down to the same     ---
// --- lat/lng corner GCPs (see the code-review finding this replaces).   ---

function numbersFromPdfArray(array: PDFArray): number[] {
  return Array.from({ length: array.size() }, (_, index) =>
    array.lookup(index, PDFNumber).asNumber(),
  );
}

function applyCtm(ctm: number[], x: number, y: number): MercatorPoint {
  const [a, b, c, d, e, f] = ctm;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

function expectMetresClose(actual: MercatorPoint, expected: MercatorPoint) {
  // A tenth-of-a-millimetre absolute tolerance on values of ~1e6-1e7
  // metres — generous next to floating-point noise, but 10 orders of
  // magnitude tighter than the ~13,000,000 m error a degrees-based CTM
  // would produce for these bounds.
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(1e-4);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(1e-4);
}

describe("attachGeoRegistration declares its CRS as Web Mercator, not degrees", () => {
  it("stamps /Measure/GCS as EPSG:3857 PROJCS and /LGIDict/Projection as Mercator", async () => {
    const document = await PDFDocument.load(await writtenBytes());
    const page = document.getPage(0);

    const viewportDict = page.node
      .lookup(PDFName.of("VP"), PDFArray)
      .lookup(0, PDFDict);
    const gcs = viewportDict
      .lookup(PDFName.of("Measure"), PDFDict)
      .lookup(PDFName.of("GCS"), PDFDict);
    expect(gcs.lookup(PDFName.of("Type"), PDFName).decodeText()).toBe(
      "PROJCS",
    );
    expect(gcs.lookup(PDFName.of("EPSG"), PDFNumber).asNumber()).toBe(3857);

    const lgi = page.node
      .lookup(PDFName.of("LGIDict"), PDFArray)
      .lookup(0, PDFDict);
    // A PDFString lookup, not PDFName: GDAL discards a Projection whose
    // ProjectionType arrives as the name /MC and then reports page pixels.
    const projectionType = lgi
      .lookup(PDFName.of("Projection"), PDFDict)
      .lookup(PDFName.of("ProjectionType"), PDFString)
      .decodeText();
    expect(projectionType).toBe("MC");
    expect(projectionType).not.toBe("GEOGRAPHIC");
  });
});

describe("attachGeoRegistration's Projection is one PROJ will accept", () => {
  async function projection(): Promise<PDFDict> {
    const document = await PDFDocument.load(await writtenBytes());
    return document
      .getPage(0)
      .node.lookup(PDFName.of("LGIDict"), PDFArray)
      .lookup(0, PDFDict)
      .lookup(PDFName.of("Projection"), PDFDict);
  }

  it("scales by 1, since Web Mercator is true to scale at the equator", async () => {
    // PROJ rejects a zero outright ("Invalid value for k/k_0: it should be
    // > 0") and the page loses its georeferencing entirely.
    const scaleFactor = (await projection())
      .lookup(PDFName.of("ScaleFactor"), PDFNumber)
      .asNumber();
    expect(scaleFactor).toBe(1);
    expect(scaleFactor).toBeGreaterThan(0);
  });

  it("spells out a spherical datum rather than naming the WGS 84 ellipsoid", async () => {
    // "WGE" names the ellipsoid, but the CTM is in spherical Web Mercator
    // metres; read against the ellipsoid this frame's north edge came back
    // 46.392°N instead of 46.2°N — roughly 21 km out.
    const datum = (await projection()).lookup(PDFName.of("Datum"), PDFDict);
    const ellipsoid = datum.lookup(PDFName.of("Ellipsoid"), PDFDict);
    expect(
      ellipsoid.lookup(PDFName.of("SemiMajorAxis"), PDFNumber).asNumber(),
    ).toBe(EARTH_RADIUS_METRES);
    expect(
      ellipsoid.lookup(PDFName.of("InvFlattening"), PDFNumber).asNumber(),
    ).toBe(0);
  });

  it("writes Units as a string, so GDAL can read it", async () => {
    expect(
      (await projection())
        .lookup(PDFName.of("Units"), PDFString)
        .decodeText(),
    ).toBe("m");
  });
});

describe("attachGeoRegistration's CTM targets Mercator metres, not degrees", () => {
  it("maps the frame's corners and centre through /LGIDict/CTM onto the true Web Mercator point", async () => {
    const document = await PDFDocument.load(await writtenBytes());
    const page = document.getPage(0);
    const lgi = page.node
      .lookup(PDFName.of("LGIDict"), PDFArray)
      .lookup(0, PDFDict);
    const ctm = numbersFromPdfArray(lgi.lookup(PDFName.of("CTM"), PDFArray));
    expect(ctm).toHaveLength(6);

    const left = mapFrame.x;
    const bottom = mapFrame.y;
    const right = mapFrame.x + mapFrame.width;
    const top = mapFrame.y + mapFrame.height;
    const centreX = mapFrame.x + mapFrame.width / 2;
    const centreY = mapFrame.y + mapFrame.height / 2;

    // Ground truth computed independently via toMercator, not by re-deriving
    // the writer's own scaleX/scaleY math.
    const mercSW = toMercator({ lat: bounds.south, lng: bounds.west });
    const mercNW = toMercator({ lat: bounds.north, lng: bounds.west });
    const mercNE = toMercator({ lat: bounds.north, lng: bounds.east });
    const mercSE = toMercator({ lat: bounds.south, lng: bounds.east });
    const mercCentre: MercatorPoint = {
      x: (mercSW.x + mercNE.x) / 2,
      y: (mercSW.y + mercNE.y) / 2,
    };

    // A degrees-based CTM would put these around (-61.25, 46.1) — off by
    // six orders of magnitude from the metres-based values asserted here.
    expectMetresClose(applyCtm(ctm, left, bottom), mercSW);
    expectMetresClose(applyCtm(ctm, left, top), mercNW);
    expectMetresClose(applyCtm(ctm, right, top), mercNE);
    expectMetresClose(applyCtm(ctm, right, bottom), mercSE);
    expectMetresClose(applyCtm(ctm, centreX, centreY), mercCentre);
  });
});

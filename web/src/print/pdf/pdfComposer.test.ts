import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractGeoPdfMetadata,
  type PdfViewportGeometry,
} from "../../userMaps/parsers/geoPdfMetadata";
import { buildScaleBar } from "./scaleBar";
import { composeGeoPdf, type ComposeInput } from "./pdfComposer";
import { pdfTemplates } from "./templates/index";

const bounds = { north: 46.2, south: 46.0, west: -61.4, east: -61.1 };

function testJpeg(): { jpegBytes: Uint8Array; widthPx: number; heightPx: number } {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#7788aa";
  ctx.fillRect(0, 0, 8, 8);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return {
    jpegBytes: Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)),
    widthPx: 8,
    heightPx: 8,
  };
}

function input(overrides: Partial<ComposeInput> = {}): ComposeInput {
  const template = pdfTemplates.portrait;
  return {
    template,
    bounds,
    mapImage: testJpeg(),
    fields: {
      title: "Mabou Harbour",
      subtitle: "Fletcher sheet 14 over modern base",
      notes: "Walked the shore road boundary.",
    },
    legend: [
      { name: "OpenStreetMap base map", swatchColor: null },
      { name: "Fletcher sheet 14", swatchColor: "#b5651d" },
    ],
    attributionLines: [
      "Base map © OpenStreetMap contributors — openstreetmap.org/copyright",
      "Fletcher series scans courtesy David Rumsey Map Collection",
    ],
    qrPngBytes: null,
    scaleBar: buildScaleBar(bounds, template.mapFrame, template.scaleBar.maxWidth),
    generatedAt: "2026-07-31T12:00:00.000Z",
    ...overrides,
  };
}

function viewport(width: number, height: number): PdfViewportGeometry {
  return {
    width,
    height,
    transform: [1, 0, 0, -1, 0, height],
    viewBox: [0, 0, width, height],
  };
}

describe("composeGeoPdf", () => {
  it("produces a one-page Letter document carrying both registrations", async () => {
    const bytes = await composeGeoPdf(input());
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    const { width, height } = document.getPage(0).getSize();
    expect({ width, height }).toEqual({ width: 612, height: 792 });
    const extraction = await extractGeoPdfMetadata(bytes, viewport(612, 792));
    expect(extraction.rejected).toEqual([]);
    expect(extraction.candidates).toHaveLength(2);
  });

  it("stamps document info from the fields", async () => {
    // updateMetadata: false — pdf-lib's own default load path unconditionally
    // rewrites Producer/ModificationDate on every load (see PDFDocument's
    // updateInfoDict), which would clobber the very field under test before
    // we ever read it back.
    const document = await PDFDocument.load(await composeGeoPdf(input()), {
      updateMetadata: false,
    });
    expect(document.getTitle()).toBe("Mabou Harbour");
    expect(document.getProducer()).toBe("NS Marks The Spot web map");
  });

  it("composes with the legend disabled and in landscape", async () => {
    const template = pdfTemplates.landscape;
    const bytes = await composeGeoPdf(input({
      template,
      legend: null,
      scaleBar: buildScaleBar(bounds, template.mapFrame, template.scaleBar.maxWidth),
    }));
    const document = await PDFDocument.load(bytes);
    const { width, height } = document.getPage(0).getSize();
    expect({ width, height }).toEqual({ width: 792, height: 612 });
  });

  it("stays under the size ceiling with a realistic map image", async () => {
    const bytes = await composeGeoPdf(input());
    expect(bytes.byteLength).toBeLessThan(15 * 1024 * 1024);
  });
});

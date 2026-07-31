import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { PrintMapBounds } from "../../services/printSnapshot";
import { attachGeoRegistration } from "./geoRegistration";
import type { ScaleBarSpec } from "./scaleBar";
import type { PdfRect, PdfTemplate } from "./templates/types";

export type ExportFields = { title: string; subtitle: string; notes: string };
export type LegendEntry = { name: string; swatchColor: string | null };

export type ComposeInput = {
  template: PdfTemplate;
  bounds: PrintMapBounds;
  mapImage: { jpegBytes: Uint8Array; widthPx: number; heightPx: number };
  fields: ExportFields;
  /** Null renders no legend box; the attribution strip always renders. */
  legend: LegendEntry[] | null;
  attributionLines: string[];
  qrPngBytes: Uint8Array | null;
  scaleBar: ScaleBarSpec;
  generatedAt: string;
};

const INK = rgb(0.12, 0.13, 0.15);
const MUTED = rgb(0.42, 0.44, 0.48);
const RULE = rgb(0.78, 0.8, 0.83);
const CHIP = rgb(0.85, 0.86, 0.88);

function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  return rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}

/** Greedy word wrap measured with the actual font metrics. */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * StandardFonts render through WinAnsi (cp1252) encoding, which has no
 * glyph for "≈" — `buildScaleBar` correctly uses it to mean "approximately"
 * for on-screen/HTML consumers, but drawing it with a standard font would
 * throw. Swap it for a plain-ASCII stand-in instead of crashing the export.
 */
function winAnsiSafe(text: string): string {
  return text.replace(/≈/gu, "~");
}

function drawScaleBar(
  page: PDFPage,
  template: PdfTemplate,
  spec: ScaleBarSpec,
  font: PDFFont,
): void {
  const { x, y } = template.scaleBar;
  const segments = 4;
  const segmentWidth = spec.widthPoints / segments;
  for (let index = 0; index < segments; index += 1) {
    page.drawRectangle({
      x: x + index * segmentWidth,
      y,
      width: segmentWidth,
      height: 5,
      color: index % 2 === 0 ? INK : rgb(1, 1, 1),
      borderColor: INK,
      borderWidth: 0.6,
    });
  }
  const caption = template.type.caption;
  page.drawText("0", { x, y: y - caption - 2, size: caption, font, color: MUTED });
  const endLabel = spec.label;
  page.drawText(endLabel, {
    x: x + spec.widthPoints - font.widthOfTextAtSize(endLabel, caption),
    y: y - caption - 2,
    size: caption,
    font,
    color: MUTED,
  });
  page.drawText(winAnsiSafe(spec.denominatorLabel), {
    x, y: y + 9, size: caption, font, color: MUTED,
  });
}

function drawNorthArrow(
  page: PDFPage,
  template: PdfTemplate,
  font: PDFFont,
): void {
  const { x, y, size } = template.northArrow;
  const cx = x + size / 2;
  page.drawText("N", {
    x: cx - font.widthOfTextAtSize("N", template.type.body) / 2,
    y: y + size - template.type.body,
    size: template.type.body,
    font,
    color: INK,
  });
  const tip = y + size - template.type.body - 3;
  page.drawLine({
    start: { x: cx, y }, end: { x: cx, y: tip },
    thickness: 1.2, color: INK,
  });
  page.drawLine({
    start: { x: cx - 4, y: tip - 6 }, end: { x: cx, y: tip },
    thickness: 1.2, color: INK,
  });
  page.drawLine({
    start: { x: cx + 4, y: tip - 6 }, end: { x: cx, y: tip },
    thickness: 1.2, color: INK,
  });
}

function drawLegend(
  page: PDFPage,
  box: PdfRect,
  entries: LegendEntry[],
  fonts: { bold: PDFFont; regular: PDFFont },
  type: PdfTemplate["type"],
): void {
  page.drawRectangle({
    x: box.x, y: box.y, width: box.width, height: box.height,
    borderColor: RULE, borderWidth: 0.75,
  });
  page.drawText("LEGEND", {
    x: box.x + 8,
    y: box.y + box.height - type.caption - 6,
    size: type.caption,
    font: fonts.bold,
    color: MUTED,
  });
  const rowHeight = type.caption + 6;
  const firstRowY = box.y + box.height - type.caption - 6 - rowHeight;
  const maxRows = Math.max(1, Math.floor((firstRowY - box.y) / rowHeight) + 1);
  const visible = entries.slice(0, maxRows);
  const overflow = entries.length - visible.length;
  visible.forEach((entry, index) => {
    const rowY = firstRowY - index * rowHeight;
    const isOverflowRow = overflow > 0 && index === visible.length - 1;
    if (!isOverflowRow) {
      page.drawRectangle({
        x: box.x + 8, y: rowY, width: 8, height: 8,
        color: entry.swatchColor ? hexToRgb(entry.swatchColor) : CHIP,
        borderColor: MUTED, borderWidth: 0.4,
      });
    }
    const label = isOverflowRow
      ? `…and ${overflow + 1} more — see attribution`
      : entry.name;
    page.drawText(label, {
      x: box.x + 22, y: rowY + 1, size: type.caption,
      font: fonts.regular, color: INK,
      maxWidth: box.width - 30,
    });
  });
}

export async function composeGeoPdf(input: ComposeInput): Promise<Uint8Array> {
  const { template, fields } = input;
  const document = await PDFDocument.create();
  document.setTitle(fields.title);
  document.setProducer("NS Marks The Spot web map");
  document.setCreator("NS Marks The Spot web map");
  const generated = new Date(input.generatedAt);
  document.setCreationDate(generated);
  document.setModificationDate(generated);

  const page = document.addPage([template.page.width, template.page.height]);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const regular = await document.embedFont(StandardFonts.Helvetica);

  // Map image plus neatline.
  const jpeg = await document.embedJpg(input.mapImage.jpegBytes);
  const frame = template.mapFrame;
  page.drawImage(jpeg, {
    x: frame.x, y: frame.y, width: frame.width, height: frame.height,
  });
  page.drawRectangle({
    x: frame.x, y: frame.y, width: frame.width, height: frame.height,
    borderColor: INK, borderWidth: 1,
  });

  // Title block: title, subtitle, then wrapped notes.
  const tb = template.titleBlock;
  let cursorY = tb.y + tb.height - template.type.title;
  page.drawText(fields.title, {
    x: tb.x, y: cursorY, size: template.type.title, font: bold, color: INK,
    maxWidth: tb.width,
  });
  if (fields.subtitle) {
    cursorY -= template.type.subtitle + 6;
    page.drawText(fields.subtitle, {
      x: tb.x, y: cursorY, size: template.type.subtitle,
      font: regular, color: MUTED, maxWidth: tb.width,
    });
  }
  if (fields.notes) {
    for (const line of wrapText(fields.notes, regular, template.type.body, tb.width)) {
      cursorY -= template.type.body + 3;
      if (cursorY < tb.y) break;
      page.drawText(line, {
        x: tb.x, y: cursorY, size: template.type.body,
        font: regular, color: INK,
      });
    }
  }

  if (input.legend && input.legend.length > 0) {
    drawLegend(page, template.legendBox, input.legend,
      { bold, regular }, template.type);
  }
  drawScaleBar(page, template, input.scaleBar, regular);
  drawNorthArrow(page, template, regular);

  if (input.qrPngBytes) {
    const qr = await document.embedPng(input.qrPngBytes);
    page.drawImage(qr, {
      x: template.qr.x, y: template.qr.y,
      width: template.qr.size, height: template.qr.size,
    });
  }

  // Attribution strip — always rendered, top-ruled, oldest obligation last.
  const strip = template.attributionStrip;
  page.drawLine({
    start: { x: strip.x, y: strip.y + strip.height },
    end: { x: strip.x + strip.width, y: strip.y + strip.height },
    thickness: 0.75, color: RULE,
  });
  const stamp = `Generated ${input.generatedAt.slice(0, 10)} — kinnokilabs.com/map`;
  const attributionText = [...input.attributionLines, stamp].join("  ·  ");
  const capSize = template.type.caption;
  const lines = wrapText(attributionText, regular, capSize, strip.width);
  const maxLines = Math.max(1, Math.floor(strip.height / (capSize + 2)));
  lines.slice(0, maxLines).forEach((line, index) => {
    page.drawText(line, {
      x: strip.x,
      y: strip.y + strip.height - (index + 1) * (capSize + 2),
      size: capSize, font: regular, color: MUTED,
    });
  });

  attachGeoRegistration(document, page, input.bounds, frame);
  return document.save({ useObjectStreams: false });
}

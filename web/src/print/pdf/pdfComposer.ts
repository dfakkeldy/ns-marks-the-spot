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

/** Falls back to the neutral chip colour for anything that isn't `#rrggbb`. */
function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/u.test(value)) return CHIP;
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
 * The single choke point every string must pass through before it reaches
 * `page.drawText` (or any font-metric call, e.g. `wrapText`/`widthOfTextAtSize`).
 *
 * StandardFonts render through pdf-lib's WinAnsi (cp1252) encoding. Em
 * dashes, curly quotes, and accented Latin letters ("Café") are all in
 * cp1252 and render fine, but emoji, arrows, and other symbols outside it
 * make pdf-lib throw an uncaught `Error: WinAnsi cannot encode "X"` —
 * crashing the whole export over one decorative character a user happened
 * to type into a title or notes field.
 *
 * "≈" gets a dedicated ASCII stand-in because `buildScaleBar` emits it on
 * purpose for the HTML consumer (see scaleBar.ts) and "~" reads naturally
 * in its place. Anything else the embedded font can't encode is swapped
 * for a plain "?", checked per Unicode code point directly against the
 * font — robust against arbitrary input rather than an exhaustive
 * character list, and it can never throw. Whitespace is passed through
 * unchecked: pdf-lib's WinAnsi encoding does encode newlines/tabs (it
 * throws on them too), but replacing them here would corrupt `wrapText`'s
 * later `\s+`-based word splitting, silently gluing words together.
 */
function sanitizeForPdf(text: string, font: PDFFont): string {
  const withoutApprox = text.replace(/≈/gu, "~");
  let safe = "";
  for (const codePoint of withoutApprox) {
    if (/\s/u.test(codePoint)) {
      safe += codePoint;
      continue;
    }
    try {
      font.widthOfTextAtSize(codePoint, 1);
      safe += codePoint;
    } catch {
      safe += "?";
    }
  }
  return safe;
}

/**
 * Trims `line` until appending an ellipsis fits within `maxWidth`, so a
 * title/notes line clipped by the block's bottom edge says so instead of
 * silently vanishing.
 */
function ellipsize(
  line: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  let candidate = line;
  while (
    candidate.length > 0 &&
    font.widthOfTextAtSize(`${candidate}…`, size) > maxWidth
  ) {
    candidate = candidate.slice(0, -1);
  }
  return `${candidate.replace(/\s+$/u, "")}…`;
}

/** Baseline-to-baseline padding added to the caption size in the strip. */
const CAPTION_LEADING = 2;

/**
 * Smallest caption size the attribution strip will shrink to. Below ~5pt the
 * strip stops being readable on paper, at which point ellipsizing and saying
 * so is more honest than rendering unreadable text.
 */
const MIN_CAPTION_SIZE = 5;

/** Said on the strip's last line when the notices run onto their own page. */
const CONTINUATION_NOTICE = "Sources and licences continue on the next page.";

/** Heading on each page that carries attribution the strip could not hold. */
const CONTINUATION_HEADING = "Sources and licences (continued)";

/**
 * Fits the attribution text INTO `strip` rather than cutting it to length.
 *
 * The attribution strip carries a licence obligation: source names, licence
 * names and URLs, and the capture stamp. Wrapping at the template caption
 * size and slicing to `floor(height / lineHeight)` dropped whatever did not
 * fit — with the app's default layer set that was the later Province layers
 * and the `Generated …` stamp, gone with no ellipsis and no notice. Silently
 * cutting the attribution is worse than not having it.
 *
 * So step the caption size down until the wrapped text fits the strip's real
 * height. When even `MIN_CAPTION_SIZE` cannot hold it, the remainder moves to
 * a continuation page and the strip's last line says so. Truncating it here
 * was the older answer, and it stopped being defensible once the coastal
 * licence's three required notices joined the strip: an ellipsis in the
 * middle of a no-warranty caveat is a licence condition the page does not
 * carry.
 */
function fitAttribution(
  text: string,
  font: PDFFont,
  strip: PdfRect,
  preferredSize: number,
): { size: number; lines: string[]; overflow: string } {
  for (let size = preferredSize; size >= MIN_CAPTION_SIZE; size -= 0.5) {
    const lines = wrapText(text, font, size, strip.width);
    if (lines.length * (size + CAPTION_LEADING) <= strip.height) {
      return { size, lines, overflow: "" };
    }
  }
  // Floor reached. `wrapText` at the floor is re-run rather than reused from
  // the loop because the loop's decreasing step may never land exactly on
  // MIN_CAPTION_SIZE (e.g. a 7.2pt template caption steps 7.2, 6.7, … 5.2).
  const size = MIN_CAPTION_SIZE;
  const lines = wrapText(text, font, size, strip.width);
  const maxLines = Math.max(
    1, Math.floor(strip.height / (size + CAPTION_LEADING)),
  );
  if (lines.length <= maxLines) return { size, lines, overflow: "" };
  // One line of the strip is spent pointing at the continuation, so what the
  // reader sees on the map page always accounts for what it does not show.
  const kept = lines.slice(0, Math.max(0, maxLines - 1));
  return {
    size,
    lines: [...kept, ellipsize(CONTINUATION_NOTICE, font, size, strip.width)
      .replace(/…$/u, "")],
    overflow: lines.slice(kept.length).join(" "),
  };
}

/**
 * Draws attribution the strip could not hold onto its own page or pages.
 *
 * The map page stays georeferenced and unchanged; these pages carry the rest
 * of the obligation at a readable size rather than at the strip's 5pt floor.
 */
function drawAttributionOverflow(
  document: PDFDocument,
  template: PdfTemplate,
  fonts: { bold: PDFFont; regular: PDFFont },
  text: string,
): void {
  const size = template.type.body;
  const lineHeight = size + 3;
  const width = template.page.width - template.margin * 2;
  let remaining = wrapText(text, fonts.regular, size, width);
  while (remaining.length > 0) {
    const page = document.addPage([template.page.width, template.page.height]);
    const headingY =
      template.page.height - template.margin - template.type.subtitle;
    page.drawText(CONTINUATION_HEADING, {
      x: template.margin,
      y: headingY,
      size: template.type.subtitle,
      font: fonts.bold,
      color: INK,
    });
    const top = headingY - template.type.subtitle - 8;
    const capacity = Math.max(
      1, Math.floor((top - template.margin) / lineHeight),
    );
    remaining.slice(0, capacity).forEach((line, index) => {
      page.drawText(line, {
        x: template.margin,
        y: top - index * lineHeight,
        size, font: fonts.regular, color: MUTED,
      });
    });
    remaining = remaining.slice(capacity);
  }
}

/**
 * Draws pre-wrapped `lines` top-down, one `page.drawText` call per line,
 * starting at `startY` and stepping by `lineHeight` (derived from the
 * paragraph's own font size, not pdf-lib's hardcoded-24 default that a
 * `maxWidth`-wrapped `drawText` call would otherwise use).
 *
 * Stops once a line's baseline would fall below `bottomY` — the
 * block-bounds guard the title and subtitle previously lacked entirely,
 * which let a long title spill past `titleBlock` and print over the map
 * image drawn beneath it. When more lines exist than fit, the last line
 * that *does* fit is ellipsized so the clipping is visible rather than
 * silent.
 *
 * Returns the baseline Y of the last line actually drawn (or `startY`
 * unchanged if nothing was), so callers can chain the next paragraph's own
 * gap + font size onto it exactly as the original single-line cursor math
 * did.
 */
function drawBoundedParagraph(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  size: number,
  lineHeight: number,
  x: number,
  startY: number,
  bottomY: number,
  color: RGB,
  maxWidth: number,
): number {
  let lastBaseline = startY;
  for (let index = 0; index < lines.length; index += 1) {
    const y = startY - index * lineHeight;
    if (y < bottomY) break;
    const linesRemain = index < lines.length - 1;
    const nextWouldOverflow = y - lineHeight < bottomY;
    const text = linesRemain && nextWouldOverflow
      ? ellipsize(lines[index], font, size, maxWidth)
      : lines[index];
    page.drawText(text, { x, y, size, font, color });
    lastBaseline = y;
  }
  return lastBaseline;
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
  page.drawText(sanitizeForPdf(spec.denominatorLabel, font), {
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
      : sanitizeForPdf(entry.name, fonts.regular);
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

  // Title block: title, subtitle, then wrapped notes. Each paragraph wraps
  // itself with `wrapText` (real font metrics) and draws one line per
  // `drawText` call via `drawBoundedParagraph` — deliberately NOT relying on
  // `drawText`'s own `maxWidth` wrapping, whose line height is a flat 24pt
  // regardless of font size. At the portrait template's 22pt title size that
  // flat 24pt is barely more than one line's worth of leading, so a wrapped
  // title's second line lands almost on top of the subtitle. Every paragraph
  // shares the same `tb.y` bottom bound, so a long title that eats the whole
  // block simply leaves no room for subtitle/notes, rather than any of the
  // three printing below the block and over the map image drawn first.
  const tb = template.titleBlock;
  const titleLineHeight = template.type.title * 1.15;
  const titleLines = wrapText(
    sanitizeForPdf(fields.title, bold), bold, template.type.title, tb.width,
  );
  let cursorY = drawBoundedParagraph(
    page, titleLines, bold, template.type.title, titleLineHeight,
    tb.x, tb.y + tb.height - template.type.title, tb.y, INK, tb.width,
  );
  if (fields.subtitle) {
    cursorY -= template.type.subtitle + 6;
    if (cursorY >= tb.y) {
      const subtitleLineHeight = template.type.subtitle * 1.15;
      const subtitleLines = wrapText(
        sanitizeForPdf(fields.subtitle, regular), regular, template.type.subtitle, tb.width,
      );
      cursorY = drawBoundedParagraph(
        page, subtitleLines, regular, template.type.subtitle, subtitleLineHeight,
        tb.x, cursorY, tb.y, MUTED, tb.width,
      );
    }
  }
  if (fields.notes) {
    cursorY -= template.type.body + 3;
    if (cursorY >= tb.y) {
      const bodyLineHeight = template.type.body + 3;
      const noteLines = wrapText(
        sanitizeForPdf(fields.notes, regular), regular, template.type.body, tb.width,
      );
      drawBoundedParagraph(
        page, noteLines, regular, template.type.body, bodyLineHeight,
        tb.x, cursorY, tb.y, INK, tb.width,
      );
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
  const safeAttributionLines = input.attributionLines.map(
    (line) => sanitizeForPdf(line, regular),
  );
  const attributionText = [...safeAttributionLines, stamp].join("  ·  ");
  const { size: capSize, lines, overflow } = fitAttribution(
    attributionText, regular, strip, template.type.caption,
  );
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: strip.x,
      y: strip.y + strip.height - (index + 1) * (capSize + CAPTION_LEADING),
      size: capSize, font: regular, color: MUTED,
    });
  });

  attachGeoRegistration(document, page, input.bounds, frame);
  if (overflow) {
    drawAttributionOverflow(document, template, { bold, regular }, overflow);
  }
  return document.save({ useObjectStreams: false });
}

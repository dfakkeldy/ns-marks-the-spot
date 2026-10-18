import type { PdfTemplate } from "./types";

/**
 * Letter landscape: map dominant on top (wide field-map aspect), compact
 * bottom band with title, legend, scale + north, QR, and attribution.
 */
export const landscapeTemplate: PdfTemplate = {
  id: "landscape",
  page: { width: 792, height: 612 },
  margin: 28,
  mapFrame: { x: 28, y: 150, width: 736, height: 434 },
  titleBlock: { x: 28, y: 64, width: 300, height: 78 },
  legendBox: { x: 340, y: 64, width: 224, height: 78 },
  scaleBar: { x: 576, y: 76, maxWidth: 80 },
  northArrow: { x: 576, y: 106, size: 32 },
  qr: { x: 668, y: 46, size: 96 },
  attributionStrip: { x: 28, y: 28, width: 624, height: 28 },
  type: { title: 16, subtitle: 10, body: 9, caption: 7 },
};

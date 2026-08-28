import type { PdfTemplate } from "./types";

/**
 * Letter portrait: title band on top, map dominant, and a bottom band with
 * legend, scale bar + north arrow, and the QR share link above a full-width
 * attribution strip. All numbers are PDF points from the bottom-left.
 */
export const portraitTemplate: PdfTemplate = {
  id: "portrait",
  page: { width: 612, height: 792 },
  margin: 28,
  titleBlock: { x: 28, y: 700, width: 556, height: 64 },
  mapFrame: { x: 28, y: 192, width: 556, height: 500 },
  legendBox: { x: 28, y: 72, width: 312, height: 112 },
  scaleBar: { x: 348, y: 84, maxWidth: 128 },
  northArrow: { x: 352, y: 124, size: 40 },
  qr: { x: 488, y: 72, size: 96 },
  attributionStrip: { x: 28, y: 28, width: 556, height: 36 },
  type: { title: 22, subtitle: 11, body: 9, caption: 7 },
};

/** PDF user-space rectangle: points, origin at the page's bottom-left. */
export type PdfRect = { x: number; y: number; width: number; height: number };

export type PdfTemplateId = "portrait" | "landscape";

export const POINTS_PER_INCH = 72;
export const METRES_PER_POINT = 0.0254 / POINTS_PER_INCH;

export type PdfTemplate = {
  id: PdfTemplateId;
  page: { width: number; height: number };
  margin: number;
  mapFrame: PdfRect;
  titleBlock: PdfRect;
  legendBox: PdfRect;
  attributionStrip: PdfRect;
  scaleBar: { x: number; y: number; maxWidth: number };
  northArrow: { x: number; y: number; size: number };
  qr: { x: number; y: number; size: number };
  /** Font sizes in points; faces are pdf-lib StandardFonts (Helvetica). */
  type: { title: number; subtitle: number; body: number; caption: number };
};

export function mapFrameAspect(template: PdfTemplate): number {
  return template.mapFrame.width / template.mapFrame.height;
}

/** Every visually exclusive block, for layout-invariant tests and mocks. */
export function templateBlocks(
  template: PdfTemplate,
): Array<{ name: string; rect: PdfRect }> {
  const { northArrow, qr, scaleBar } = template;
  return [
    { name: "mapFrame", rect: template.mapFrame },
    { name: "titleBlock", rect: template.titleBlock },
    { name: "legendBox", rect: template.legendBox },
    { name: "attributionStrip", rect: template.attributionStrip },
    {
      name: "scaleBar",
      rect: { x: scaleBar.x, y: scaleBar.y - 4, width: scaleBar.maxWidth, height: 26 },
    },
    {
      name: "northArrow",
      rect: { x: northArrow.x, y: northArrow.y, width: northArrow.size, height: northArrow.size },
    },
    { name: "qr", rect: { x: qr.x, y: qr.y, width: qr.size, height: qr.size } },
  ];
}

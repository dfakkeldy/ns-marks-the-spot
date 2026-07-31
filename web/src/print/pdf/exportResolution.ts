import { POINTS_PER_INCH, type PdfRect } from "./templates/types";

export const MAX_CANVAS_DIMENSION_PX = 4096;

export type ExportResolution = {
  dpi: number;
  widthPx: number;
  heightPx: number;
  reduced: boolean;
};

/**
 * iOS Safari enforces aggressive per-canvas memory ceilings (documented in
 * the GeoPDF import work), and Chrome's `deviceMemory` flags low-RAM
 * hardware. Both start the DPI ladder one rung down.
 */
export function isConstrainedDevice(nav: Navigator = navigator): boolean {
  const memory = (nav as { deviceMemory?: number }).deviceMemory;
  return /iPhone|iPad|iPod/u.test(nav.userAgent) ||
    (typeof memory === "number" && memory <= 4);
}

export function resolveExportResolution(
  mapFrame: PdfRect,
  options: { constrainedDevice: boolean },
): ExportResolution {
  const ladder = options.constrainedDevice ? [200, 150] : [300, 200, 150];
  for (const dpi of ladder) {
    const widthPx = Math.round((mapFrame.width / POINTS_PER_INCH) * dpi);
    const heightPx = Math.round((mapFrame.height / POINTS_PER_INCH) * dpi);
    if (Math.max(widthPx, heightPx) <= MAX_CANVAS_DIMENSION_PX) {
      return { dpi, widthPx, heightPx, reduced: dpi < 300 };
    }
  }
  const dpi = ladder[ladder.length - 1];
  const scale =
    MAX_CANVAS_DIMENSION_PX / Math.max(mapFrame.width, mapFrame.height);
  return {
    dpi,
    widthPx: Math.round(mapFrame.width * scale),
    heightPx: Math.round(mapFrame.height * scale),
    reduced: true,
  };
}

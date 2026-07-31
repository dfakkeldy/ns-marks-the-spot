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
 *
 * Since iPadOS 13, Safari's default user agent reports as desktop
 * "Macintosh" with no "iPad" token, so the UA substring check alone misses
 * real iPads — exactly the device this function exists to protect.
 * `navigator.deviceMemory` doesn't help either: it's a Chromium-only API
 * and is `undefined` on Safari. The standard idiom for detecting this case
 * is a Mac-labeled UA that also reports multi-touch support: a real Mac
 * with a trackpad/mouse reports `maxTouchPoints <= 1`, while an iPad's
 * touchscreen reports a higher value. Do not simplify this touch check
 * away — it is load-bearing for modern iPadOS Safari, not redundant with
 * the iPhone/iPad/iPod substring check above it.
 */
export function isConstrainedDevice(nav: Navigator = navigator): boolean {
  const memory = (nav as { deviceMemory?: number }).deviceMemory;
  const touchPoints = (nav as { maxTouchPoints?: number }).maxTouchPoints;
  const looksLikeIpadOsSafari =
    /Macintosh/u.test(nav.userAgent) &&
    typeof touchPoints === "number" &&
    touchPoints > 1;
  return /iPhone|iPad|iPod/u.test(nav.userAgent) ||
    looksLikeIpadOsSafari ||
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
  // Even the lowest ladder rung would overflow the canvas cap: scale down
  // to fit and report the DPI that actually describes the returned
  // pixels, not the last rung we fell off of — the export dialog and any
  // downstream metadata show this value to the user.
  const scale =
    MAX_CANVAS_DIMENSION_PX / Math.max(mapFrame.width, mapFrame.height);
  const widthPx = Math.round(mapFrame.width * scale);
  const heightPx = Math.round(mapFrame.height * scale);
  const dpi = Math.round(widthPx / (mapFrame.width / POINTS_PER_INCH));
  return { dpi, widthPx, heightPx, reduced: true };
}

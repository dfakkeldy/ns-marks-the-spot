import type { ContextMarker } from "../layers/contextLayerTypes";

/**
 * Point symbols for context layers that say what a place is, not just where:
 * a turbine is drawn as a turbine, a tank farm as a tank. The map's divIcons
 * and the on-map legends both draw from here, so a key always matches its map.
 * Every string is built from constants and a validated colour, never from
 * source data, so it is safe to use as markup.
 */

const HEX = /^#[0-9a-f]{6}$/i;

/** One blade pointing up from the hub at (12, 10); the other two are rotations. */
const BLADE = "M12 10 C14.1 7.3 13.9 3.2 12 0.9 C10.1 3.2 9.9 7.3 12 10 Z";
const TOWER = "M11.1 10.5 H12.9 L13.8 27 H10.2 Z";

function turbine(color: string, hollow: boolean, size: number): string {
  const width = Math.round(size * 24 / 28);
  const fill = hollow ? "#ffffff" : color;
  const stroke = hollow ? color : "#ffffff";
  // The halo is a wide white stroke under the shape, so the glyph reads on
  // light and dark backgrounds and over aerial imagery alike.
  const shapes = `<path d="${TOWER}"/>${[0, 120, 240].map((angle) => `<path d="${BLADE}" transform="rotate(${angle} 12 10)"/>`).join("")}<circle cx="12" cy="10" r="1.7"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28" width="${width}" height="${size}" aria-hidden="true" focusable="false">`
    + `<g fill="#ffffff" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round" opacity="0.92">${shapes}</g>`
    + `<g fill="${fill}" stroke="${stroke}" stroke-width="${hollow ? 1.5 : 0.6}" stroke-linejoin="round">${shapes}</g>`
    + "</svg>";
}

const GLYPHS = {
  // A storage tank: a squat cylinder with its roof seam.
  tank: '<path d="M7 9.5 C7 8.1 17 8.1 17 9.5 V15.5 C17 16.9 7 16.9 7 15.5 Z" fill="#ffffff"/><path d="M7 9.5 C7 10.9 17 10.9 17 9.5" fill="none" stroke="currentColor" stroke-width="1.1"/>',
  bolt: '<path d="M13.2 5.5 L8.4 13 H11.6 L10.6 18.5 L15.6 10.6 H12.3 Z" fill="#ffffff"/>',
  drop: '<path d="M12 5.6 C14.6 9 16.2 11.3 16.2 13.6 A4.2 4.2 0 0 1 7.8 13.6 C7.8 11.3 9.4 9 12 5.6 Z" fill="#ffffff"/>',
  dot: "",
} as const;

function pin(glyph: keyof typeof GLYPHS, color: string, size: number): string {
  const radius = glyph === "dot" ? 6 : 10.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" style="color:${color}">`
    + `<circle cx="12" cy="12" r="${radius}" fill="${color}" stroke="#ffffff" stroke-width="2.2"/>`
    + GLYPHS[glyph]
    + "</svg>";
}

/** The marker's pixel size: turbines are taller than they are wide. */
export function contextMarkerSize(marker: ContextMarker): { width: number; height: number } {
  const size = marker.size ?? (marker.glyph === "turbine" ? 34 : marker.glyph === "dot" ? 16 : 26);
  return marker.glyph === "turbine" ? { width: Math.round(size * 24 / 28), height: size } : { width: size, height: size };
}

/** Smaller at overview zooms, so a province of wind farms reads as dots of colour, not a thicket. */
export function contextMarkerAtZoom(marker: ContextMarker, zoom: number): ContextMarker {
  const scale = zoom < 9 ? 0.45 : zoom < 11 ? 0.55 : zoom < 13 ? 0.75 : 1;
  return scale === 1 ? marker : { ...marker, size: Math.round(contextMarkerSize(marker).height * scale) };
}

/** Where the marker meets its coordinate: a turbine stands on it, a pin centres on it. */
export function contextMarkerAnchor(marker: ContextMarker): [number, number] {
  const { width, height } = contextMarkerSize(marker);
  return marker.glyph === "turbine" ? [Math.round(width / 2), Math.round(height * 27 / 28)] : [Math.round(width / 2), Math.round(height / 2)];
}

export function contextMarkerSvg(marker: ContextMarker, color: string): string {
  if (!HEX.test(color)) throw new Error(`Marker colour must be #rrggbb: ${color}`);
  const { height } = contextMarkerSize(marker);
  return marker.glyph === "turbine" ? turbine(color, marker.hollow === true, height) : pin(marker.glyph, color, height);
}

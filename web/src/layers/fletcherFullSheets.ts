import { normalizeFletcherTileBaseUrl } from './fletcherLayer';

export const FLETCHER_FULL_SHEETS_REVISION = 'fletcher-seams-20261009.2';
export const FLETCHER_FULL_SHEETS_BOUNDS: [[number, number], [number, number]] = [
  [45.37688026971942, -61.615265674701156],
  [47.13031012425374, -60.0696243968451],
];

/** A separate opt-in preview. Never substitutes for the published 24 sheets. */
export function fletcherFullSheetsRoot(
  value = import.meta.env.VITE_FLETCHER_FULL_SHEETS_TILE_BASE_URL ?? '',
): string | null {
  const base = normalizeFletcherTileBaseUrl(value);
  return base ? `${base}/${FLETCHER_FULL_SHEETS_REVISION}` : null;
}

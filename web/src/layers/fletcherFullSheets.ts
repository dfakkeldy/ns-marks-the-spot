import { normalizeFletcherTileBaseUrl } from './fletcherLayer';

export const FLETCHER_FULL_SHEETS_REVISION = 'fletcher-full-sheets-20260909.2';
export const FLETCHER_FULL_SHEETS_BOUNDS: [[number, number], [number, number]] = [
  [45.5706467, -61.6149513],
  [46.2701678, -61.219468],
];

/** A separate opt-in preview. Never substitutes for the published 24 sheets. */
export function fletcherFullSheetsRoot(
  value = import.meta.env.VITE_FLETCHER_FULL_SHEETS_TILE_BASE_URL ?? '',
): string | null {
  const base = normalizeFletcherTileBaseUrl(value);
  return base ? `${base}/${FLETCHER_FULL_SHEETS_REVISION}` : null;
}

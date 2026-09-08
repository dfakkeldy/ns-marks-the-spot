import { normalizeFletcherTileBaseUrl } from './fletcherLayer';

export const FLETCHER_CORRIDOR_REVISION = 'fletcher-corridor-20260908.1';
export const FLETCHER_CORRIDOR_BOUNDS: [[number, number], [number, number]] = [
  [45.618575827834, -61.532171510920094],
  [46.08000898826857, -61.35205929645413],
];

/** A separate opt-in preview. Never substitutes for the published 24 sheets. */
export function fletcherCorridorRoot(
  value = import.meta.env.VITE_FLETCHER_CORRIDOR_TILE_BASE_URL ?? '',
): string | null {
  const base = normalizeFletcherTileBaseUrl(value);
  return base ? `${base}/${FLETCHER_CORRIDOR_REVISION}` : null;
}

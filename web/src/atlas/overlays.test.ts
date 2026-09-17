import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { buildReviewStyle } from './overlays';
import { fletcherTileRegions, FLETCHER_TILE_REVISION } from '../layers/fletcherLayer';

describe('atlas review evidence boundary', () => {
  it('does not create a Province source before licence acceptance', () => {
    const style = buildReviewStyle('day', { parcels: true, provinceAccepted: false, historical: false, opacity: 0.5 }, null);
    expect(style.sources).not.toHaveProperty('parcels');
  });
  it('does not invent a historical tile host', () => {
    const style = buildReviewStyle('night', { parcels: false, provinceAccepted: false, historical: true, opacity: 0.5 }, null);
    expect(Object.keys(style.sources).some(id => id.startsWith('fletcher-'))).toBe(false);
  });
  it.each(['day', 'night', 'osm'] as const)('validates %s with the actual overlay source contracts', (mode) => {
    const style = buildReviewStyle(mode, { parcels: true, provinceAccepted: true, historical: true, opacity: 0.5 }, 'https://tiles.example.org');
    expect(validateStyleMin(style)).toEqual([]);
    expect(style.sources).toHaveProperty('parcels');
    expect(style.layers.find(layer => layer.id === 'parcels')?.minzoom).toBe(14);
    const [[south, west], [north, east]] = fletcherTileRegions[0].bounds;
    expect(Object.keys(style.sources).filter(id => id.startsWith('fletcher-'))).toEqual(['fletcher-mosaic']);
    expect(style.sources['fletcher-mosaic']).toMatchObject({ bounds: [west, south, east, north], maxzoom: 15,
      tiles: [`https://tiles.example.org/${FLETCHER_TILE_REVISION}/{z}/{x}/{y}.png`] });
  });
});

import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { buildReviewStyle } from './overlays';

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
    expect(style.sources['fletcher-13']).toMatchObject({ bounds: [-61.2213134765625, 46.09989991062731, -60.8477783203125, 46.27483447871402] });
  });
});

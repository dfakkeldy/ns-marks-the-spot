import { describe, expect, it } from 'vitest';
import { createExpression, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { buildAtlasStyle } from './style';

// A valid style is essential: an invalid expression can blank the whole map.
describe('atlas cartography', () => {
  it.each(['day', 'night'] as const)('renders a schema-valid %s style', (mode) => {
    expect(validateStyleMin(buildAtlasStyle(mode))).toEqual([]);
  });
  it('does not draw an unclassified boundary as an administrative boundary', () => {
    const layer = buildAtlasStyle('day').layers.find(layer => layer.id === 'boundaries')!;
    const expression = createExpression('filter' in layer ? layer.filter : null, 'filter');
    expect(expression.result).toBe('success');
    if (expression.result === 'success') {
      expect(expression.value.evaluate({ zoom: 12 }, { type: 2, properties: {} })).toBe(false);
      expect(expression.value.evaluate({ zoom: 12 }, { type: 2, properties: { admin_level: 6 } })).toBe(true);
    }
  });
});

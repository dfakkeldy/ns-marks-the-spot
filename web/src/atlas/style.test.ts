import { describe, expect, it } from 'vitest';
import { createExpression, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { buildAtlasStyle } from './style';

// A valid style is essential: an invalid expression can blank the whole map.
describe('atlas cartography', () => {
  it.each(['day', 'night'] as const)('renders a schema-valid %s style', (mode) => {
    expect(validateStyleMin(buildAtlasStyle(mode))).toEqual([]);
  });
  it('uses provincial road names and does not draw competing OSM road labels', () => {
    const style = buildAtlasStyle('day');
    const labels = style.layers.find(layer => layer.id === 'road-names')!;
    expect('source' in labels && labels.source).toBe('province');
    expect(style.layers.filter(layer => 'source-layer' in layer && layer['source-layer'] === 'transportation_name')).toEqual([]);
  });
  it('does not draw an unknown or abandoned road as an ordinary road', () => {
    const layer = buildAtlasStyle('day').layers.find(layer => layer.id === 'surface-roads')!;
    const expression = createExpression('filter' in layer ? layer.filter : null, 'filter');
    expect(expression.result).toBe('success');
    if (expression.result === 'success') {
      expect(expression.value.evaluate({ zoom: 12 }, { type: 2, properties: {} })).toBe(false);
      expect(expression.value.evaluate({ zoom: 12 }, { type: 2, properties: { roadc_desc: 'Local', feat_desc: 'ROAD - Local - 1 Lane - Unpaved' } })).toBe(true);
      expect(expression.value.evaluate({ zoom: 12 }, { type: 2, properties: { roadc_desc: 'Local', feat_desc: 'ROAD - Abandoned - Local - 1 Lane - Unpaved' } })).toBe(false);
      for (const feat_desc of ['WALK - Urban Addressed Feature - No Vehicular Traffic', 'ROAD - Local - Status Unknown', 'TUNNEL - Local']) {
        expect(expression.value.evaluate({ zoom: 12 }, { type: 2, properties: { roadc_desc: 'Local', feat_desc } })).toBe(false);
      }
    }
  });
  it('labels a named private road but not a generic Track placeholder', () => {
    const layer = buildAtlasStyle('day').layers.find(layer => layer.id === 'road-names')!;
    const expression = createExpression('filter' in layer ? layer.filter : null, 'filter');
    expect(expression.result).toBe('success');
    if (expression.result === 'success') {
      const evaluate = (street: string) => expression.value.evaluate({ zoom: 13 },
        { type: 2, properties: { street, roadc_desc: 'Private Use', feat_desc: 'ROAD - Local - 1 Lane - Unpaved' } });
      expect(evaluate('Track')).toBe(false);
      expect(evaluate('Chisholm-MacLean Rd')).toBe(true);
    }
  });
});

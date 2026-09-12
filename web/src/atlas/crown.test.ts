import { describe, expect, it } from 'vitest';
import { crownReceipt, crownTileUrl, crownReceiptUrl } from './crown';
import { basemapSource } from './basemap';
import { buildAtlasStyle } from './style';
import { atlasPalettes } from './palette';

describe('dissolved Crown Land atlas', () => {
  it('resolves the pinned archive beneath the app subpath without location query data', () => {
    const base = 'https://example.org/apps/map/index.html?position=45,-61,14';
    expect(crownTileUrl(base)).toBe(`pmtiles://https://example.org/apps/map/atlas/crown/${crownReceipt.archive}`);
    expect(crownReceiptUrl(base)).toBe('https://example.org/apps/map/atlas/crown/source.json');
  });

  it.each(['day', 'night', 'fletcher'] as const)('draws the %s union below water, roads and labels with a separate outline', mode => {
    const style = buildAtlasStyle(mode);
    const fill = style.layers.find(layer => layer.id === 'crown-land');
    expect(fill).toMatchObject({ type: 'fill', source: 'crown', 'source-layer': 'crown',
      paint: { 'fill-color': atlasPalettes[mode].crown, 'fill-antialias': false } });
    expect(style.layers.find(layer => layer.id === 'crown-land-boundary')).toMatchObject({
      type: 'line', source: 'crown', 'source-layer': 'crown_outline',
    });
    const ids = style.layers.map(layer => layer.id);
    expect(ids.indexOf('woodland')).toBeLessThan(ids.indexOf('crown-land'));
    for (const id of ['water', 'surface-roads', 'town-names']) {
      expect(ids.indexOf('crown-land-boundary')).toBeLessThan(ids.indexOf(id));
    }
    expect(style.layers.filter(layer => layer.type === 'line' && 'source-layer' in layer && layer['source-layer'] === 'crown')).toEqual([]);
    const provenance = basemapSource(mode).attribution;
    expect(provenance).toContain('3nka-59nz');
    expect(provenance).toContain(crownReceipt.archive);
    expect(provenance).toContain(crownReceipt.source.released.slice(0, 10));
    expect(provenance).toContain('full or partial');
  });

  it('keeps Fletcher mustard distinct from farmland and woodland, and leaves OSM separate', () => {
    expect(atlasPalettes.fletcher.crown).not.toBe(atlasPalettes.fletcher.farmland);
    expect(atlasPalettes.fletcher.crown).not.toBe(atlasPalettes.fletcher.wood);
    expect(basemapSource('osm').attribution).not.toContain('Crown Land');
  });
});

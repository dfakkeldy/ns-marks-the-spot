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

  it.each(['day', 'night', 'fletcher'] as const)('draws the %s union as an unoutlined fill below water, roads and labels', mode => {
    const style = buildAtlasStyle(mode);
    const fill = style.layers.find(layer => layer.id === 'crown-land');
    expect(fill).toMatchObject({ type: 'fill', source: 'crown', 'source-layer': 'crown',
      paint: { 'fill-color': atlasPalettes[mode].crown, 'fill-antialias': false } });
    expect(style.layers.filter(layer => layer.type === 'line' && 'source' in layer && layer.source === 'crown')).toEqual([]);
    expect(fill && 'paint' in fill && fill.paint).not.toHaveProperty('fill-outline-color');
    const ids = style.layers.map(layer => layer.id);
    expect(ids.indexOf('woodland')).toBeLessThan(ids.indexOf('crown-land'));
    for (const id of ['water', 'surface-roads', 'town-names']) {
      expect(ids.indexOf('crown-land')).toBeLessThan(ids.indexOf(id));
    }
    expect(style.layers.filter(layer => layer.type === 'line' && 'source-layer' in layer && layer['source-layer'] === 'crown')).toEqual([]);
    const provenance = basemapSource(mode).attribution;
    expect(provenance).toContain('3nka-59nz');
    expect(provenance).toContain(crownReceipt.archive);
    expect(provenance).toContain(crownReceipt.source.released.slice(0, 10));
    expect(provenance).toContain('full or partial');
  });

  it('hatches Fletcher Crown Land with a seamless pattern over the unchanged wash, and only in Fletcher', () => {
    const style = buildAtlasStyle('fletcher');
    const ids = style.layers.map(layer => layer.id);
    expect(ids.indexOf('crown-land-hatch')).toBe(ids.indexOf('crown-land') + 1);
    expect(style.layers.find(layer => layer.id === 'crown-land-hatch')).toMatchObject({ type: 'fill', source: 'crown', 'source-layer': 'crown',
      paint: { 'fill-pattern': 'crown-hatch', 'fill-opacity': 0.35 } });
    for (const mode of ['day', 'night', 'handdrawn'] as const) {
      expect(buildAtlasStyle(mode).layers.map(layer => layer.id)).not.toContain('crown-land-hatch');
    }
  });

  it('keeps Fletcher mustard distinct from farmland and woodland, and leaves OSM separate', () => {
    expect(atlasPalettes.fletcher.crown).not.toBe(atlasPalettes.fletcher.farmland);
    expect(atlasPalettes.fletcher.crown).not.toBe(atlasPalettes.fletcher.wood);
    expect(basemapSource('osm').attribution).not.toContain('Crown Land');
  });
});

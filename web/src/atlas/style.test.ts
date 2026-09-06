import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExpression, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { atlasGlyphUrl, atlasSpriteUrl, buildAtlasStyle } from './style';

// Vitest runs from web/; the generated glyphs and sprite ship from public/.
const publicDir = `${resolve(process.cwd(), 'public')}/`;
/** Advance of one glyph in a generated range (glyphs > fontstack > glyph, field 7). */
function advance(stack: string, character: string) {
  const bytes = readFileSync(`${publicDir}atlas/fonts/${stack}/0-255.pbf`);
  let index = 0;
  const varint = () => { let value = 0, shift = 0; for (;;) { const byte = bytes[index++]; value += (byte & 127) * 2 ** shift; shift += 7; if (byte < 128) return value; } };
  const glyphs = new Map<number, number>();
  const message = (end: number, onGlyph: boolean) => {
    let id = -1, found = -1;
    while (index < end) {
      const tag = varint(), field = tag >>> 3;
      if ((tag & 7) === 2) { const length = varint(); if (!onGlyph && field === 3) message(index + length, true); else index += length; }
      else { const value = varint(); if (onGlyph && field === 1) id = value; else if (onGlyph && field === 7) found = value; }
    }
    if (onGlyph) glyphs.set(id, found);
  };
  varint(); message(index + varint(), false);
  return glyphs.get(character.codePointAt(0)!);
}
const evaluate = (layerId: string, properties: Record<string, unknown>, zoom = 13, mode: 'day' | 'fletcher' = 'day') => {
  const layer = buildAtlasStyle(mode).layers.find(layer => layer.id === layerId)!;
  const expression = createExpression('filter' in layer ? layer.filter : null, 'filter');
  expect(expression.result).toBe('success');
  return expression.result === 'success' ? expression.value.evaluate({ zoom }, { type: 2, properties }) : undefined;
};

// A valid style is essential: an invalid expression can blank the whole map.
describe('atlas cartography', () => {
  it.each(['day', 'night', 'fletcher'] as const)('renders a schema-valid %s style', (mode) => {
    expect(validateStyleMin(buildAtlasStyle(mode))).toEqual([]);
  });
  it('uses provincial road names and does not draw competing OSM road labels', () => {
    const style = buildAtlasStyle('day');
    const labels = style.layers.find(layer => layer.id === 'road-names')!;
    expect('source' in labels && labels.source).toBe('province');
    expect(style.layers.filter(layer => 'source-layer' in layer && layer['source-layer'] === 'transportation_name')).toEqual([]);
  });
  it('does not draw an unknown or abandoned road as an ordinary road', () => {
    expect(evaluate('surface-roads', {}, 12)).toBe(false);
    expect(evaluate('surface-roads', { roadc_desc: 'Local', feat_desc: 'ROAD - Local - 1 Lane - Unpaved' }, 12)).toBe(true);
    expect(evaluate('surface-roads', { roadc_desc: 'Local', feat_desc: 'ROAD - Abandoned - Local - 1 Lane - Unpaved' }, 12)).toBe(false);
    for (const feat_desc of ['WALK - Urban Addressed Feature - No Vehicular Traffic', 'ROAD - Local - Status Unknown', 'TUNNEL - Local']) {
      expect(evaluate('surface-roads', { roadc_desc: 'Local', feat_desc }, 12)).toBe(false);
    }
  });
  it('keeps abandoned routes, tracks and ordinary roads as separate treatments', () => {
    const abandoned = { roadc_desc: 'Local', feat_desc: 'ROAD - Abandoned - Local - 1 Lane - Unpaved' };
    const track = { roadc_desc: 'Track', feat_desc: 'TRACK' };
    expect(evaluate('abandoned-routes', abandoned)).toBe(true);
    expect(evaluate('tracks-and-paths', abandoned)).toBe(false);
    expect(evaluate('tracks-and-paths', track)).toBe(true);
    expect(evaluate('abandoned-routes', track)).toBe(false);
    expect(evaluate('surface-roads', track)).toBe(false);
  });
  it('labels a named private road but not a generic Track placeholder', () => {
    const named = (street: string) => evaluate('road-names', { street, roadc_desc: 'Private Use', feat_desc: 'ROAD - Local - 1 Lane - Unpaved' });
    expect(named('Track')).toBe(false);
    expect(named('Chisholm-MacLean Rd')).toBe(true);
  });
  it('draws Fletcher shore treatments from NSTDB shoreline lines on the water side, never from water polygon edges', () => {
    const style = buildAtlasStyle('fletcher');
    expect(style.layers.filter(layer => layer.type === 'line' && 'source-layer' in layer && layer['source-layer'] === 'water')).toEqual([]);
    for (const id of ['shore-band', 'shore-stipple', 'shoreline', 'shoreline-inked']) {
      const layer = style.layers.find(layer => layer.id === id)!;
      expect('source-layer' in layer && layer['source-layer']).toBe('waterways');
      expect(layer.minzoom).toBeGreaterThanOrEqual(11);
      expect(evaluate(id, { feat_desc: 'Coast - Water to the right line' }, 13, 'fletcher')).toBe(true);
      expect(evaluate(id, { feat_desc: 'Lake - Water to the right line' }, 13, 'fletcher')).toBe(true);
      expect(evaluate(id, { feat_desc: 'River - Single Line' }, 13, 'fletcher')).toBe(false);
      expect(evaluate(id, { feat_desc: 'Wharf - Single Line' }, 13, 'fletcher')).toBe(false);
    }
    const band = style.layers.find(layer => layer.id === 'shore-band') as { paint: { 'line-offset': unknown } };
    const offset = createExpression(band.paint['line-offset'] as never, 'layers[0].paint.line-offset');
    expect(offset.result).toBe('success');
    if (offset.result === 'success') {
      const at = (feat_desc: string) => offset.value.evaluate({ zoom: 13 }, { type: 2, properties: { feat_desc } }) as number;
      expect(at('Coast - Water to the right line')).toBeGreaterThan(0);
      expect(at('Double Line River - Water to the left line')).toBeLessThan(0);
    }
  });
  it('lets main-route names outrank village names but keeps towns first', () => {
    const ids = buildAtlasStyle('day').layers.map(layer => layer.id);
    // MapLibre places later symbol layers first, so array order is collision priority.
    expect(ids.indexOf('road-names')).toBeLessThan(ids.indexOf('village-names'));
    expect(ids.indexOf('village-names')).toBeLessThan(ids.indexOf('major-road-names'));
    expect(ids.indexOf('major-road-names')).toBeLessThan(ids.indexOf('town-names'));
    expect(evaluate('major-road-names', { street: 'Highway 19', roadc_desc: 'Arterial', feat_desc: 'ROAD - Arterial' })).toBe(true);
    expect(evaluate('road-names', { street: 'Highway 19', roadc_desc: 'Arterial', feat_desc: 'ROAD - Arterial' })).toBe(false);
    expect(evaluate('road-names', { street: 'Keltic Dr', roadc_desc: 'Local', feat_desc: 'ROAD - Local' })).toBe(true);
  });
});

describe('fletcher-inspired texture and lettering', () => {
  it('resolves glyph and sprite URLs beneath the app directory, keeping the range template intact', () => {
    expect(atlasGlyphUrl('https://example.org/map/index.html')).toBe('https://example.org/map/atlas/fonts/{fontstack}/{range}.pbf');
    expect(atlasSpriteUrl('https://example.org/map/index.html')).toBe('https://example.org/map/atlas/sprite/sprite');
  });
  it.each(['day', 'night', 'fletcher'] as const)('ships every glyph range and sprite image the %s style names', (mode) => {
    const style = buildAtlasStyle(mode);
    const receipt = JSON.parse(readFileSync(`${publicDir}atlas/fonts/source.json`, 'utf8')) as { fonts: { stack: string }[] };
    const stacks = new Set<string>();
    const images = new Set<string>();
    for (const layer of style.layers) {
      const layout = 'layout' in layer ? layer.layout as Record<string, unknown> : {};
      const paint = 'paint' in layer ? layer.paint as Record<string, unknown> : {};
      for (const font of (layout['text-font'] as string[] | undefined) ?? []) stacks.add(font);
      for (const key of ['fill-pattern', 'line-pattern', 'background-pattern']) if (typeof paint[key] === 'string') images.add(paint[key] as string);
    }
    expect(stacks.size).toBeGreaterThan(0);
    for (const stack of stacks) {
      expect(receipt.fonts.map(font => font.stack)).toContain(stack);
      const ranges = readdirSync(`${publicDir}atlas/fonts/${stack}`).filter(name => name.endsWith('.pbf'));
      expect(ranges).toHaveLength(256); // a missing range would fail the whole tile's labels
    }
    const sprite = JSON.parse(readFileSync(`${publicDir}atlas/sprite/sprite.json`, 'utf8')) as Record<string, unknown>;
    const retina = JSON.parse(readFileSync(`${publicDir}atlas/sprite/sprite@2x.json`, 'utf8')) as Record<string, unknown>;
    for (const image of images) { expect(sprite).toHaveProperty(image); expect(retina).toHaveProperty(image); }
    expect(existsSync(`${publicDir}atlas/sprite/sprite.png`)).toBe(true);
  });
  it('uses paper grain as the only Fletcher area texture and draws it beneath every label', () => {
    const style = buildAtlasStyle('fletcher');
    const textured = style.layers.filter(layer => layer.type === 'fill' && 'paint' in layer && layer.paint && 'fill-pattern' in layer.paint);
    expect(textured.map(layer => layer.id)).toEqual(['paper-grain']);
    const ids = style.layers.map(layer => layer.id);
    const grain = ids.indexOf('paper-grain');
    const firstSymbol = style.layers.findIndex(layer => layer.type === 'symbol');
    const lastLine = ids.lastIndexOf('ferries');
    expect(grain).toBeGreaterThan(lastLine);
    expect(grain).toBeLessThan(firstSymbol);
  });
  it('ships the faces it claims: serif metrics differ from the sans and the italic from the roman', () => {
    // Advances at 24 px from the pinned fonts' own hmtx tables; a fallback face would not match.
    expect(advance('Atlas Serif Regular', 'H')).toBe(22);
    expect(advance('Atlas Serif Italic', 'J')).toBe(13);
    expect(advance('Atlas Serif Regular', 'J')).toBe(9);
    expect(advance('Atlas Sans Regular', 'H')).toBe(18);
    expect(advance('Atlas Sans Regular', 'm')).toBe(22);
    expect(advance('Atlas Sans Bold', 'm')).toBe(23);
  });
  it('sets Fletcher names in the serif and road names in the utility sans', () => {
    const style = buildAtlasStyle('fletcher');
    const font = (id: string) => (style.layers.find(layer => layer.id === id) as { layout: { 'text-font': string[] } }).layout['text-font'];
    expect(font('town-names')).toEqual(['Atlas Serif Regular']);
    expect(font('water-names')).toEqual(['Atlas Serif Italic']);
    expect(font('road-names')).toEqual(['Atlas Sans Regular']);
  });
  it.each(['day', 'night'] as const)('keeps the modern %s style clean: sans lettering, no textures, no engraved shore', (mode) => {
    const style = buildAtlasStyle(mode);
    const font = (id: string) => (style.layers.find(layer => layer.id === id) as { layout: { 'text-font': string[] } }).layout['text-font'];
    expect(font('town-names')).toEqual(['Atlas Sans Bold']);
    expect(font('village-names')).toEqual(['Atlas Sans Regular']);
    expect(font('water-names')).toEqual(['Atlas Sans Regular']);
    const patterned = style.layers.filter(layer => 'paint' in layer && layer.paint && ('fill-pattern' in layer.paint || 'line-pattern' in layer.paint));
    expect(patterned).toEqual([]);
    for (const id of ['shore-band', 'shore-stipple', 'shoreline', 'shoreline-inked', 'surface-road-edge-inked', 'paper-grain']) {
      expect(style.layers.find(layer => layer.id === id)).toBeUndefined();
    }
    expect(style.layers.find(layer => layer.id === 'surface-road-edge')?.maxzoom).toBeUndefined();
  });
});

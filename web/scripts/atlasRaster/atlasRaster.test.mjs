import { describe, expect, test } from 'vitest';
import { Coverage, decodeRuns, encodeRuns } from './coverage.mjs';
import { rewriteStyleForRender, styleSha256 } from './atlasStyle.mjs';
import {
  bboxToTileRange, lonLatToTile, metatileIntersectsRange, metatileOrigin, metatileView, parseBbox, parseZoomRange,
  sliceRect, tileBounds, tileContaining, tileToLonLat,
} from './tileMath.mjs';

describe('tile maths', () => {
  test('the world is one tile at zoom 0 and the origin sits at the centre of zoom 1', () => {
    expect(lonLatToTile(-180, 85.0511287798066, 0)).toEqual({ x: 0, y: expect.closeTo(0, 9) });
    expect(lonLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1 });
    expect(tileToLonLat(1, 1, 1)).toEqual([0, expect.closeTo(0, 9)]);
  });

  test('tile coordinates round-trip through longitude and latitude', () => {
    const { x, y } = lonLatToTile(-61.5, 45.87, 13);
    const [lon, lat] = tileToLonLat(x, y, 13);
    expect(lon).toBeCloseTo(-61.5, 9);
    expect(lat).toBeCloseTo(45.87, 9);
  });

  test('Judique lies in the expected zoom-13 tile and its bounds contain the point', () => {
    const tile = tileContaining(-61.5, 45.87, 13);
    expect(tile).toEqual({ x: 2696, y: 2918 });
    const bounds = tileBounds(13, tile.x, tile.y);
    expect(bounds.west).toBeLessThan(-61.5);
    expect(bounds.east).toBeGreaterThan(-61.5);
    expect(bounds.south).toBeLessThan(45.87);
    expect(bounds.north).toBeGreaterThan(45.87);
  });

  test('a bbox that ends exactly on a tile edge does not include the tile beyond it', () => {
    const west = tileToLonLat(10, 0, 5)[0];
    const east = tileToLonLat(12, 0, 5)[0];
    const north = tileToLonLat(0, 11, 5)[1];
    const south = tileToLonLat(0, 13, 5)[1];
    expect(bboxToTileRange({ west, south, east, north }, 5)).toEqual({ xMin: 10, xMax: 11, yMin: 11, yMax: 12 });
    expect(bboxToTileRange({ west: -179.9, south: -80, east: 179.9, north: 80 }, 0)).toEqual({ xMin: 0, xMax: 0, yMin: 0, yMax: 0 });
  });

  test('metatiles align to multiples of four and intersect ranges inclusively', () => {
    expect(metatileOrigin(2697, 2919)).toEqual({ mx: 2696, my: 2916 });
    expect(metatileOrigin(2695, 2915)).toEqual({ mx: 2692, my: 2912 });
    const range = { xMin: 2697, xMax: 2699, yMin: 2919, yMax: 2919 };
    expect(metatileIntersectsRange(2696, 2916, range)).toBe(true);
    expect(metatileIntersectsRange(2692, 2916, range)).toBe(false);
    expect(metatileIntersectsRange(2696, 2920, range)).toBe(false);
  });

  test('a metatile view is 2560 CSS px with the block starting 256 px in, centred on the block', () => {
    const view = metatileView(13, 2696, 2916);
    expect(view.sizeCss).toBe(2560);
    expect(view.offsetCss).toBe(256);
    expect(view.center).toEqual(tileToLonLat(2698, 2918, 13));
    expect(view.nw).toEqual(tileToLonLat(2696, 2916, 13));
    expect(view.se).toEqual(tileToLonLat(2700, 2920, 13));
    expect(sliceRect(view, 2696, 2916)).toEqual({ sx: 512, sy: 512, size: 1024 });
    expect(sliceRect(view, 2699, 2919)).toEqual({ sx: 512 + 3 * 1024, sy: 512 + 3 * 1024, size: 1024 });
  });

  test('zoom ranges and bounding boxes are parsed strictly', () => {
    expect(parseZoomRange('9-13')).toEqual([9, 13]);
    expect(parseZoomRange('12')).toEqual([12, 12]);
    expect(() => parseZoomRange('13-9')).toThrow(/backwards/);
    expect(() => parseZoomRange('all')).toThrow(/Zoom range/);
    expect(parseBbox('-61.75,45.70,-61.25,46.10')).toEqual({ west: -61.75, south: 45.7, east: -61.25, north: 46.1 });
    expect(() => parseBbox('-61,46,-62,47')).toThrow(/valid/);
    expect(() => parseBbox('1,2,3')).toThrow(/west,south,east,north/);
  });
});

describe('coverage', () => {
  test('runs encode sorted, deduplicated integers and decode back', () => {
    expect(encodeRuns([8, 7, 1, 2, 3, 3, 10])).toEqual([[1, 3], [7, 8], [10, 10]]);
    expect(encodeRuns([])).toEqual([]);
    expect(decodeRuns([[1, 3], [7, 8]])).toEqual([1, 2, 3, 7, 8]);
    expect(() => decodeRuns([[3, 1]])).toThrow(/inclusive/);
  });

  test('coverage records exact addresses and round-trips through coverage.json rows', () => {
    const coverage = Coverage.fromTiles([[5, 10, 11], [13, 2697, 2953], [13, 2696, 2953], [13, 2699, 2953], [13, 2696, 2954]]);
    expect(coverage.has(13, 2697, 2953)).toBe(true);
    expect(coverage.has(13, 2698, 2953)).toBe(false);
    expect(coverage.has(12, 1348, 1476)).toBe(false);
    expect(coverage.counts()).toEqual({ 5: 1, 13: 4 });
    expect(coverage.total()).toBe(5);
    expect(coverage.zoomRange()).toEqual([5, 13]);
    const rows = coverage.toRows();
    expect(rows).toEqual({ zoomRange: [5, 13], rows: {
      5: { 11: [[10, 10]] },
      13: { 2953: [[2696, 2697], [2699, 2699]], 2954: [[2696, 2696]] },
    } });
    expect(JSON.stringify(Coverage.fromRows(JSON.parse(JSON.stringify(rows))).toRows())).toBe(JSON.stringify(rows));
    expect([...coverage.tiles(13)]).toEqual([[2696, 2953], [2697, 2953], [2699, 2953], [2696, 2954]]);
    expect(() => coverage.add(13, -1, 0)).toThrow(/whole/);
  });

  test('metatiles group covered tiles into aligned 4x4 blocks and honour a bbox range', () => {
    const coverage = Coverage.fromTiles([[13, 2695, 2915], [13, 2696, 2916], [13, 2697, 2919], [13, 2700, 2916]]);
    expect(coverage.metatiles(13)).toEqual([
      { z: 13, mx: 2692, my: 2912, tiles: [[2695, 2915]] },
      { z: 13, mx: 2696, my: 2916, tiles: [[2696, 2916], [2697, 2919]] },
      { z: 13, mx: 2700, my: 2916, tiles: [[2700, 2916]] },
    ]);
    const range = bboxToTileRange({ west: -61.51, south: 45.86, east: -61.49, north: 45.88 }, 13);
    expect(coverage.metatiles(13, { range })).toEqual([{ z: 13, mx: 2696, my: 2916, tiles: [[2696, 2916], [2697, 2919]] }]);
    expect(coverage.metatiles(12)).toEqual([]);
  });
});

describe('style rewriting', () => {
  const style = {
    version: 8, name: 'NS Marks Atlas / day / provincial-first', glyphs: 'http://127.0.0.1:4790/atlas/fonts/{fontstack}/{range}.pbf',
    sources: {
      paper: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      province: { type: 'vector', url: 'pmtiles://http://127.0.0.1:4790/archive/ns.pmtiles' },
      geography: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: 'OpenFreeMap' },
    },
    layers: [{ id: 'paper', type: 'background', paint: { 'background-color': '#f3efe3' } }],
  };

  test('only the geography source URL changes and the input is untouched', () => {
    const before = JSON.stringify(style);
    const { style: rendered, upstreamTileJson } = rewriteStyleForRender(style, { geographyUrl: 'http://127.0.0.1:4790/osm/planet.json' });
    expect(upstreamTileJson).toBe('https://tiles.openfreemap.org/planet');
    expect(rendered.sources.geography).toEqual({ type: 'vector', url: 'http://127.0.0.1:4790/osm/planet.json', attribution: 'OpenFreeMap' });
    expect(rendered.sources.province).toEqual(style.sources.province);
    expect(rendered.layers).toEqual(style.layers);
    expect(JSON.stringify(style)).toBe(before);
    expect(styleSha256(rendered)).not.toBe(styleSha256(style));
    expect(styleSha256(style)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a style without the OpenFreeMap source is refused rather than rendered blind', () => {
    const { geography, ...sources } = style.sources;
    expect(geography).toBeDefined();
    expect(() => rewriteStyleForRender({ ...style, sources }, { geographyUrl: 'x' })).toThrow(/geography/);
    expect(() => rewriteStyleForRender({ ...style, sources: { ...sources, geography: { type: 'vector', url: 'https://example.org/planet' } } }, { geographyUrl: 'x' })).toThrow(/geography/);
  });
});

import L from 'leaflet';
import { afterEach, describe, expect, it } from 'vitest';
import { boundsCorners, collectScene, installTerrainViewport, urlForTile } from './leafletScene';
import { ArcGISExportTileLayer, webMercatorBoundsForTile } from '../layers/arcGISExport';
import { basemapLayerOrder, researchTerrainStyle } from './researchStyle';

let map: L.Map | undefined;
function makeMap() {
  const container = document.createElement('div');
  Object.defineProperties(container, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  document.body.append(container);
  map = L.map(container, { zoomControl: false }).setView([45.835, -61.405], 13);
  return map;
}
afterEach(() => { map?.remove(); map = undefined; document.body.replaceChildren(); });

describe('Leaflet sources in the terrain view', () => {
  it('uses the requested tile zoom and TMS range without changing the mounted layer', () => {
    const m = makeMap();
    const tiles = L.tileLayer('https://example.test/{z}/{x}/{y}.png', { tms: true }).addTo(m);
    expect(urlForTile(tiles, Object.assign(L.point(2, 3), { z: 8 }))).toBe('https://example.test/8/2/252.png');
    expect(m.getZoom()).toBe(13);
  });
  it('preserves the exact export extent for ArcGIS imagery', () => {
    const m = makeMap();
    const layer = new ArcGISExportTileLayer({ serviceUrl: 'https://example.test/MapServer', transparent: true }, {}).addTo(m);
    const coords = Object.assign(L.point(1349, 1460), { z: 12 });
    const url = new URL(urlForTile(layer, coords));
    const b = webMercatorBoundsForTile(coords);
    expect(url.searchParams.get('bbox')).toBe(`${b.minX},${b.minY},${b.maxX},${b.maxY}`);
  });
  it('keeps a local raster in its original geographic frame and reads the active pane order', () => {
    const m = makeMap(); m.createPane('water').style.zIndex = '210'; m.createPane('parcels').style.zIndex = '218';
    const bounds = L.latLngBounds([45.8, -61.5], [45.9, -61.3]);
    L.imageOverlay('data:image/png;base64,', bounds, { pane: 'water', opacity: .4 }).addTo(m);
    L.imageOverlay('data:image/png;base64,', bounds, { pane: 'parcels', opacity: .8 }).addTo(m);
    const scene = collectScene(m);
    expect(scene.rasters.map(r => [r.order, r.opacity])).toEqual([[210, .4], [218, .8]]);
    expect(scene.rasters[0]).toMatchObject({ kind: 'image', coordinates: boundsCorners(bounds) });
    expect(boundsCorners(bounds)).toEqual([[-61.5, 45.9], [-61.3, 45.9], [-61.3, 45.8], [-61.5, 45.8]]);
  });
  it('restores Leaflet bounds and zoom snapping after the 3D view closes', () => {
    const m = makeMap(), original = m.getBounds, before = m.getBounds();
    const tilted = L.latLngBounds([45.7, -61.7], [46.1, -61.1]);
    const restore = installTerrainViewport(m, () => tilted);
    expect(m.getBounds()).toBe(tilted); expect(m.options.zoomSnap).toBe(0);
    restore();
    expect(m.getBounds).toBe(original); expect(m.getBounds().equals(before)).toBe(true); expect(m.options.zoomSnap).toBe(1);
  });
  it('keeps a regional image wash at its per-image z-index inside tilePane', () => {
    const m = makeMap();
    L.imageOverlay('data:image/png;base64,', [[45.8, -61.5], [45.9, -61.3]], { pane: 'tilePane', zIndex: 180 }).addTo(m);
    expect(collectScene(m).rasters[0].order).toBe(180);
  });
  it('keeps road and bridge basemap geometry above water while using province-wide terrain', () => {
    expect(basemapLayerOrder({ id: 'surface-roads', type: 'line', 'source-layer': 'roads' })).toBeGreaterThan(210);
    expect(basemapLayerOrder({ id: 'bridge-roads', type: 'line', 'source-layer': 'roads' })).toBeGreaterThan(235);
    expect(researchTerrainStyle('osm', true).sources['research-elevation']).toMatchObject({ encoding: 'terrarium', tileSize: 256 });
  });
});

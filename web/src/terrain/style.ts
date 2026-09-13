import type { StyleSpecification } from 'maplibre-gl';
import { nativeLayerCatalog } from '../layers/layerCatalog';
import { OPEN_GOVERNMENT_ATTRIBUTION, OPEN_GOVERNMENT_LICENCE_TERMS_URL, PROVINCE_ATTRIBUTION } from '../licensing/provinceLicense';

export const DATA = './terrain/judique';
export type Surface = 'terrain' | 'historical' | 'aerial';
export type TerrainReceipt = {
  bounds: [number, number, number, number];
  terrainMinZoom: number;
  terrainMaxZoom: number;
  historical: { coordinates: [[number, number], [number, number], [number, number], [number, number]] };
};

export function buildTerrainStyle(receipt: TerrainReceipt, aerialAccepted: boolean, surface: Surface = 'historical', opacity = 0.55): StyleSpecification {
  const attribution = `${OPEN_GOVERNMENT_ATTRIBUTION} <a href="${OPEN_GOVERNMENT_LICENCE_TERMS_URL}">Licence</a>`;
  const [west, south, east, north] = receipt.bounds;
  const style: StyleSpecification = {
    version: 8,
    sources: {
      elevation: { type: 'raster-dem', tiles: [`${DATA}/dem/{z}/{x}/{y}.png`], tileSize: 256, bounds: receipt.bounds,
        minzoom: receipt.terrainMinZoom, maxzoom: receipt.terrainMaxZoom, encoding: 'mapbox', attribution },
      historical: { type: 'image', url: `${DATA}/historical.webp`, coordinates: receipt.historical.coordinates },
      contours: { type: 'geojson', data: `${DATA}/contours.geojson`, attribution },
      hydro: { type: 'geojson', data: `${DATA}/hydro.geojson`, attribution: `Nova Scotia Hydrographic Network · ${attribution}` },
      outside: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
        [[west - 2, south - 2], [east + 2, south - 2], [east + 2, north + 2], [west - 2, north + 2], [west - 2, south - 2]],
        [[west, south], [west, north], [east, north], [east, south], [west, south]],
      ] } } },
    },
    terrain: { source: 'elevation', exaggeration: 1 },
    layers: [
      { id: 'ground', type: 'background', paint: { 'background-color': '#d9dec9' } },
      { id: 'relief', type: 'hillshade', source: 'elevation', paint: {
        'hillshade-shadow-color': '#4c5f54', 'hillshade-highlight-color': '#fffbea', 'hillshade-accent-color': '#768771', 'hillshade-exaggeration': 0.45,
      } },
      { id: 'historical', type: 'raster', source: 'historical', paint: { 'raster-opacity': surface === 'historical' ? opacity : 0, 'raster-fade-duration': 0 } },
      // Hide renderer padding beyond the explicitly bounded inspection area.
      { id: 'outside', type: 'fill', source: 'outside', paint: { 'fill-color': '#faf8f0' } },
      { id: 'contours', type: 'line', source: 'contours', paint: {
        'line-color': '#795c36', 'line-opacity': 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.35, 14, 1.1],
      } },
      // Keep both water strokes last. No imagery or contours may obscure them.
      { id: 'hydro-halo', type: 'line', source: 'hydro', paint: {
        'line-color': '#effcfc', 'line-opacity': 0.9,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 4],
      } },
      { id: 'hydro', type: 'line', source: 'hydro', paint: {
        'line-color': '#087aab',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2],
      } },
    ],
  };
  if (aerialAccepted) {
    const aerial = nativeLayerCatalog.find(layer => layer.id === 'ns-aerial')!;
    const query = new URLSearchParams({ f: 'image', bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'jpg', transparent: 'false' });
    style.sources.aerial = { type: 'raster', tiles: [`${aerial.serviceUrl}/export?${query}&bbox={bbox-epsg-3857}`],
      tileSize: 256, bounds: receipt.bounds, minzoom: 10, maxzoom: 19, attribution: PROVINCE_ATTRIBUTION };
    style.layers.splice(2, 0, { id: 'aerial', type: 'raster', source: 'aerial',
      layout: { visibility: surface === 'aerial' ? 'visible' : 'none' }, paint: { 'raster-fade-duration': 0 } });
  }
  return style;
}

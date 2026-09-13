import type { StyleSpecification } from 'maplibre-gl';
import { buildAtlasStyle, buildOsmStyle } from '../atlas/style';
import type { BasemapStyle } from '../atlas/basemap';

export const TERRAIN_CREDIT = 'Mapzen terrain · Contains information licensed under the Open Government Licence – Canada. SRTM/GMTED2010: U.S. Geological Survey. ETOPO1: NOAA.';
export const TERRAIN_SOURCE_URL = 'https://registry.opendata.aws/terrain-tiles/';

export function researchTerrainStyle(basemap: BasemapStyle, modern: boolean): StyleSpecification {
  const style: StyleSpecification = modern ? basemap === 'osm' ? buildOsmStyle() : buildAtlasStyle(basemap) :
    { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#d9dec9' } }] };
  style.sources['research-elevation'] = { type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium', tileSize: 256, maxzoom: 15,
    attribution: `${TERRAIN_CREDIT} · <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Source licences</a>` };
  style.terrain = { source: 'research-elevation', exaggeration: 1 };
  style.layers.push({ id: 'research-hillshade', type: 'hillshade', source: 'research-elevation', paint: {
    'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#43544b', 'hillshade-highlight-color': '#fffae9',
  } });
  return style;
}

export function basemapLayerOrder(layer: { id: string; type: string; 'source-layer'?: string }): number {
  if (layer.id === 'research-hillshade') return 10;
  if (layer.type === 'symbol') return 300;
  if (layer['source-layer'] === 'roads') return layer.id.startsWith('bridge') ? 240 : 235;
  return 0;
}

import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { atlasPalettes, type AtlasMode } from './palette';

const name: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
const roadWidth: ExpressionSpecification = ['interpolate', ['exponential', 1.4], ['zoom'],
  6, 0.4, 12, ['match', ['get', 'class'], ['motorway', 'trunk'], 3, ['primary', 'secondary'], 2, 1],
  18, ['match', ['get', 'class'], ['motorway', 'trunk'], 15, ['primary', 'secondary'], 11, 7]];

/** Original cartography against the published OpenMapTiles schema, not a recoloured raster. */
export function buildAtlasStyle(mode: AtlasMode): StyleSpecification {
  const p = atlasPalettes[mode];
  const vector = { source: 'geography' };
  const layers: LayerSpecification[] = [
    { id: 'paper', type: 'background', paint: { 'background-color': p.land } },
    { id: 'woodland', type: 'fill', ...vector, 'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': p.wood } },
    { id: 'grass', type: 'fill', ...vector, 'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'scrub'], true, false], paint: { 'fill-color': p.grass } },
    { id: 'farmland', type: 'fill', ...vector, 'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['farmland', 'farmyard', 'orchard', 'vineyard'], true, false], paint: { 'fill-color': p.farmland } },
    { id: 'settlements', type: 'fill', ...vector, 'source-layer': 'landuse', minzoom: 10,
      filter: ['match', ['get', 'class'], ['residential', 'commercial', 'industrial'], true, false], paint: { 'fill-color': p.residential } },
    { id: 'water', type: 'fill', ...vector, 'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': p.water } },
    { id: 'waterways', type: 'line', ...vector, 'source-layer': 'waterway', minzoom: 9,
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'line-color': p.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 16, 2] } },
    { id: 'buildings', type: 'fill', ...vector, 'source-layer': 'building', minzoom: 13,
      paint: { 'fill-color': p.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.8] } },
    { id: 'boundaries', type: 'line', ...vector, 'source-layer': 'boundary',
      filter: ['<=', ['to-number', ['coalesce', ['get', 'admin_level'], 99], 99], 6],
      paint: { 'line-color': p.boundary, 'line-width': 0.7, 'line-dasharray': [3, 3], 'line-opacity': 0.65 } },
  ];
  // Keep tunnels, surface roads and bridges separate, in their drawing order.
  for (const level of ['tunnel', 'surface', 'bridge'] as const) {
    const filter: ExpressionSpecification = ['all',
      ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'], true, false],
      level === 'surface' ? ['!', ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], true, false]] : ['==', ['get', 'brunnel'], level],
    ];
    layers.push(
      { id: `${level}-road-edge`, type: 'line', ...vector, 'source-layer': 'transportation', filter,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.roadEdge, 'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 6, 0.8,
          12, ['match', ['get', 'class'], ['motorway', 'trunk'], 3.8, ['primary', 'secondary'], 2.8, 1.8],
          18, ['match', ['get', 'class'], ['motorway', 'trunk'], 16.5, ['primary', 'secondary'], 12.5, 8.5]], 'line-opacity': level === 'tunnel' ? 0.35 : 0.75 } },
      { id: `${level}-roads`, type: 'line', ...vector, 'source-layer': 'transportation', filter,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], p.highway, p.road],
          'line-width': roadWidth, 'line-opacity': level === 'tunnel' ? 0.5 : 1,
          ...(level === 'tunnel' ? { 'line-dasharray': [3, 2] } : {}) } },
    );
  }
  layers.push(
    { id: 'tracks-and-paths', type: 'line', ...vector, 'source-layer': 'transportation', minzoom: 13,
      filter: ['match', ['get', 'class'], ['track', 'path'], true, false],
      paint: { 'line-color': p.path, 'line-width': 1, 'line-dasharray': [3, 3] } },
    { id: 'railways', type: 'line', ...vector, 'source-layer': 'transportation', minzoom: 10,
      filter: ['==', ['get', 'class'], 'rail'],
      paint: { 'line-color': p.mutedInk, 'line-width': 1, 'line-dasharray': [5, 3], 'line-opacity': 0.65 } },
    { id: 'ferries', type: 'line', ...vector, 'source-layer': 'transportation', minzoom: 8,
      filter: ['==', ['get', 'class'], 'ferry'],
      paint: { 'line-color': p.waterInk, 'line-width': 1, 'line-dasharray': [2, 4] } },
    { id: 'road-names', type: 'symbol', ...vector, 'source-layer': 'transportation_name', minzoom: 13,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'], true, false],
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'symbol-spacing': 350 },
      paint: { 'text-color': p.mutedInk, 'text-halo-color': p.halo, 'text-halo-width': 1.5 } },
    { id: 'water-names', type: 'symbol', ...vector, 'source-layer': 'water_name', minzoom: 6,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 14, 15], 'text-letter-spacing': 0.08, 'text-max-width': 9 },
      paint: { 'text-color': p.waterInk, 'text-halo-color': p.water, 'text-halo-width': 1 } },
    { id: 'waterway-names', type: 'symbol', ...vector, 'source-layer': 'water_name', minzoom: 11,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'symbol-spacing': 500 },
      paint: { 'text-color': p.waterInk, 'text-halo-color': p.water, 'text-halo-width': 1 } },
    { id: 'village-names', type: 'symbol', ...vector, 'source-layer': 'place', minzoom: 10,
      filter: ['match', ['get', 'class'], ['village', 'hamlet', 'suburb', 'neighbourhood'], true, false],
      layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 15], 'text-max-width': 9 },
      paint: { 'text-color': p.ink, 'text-halo-color': p.halo, 'text-halo-width': 2 } },
    { id: 'town-names', type: 'symbol', ...vector, 'source-layer': 'place', minzoom: 5,
      filter: ['match', ['get', 'class'], ['town', 'city'], true, false],
      layout: { 'text-field': name, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 10, 15, 14, 20], 'text-max-width': 9 },
      paint: { 'text-color': p.ink, 'text-halo-color': p.halo, 'text-halo-width': 2 } },
    { id: 'province-names', type: 'symbol', ...vector, 'source-layer': 'place', minzoom: 3, maxzoom: 8,
      filter: ['==', ['get', 'class'], 'state'],
      layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': 13, 'text-transform': 'uppercase', 'text-letter-spacing': 0.18 },
      paint: { 'text-color': p.mutedInk, 'text-halo-color': p.halo, 'text-halo-width': 2 } },
  );
  return {
    version: 8, name: `NS Marks Atlas / ${mode}`,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { geography: { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
      attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' } },
    layers,
  };
}

export function buildOsmStyle(): StyleSpecification {
  return { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
    attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' } },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }] };
}

import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { atlasPalettes, type AtlasMode } from './palette';
import { provincialTileUrl, PROVINCIAL_ATTRIBUTION } from './provincial';

const roadClass: ExpressionSpecification = ['coalesce', ['get', 'roadc_desc'], ''];
const description: ExpressionSpecification = ['coalesce', ['get', 'feat_desc'], ''];
const abandoned: ExpressionSpecification = ['in', 'abandoned', ['downcase', description]];
const nonOrdinary: ExpressionSpecification = ['any', abandoned,
  ['in', 'no vehicular traffic', ['downcase', description]], ['in', 'status unknown', ['downcase', description]]];
const ordinaryRoad: ExpressionSpecification = ['all', ['!', nonOrdinary],
  ['match', roadClass, ['Trans Canada', 'Highway', 'Local Highway', 'Arterial', 'Collector', 'Local Arterial', 'Local Collector', 'Local', 'Ramp'], true, false]];
const majorRoads = ['Trans Canada', 'Highway', 'Local Highway', 'Arterial'];
// NSRN also fills STREET with class placeholders for unnamed access features.
// Keep those source values in the tiles, but do not print them as road names.
const genericStreetNames = ['Track', 'Driveway', 'Dryweather', 'Trail', 'Railroad',
  'Active Rail Road', 'Abandoned Rail Road', 'Service Lane', 'Seasonal', 'Private Use',
  'Restricted', 'Water Access', 'Median Crossover', 'Ramp', 'Local', 'Collector',
  'Arterial', 'Highway', 'Trans Canada', 'Local Highway', 'Local Arterial', 'Local Collector'];
const width: ExpressionSpecification = ['interpolate', ['exponential', 1.4], ['zoom'],
  5, 0.5, 12, ['match', roadClass, majorRoads, 3, 1.5], 18, ['match', roadClass, majorRoads, 15, 7]];

/** Provincial source fields remain intact; expressions only choose cartography. */
export function buildAtlasStyle(mode: AtlasMode): StyleSpecification {
  const p = atlasPalettes[mode];
  const province = { source: 'province' };
  const osm = { source: 'geography' };
  const roads = { ...province, 'source-layer': 'roads' };
  const names = { ...province, 'source-layer': 'names' };
  const layers: LayerSpecification[] = [
    { id: 'paper', type: 'background', paint: { 'background-color': p.land } },
    // OSM supplies supplemental ocean, land-use and footprint context only.
    { id: 'grass', type: 'fill', ...osm, 'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'scrub'], true, false], paint: { 'fill-color': p.grass } },
    { id: 'farmland', type: 'fill', ...osm, 'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['farmland', 'farmyard', 'vineyard'], true, false], paint: { 'fill-color': p.farmland } },
    { id: 'settlements', type: 'fill', ...osm, 'source-layer': 'landuse', minzoom: 10,
      filter: ['match', ['get', 'class'], ['residential', 'commercial', 'industrial'], true, false], paint: { 'fill-color': p.residential } },
    { id: 'woodland', type: 'fill', ...province, 'source-layer': 'woodland',
      filter: ['==', ['get', 'feat_desc'], 'TREE AREA polygon'], paint: { 'fill-color': p.wood } },
    { id: 'orchards', type: 'fill', ...province, 'source-layer': 'woodland',
      filter: ['match', ['get', 'feat_desc'], ['ORCHARD polygon', 'NURSERY polygon'], true, false], paint: { 'fill-color': p.farmland } },
    { id: 'reforestation', type: 'fill', ...province, 'source-layer': 'woodland',
      filter: ['==', ['get', 'feat_desc'], 'REFORESTATION (< 2m high only) polygon'], paint: { 'fill-color': p.grass } },
    { id: 'ocean-context', type: 'fill', ...osm, 'source-layer': 'water',
      filter: ['==', ['get', 'class'], 'ocean'], paint: { 'fill-color': p.water } },
    { id: 'wetlands', type: 'fill', ...province, 'source-layer': 'water',
      filter: ['match', description, ['Swamp Area polygon', 'Cranberry Bog polygon'], true, false],
      paint: { 'fill-color': p.waterLine, 'fill-opacity': 0.22 } },
    { id: 'water', type: 'fill', ...province, 'source-layer': 'water',
      filter: ['all', ['in', 'Water', description], ['!', ['in', 'Underground', description]]], paint: { 'fill-color': p.water } },
    { id: 'waterways', type: 'line', ...province, 'source-layer': 'waterways', minzoom: 11,
      filter: ['match', description, ['River - Single Line', 'River - Single Line Indefinite', 'River Split - Single Line',
        'River Split - Single Line Indefinite', 'Canal - Single Line', 'Ditch - Single Line', 'Ditch - Single Line Indefinite'], true, false],
      paint: { 'line-color': p.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 2] } },
    { id: 'buildings', type: 'fill', ...osm, 'source-layer': 'building', minzoom: 13,
      paint: { 'fill-color': p.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.8] } },
    { id: 'boundaries', type: 'line', ...province, 'source-layer': 'boundaries',
      paint: { 'line-color': p.boundary, 'line-width': 0.7, 'line-dasharray': [3, 3], 'line-opacity': 0.65 } },
  ];
  // Source descriptions distinguish tunnels, surface roads and bridges.
  for (const level of ['tunnel', 'surface', 'bridge'] as const) {
    const bridge: ExpressionSpecification = ['==', ['slice', description, 0, 6], 'BRIDGE'];
    const tunnel: ExpressionSpecification = ['==', ['slice', description, 0, 6], 'TUNNEL'];
    const filter: ExpressionSpecification = ['all', ordinaryRoad,
      level === 'bridge' ? bridge : level === 'tunnel' ? tunnel : ['all', ['!', bridge], ['!', tunnel]]];
    layers.push(
      { id: `${level}-road-edge`, type: 'line', ...roads, filter,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': p.roadEdge, 'line-width': ['interpolate', ['exponential', 1.4], ['zoom'],
          5, 1, 12, ['match', roadClass, majorRoads, 3.8, 2.3], 18, ['match', roadClass, majorRoads, 16.5, 8.5]], 'line-opacity': level === 'tunnel' ? 0.35 : 0.75 } },
      { id: `${level}-roads`, type: 'line', ...roads, filter,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['match', roadClass, majorRoads, p.highway, p.road], 'line-width': width,
          'line-opacity': level === 'tunnel' ? 0.5 : 1, ...(level === 'tunnel' ? { 'line-dasharray': [3, 2] } : {}) } },
    );
  }
  layers.push(
    { id: 'tracks-and-paths', type: 'line', ...roads, minzoom: 13,
      filter: ['any', nonOrdinary, ['match', roadClass,
        ['Track', 'Trail', 'Driveway', 'Dryweather', 'Seasonal', 'Private Use', 'Restricted', 'Service Lane', 'Water Access', 'Median Crossover'], true, false]],
      paint: { 'line-color': p.path, 'line-width': 1, 'line-dasharray': [3, 3] } },
    { id: 'railways', type: 'line', ...roads, minzoom: 12,
      filter: ['==', roadClass, 'Active Rail Road'],
      paint: { 'line-color': p.mutedInk, 'line-width': 1, 'line-dasharray': [5, 3], 'line-opacity': 0.65 } },
    { id: 'ferries', type: 'line', ...roads, minzoom: 12,
      filter: ['==', roadClass, 'Ferry Connector'],
      paint: { 'line-color': p.waterInk, 'line-width': 1, 'line-dasharray': [2, 4] } },
    { id: 'road-names', type: 'symbol', ...roads, minzoom: 13,
      filter: ['all', ['!', abandoned],
        ['match', roadClass, ['Active Rail Road', 'Abandoned Rail Road', 'Ferry Connector'], false, true],
        ['match', ['get', 'street'], genericStreetNames, false, true],
        ['!=', ['coalesce', ['get', 'street'], ''], '']],
      layout: { 'symbol-placement': 'line', 'text-field': ['get', 'street'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'symbol-spacing': 350 },
      paint: { 'text-color': p.mutedInk, 'text-halo-color': p.halo, 'text-halo-width': 1.5 } },
  );
  for (const [id, kinds, minzoom, size] of [
    ['town-names', ['City', 'Town'], 6, 15],
    ['administrative-names', ['Other municipal/district area - major agglomeration'], 6, 11],
    ['village-names', ['Village', 'Unincorporated area'], 10, 12],
    ['water-names', ['Lake', 'River', 'Bay', 'Channel', 'Sea feature'], 11, 12],
    ['terrain-names', ['Mountain', 'Cape', 'Island', 'Falls', 'Valley', 'Cliff'], 13, 11],
  ] as const) {
    layers.push({ id, type: 'symbol', ...names, minzoom, ...(id === 'administrative-names' ? { maxzoom: 10 } : {}),
      filter: ['all', ['==', ['get', 'status_ds'], 'Official - Official'], ['match', ['get', 'concise_ds'], [...kinds], true, false]],
      layout: { 'text-field': ['get', 'geoname'], 'text-font': [id === 'town-names' ? 'Noto Sans Bold' : 'Noto Sans Regular'], 'text-size': size, 'text-max-width': 9,
        ...(id === 'administrative-names' ? { 'text-transform': 'uppercase', 'text-letter-spacing': 0.12 } : {}) },
      paint: { 'text-color': id === 'administrative-names' ? p.mutedInk : id === 'town-names' || id === 'village-names' ? p.ink : p.waterInk, 'text-halo-color': p.halo, 'text-halo-width': 2 } });
  }
  return { version: 8, name: `NS Marks Atlas / ${mode} / provincial-first`,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      province: { type: 'vector', url: provincialTileUrl(), attribution: PROVINCIAL_ATTRIBUTION },
      geography: { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
        attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' },
    }, layers };
}

export function buildOsmStyle(): StyleSpecification {
  return { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
    attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' } },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }] };
}

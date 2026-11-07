import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { atlasPalettes, type AtlasMode } from './palette';
import { provincialTileUrl, PROVINCIAL_ATTRIBUTION } from './provincial';
import { crownTileUrl, CROWN_SOURCE_URL } from './crown';
import {
  atlasGlyphUrl, atlasSpriteUrl, atlasFonts, paperSheet, roadClass, description, abandoned, nonOrdinary, majorRoads, secondaryRoads,
  ordinaryRoad, trackClasses, genericStreetNames, streams, surfaceWater, shoreFilter, towardWater,
} from './styleCommon';
import { handDrawnLayers, handDrawnReliefUrl, HAND_DRAWN_RELIEF_ATTRIBUTION } from './handDrawnStyle';

export { atlasFonts, atlasGlyphUrl, atlasSpriteUrl } from './styleCommon';

/** Three road tiers: ochre main routes, then collectors, then local roads, all with an ink casing. */
type Tier = [major: number, secondary: number, local: number];
const tierWidths: [zoom: number, widths: Tier][] = [[5, [0.8, 0.3, 0.15]], [9, [1.4, 0.7, 0.35]], [12, [2.8, 1.7, 1.1]], [15, [6.5, 4.2, 3]], [18, [17, 12, 9]]];
const casingExtra = (zoom: number) => zoom <= 9 ? 0.8 : zoom <= 12 ? 1.4 : zoom <= 15 ? 2.2 : 3.2;
const tier = ([major, secondary, local]: Tier): ExpressionSpecification =>
  ['match', roadClass, majorRoads, major, secondaryRoads, secondary, local];
const roadWidth = (casing: boolean): ExpressionSpecification => ['interpolate', ['exponential', 1.5], ['zoom'],
  ...tierWidths.flatMap(([zoom, widths]) => [zoom, tier(casing ? widths.map(width => width + casingExtra(zoom)) as Tier : widths)])];

/** Provincial source fields remain intact; expressions only choose cartography. */
export function buildAtlasStyle(mode: AtlasMode): StyleSpecification {
  const p = atlasPalettes[mode];
  const style = (layers: LayerSpecification[]): StyleSpecification => ({ version: 8, name: `NS Marks Atlas / ${mode} / provincial-first`,
    glyphs: atlasGlyphUrl(),
    sprite: atlasSpriteUrl(),
    sources: {
      paper: { type: 'geojson', data: paperSheet },
      province: { type: 'vector', url: provincialTileUrl(), attribution: PROVINCIAL_ATTRIBUTION },
      crown: { type: 'vector', url: crownTileUrl(),
        attribution: `<a href="${CROWN_SOURCE_URL}">Crown Land · full or partial provincial interest</a>` },
      geography: { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
        attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' },
    }, layers });
  if (mode === 'handdrawn') {
    const sheet = style(handDrawnLayers(atlasPalettes.handdrawn));
    sheet.sources.relief = { type: 'geojson', data: handDrawnReliefUrl(), attribution: HAND_DRAWN_RELIEF_ATTRIBUTION };
    return sheet;
  }
  // Fletcher carries the engraved treatment: serif lettering, paper grain, shore
  // stipple and hand-inked strokes. Day and Night stay clean and sans-serif.
  const engraved = mode === 'fletcher';
  const night = '';
  const face = engraved
    ? { names: atlasFonts.serif, towns: atlasFonts.serif, water: atlasFonts.serifItalic, tracking: 1, capitals: 0.32 }
    : { names: atlasFonts.sans, towns: atlasFonts.sansBold, water: atlasFonts.sans, tracking: 0.35, capitals: 0.12 };
  const province = { source: 'province' };
  const osm = { source: 'geography' };
  const roads = { ...province, 'source-layer': 'roads' };
  const names = { ...province, 'source-layer': 'names' };
  const water = { ...province, 'source-layer': 'water' };
  const layers: LayerSpecification[] = [
    { id: 'paper', type: 'background', paint: { 'background-color': p.land } },
    // OSM supplies supplemental ocean, land-use and footprint context only.
    { id: 'grass', type: 'fill', ...osm, 'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'scrub'], true, false], paint: { 'fill-color': p.grass } },
    { id: 'farmland', type: 'fill', ...osm, 'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['farmland', 'farmyard', 'vineyard'], true, false], paint: { 'fill-color': p.farmland } },
    { id: 'settlements', type: 'fill', ...osm, 'source-layer': 'landuse', minzoom: 10,
      filter: ['match', ['get', 'class'], ['residential', 'commercial', 'industrial'], true, false], paint: { 'fill-color': p.residential } },
    // Provincial land cover: the olive of the sheets stands for tree cover, not geology.
    { id: 'woodland', type: 'fill', ...province, 'source-layer': 'woodland',
      filter: ['==', ['get', 'feat_desc'], 'TREE AREA polygon'],
      paint: { 'fill-color': p.wood, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 11, 1] } },
    { id: 'orchards', type: 'fill', ...province, 'source-layer': 'woodland',
      filter: ['match', ['get', 'feat_desc'], ['ORCHARD polygon', 'NURSERY polygon'], true, false], paint: { 'fill-color': p.farmland } },
    { id: 'reforestation', type: 'fill', ...province, 'source-layer': 'woodland',
      filter: ['==', ['get', 'feat_desc'], 'REFORESTATION (< 2m high only) polygon'], paint: { 'fill-color': p.grass } },
    // One merged fill with no boundary stroke or antialiased tile-edge outline.
    { id: 'crown-land', type: 'fill', source: 'crown', 'source-layer': 'crown',
      paint: { 'fill-color': p.crown, 'fill-antialias': false } },
    // Fletcher adds a sparse engraver's hatch over the wash. A fill pattern, not an outline:
    // the Crown polygons are tiled, so a stroke would draw false seams at tile edges.
    ...(engraved ? [{ id: 'crown-land-hatch', type: 'fill', source: 'crown', 'source-layer': 'crown',
      paint: { 'fill-pattern': 'crown-hatch', 'fill-opacity': 0.35, 'fill-antialias': false } } satisfies LayerSpecification] : []),
    { id: 'ocean-context', type: 'fill', ...osm, 'source-layer': 'water',
      filter: ['==', ['get', 'class'], 'ocean'], paint: { 'fill-color': p.water } },
    { id: 'wetlands', type: 'fill', ...water,
      filter: ['match', description, ['Swamp Area polygon', 'Cranberry Bog polygon'], true, false],
      paint: engraved ? { 'fill-color': p.water, 'fill-opacity': 0.45 } : { 'fill-color': p.waterLine, 'fill-opacity': 0.22 } },
    { id: 'water', type: 'fill', ...water, filter: surfaceWater, paint: { 'fill-color': p.water } },
    ...(engraved ? [
    // The engraved shore: a pale band and stipple on the water side under a firm ink line,
    // drawn from NSTDB shoreline lines from z11 (offset plus half width stays inside the
    // 8 px overzoom buffer so bands never break at tile edges).
    { id: 'shore-band', type: 'line', ...province, 'source-layer': 'waterways', minzoom: 11, filter: shoreFilter,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': p.shore, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 13, 3, 17, 7],
        'line-offset': ['interpolate', ['linear'], ['zoom'], 11, towardWater(0.8), 13, towardWater(1.5), 17, towardWater(3.5)] } },
    { id: 'shore-stipple', type: 'line', ...province, 'source-layer': 'waterways', minzoom: 12, filter: shoreFilter,
      layout: { 'line-join': 'round' },
      paint: { 'line-pattern': 'shore-stipple', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 14, 6.5, 17, 10],
        'line-offset': ['interpolate', ['linear'], ['zoom'], 12, towardWater(2), 14, towardWater(3.2), 17, towardWater(5)],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.25, 14, 0.5] } },
    { id: 'shoreline', type: 'line', ...province, 'source-layer': 'waterways', minzoom: 11, maxzoom: 12, filter: shoreFilter,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': p.ink, 'line-width': 0.8, 'line-opacity': 0.7 } },
    { id: 'shoreline-inked', type: 'line', ...province, 'source-layer': 'waterways', minzoom: 12, filter: shoreFilter,
      layout: { 'line-join': 'round' },
      paint: { 'line-pattern': `ink-line${night}`, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.6, 16, 2.6], 'line-opacity': 0.8 } },
    ] satisfies LayerSpecification[] : []),
    { id: 'waterways', type: 'line', ...province, 'source-layer': 'waterways', minzoom: 11, ...(engraved ? { maxzoom: 14 } : {}),
      filter: ['match', description, streams, true, false],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 14, 1.1, 17, 2.2],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 13, 0.9] } },
    ...(engraved ? [{ id: 'waterways-inked', type: 'line', ...province, 'source-layer': 'waterways', minzoom: 14,
      filter: ['match', description, streams, true, false],
      layout: { 'line-join': 'round' },
      paint: { 'line-pattern': `ink-line-water${night}`, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.6, 17, 3], 'line-opacity': 0.9 } } satisfies LayerSpecification] : []),
    { id: 'buildings', type: 'fill', ...osm, 'source-layer': 'building', minzoom: 13,
      paint: { 'fill-color': p.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.75] } },
    { id: 'boundaries', type: 'line', ...province, 'source-layer': 'boundaries',
      paint: { 'line-color': p.boundary, 'line-width': 1.1, 'line-dasharray': [7, 3, 1.5, 3], 'line-opacity': 0.75 } },
  ];
  // Source descriptions distinguish tunnels, surface roads and bridges.
  const bridge: ExpressionSpecification = ['==', ['slice', description, 0, 6], 'BRIDGE'];
  const tunnel: ExpressionSpecification = ['==', ['slice', description, 0, 6], 'TUNNEL'];
  const casingColor: ExpressionSpecification | string = engraved ? ['match', roadClass, majorRoads, p.halo, p.roadEdge] : p.roadEdge;
  const isMajor: ExpressionSpecification = ['match', roadClass, majorRoads, true, false];
  for (const level of ['tunnel', 'surface', 'bridge'] as const) {
    const filter: ExpressionSpecification = ['all', ordinaryRoad,
      level === 'bridge' ? bridge : level === 'tunnel' ? tunnel : ['all', ['!', bridge], ['!', tunnel]]];
    const casingOpacity: ExpressionSpecification | number = level === 'tunnel' ? 0.3 : ['interpolate', ['linear'], ['zoom'],
      10, ['match', roadClass, majorRoads, 0.9, secondaryRoads, 0.5, 0], 13, 0.9];
    const split = engraved && level === 'surface';
    layers.push(
      // Local casings arrive with the village scale so regional views stay open; in Fletcher
      // the ink casing of local and collector roads then becomes a hand-inked stroke.
      { id: `${level}-road-edge`, type: 'line', ...roads, filter: split ? ['all', filter, ['!', isMajor]] : filter,
        ...(split ? { maxzoom: 14 } : {}),
        layout: { 'line-cap': level === 'bridge' ? 'butt' : 'round', 'line-join': 'round' },
        paint: { 'line-color': casingColor, 'line-width': roadWidth(true), 'line-opacity': casingOpacity } },
      ...(split ? [
        { id: 'surface-road-edge-major', type: 'line', ...roads, filter: ['all', filter, isMajor],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': casingColor, 'line-width': roadWidth(true), 'line-opacity': 0.9 } } satisfies LayerSpecification,
        { id: 'surface-road-edge-inked', type: 'line', ...roads, filter: ['all', filter, ['!', isMajor]], minzoom: 14,
          layout: { 'line-join': 'round' },
          paint: { 'line-pattern': `ink-line-road${night}`, 'line-width': roadWidth(true), 'line-opacity': 0.9 } } satisfies LayerSpecification,
      ] : []),
      { id: `${level}-roads`, type: 'line', ...roads, filter,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['match', roadClass, majorRoads, p.highway, p.road], 'line-width': roadWidth(false),
          'line-opacity': level === 'tunnel' ? 0.5 : 1, ...(level === 'tunnel' ? { 'line-dasharray': [3, 2] } : {}) } },
    );
  }
  layers.push(
    // Tracks, trails and access features stay visible but never read as ordinary roads.
    { id: 'tracks-and-paths', type: 'line', ...roads, minzoom: 13,
      filter: ['all', ['!', abandoned], ['any', nonOrdinary, ['match', roadClass, trackClasses, true, false]]],
      paint: { 'line-color': p.path, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 1.4], 'line-dasharray': [3, 2.5], 'line-opacity': 0.85 } },
    { id: 'abandoned-routes', type: 'line', ...roads, minzoom: 13, filter: abandoned,
      paint: { 'line-color': p.path, 'line-width': 1, 'line-dasharray': [0.8, 2.2], 'line-opacity': 0.7 } },
    { id: 'railways', type: 'line', ...roads, minzoom: 11,
      filter: ['==', roadClass, 'Active Rail Road'],
      paint: { 'line-color': p.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 15, 1.8], 'line-opacity': 0.75 } },
    { id: 'railway-ties', type: 'line', ...roads, minzoom: 12,
      filter: ['==', roadClass, 'Active Rail Road'],
      paint: { 'line-color': p.halo, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 15, 1.2], 'line-dasharray': [4, 4], 'line-opacity': 0.9 } },
    { id: 'ferries', type: 'line', ...roads, minzoom: 11,
      filter: ['==', roadClass, 'Ferry Connector'],
      paint: { 'line-color': p.waterInk, 'line-width': 1.2, 'line-dasharray': [1, 3] } },
    // Paper grain sits over every fill and line but beneath the lettering, so text stays crisp.
    ...(engraved ? [{ id: 'paper-grain', type: 'fill', source: 'paper',
      paint: { 'fill-pattern': `paper-grain${night}` } } satisfies LayerSpecification] : []),
  );
  const roadNames = (id: string, classes: readonly string[]): LayerSpecification => ({ id, type: 'symbol', ...roads, minzoom: 13,
    filter: ['all', ['!', abandoned], ['match', roadClass, [...classes], true, false],
      ['match', ['get', 'street'], genericStreetNames, false, true],
      ['!=', ['coalesce', ['get', 'street'], ''], '']],
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'street'], 'text-font': [atlasFonts.sans],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, ['match', roadClass, majorRoads, 11, 10], 17, ['match', roadClass, majorRoads, 13, 12]],
      'text-letter-spacing': 0.02, 'symbol-spacing': 350, 'text-padding': 2,
      'symbol-sort-key': ['match', roadClass, majorRoads, 0, secondaryRoads, 1, 2] },
    paint: { 'text-color': p.mutedInk, 'text-halo-color': p.halo, 'text-halo-width': 1.6 } });
  // Later symbol layers are placed first and win collisions: towns, then counties, then
  // main-route names, then villages, water and terrain, with local street names last.
  layers.push(roadNames('road-names', [...secondaryRoads, 'Local', ...trackClasses]));
  const officialNames = (kinds: readonly string[]): ExpressionSpecification =>
    ['all', ['==', ['get', 'status_ds'], 'Official - Official'], ['match', ['get', 'concise_ds'], [...kinds], true, false]];
  const sideAnchors = ['top', 'bottom', 'right', 'left'] as const;
  const pointNames = (id: string, kinds: readonly string[], minzoom: number, font: string, size: ExpressionSpecification,
    spacing: number, color: string, sort: number, halo: number): LayerSpecification => ({ id, type: 'symbol', ...names, minzoom,
    filter: officialNames(kinds),
    layout: { 'text-field': ['get', 'geoname'], 'text-font': [font], 'text-size': size, 'text-letter-spacing': spacing,
      'text-max-width': 8, 'text-padding': 2, 'symbol-sort-key': sort,
      'text-variable-anchor': [...sideAnchors], 'text-radial-offset': 0.2, 'text-justify': 'auto' },
    paint: { 'text-color': color, 'text-halo-color': p.halo, 'text-halo-width': halo } });
  layers.push(
    pointNames('terrain-names', ['Mountain', 'Cape', 'Island', 'Falls', 'Valley', 'Cliff'], 12.5, face.names,
      ['interpolate', ['linear'], ['zoom'], 13, 10.5, 16, 12], 0.08 * face.tracking, p.mutedInk, 4, 1.8),
    pointNames('water-names', ['Lake', 'River', 'Bay', 'Channel', 'Sea feature'], 10.5, face.water,
      ['interpolate', ['linear'], ['zoom'], 11, 11.5, 15, 13.5], 0.1 * face.tracking, p.waterInk, 3, 1.8),
    pointNames('village-names', ['Village', 'Unincorporated area'], 9.5, face.names,
      ['interpolate', ['linear'], ['zoom'], 10, 11.5, 14, 14], 0.06 * face.tracking, p.ink, 2, 2),
    roadNames('major-road-names', majorRoads),
    // Counties and other major municipal areas in the spaced capitals of the sheets.
    { id: 'administrative-names', type: 'symbol', ...names, minzoom: 6, maxzoom: 10,
      filter: officialNames(['Other municipal/district area - major agglomeration']),
      layout: { 'text-field': ['get', 'geoname'], 'text-font': [face.names], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10.5, 9, 12.5],
        'text-transform': 'uppercase', 'text-letter-spacing': face.capitals, 'text-max-width': 12, 'text-padding': 8, 'symbol-sort-key': 1 },
      paint: { 'text-color': p.mutedInk, 'text-halo-color': p.halo, 'text-halo-width': 2, 'text-opacity': 0.85 } },
    { id: 'town-names', type: 'symbol', ...names, minzoom: 6,
      filter: officialNames(['City', 'Town']),
      layout: { 'text-field': ['get', 'geoname'], 'text-font': [face.towns], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 12.5, 10, 15.5, 14, 19],
        'text-letter-spacing': 0.1 * face.tracking, 'text-max-width': 8, 'text-padding': 6, 'symbol-sort-key': 0 },
      paint: { 'text-color': p.ink, 'text-halo-color': p.halo, 'text-halo-width': 2.2 } },
  );
  return style(layers);
}

export function buildOsmStyle(): StyleSpecification {
  return { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
    attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' } },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }] };
}

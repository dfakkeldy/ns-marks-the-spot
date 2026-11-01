import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import type { atlasPalettes } from './palette';
import {
  atlasFonts, abandoned, description, genericStreetNames, majorRoads, nonOrdinary, ordinaryRoad, roadClass,
  secondaryRoads, shoreFilter, streams, surfaceWater, towardWater, trackClasses,
} from './styleCommon';

type Palette = Record<keyof (typeof atlasPalettes)['handdrawn'], string>;

/**
 * The Hand-drawn style changes character with scale, as a sketched map would:
 *
 *   explorer's chart (to z10)   parchment, a pen-hatched sea, ink asterisks for
 *                               forest, hachured ridges on named heights and an
 *                               old book face for the names
 *   surveyor's sketch (z10-13)  brooks, collector roads, marsh tufts, furrowed
 *                               fields and rippled shores join in
 *   folksy (from z13)           doodled pines, double-line streets, red-dash
 *                               trails, cottages for villages and every name in
 *                               a felt-pen hand
 *
 * It reads the same provincial and OSM features as the other Atlas styles; only
 * the drawing changes.
 */
export const HAND_DRAWN_LOCAL_ZOOM = 13;
const SKETCH_ZOOM = 10;
const LOCAL = HAND_DRAWN_LOCAL_ZOOM;

/** The old book face across the region, the felt-pen hand up close. */
const lettering = (regional: string, local: string): ExpressionSpecification =>
  ['step', ['zoom'], ['literal', [regional]], LOCAL, ['literal', [local]]];

const fade = (from: number, to: number, start = 0, end = 1): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], from, start, to, end];

/** Hand-drawn roads stay slimmer than the modern Atlas: a pen line, then a double line. */
type Tier = [major: number, secondary: number, local: number];
const tierWidths: [zoom: number, widths: Tier][] = [[6, [0.7, 0.3, 0.2]], [10, [1.4, 0.8, 0.5]], [13, [2.6, 1.8, 1.3]], [16, [7, 5, 3.8]], [18, [15, 11, 8.5]]];
const tier = ([major, secondary, local]: Tier): ExpressionSpecification =>
  ['match', roadClass, majorRoads, major, secondaryRoads, secondary, local];
const roadWidth = (extra = 0): ExpressionSpecification => ['interpolate', ['exponential', 1.5], ['zoom'],
  ...tierWidths.flatMap(([zoom, widths]) => [zoom, tier(widths.map(width => width + (zoom >= LOCAL ? extra : 0)) as Tier)])];
const tunnel: ExpressionSpecification = ['==', ['slice', description, 0, 6], 'TUNNEL'];

export function handDrawnLayers(p: Palette): LayerSpecification[] {
  const province = { source: 'province' };
  const osm = { source: 'geography' };
  const roads = { ...province, 'source-layer': 'roads' };
  const names = { ...province, 'source-layer': 'names' };
  const water = { ...province, 'source-layer': 'water' };
  const woodland = { ...province, 'source-layer': 'woodland' };
  const trees: ExpressionSpecification = ['==', ['get', 'feat_desc'], 'TREE AREA polygon'];
  const wetland: ExpressionSpecification = ['match', description, ['Swamp Area polygon', 'Cranberry Bog polygon'], true, false];
  const halo = { 'text-halo-color': p.halo, 'text-halo-width': 1.8, 'text-halo-blur': 0.6 };
  const layers: LayerSpecification[] = [
    { id: 'paper', type: 'background', paint: { 'background-color': p.land } },
    { id: 'grass', type: 'fill', ...osm, 'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'scrub'], true, false], paint: { 'fill-color': p.grass } },
    { id: 'farmland', type: 'fill', ...osm, 'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['farmland', 'farmyard', 'vineyard'], true, false], paint: { 'fill-color': p.farmland } },
    { id: 'farmland-furrows', type: 'fill', ...osm, 'source-layer': 'landuse', minzoom: 11,
      filter: ['match', ['get', 'class'], ['farmland', 'farmyard', 'vineyard'], true, false],
      paint: { 'fill-pattern': 'hand-field', 'fill-opacity': fade(11, 12) } },
    { id: 'settlements', type: 'fill', ...osm, 'source-layer': 'landuse', minzoom: SKETCH_ZOOM,
      filter: ['match', ['get', 'class'], ['residential', 'commercial', 'industrial'], true, false], paint: { 'fill-color': p.residential } },
    { id: 'woodland', type: 'fill', ...woodland, filter: trees, paint: { 'fill-color': p.wood } },
    { id: 'orchards', type: 'fill', ...woodland,
      filter: ['match', ['get', 'feat_desc'], ['ORCHARD polygon', 'NURSERY polygon'], true, false], paint: { 'fill-color': p.farmland } },
    { id: 'reforestation', type: 'fill', ...woodland,
      filter: ['==', ['get', 'feat_desc'], 'REFORESTATION (< 2m high only) polygon'], paint: { 'fill-color': p.grass } },
    { id: 'crown-land', type: 'fill', source: 'crown', 'source-layer': 'crown',
      paint: { 'fill-color': p.crown, 'fill-opacity': 0.55, 'fill-antialias': false } },
    // Forest is drawn, not coloured: scattered ink asterisks give way to doodled trees.
    { id: 'woodland-asterisks', type: 'fill', ...woodland, maxzoom: LOCAL, filter: trees,
      paint: { 'fill-pattern': 'hand-trees-far', 'fill-opacity': fade(LOCAL - 0.6, LOCAL, 0.85, 0) } },
    { id: 'woodland-trees', type: 'fill', ...woodland, minzoom: LOCAL - 0.6, filter: trees,
      paint: { 'fill-pattern': 'hand-trees', 'fill-opacity': fade(LOCAL - 0.6, LOCAL) } },
    { id: 'ocean-context', type: 'fill', ...osm, 'source-layer': 'water',
      filter: ['==', ['get', 'class'], 'ocean'], paint: { 'fill-color': p.water } },
    { id: 'water', type: 'fill', ...water, filter: surfaceWater, paint: { 'fill-color': p.water } },
    // The pen cross-hatching. Both water sources share one world-anchored pattern, so overlaps line up.
    { id: 'ocean-hatching', type: 'fill', ...osm, 'source-layer': 'water',
      filter: ['==', ['get', 'class'], 'ocean'], paint: { 'fill-pattern': 'hand-sea', 'fill-opacity': 0.9 } },
    { id: 'water-hatching', type: 'fill', ...water, filter: surfaceWater, paint: { 'fill-pattern': 'hand-sea', 'fill-opacity': 0.9 } },
    { id: 'wetlands', type: 'fill', ...water, minzoom: SKETCH_ZOOM, filter: wetland,
      paint: { 'fill-pattern': 'hand-marsh', 'fill-opacity': fade(SKETCH_ZOOM, 11) } },
    // Rippled shores: pen lines set off the coast into the water, each fainter than the last.
    // NSTDB shoreline lines (from z11) know which side is water; tiled water polygon edges are never outlined.
    ...[[3, 0.55], [6.5, 0.35], [11, 0.2]].map(([offset, opacity], index): LayerSpecification => ({
      id: `shore-ripple-${index + 1}`, type: 'line', ...province, 'source-layer': 'waterways', minzoom: 11 + index * 0.5, filter: shoreFilter,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': p.mutedInk, 'line-width': 0.7, 'line-opacity': fade(11 + index * 0.5, 12 + index * 0.5, 0, opacity),
        'line-offset': ['interpolate', ['linear'], ['zoom'], 11, towardWater(offset * 0.6), 15, towardWater(offset * 1.4)],
        ...(index ? { 'line-dasharray': [6 + index * 4, 2 + index] } : {}) } })),
    { id: 'shoreline', type: 'line', ...province, 'source-layer': 'waterways', minzoom: 11, maxzoom: 12, filter: shoreFilter,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': p.ink, 'line-width': 1, 'line-opacity': 0.8 } },
    { id: 'shoreline-inked', type: 'line', ...province, 'source-layer': 'waterways', minzoom: 12, filter: shoreFilter,
      layout: { 'line-join': 'round' },
      paint: { 'line-pattern': 'hand-ink', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.8, 16, 3], 'line-opacity': 0.9 } },
    { id: 'waterways', type: 'line', ...province, 'source-layer': 'waterways', minzoom: SKETCH_ZOOM, maxzoom: LOCAL + 1,
      filter: ['match', description, streams, true, false],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], SKETCH_ZOOM, 0.5, 14, 1.2],
        'line-opacity': fade(SKETCH_ZOOM, 11.5, 0.4, 0.85) } },
    { id: 'waterways-inked', type: 'line', ...province, 'source-layer': 'waterways', minzoom: LOCAL + 1,
      filter: ['match', description, streams, true, false],
      layout: { 'line-join': 'round' },
      paint: { 'line-pattern': 'hand-ink-water', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.6, 17, 3] } },
    { id: 'buildings', type: 'fill', ...osm, 'source-layer': 'building', minzoom: LOCAL,
      paint: { 'fill-color': p.building, 'fill-outline-color': p.ink, 'fill-opacity': fade(LOCAL, LOCAL + 1, 0, 0.85) } },
    { id: 'boundaries', type: 'line', ...province, 'source-layer': 'boundaries',
      paint: { 'line-color': p.boundary, 'line-width': 1.2, 'line-dasharray': [5, 2, 1, 2], 'line-opacity': 0.6 } },
    // Roads: rust main routes and sepia byways as single pen lines, then double-line streets up close.
    { id: 'roads-inked-edge', type: 'line', ...roads, minzoom: LOCAL, filter: ['all', ordinaryRoad, ['!', tunnel]],
      layout: { 'line-join': 'round' },
      paint: { 'line-pattern': 'hand-ink-road', 'line-width': roadWidth(2.4), 'line-opacity': fade(LOCAL, LOCAL + 0.5) } },
    { id: 'tunnels', type: 'line', ...roads, minzoom: 11, filter: ['all', ordinaryRoad, tunnel],
      paint: { 'line-color': p.mutedInk, 'line-width': roadWidth(), 'line-dasharray': [3, 2], 'line-opacity': 0.6 } },
    { id: 'roads', type: 'line', ...roads, filter: ['all', ordinaryRoad, ['!', tunnel]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['step', ['zoom'], ['match', roadClass, majorRoads, p.highway, p.mutedInk], LOCAL, ['match', roadClass, majorRoads, '#e4bf94', p.road]],
        'line-width': roadWidth(),
        // Byways arrive with the sketch scale and local roads just before the streets.
        'line-opacity': ['interpolate', ['linear'], ['zoom'],
          9.5, ['match', roadClass, majorRoads, 0.8, 0], SKETCH_ZOOM, ['match', roadClass, majorRoads, 0.9, secondaryRoads, 0.6, 0],
          11.5, ['match', roadClass, majorRoads, 0.95, secondaryRoads, 0.7, 0], 12, ['match', roadClass, majorRoads, 0.95, 0.7], LOCAL, 1] } },
    // A treasure-map trail: tracks and paths in red-brown dashes, abandoned routes dotted.
    { id: 'tracks-and-paths', type: 'line', ...roads, minzoom: 12.5,
      filter: ['all', ['!', abandoned], ['any', nonOrdinary, ['match', roadClass, trackClasses, true, false]]],
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': p.path, 'line-width': ['interpolate', ['linear'], ['zoom'], 12.5, 1, 17, 2], 'line-dasharray': [2.2, 1.8], 'line-opacity': 0.9 } },
    { id: 'abandoned-routes', type: 'line', ...roads, minzoom: LOCAL, filter: abandoned,
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': p.path, 'line-width': 1.4, 'line-dasharray': [0.1, 2.4], 'line-opacity': 0.75 } },
    // The old railway mark: a pen line crossed by ties (a wide, short-dashed line).
    { id: 'railways', type: 'line', ...roads, minzoom: SKETCH_ZOOM, filter: ['==', roadClass, 'Active Rail Road'],
      paint: { 'line-color': p.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], SKETCH_ZOOM, 0.8, 15, 1.4], 'line-opacity': 0.85 } },
    { id: 'railway-ties', type: 'line', ...roads, minzoom: 11.5, filter: ['==', roadClass, 'Active Rail Road'],
      paint: { 'line-color': p.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 11.5, 4, 15, 7], 'line-dasharray': [0.18, 2.2], 'line-opacity': 0.8 } },
    { id: 'ferries', type: 'line', ...roads, minzoom: 11, filter: ['==', roadClass, 'Ferry Connector'],
      paint: { 'line-color': p.waterInk, 'line-width': 1.2, 'line-dasharray': [1, 3] } },
    // Parchment stains and fibres over everything drawn, beneath the lettering.
    { id: 'paper-grain', type: 'fill', source: 'paper', paint: { 'fill-pattern': 'hand-paper' } },
  ];

  // Later symbol layers are placed first and win collisions: towns, counties, main routes,
  // villages, then heights and water, with street names last.
  const roadNames = (id: string, classes: readonly string[], color: string = p.mutedInk): LayerSpecification => ({ id, type: 'symbol', ...roads, minzoom: LOCAL,
    filter: ['all', ['!', abandoned], ['match', roadClass, [...classes], true, false],
      ['match', ['get', 'street'], genericStreetNames, false, true], ['!=', ['coalesce', ['get', 'street'], ''], '']],
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'street'], 'text-font': [atlasFonts.hand],
      'text-size': ['interpolate', ['linear'], ['zoom'], LOCAL, ['match', roadClass, majorRoads, 12.5, 11.5], 17, ['match', roadClass, majorRoads, 15, 14]],
      'symbol-spacing': 320, 'text-padding': 2, 'symbol-sort-key': ['match', roadClass, majorRoads, 0, secondaryRoads, 1, 2] },
    paint: { 'text-color': color, ...halo } });
  const official = (kinds: readonly string[]): ExpressionSpecification =>
    ['all', ['==', ['get', 'status_ds'], 'Official - Official'], ['match', ['get', 'concise_ds'], [...kinds], true, false]];
  const sideAnchors = ['top', 'bottom', 'right', 'left'] as const;
  layers.push(
    roadNames('road-names', [...secondaryRoads, 'Local', ...trackClasses]),
    // Hachured ridges mark named heights from the regional view on; their names join later.
    { id: 'heights', type: 'symbol', ...names, minzoom: 8, filter: official(['Mountain']),
      layout: { 'icon-image': 'hand-mountain', 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 12, 1, 16, 1.4],
        'icon-padding': 4, 'symbol-sort-key': 5,
        'text-field': ['step', ['zoom'], '', 11, ['get', 'geoname']], 'text-font': lettering(atlasFonts.quillItalic, atlasFonts.hand),
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 13.5], 'text-anchor': 'top', 'text-offset': [0, 1.1],
        'text-max-width': 8, 'text-optional': true },
      paint: { 'icon-opacity': 0.9, 'text-color': p.mutedInk, ...halo } },
    { id: 'terrain-names', type: 'symbol', ...names, minzoom: 12, filter: official(['Cape', 'Island', 'Falls', 'Valley', 'Cliff']),
      layout: { 'text-field': ['get', 'geoname'], 'text-font': lettering(atlasFonts.quillItalic, atlasFonts.hand),
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 13.5], 'text-max-width': 8, 'text-padding': 2, 'symbol-sort-key': 4,
        'text-variable-anchor': [...sideAnchors], 'text-radial-offset': 0.2, 'text-justify': 'auto' },
      paint: { 'text-color': p.mutedInk, ...halo } },
    { id: 'water-names', type: 'symbol', ...names, minzoom: 9.5, filter: official(['Lake', 'River', 'Bay', 'Channel', 'Sea feature']),
      layout: { 'text-field': ['get', 'geoname'], 'text-font': lettering(atlasFonts.quillItalic, atlasFonts.hand),
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 15], 'text-letter-spacing': 0.04, 'text-max-width': 7,
        'text-padding': 2, 'symbol-sort-key': 3, 'text-variable-anchor': [...sideAnchors], 'text-radial-offset': 0.2, 'text-justify': 'auto' },
      paint: { 'text-color': p.waterInk, ...halo } },
    // Villages: names alone in the regional view, a little cottage beside each at the folksy scale.
    { id: 'village-names', type: 'symbol', ...names, minzoom: 9.5, maxzoom: LOCAL, filter: official(['Village', 'Unincorporated area']),
      layout: { 'text-field': ['get', 'geoname'], 'text-font': [atlasFonts.quill], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, LOCAL, 14],
        'text-max-width': 8, 'text-padding': 2, 'symbol-sort-key': 2,
        'text-variable-anchor': [...sideAnchors], 'text-radial-offset': 0.2, 'text-justify': 'auto' },
      paint: { 'text-color': p.ink, ...halo } },
    { id: 'village-cottages', type: 'symbol', ...names, minzoom: LOCAL, filter: official(['Village', 'Unincorporated area']),
      layout: { 'icon-image': 'hand-house', 'icon-size': ['interpolate', ['linear'], ['zoom'], LOCAL, 1, 17, 1.5],
        'text-field': ['get', 'geoname'], 'text-font': [atlasFonts.handBold], 'text-size': ['interpolate', ['linear'], ['zoom'], LOCAL, 15, 17, 19],
        'text-max-width': 8, 'text-padding': 2, 'symbol-sort-key': 2,
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 1.1, 'text-justify': 'auto' },
      paint: { 'text-color': p.ink, ...halo } },
    roadNames('major-road-names', majorRoads, p.highway),
    { id: 'administrative-names', type: 'symbol', ...names, minzoom: 6, maxzoom: SKETCH_ZOOM,
      filter: official(['Other municipal/district area - major agglomeration']),
      layout: { 'text-field': ['get', 'geoname'], 'text-font': [atlasFonts.quill], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 9, 14],
        'text-transform': 'uppercase', 'text-letter-spacing': 0.35, 'text-max-width': 12, 'text-padding': 8, 'symbol-sort-key': 1 },
      paint: { 'text-color': p.mutedInk, ...halo, 'text-opacity': 0.8 } },
    // Towns carry the ringed mark of the old charts until the streets take over.
    { id: 'town-names', type: 'symbol', ...names, minzoom: 6, filter: official(['City', 'Town']),
      layout: { 'icon-image': ['step', ['zoom'], 'hand-town', 12, 'hand-house'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 11, 1, 16, 1.6],
        'text-field': ['get', 'geoname'], 'text-font': lettering(atlasFonts.quill, atlasFonts.handBold),
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 13, 10, 16.5, 14, 21], 'text-letter-spacing': 0.03,
        'text-max-width': 8, 'text-padding': 6, 'symbol-sort-key': 0,
        'text-variable-anchor': ['right', 'left', 'top', 'bottom'], 'text-radial-offset': 0.9, 'text-justify': 'auto' },
      paint: { 'text-color': p.ink, ...halo, 'text-halo-width': 2.2 } },
  );
  return layers;
}

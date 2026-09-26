import type { ContextLayerDescriptor } from '../layers/contextLayerTypes';
export const RHODENA_SOURCE = 'https://novascotia.ca/nse/ea/rhodena-wind-project/';
export const RHODENA_POSITION = { latitude: 45.785, longitude: -61.405, zoom: 11 };
export const RHODENA_BOUNDS: [[number, number], [number, number]] = [[45.69, -61.52], [45.90, -61.28]];
const common = {
  category: 'rhodena-project', delivery: 'rhodena', serviceUrl: '',
  sourceUrl: RHODENA_SOURCE, licenceUrl: RHODENA_SOURCE, licence: 'public-facts',
  attribution: 'Rhodena: factual extracts and approximate annotations from ABO Energy / Strum Consulting, 2024 EA. Original source rights retained.',
  sourceDate: '2024 assessed layout · sources checked September 26, 2026',
  scale: 'Published points or explicitly approximate drawing traces; no final-design verification',
  coverage: 'Rhodena project near Creignish; incomplete evidence is not absence',
  minZoom: 7, maxZoom: 23, opacity: 1, zIndex: 245,
  exportOptions: { transparent: true },
} as const;
export const rhodenaLayers = [
  { ...common, id: 'rhodena-visibility', name: 'Rhodena · turbine visibility',
    webCaveat: 'Preliminary terrain-only viewsheds for T1–T6. Choose a viewpoint to compare all six; trees, buildings and final design are not modelled.',
    sourceUrl: 'https://registry.opendata.aws/terrain-tiles/', licenceUrl: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md', licence: 'canada-open',
    sourceDate: 'Mapzen terrain retrieved September 26, 2026; source acquisition dates vary',
    attribution: 'Mapzen terrain. Contains information licensed under the Open Government Licence – Canada. SRTM/GMTED2010: USGS. ETOPO1: NOAA.',
    legend: [{label:'Potential tip visibility · green',color:'#177e70'},{label:'Terrain screened · grey',color:'#646971'},{label:'Near terrain threshold · amber',color:'#cd8b24'},{label:'Uncoloured: not assessed / outside range'}] },
  { ...common, id: 'rhodena-turbines', name: 'Rhodena · six proposed turbines',
    webCaveat: 'T1–T6, 2024 assessment: up to 42 MW, up to 200 m above ground. Tap a point for its source and coordinates.',
    legend: [{label:'Published turbine coordinate',color:'#b24719'}] },
  { ...common, id: 'rhodena-infrastructure', name: 'Rhodena · proposed infrastructure',
    webCaveat: 'Approximate roads, collectors and transmission route. Two conflicting substation records are shown separately. Not final engineering or permission to enter.',
    legend: [{label:'Proposed new road · dashed orange',color:'#b24719'},{label:'Existing road to upgrade · dashed brown',color:'#79553a'},{label:'Collector · dashed pink',color:'#b42d86'},{label:'Transmission · dashed purple',color:'#7350b6'},{label:'Drawing substation · orange; noise-model substation · purple',color:'#7350b6'}] },
  { ...common, id: 'rhodena-study', name: 'Rhodena · study area overview',
    webCaveat: 'Simplified 1:50,000 outline. Fine boundary detail and holes omitted. This is the study area, not the construction footprint or assessment area.',
    legend: [{label:'Approximate study outline · dashed; not a parcel boundary',color:'#a56a15'}] },
  { ...common, id: 'rhodena-receptors', name: 'Rhodena · assessment receptors',
    webCaveat: 'Anonymous A–G shadow-model inputs; A is also noise R1. Not all homes. Predictions retain their model date and assumptions.',
    legend: [{label:'Published anonymous receptor',color:'#176879'}] },
  { ...common, id: 'rhodena-distance-rings', name: 'Rhodena · illustrative 1 km rings',
    webCaveat: 'Horizontal distance from the six published turbine positions. Not legal setbacks, noise contours, shadow footprints or impact predictions.',
    legend: [{label:'Illustrative 1 km distance · dotted',color:'#6d7480'}] },
] as const satisfies readonly ContextLayerDescriptor[];
export type RhodenaLayerId = typeof rhodenaLayers[number]['id'];
export function isRhodenaLayerId(id: string): id is RhodenaLayerId { return rhodenaLayers.some(layer => layer.id === id); }
export function rhodenaFeatureInLayer(kind: string, layer: RhodenaLayerId): boolean {
  if (layer === 'rhodena-turbines' || layer === 'rhodena-distance-rings') return kind === 'turbine';
  if (layer === 'rhodena-study') return kind === 'study';
  if (layer === 'rhodena-receptors') return kind === 'receptor';
  return ['substation','model-substation','collector','transmission','new-road','upgrade'].includes(kind);
}

import type { LayerCategoryId } from '../layers/layerCategories';
import type { ShareLayerId } from '../services/mapShareState';

/**
 * The /rhodena page is the research map with a shorter panel: the project
 * layers first, then the land, water, road and forest context a neighbour is
 * likely to ask about. Every layer keeps its own source, licence gate and
 * caveats; this list only decides which rows the panel offers.
 */
export const rhodenaFocusCategoryIds = [
  'rhodena-project',
  'background-maps',
  'land-property',
  'water-terrain',
  'roads-places',
  'forestry-ecology',
  'environment-hazards',
] as const satisfies readonly LayerCategoryId[];

export const rhodenaFocusLayerIds: ReadonlySet<ShareLayerId> = new Set<ShareLayerId>([
  'rhodena-visibility',
  'rhodena-turbines',
  'rhodena-infrastructure',
  'rhodena-study',
  'rhodena-receptors',
  'rhodena-distance-rings',
  'modern',
  'ns-aerial',
  'ns-topographic',
  'nsprd',
  'crown-lands',
  'protected-conservation-areas',
  'buildings',
  'zoning-inverness',
  'water-features',
  'contours',
  'lidar-hillshade',
  'wam-relative-wetness',
  'wam-predicted-flow',
  'roads',
  'place-names',
  'transmission-lines',
  'substations',
  'lookouts-rest-areas',
  'old-growth-policy',
  'forest-leading-species',
  'forest-height',
  'flood-risk',
  'ns-well-logs',
]);

export function inRhodenaFocus(id: string): boolean {
  return rhodenaFocusLayerIds.has(id as ShareLayerId);
}

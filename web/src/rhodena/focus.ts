import type { LayerCategoryId } from '../layers/layerCategories';
import type { ShareLayerId } from '../services/mapShareState';
import { contextLayerCatalog } from '../layers/contextLayerCatalog';

/**
 * The /rhodena page is the research map with a shorter panel: the project
 * layers first, then the shared land, water, ecology and resource sources.
 * Every layer keeps its own source, licence gate and
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
  'geology-resources',
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
  'waterfalls',
  'published-river-flood-zones',
  'coastal-flood-current',
  'coastal-flood-2050',
  'coastal-flood-2100',
  'arsenic-risk-wells',
  'uranium-risk-wells',
  'manganese-risk-wells',
  'surficial-aquifers',
  ...contextLayerCatalog
    .filter(({ category }) => rhodenaFocusCategoryIds.some(id => id === category))
    .map(({ id }) => id),
]);

export function inRhodenaFocus(id: string): boolean {
  return rhodenaFocusLayerIds.has(id as ShareLayerId);
}

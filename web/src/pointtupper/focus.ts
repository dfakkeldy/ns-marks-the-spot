import type { FocusBounds } from '../focus/focusDefinition';
import { contextLayerIdsInCategories } from '../focus/focusDefinition';
import type { LayerCategoryId } from '../layers/layerCategories';
import type { MapPosition, ShareLayerId } from '../services/mapShareState';

/**
 * The /pointtupper page is the research map with a short panel: the key
 * places first, then the grid, water and land context around the Strait.
 * Every layer keeps its own source, licence gate and caveats; these lists
 * only decide which rows the panel offers.
 */
export const pointTupperFocusCategoryIds = [
  'point-tupper-site',
  'roads-places',
  'water-terrain',
  'land-property',
  'environment-hazards',
  'background-maps',
] as const satisfies readonly LayerCategoryId[];

export const pointTupperFocusLayerIds: ReadonlySet<ShareLayerId> = new Set<ShareLayerId>([
  'modern',
  'ns-aerial',
  'ns-topographic',
  'transmission-lines',
  'substations',
  'pipelines',
  'wharves-coastal-structures',
  'water-features',
  'contours',
  'roads',
  'main-roads',
  'place-names',
  'nsprd',
  'crown-lands',
  'buildings',
  'zoning-richmond',
  'protected-conservation-areas',
  'flood-risk',
  'coastal-flood-current',
  'coastal-flood-2050',
  'coastal-flood-2100',
  // The key places, and every water and background layer, including later additions.
  ...contextLayerIdsInCategories(['point-tupper-site', 'water-terrain', 'background-maps']),
]);

/**
 * Never offered here, even where a category would: the fishing pins belong to
 * /fishing and would read as part of the site brief.
 */
export const pointTupperFocusDeniedLayerIds: ReadonlySet<ShareLayerId> = new Set<ShareLayerId>([
  'fishing-spots',
  'stocked-waters',
]);

/** The terminal, the generating station, Landrie Lake and Port Hawkesbury. */
export const POINT_TUPPER_BOUNDS: FocusBounds = [[45.560, -61.385], [45.622, -61.300]];

export const POINT_TUPPER_POSITION: MapPosition = { latitude: 45.591, longitude: -61.3425, zoom: 13 };

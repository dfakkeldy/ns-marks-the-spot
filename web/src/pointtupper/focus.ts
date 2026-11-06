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
  'canadian-wind-turbines',
  'planned-wind-turbines',
  'transmission-lines',
  'substations',
  'pipelines',
  'tanks',
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

/**
 * A close view of each mapped place a summary line is about, for its "Show on
 * map" pill: the jetty, the generating station and Landrie Lake (positions
 * from sites.geojson), and the Point Tupper wind farm's twelve turbines (the
 * extent of NRCan's records, read November 5, 2026).
 */
export const POINT_TUPPER_PLACE_BOUNDS: Readonly<Record<'terminal' | 'power' | 'water' | 'turbines', FocusBounds>> = {
  terminal: [[45.5676, -61.3525], [45.5797, -61.3345]],
  power: [[45.5809, -61.3571], [45.5929, -61.3391]],
  water: [[45.5806, -61.3293], [45.5986, -61.2973]],
  turbines: [[45.5609, -61.3434], [45.5788, -61.2908]],
};

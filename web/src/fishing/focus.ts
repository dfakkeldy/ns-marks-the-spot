import type { LayerCategoryId } from '../layers/layerCategories';
import { FISHING_SPOTS_COVERAGE } from '../layers/fishingLayers';
import type { FocusBounds } from '../focus/focusDefinition';
import { contextLayerIdsInCategories } from '../focus/focusDefinition';
import type { MapPosition, ShareLayerId } from '../services/mapShareState';

/**
 * The /fishing page is the research map with a water-first panel. Every layer
 * keeps its own source, licence gate and caveats; these lists only decide
 * which rows the panel offers.
 */
export const fishingFocusCategoryIds = [
  'water-terrain',
  'land-property',
  'roads-places',
  'environment-hazards',
  'background-maps',
] as const satisfies readonly LayerCategoryId[];

/**
 * Never offered here, even where a category would: next to fishing pins the
 * aquatic species-at-risk layers read as directions to Endangered salmon.
 * They stay in the full map's catalogue.
 */
export const fishingFocusDeniedLayerIds: ReadonlySet<ShareLayerId> = new Set<ShareLayerId>([
  'dfo-aquatic-critical-habitat',
  'dfo-aquatic-sar-range',
  'ns-sar-core-habitat',
]);

export const fishingFocusLayerIds: ReadonlySet<ShareLayerId> = new Set<ShareLayerId>([
  'modern',
  'ns-aerial',
  'water-features',
  'waterfalls',
  'contours',
  'crown-lands',
  'nsprd',
  'roads',
  'main-roads',
  'place-names',
  'protected-conservation-areas',
  'campgrounds',
  'lookouts-rest-areas',
  'mapped-gates',
  'tourism-listed-operators',
  'flood-risk',
  'weather-radar',
  // Every water and background layer, including later additions. Land,
  // roads and hazards are listed one by one: most of their rows have nothing
  // to do with fishing.
  ...contextLayerIdsInCategories(['water-terrain', 'background-maps']),
]);

/** The spots' coverage, which `check:fishing` enforces on every pin. */
export const FISHING_BOUNDS: FocusBounds = [
  [FISHING_SPOTS_COVERAGE.south, FISHING_SPOTS_COVERAGE.west],
  [FISHING_SPOTS_COVERAGE.north, FISHING_SPOTS_COVERAGE.east],
];

export const FISHING_POSITION: MapPosition = {
  latitude: (FISHING_SPOTS_COVERAGE.south + FISHING_SPOTS_COVERAGE.north) / 2,
  longitude: (FISHING_SPOTS_COVERAGE.west + FISHING_SPOTS_COVERAGE.east) / 2,
  zoom: 9,
};

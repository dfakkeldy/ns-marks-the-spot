import type { FocusDefinition, FocusHiddenFeature, FocusShareParam } from '../focus/focusDefinition';
import { FishingMapKey } from '../themes/setupMapKeys';
import { FISHING_BOUNDS, FISHING_POSITION, fishingFocusCategoryIds, fishingFocusDeniedLayerIds, fishingFocusLayerIds } from './focus';
import { FishingBrandMark, FishingFocusHero, FishingFooterNote } from './FishingFocusChrome';
import { FishingPanel } from './FishingPanel';

/** The /fishing page (`web/fishing.html`, `<App focus="fishing" />`). */
export const fishingFocusDefinition: FocusDefinition = {
  id: 'fishing',
  themeId: 'fishing',
  pageTitle: 'Fishing spots — Cape Breton and the Strait of Canso',
  categoryIds: fishingFocusCategoryIds,
  allowLayerIds: fishingFocusLayerIds,
  denyLayerIds: fishingFocusDeniedLayerIds,
  initialPosition: FISHING_POSITION,
  fitBounds: FISHING_BOUNDS,
  // Zoom 9 holds every spot on a desktop map but not on a phone.
  fitOnOpen: true,
  shareParams: new Set<FocusShareParam>(['month', 'spot']),
  hiddenFeatures: new Set<FocusHiddenFeature>(['tax-sale', 'my-maps', 'setup-picker']),
  backgroundSwitch: false,
  // The map key's width and margin (components/SetupMapKey.css).
  mapOverlayInset: 264,
  // The half-height sheet's share of a phone's height, so the spots open in the map above it.
  phoneSheetShare: 0.59,
  chrome: {
    sheetTitle: 'Spots & layers',
    Hero: FishingFocusHero,
    Panel: FishingPanel,
    MapOverlay: FishingMapKey,
    brand: { label: 'Fishing spots — summary and spot list', Mark: FishingBrandMark },
    FooterNote: FishingFooterNote,
  },
};

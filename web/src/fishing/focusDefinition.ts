import type { FocusDefinition, FocusHiddenFeature, FocusShareParam } from '../focus/focusDefinition';
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
  chrome: {
    Hero: FishingFocusHero,
    Panel: FishingPanel,
    brand: { label: 'Fishing spots — summary and spot list', Mark: FishingBrandMark },
    FooterNote: FishingFooterNote,
  },
};

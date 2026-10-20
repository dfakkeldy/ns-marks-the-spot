import type { FocusDefinition, FocusHiddenFeature } from '../focus/focusDefinition';
import { POINT_TUPPER_BOUNDS, POINT_TUPPER_POSITION, pointTupperFocusCategoryIds, pointTupperFocusDeniedLayerIds, pointTupperFocusLayerIds } from './focus';
import { PointTupperBrandMark, PointTupperFocusHero, PointTupperFooterNote, PointTupperTimelinePanel } from './PointTupperFocusChrome';

/** The /pointtupper page (`web/pointtupper.html`, `<App focus="pointtupper" />`). */
export const pointTupperFocusDefinition: FocusDefinition = {
  id: 'pointtupper',
  themeId: 'point-tupper',
  pageTitle: 'Point Tupper — data-centre site brief',
  categoryIds: pointTupperFocusCategoryIds,
  allowLayerIds: pointTupperFocusLayerIds,
  denyLayerIds: pointTupperFocusDeniedLayerIds,
  initialPosition: POINT_TUPPER_POSITION,
  fitBounds: POINT_TUPPER_BOUNDS,
  // Zoom 13 holds the terminal, the station and Landrie Lake on a desktop map but not on a phone.
  fitOnOpen: true,
  hiddenFeatures: new Set<FocusHiddenFeature>(['tax-sale', 'my-maps', 'setup-picker']),
  backgroundSwitch: true,
  chrome: {
    Hero: PointTupperFocusHero,
    Panel: PointTupperTimelinePanel,
    brand: { label: 'Point Tupper — summary and layers', Mark: PointTupperBrandMark },
    FooterNote: PointTupperFooterNote,
  },
};

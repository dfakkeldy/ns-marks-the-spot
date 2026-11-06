import type { FocusDefinition, FocusHiddenFeature } from '../focus/focusDefinition';
import { POINT_TUPPER_BOUNDS, POINT_TUPPER_PHONE_BOUNDS, POINT_TUPPER_PHONE_SHEET_SHARE, POINT_TUPPER_POSITION, pointTupperFocusCategoryIds, pointTupperFocusDeniedLayerIds, pointTupperFocusLayerIds } from './focus';
import { PointTupperBrandMark, PointTupperFocusHero, PointTupperFooterNote } from './PointTupperFocusChrome';
import { PointTupperMapLegend } from './PointTupperMapLegend';

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
  // Twice the map's default: a few large industrial holdings, as on the park's own maps.
  parcelOutlineWidth: 2.6,
  // The map key's width and margin (pointTupperPage.css).
  mapOverlayInset: 264,
  // The phone sheet's arrival height (pointTupperPage.css), so the site opens in view above it.
  phoneSheetShare: POINT_TUPPER_PHONE_SHEET_SHARE,
  phoneFitBounds: POINT_TUPPER_PHONE_BOUNDS,
  chrome: {
    Hero: PointTupperFocusHero,
    MapOverlay: PointTupperMapLegend,
    sheetTitle: 'Site brief & layers',
    brand: { label: 'Point Tupper brief: summary and layers', Mark: PointTupperBrandMark },
    FooterNote: PointTupperFooterNote,
  },
};

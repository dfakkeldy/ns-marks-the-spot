import type { FocusDefinition, FocusHiddenFeature } from '../focus/focusDefinition';
import { RHODENA_BOUNDS, RHODENA_POSITION } from './catalog';
import { rhodenaFocusCategoryIds, rhodenaFocusDeniedLayerIds, rhodenaFocusLayerIds } from './focus';
import { RhodenaBrandMark, RhodenaFocusHero, RhodenaFooterNote } from './RhodenaFocusChrome';

/** The /rhodena page (`web/rhodena.html`, `<App focus="rhodena" />`). */
export const rhodenaFocusDefinition: FocusDefinition = {
  id: 'rhodena',
  themeId: 'rhodena',
  pageTitle: 'Rhodena Wind — proposed turbine map',
  categoryIds: rhodenaFocusCategoryIds,
  allowLayerIds: rhodenaFocusLayerIds,
  // Every context layer in the page's categories, including ones added
  // later, is offered (see rhodena/focus.ts), except the fishing layers.
  denyLayerIds: rhodenaFocusDeniedLayerIds,
  initialPosition: RHODENA_POSITION,
  fitBounds: RHODENA_BOUNDS,
  hiddenFeatures: new Set<FocusHiddenFeature>(['tax-sale', 'my-maps', 'setup-picker']),
  backgroundSwitch: true,
  chrome: {
    Hero: RhodenaFocusHero,
    brand: { label: 'Rhodena Wind — summary and layers', Mark: RhodenaBrandMark },
    FooterNote: RhodenaFooterNote,
  },
};

import { describe, expect, it } from 'vitest';
import { focusOffersLayer } from '../focus/focusDefinition';
import { focusDefinitions, focusForTheme } from '../focus/registry';
import { fishingLayers } from '../layers/fishingLayers';
import { layerCategoryByLayerId } from '../layers/layerCategories';
import { rhodenaLayers } from '../rhodena/catalog';
import { rhodenaFocusDefinition } from '../rhodena/focusDefinition';
import { builtInMapThemes } from '../themes/mapThemes';
import { fishingFocusDefinition } from './focusDefinition';
import { FISHING_BOUNDS, fishingFocusCategoryIds } from './focus';

const offers = (id: string) => focusOffersLayer(fishingFocusDefinition, id);

describe('the /fishing focus page', () => {
  it('is registered on its own setup', () => {
    expect(focusDefinitions.fishing).toBe(fishingFocusDefinition);
    expect(fishingFocusDefinition.themeId).toBe('fishing');
    expect(focusForTheme('fishing')).toBe(fishingFocusDefinition);
    expect(fishingFocusDefinition.pageTitle).toBe('Fishing spots — Cape Breton and the Strait of Canso');
  });

  it('offers every fishing layer and everything the Fishing setup turns on', () => {
    for (const { id } of fishingLayers) expect(offers(id), id).toBe(true);
    for (const id of builtInMapThemes.find(({ id: theme }) => theme === 'fishing')!.layerIds) expect(offers(id), id).toBe(true);
    for (const id of ['crown-lands', 'nsprd', 'contours', 'waterfalls', 'protected-conservation-areas', 'weather-radar']) expect(offers(id), id).toBe(true);
  });

  it('never offers the aquatic species-at-risk layers beside the pins', () => {
    for (const id of ['dfo-aquatic-critical-habitat', 'dfo-aquatic-sar-range', 'ns-sar-core-habitat']) {
      expect(fishingFocusDefinition.denyLayerIds.has(id as never), id).toBe(true);
      expect(offers(id), id).toBe(false);
    }
  });

  it('leaves out research surfaces unrelated to fishing', () => {
    for (const id of ['fletcher', 'mineral-tenure', 'provincial-districts-2026', 'zoning-halifax', 'rhodena-turbines', 'transmission-lines', 'forest-height']) {
      expect(offers(id), id).toBe(false);
    }
    expect(fishingFocusCategoryIds).not.toContain('tax-sale');
    expect(fishingFocusCategoryIds).not.toContain('my-maps');
    expect(fishingFocusCategoryIds[0]).toBe(layerCategoryByLayerId['fishing-spots']);
    expect([...fishingFocusDefinition.hiddenFeatures].sort()).toEqual(['my-maps', 'setup-picker', 'tax-sale']);
  });

  it('opens fitted to the spots, and carries only its month and spot in links', () => {
    expect(fishingFocusDefinition.fitOnOpen).toBe(true);
    expect(fishingFocusDefinition.fitBounds).toBe(FISHING_BOUNDS);
    expect(FISHING_BOUNDS).toEqual([[45.3, -62.2], [46.4, -60.5]]);
    expect([...fishingFocusDefinition.shareParams!].sort()).toEqual(['month', 'spot']);
    expect(fishingFocusDefinition.backgroundSwitch).toBe(false);
    expect(fishingFocusDefinition.chrome.Panel).toBeDefined();
  });
});

describe('/rhodena and the fishing layers', () => {
  it('keeps every fishing layer off the Rhodena panel (decided 2026-10-13)', () => {
    for (const { id } of fishingLayers) {
      expect(rhodenaFocusDefinition.denyLayerIds.has(id), id).toBe(true);
      expect(focusOffersLayer(rhodenaFocusDefinition, id), id).toBe(false);
    }
  });

  it('still offers Rhodena its own layers and the shared water context', () => {
    for (const { id } of rhodenaLayers) expect(focusOffersLayer(rhodenaFocusDefinition, id), id).toBe(true);
    for (const id of ['water-features', 'nshn-spines', 'wsc-hydrometric-stations', 'wharves-coastal-structures']) {
      expect(focusOffersLayer(rhodenaFocusDefinition, id), id).toBe(true);
    }
  });
});

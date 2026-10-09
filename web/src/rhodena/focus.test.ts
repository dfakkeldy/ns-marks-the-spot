import { describe, expect, it } from 'vitest';
import { layerCategoryByLayerId } from '../layers/layerCategories';
import { isShareLayerId } from '../services/mapShareState';
import { builtInMapThemes } from '../themes/mapThemes';
import { rhodenaLayers } from './catalog';
import { biodiversityLayers } from '../layers/biodiversityLayers';
import { communityResearchLayers } from '../layers/communityResearchLayers';
import { waterResearchLayers } from '../layers/waterResearchLayers';
import { inRhodenaFocus, rhodenaFocusCategoryIds, rhodenaFocusLayerIds } from './focus';

describe('Rhodena page layer focus', () => {
  it('offers only real layers, each in a category the page shows', () => {
    for (const id of rhodenaFocusLayerIds) {
      expect(isShareLayerId(id), id).toBe(true);
      expect(rhodenaFocusCategoryIds, id).toContain(layerCategoryByLayerId[id as keyof typeof layerCategoryByLayerId]);
    }
  });

  it('keeps every project layer and everything the Rhodena setup turns on', () => {
    for (const { id } of rhodenaLayers) expect(inRhodenaFocus(id), id).toBe(true);
    const theme = builtInMapThemes.find(({ id }) => id === 'rhodena')!;
    for (const id of theme.layerIds) expect(inRhodenaFocus(id), id).toBe(true);
  });

  it('offers the shared research sources and existing land/water context on Rhodena', () => {
    for (const { id } of [...biodiversityLayers, ...communityResearchLayers, ...waterResearchLayers]) expect(inRhodenaFocus(id), id).toBe(true);
    for (const id of ['crown-harvest-plans', 'forest-height', 'forest-leading-species', 'bedrock-geology', 'surficial-geology', 'source-water-well-field-protection']) expect(inRhodenaFocus(id), id).toBe(true);
  });

  it('leaves out research surfaces unrelated to the project', () => {
    for (const id of ['fletcher', 'provincial-districts-2026', 'mineral-tenure', 'weather-radar', 'zoning-halifax']) {
      expect(inRhodenaFocus(id), id).toBe(false);
    }
    expect(rhodenaFocusCategoryIds).not.toContain('tax-sale');
    expect(rhodenaFocusCategoryIds).not.toContain('my-maps');
    expect(rhodenaFocusCategoryIds[0]).toBe('rhodena-project');
  });
});

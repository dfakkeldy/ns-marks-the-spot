import { expect, it } from 'vitest';
import { parcelBoundaryRenderer, parcelOutlineColor, parcelStyleForFeature } from './parcelStyle';
const context = { selectedPid: null, showTaxSale: false, taxSalePids: new Set<string>(), showHistoricalTaxSales: false, historicalTaxSalePids: new Set<string>() };
it('uses mustard on Fletcher and bright yellow on dark maps and imagery', () => {
  expect(parcelOutlineColor('fletcher', false)).toBe('#cdb760');
  expect(parcelOutlineColor('night', false)).toBe('#ffe66d');
  expect(parcelOutlineColor('day', true)).toBe('#ffe66d');
  expect(parcelStyleForFeature(undefined, { ...context, outlineColor: '#cdb760' })).toMatchObject({ color: '#cdb760', fillOpacity: 0 });
});
it('renders service boundaries with no fill or labels', () => {
  const [{ drawingInfo }] = JSON.parse(parcelBoundaryRenderer('#cdb760'));
  expect(drawingInfo.showLabels).toBe(false);
  expect(drawingInfo.renderer.symbol).toMatchObject({ style: 'esriSFSNull', outline: { color: [205, 183, 96, 255] } });
});

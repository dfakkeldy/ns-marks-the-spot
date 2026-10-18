import { expect, it } from 'vitest';
import { parcelBoundaryRenderer, parcelOutlineColor, parcelStyleForFeature } from './parcelStyle';
const context = { selectedPid: null, showTaxSale: false, taxSalePids: new Set<string>(), showHistoricalTaxSales: false, historicalTaxSalePids: new Set<string>() };
it('uses mustard on Fletcher and bright yellow on dark maps and imagery', () => {
  expect(parcelOutlineColor('fletcher', false)).toBe('#d4bd4d');
  expect(parcelOutlineColor('night', false)).toBe('#ffe66d');
  expect(parcelOutlineColor('day', true)).toBe('#ffe66d');
  expect(parcelStyleForFeature(undefined, { ...context, outlineColor: '#d4bd4d' })).toMatchObject({ color: '#d4bd4d', fillOpacity: 0 });
});
it('renders service boundaries with no fill or labels', () => {
  const [{ drawingInfo }] = JSON.parse(parcelBoundaryRenderer('#d4bd4d'));
  expect(drawingInfo.showLabels).toBe(false);
  expect(drawingInfo.renderer.symbol).toMatchObject({ style: 'esriSFSNull', outline: { color: [212, 189, 77, 255] } });
});

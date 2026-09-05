import { expect, it } from 'vitest';
import { buildMapShareUrl, parseMapShareState } from '../services/mapShareState';

it.each(['day', 'night', 'osm'] as const)('round-trips the captured %s basemap without changing location', (basemapStyle) => {
  const state = { ...parseMapShareState('https://example.com/?layers=modern&position=46.1,-60.7,12'), basemapStyle };
  expect(parseMapShareState(buildMapShareUrl('https://example.com/', state))).toEqual(state);
});
it('leaves legacy links unspecified and ignores unsupported basemaps', () => {
  expect(parseMapShareState('https://example.com/')).not.toHaveProperty('basemapStyle');
  expect(parseMapShareState('https://example.com/?basemap=unknown')).not.toHaveProperty('basemapStyle');
});

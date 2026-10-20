import { describe, expect, it } from 'vitest';
import { fishingPagePath } from './pagePath';

describe('fishingPagePath', () => {
  it('drops the trailing slash and keeps the path the visitor arrived on', () => {
    expect(fishingPagePath('/fishmap/')).toBe('/fishmap');
    expect(fishingPagePath('/fishing/')).toBe('/fishing');
    expect(fishingPagePath('/apps/nsmarksthespot/map/fishing/')).toBe('/apps/nsmarksthespot/map/fishing');
  });

  it('leaves a path without a trailing slash, and every other path, alone', () => {
    for (const path of ['/fishmap', '/fishing', '/apps/nsmarksthespot/map/fishing', '/', '/rhodena/', '/fishing/spots.geojson', '/fishmaps/']) {
      expect(fishingPagePath(path), path).toBeNull();
    }
  });
});

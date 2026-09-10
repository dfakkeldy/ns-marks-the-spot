import { afterEach, describe, expect, it, vi } from 'vitest';
import { fletcherFullSheetsRoot } from './fletcherFullSheets';
import { fletcherTileUrl } from './fletcherLayer';

afterEach(() => vi.unstubAllEnvs());
describe('full sheets preview', () => {
  it('requires explicit configuration and leaves the existing sheets separate', () => {
    vi.stubEnv('VITE_FLETCHER_FULL_SHEETS_TILE_BASE_URL', undefined);
    expect(fletcherFullSheetsRoot()).toBeNull();
    vi.stubEnv('VITE_FLETCHER_FULL_SHEETS_TILE_BASE_URL', 'http://127.0.0.1:4198');
    expect(fletcherFullSheetsRoot()).toBe('http://127.0.0.1:4198/fletcher-full-sheets-20260909.3');
    expect(fletcherTileUrl(19, 'https://tiles.example.test')).not.toContain('corridor');
  });
  it('uses the existing source URL restrictions', () => {
    expect(() => fletcherFullSheetsRoot('https://user:secret@example.test')).toThrow();
    expect(() => fletcherFullSheetsRoot('http://example.test')).toThrow();
    expect(fletcherFullSheetsRoot(' ')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fletcherCorridorRoot } from './fletcherCorridor';
import { fletcherTileUrl } from './fletcherLayer';

afterEach(() => vi.unstubAllEnvs());
describe('corrected corridor preview', () => {
  it('requires explicit configuration and leaves the existing sheets separate', () => {
    vi.stubEnv('VITE_FLETCHER_CORRIDOR_TILE_BASE_URL', undefined);
    expect(fletcherCorridorRoot()).toBeNull();
    vi.stubEnv('VITE_FLETCHER_CORRIDOR_TILE_BASE_URL', 'http://127.0.0.1:4198');
    expect(fletcherCorridorRoot()).toBe('http://127.0.0.1:4198/fletcher-corridor-20260908.1');
    expect(fletcherTileUrl(19, 'https://tiles.example.test')).not.toContain('corridor');
  });
  it('uses the existing source URL restrictions', () => {
    expect(() => fletcherCorridorRoot('https://user:secret@example.test')).toThrow();
    expect(() => fletcherCorridorRoot('http://example.test')).toThrow();
    expect(fletcherCorridorRoot(' ')).toBeNull();
  });
});

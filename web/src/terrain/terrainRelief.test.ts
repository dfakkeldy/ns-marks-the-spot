import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTerrainTile } from './terrainRelief';

const tile = new URL('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/1349/1458.png');
afterEach(() => { vi.unstubAllGlobals(); });

describe('terrain tile fetches', () => {
  it('retries a dropped connection and a server error before giving up', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('tile', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const response = await fetchTerrainTile(tile, new AbortController().signal, 3, 1);
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('answers a missing tile at once and reports a persistent drop', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    expect((await fetchTerrainTile(tile, new AbortController().signal, 3, 1)).status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')));
    await expect(fetchTerrainTile(tile, new AbortController().signal, 3, 1)).rejects.toThrow('Load failed');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('stops retrying once the tile is no longer wanted', async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(() => { controller.abort(); return Promise.reject(new DOMException('Aborted', 'AbortError')); });
    vi.stubGlobal('fetch', fetch);
    await expect(fetchTerrainTile(tile, controller.signal, 3, 1)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

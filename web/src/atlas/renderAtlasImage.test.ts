import { describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ remove: vi.fn(), fit: vi.fn(), fail: false }));
vi.mock('maplibre-gl', () => ({ Map: class {
  listeners: Record<string, (event?: unknown) => void> = {};
  canvas = document.createElement('canvas');
  on(type: string, callback: (event?: unknown) => void) { this.listeners[type] = callback; }
  off(type: string) { delete this.listeners[type]; }
  getCanvas() { return this.canvas; }
  fitBounds() { mocked.fit(); queueMicrotask(() => this.listeners.error?.({ error: { message: 'Tile source failed' } })); }
  remove() { mocked.remove(); }
}, setWorkerUrl: vi.fn() }));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: 'worker.js' }));
import { atlasCropRect, atlasRenderSize, renderAtlasImage } from './renderAtlasImage';

const bounds = { west: -62, east: -60, north: 47, south: 45 };
describe('atlas export geometry', () => {
  it('crops fitBounds padding and accounts for backing canvas scale', () => {
    const project = ([lng, lat]: [number, number]) => ({ x: 100 + (lng + 62) * 100, y: 25 + (47 - lat) * 50 });
    expect(atlasCropRect(bounds, project, { width: 400, height: 150 }, { width: 800, height: 300 }))
      .toEqual({ x: 200, y: 50, width: 400, height: 200 });
  });
  it('rejects a viewport that does not contain the requested extent', () => {
    expect(() => atlasCropRect(bounds, () => ({ x: -1, y: 0 }), { width: 400, height: 150 }, { width: 400, height: 150 })).toThrow('aligned');
  });
  it('bounds GPU allocation while retaining the requested aspect ratio', () => {
    expect(atlasRenderSize({ widthPx: 8192, heightPx: 4096 })).toEqual({ width: 2048, height: 1024 });
    expect(atlasRenderSize({ widthPx: 600, heightPx: 800 })).toEqual({ width: 600, height: 800 });
  });
  it('does not allocate a renderer for an already cancelled export', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(renderAtlasImage(bounds, { widthPx: 600, heightPx: 800 }, 'night', controller.signal)).rejects.toThrow();
  });
});

it('reports a source failure and disposes the map and hidden container', async () => {
  const before = document.body.childElementCount;
  await expect(renderAtlasImage(bounds, { widthPx: 600, heightPx: 800 }, 'day')).rejects.toMatchObject({ message: 'Tile source failed' });
  expect(mocked.remove).toHaveBeenCalledOnce();
  expect(document.body.childElementCount).toBe(before);
});

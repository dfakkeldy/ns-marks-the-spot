import { act, render, screen } from '@testing-library/react';
import L from 'leaflet';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RhodenaVisibility } from './RhodenaVisibility';

let map: L.Map;
vi.mock('react-leaflet', () => ({ useMap: () => map }));
vi.mock('./terrainData', () => ({ loadRhodenaTerrain: async () => ({
  meta: { width: 2, height: 2, bounds: [[45, -62], [46, -61]] }, values: new Int16Array(4),
}) }));
class SilentWorker {
  static instances: SilentWorker[] = [];
  onmessage?: (event: MessageEvent) => void;
  onerror?: () => void;
  terminated = false;
  constructor() { SilentWorker.instances.push(this); }
  postMessage() {}
  terminate() { this.terminated = true; }
}
beforeEach(() => {
  vi.useFakeTimers();
  SilentWorker.instances = [];
  vi.stubGlobal('Worker', SilentWorker);
  const container = document.createElement('div');
  document.body.append(container);
  map = L.map(container).setView([45.8, -61.4], 12);
});
afterEach(() => {
  map.remove(); map.getContainer().remove();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
async function mount() {
  await act(async () => { render(<RhodenaVisibility onPickingChange={() => {}} />); });
  return SilentWorker.instances[0];
}
it('stops a silent calculation and offers a retry without claiming visibility', async () => {
  const worker = await mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(120_001); });
  expect(screen.getByRole('button', { name: 'Retry terrain' })).toBeInTheDocument();
  expect(worker.terminated).toBe(true);
  expect(map.getContainer().querySelector('.rhodena-viewshed-raster')).toBeNull();
});
it('turns an image rendering failure into a retryable unassessed result', async () => {
  const worker = await mount();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => { throw Error('graphics unavailable'); });
  await act(async () => {
    worker.onmessage?.(new MessageEvent('message', { data: { width: 1, height: 1, rgba: new Uint8ClampedArray(4) } }));
  });
  expect(screen.getByRole('button', { name: 'Retry terrain' })).toBeInTheDocument();
  expect(worker.terminated).toBe(true);
  expect(map.getContainer().querySelector('.rhodena-viewshed-raster')).toBeNull();
});

it('ignores a late failed-worker reply and keeps a successful retry after the deadline', async () => {
  const first = await mount();
  const pixels = new MessageEvent('message', { data: { width: 1, height: 1, rgba: new Uint8ClampedArray([23, 126, 112, 110]) } });
  await act(async () => { await vi.advanceTimersByTimeAsync(120_001); });
  await act(async () => { first.onmessage?.(pixels); });
  expect(map.getContainer().querySelector('.rhodena-viewshed-raster')).toBeNull();
  await act(async () => { screen.getByRole('button', { name: 'Retry terrain' }).click(); });
  const next = SilentWorker.instances[1];
  await act(async () => { next.onmessage?.(pixels); });
  expect(map.getContainer().querySelector('.rhodena-viewshed-raster')).not.toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(120_001); });
  expect(screen.queryByRole('button', { name: 'Retry terrain' })).toBeNull();
  expect(next.terminated).toBe(true);
});

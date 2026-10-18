import { afterEach, expect, it, vi } from 'vitest';
import type { Protocol } from 'pmtiles';

const registered = vi.hoisted(() => ({ handler: undefined as Protocol['tilev4'] | undefined }));
vi.mock('maplibre-gl', () => ({
  Map: class {},
  setWorkerUrl: vi.fn(),
  addProtocol: (_name: string, handler: Protocol['tilev4']) => { registered.handler = handler; },
}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: 'worker.js' }));
import './mapLibreRuntime';

afterEach(() => vi.unstubAllGlobals());

it('fetches the archive again after a failed header instead of retaining its rejected promise', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  const request = { url: 'pmtiles://https://example.com/province.pmtiles', type: 'json' as const };
  await expect(registered.handler!(request, new AbortController())).rejects.toThrow();
  await expect(registered.handler!(request, new AbortController())).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2);
});

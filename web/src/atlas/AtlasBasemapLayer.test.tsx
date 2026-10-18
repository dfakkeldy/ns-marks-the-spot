import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import L from 'leaflet';
import AtlasBasemapLayer from './AtlasBasemapLayer';

const renderer = vi.hoisted(() => ({ events: new Map<string, (event: unknown) => void>() }));
vi.mock('./mapLibreRuntime', () => ({ Map: class {
  on(name: string, handler: (event: unknown) => void) { renderer.events.set(name, handler); }
  once() {}
  resize() {}
  jumpTo() {}
  triggerRepaint() {}
  remove() {}
} }));
vi.mock('react-leaflet', () => ({ useMap: () => leaflet }));
const container = document.createElement('div');
const leaflet = {
  getContainer: () => container,
  getCenter: () => ({ lat: 45.8, lng: -61.4 }),
  getZoom: () => 12,
  getSize: () => L.point(390, 700),
  on() {}, off() {},
};
afterEach(() => { cleanup(); vi.useRealTimers(); renderer.events.clear(); });

it('clears a slow-loading warning when the map finishes loading', () => {
  vi.useFakeTimers();
  const status = vi.fn();
  render(<AtlasBasemapLayer mode="day" onStatus={status} />);
  act(() => vi.advanceTimersByTime(25000));
  expect(status).toHaveBeenLastCalledWith({ status: 'error' });
  act(() => renderer.events.get('idle')!({}));
  expect(status).toHaveBeenLastCalledWith({ status: 'ready' });
});

it('does not treat a cancelled request as a missing map', () => {
  const status = vi.fn();
  render(<AtlasBasemapLayer mode="day" onStatus={status} />);
  act(() => renderer.events.get('error')!({ error: new DOMException('Cancelled', 'AbortError') }));
  act(() => renderer.events.get('idle')!({}));
  expect(status).not.toHaveBeenCalledWith({ status: 'error' });
  expect(status).toHaveBeenLastCalledWith({ status: 'ready' });
});

it('preserves a real source failure even when the remaining map becomes idle', () => {
  const status = vi.fn();
  render(<AtlasBasemapLayer mode="day" onStatus={status} />);
  act(() => renderer.events.get('error')!({ error: new Error('HTTP 503') }));
  act(() => renderer.events.get('idle')!({}));
  expect(status).toHaveBeenLastCalledWith({ status: 'error', message: 'A map source failed to load (HTTP 503). View may be incomplete.' });
});

it('does not overwrite a named failure when the loading watchdog expires', () => {
  vi.useFakeTimers();
  const status = vi.fn();
  render(<AtlasBasemapLayer mode="day" onStatus={status} />);
  act(() => renderer.events.get('error')!({ sourceId: 'province', error: new Error('HTTP 503') }));
  act(() => vi.advanceTimersByTime(26000));
  expect(status).toHaveBeenLastCalledWith({ status: 'error', message: 'Provincial Atlas failed to load (HTTP 503). View may be incomplete.' });
});

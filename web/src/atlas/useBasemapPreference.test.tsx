import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useBasemapPreference } from './useBasemapPreference';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('follows the system until an explicit style is chosen', () => {
  let changed: ((event: { matches: boolean }) => void) | undefined;
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: (_: string, listener: typeof changed) => { changed = listener; }, removeEventListener() {} })));
  const { result } = renderHook(() => useBasemapPreference());
  expect(result.current.style).toBe('day');
  act(() => changed?.({ matches: true }));
  expect(result.current.style).toBe('night');
  act(() => result.current.setPreference('day'));
  expect(result.current.style).toBe('day');
  expect(document.documentElement.dataset.mapAppearance).toBe('day');
});
it('honours a shared style ahead of stored preference and survives blocked storage', () => {
  localStorage.setItem('ns-marks-the-spot:basemap', 'night');
  const { result } = renderHook(() => useBasemapPreference('osm'));
  expect(result.current.style).toBe('osm');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  act(() => result.current.setPreference('day'));
  expect(result.current.style).toBe('day');
});
it('treats the Fletcher style as a light appearance and keeps it as an explicit choice', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
  const { result } = renderHook(() => useBasemapPreference('fletcher'));
  expect(result.current.style).toBe('fletcher');
  expect(document.documentElement.dataset.mapAppearance).toBe('day');
  act(() => result.current.setPreference('system'));
  expect(result.current.style).toBe('night');
});

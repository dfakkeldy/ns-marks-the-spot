import { describe, expect, it } from 'vitest';
import { FLETCHER_STYLE_NOTE, basemapSource, isBasemapStyle, resolveBasemapStyle } from './basemap';

describe('atlas styles', () => {
  it('accepts the Fletcher style as an explicit choice and never as the system default', () => {
    expect(isBasemapStyle('fletcher')).toBe(true);
    expect(isBasemapStyle('sepia')).toBe(false);
    expect(resolveBasemapStyle('fletcher', true)).toBe('fletcher');
    expect(resolveBasemapStyle('system', false)).toBe('day');
    expect(resolveBasemapStyle('system', true)).toBe('night');
  });
  it('names the Fletcher style and tells print sources it is not a historical map', () => {
    expect(basemapSource('fletcher').name).toBe('NS Marks Atlas · Fletcher');
    expect(basemapSource('fletcher').attribution).toContain(FLETCHER_STYLE_NOTE);
    expect(basemapSource('day').name).toBe('NS Marks Atlas · Day');
    expect(basemapSource('day').attribution).not.toContain('historical map');
  });
});

import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtlasMap } from './AtlasMap';
import { buildAtlasStyle } from './style';

const mocks = vi.hoisted(() => ({ setPaint: vi.fn(), setStyle: vi.fn() }));
vi.mock('maplibre-gl', () => ({
  Map: class {
    touchZoomRotate = { disableRotation() {} };
    addControl() {}
    on() {}
    remove() {}
    resize() {}
    jumpTo() {}
    isStyleLoaded() { return false; } // Style exists, but tiles are still loading.
    getStyle() { return { layers: [{ id: 'fletcher-16' }] }; }
    setPaintProperty = mocks.setPaint;
    setStyle = mocks.setStyle;
  },
  NavigationControl: class {}, ScaleControl: class {}, AttributionControl: class {},
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('historical opacity during map loading', () => {
  it('applies the latest opacity without replacing the style while tiles load', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const props = { style: buildAtlasStyle('day'), camera: { longitude: -61.393, latitude: 46.071, zoom: 12 }, onView: vi.fn(), onStatus: vi.fn() };
    const { rerender } = render(<AtlasMap {...props} historicalOpacity={0.5} />);
    rerender(<AtlasMap {...props} historicalOpacity={0.75} />);
    expect(mocks.setPaint).toHaveBeenLastCalledWith('fletcher-16', 'raster-opacity', 0.75);
    expect(mocks.setStyle).not.toHaveBeenCalled();
  });
});

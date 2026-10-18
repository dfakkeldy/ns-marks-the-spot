import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import { TerrainCameraControls } from './TerrainCameraControls';

// A stateful camera isolates the control contract from WebGL. Frames are held
// to reproduce the hosted software renderer's multi-second frame stalls.
class Camera {
  pitch = 50;
  bearing = 0;
  listeners = new Set<() => void>();
  getPitch() { return this.pitch; }
  getBearing() { return this.bearing; }
  on(_event: string, listener: () => void) { this.listeners.add(listener); }
  off(_event: string, listener: () => void) { this.listeners.delete(listener); }
  jumpTo({ pitch = this.pitch, bearing = this.bearing }: { pitch?: number; bearing?: number }) {
    this.pitch = pitch;
    this.bearing = bearing;
    this.listeners.forEach(listener => listener());
  }
}

afterEach(() => vi.unstubAllGlobals());

it('publishes tilt and direction commands without waiting for a graphics frame', () => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const camera = new Camera();
  const { container } = render(<TerrainCameraControls map={camera as unknown as Map} />);
  const tilt = screen.getByRole('slider', { name: 'Map tilt' });
  fireEvent.change(tilt, { target: { value: '0' } });
  expect(camera.getPitch()).toBe(0);
  expect(tilt).toHaveValue('0');
  fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
  expect(container.querySelector('.terrain-bearing output')).toHaveTextContent('30°');
  fireEvent.click(screen.getByRole('button', { name: 'North up' }));
  expect(container.querySelector('.terrain-bearing output')).toHaveTextContent('0°');
  fireEvent.change(tilt, { target: { value: '65' } });
  expect(camera.getPitch()).toBe(65);
  expect(tilt).toHaveValue('65');
});

it('still coalesces gesture updates and reads the latest camera when the frame arrives', () => {
  let nextFrame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { nextFrame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const camera = new Camera();
  render(<TerrainCameraControls map={camera as unknown as Map} />);
  act(() => { camera.jumpTo({ pitch: 20 }); camera.jumpTo({ pitch: 35 }); });
  expect(screen.getByRole('slider')).toHaveValue('50');
  act(() => nextFrame!(0));
  expect(screen.getByRole('slider')).toHaveValue('35');
});

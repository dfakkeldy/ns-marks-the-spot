import { describe, expect, it } from 'vitest';
import { DEFAULT_RELIEF, displayHeight, reliefTileUrl, transformDemRgba, type DemEncoding, type ReliefSettings } from './reliefMath';

const settings: ReliefSettings = { exaggeration: 2, lowEnabled: true, lowExaggeration: 10, lowThreshold: 20 };

function encode(height: number, encoding: DemEncoding, alpha = 255): number[] {
  const value = Math.round(encoding === 'mapbox' ? (height + 10000) * 10 : (height + 32768) * 256);
  return [value >>> 16, (value >>> 8) & 255, value & 255, alpha];
}
function decode(bytes: Uint8ClampedArray, encoding: DemEncoding, index = 0): number {
  const value = bytes[index] * 65536 + bytes[index + 1] * 256 + bytes[index + 2];
  return encoding === 'mapbox' ? value * 0.1 - 10000 : bytes[index] * 256 + bytes[index + 1] + bytes[index + 2] / 256 - 32768;
}

describe('display-only elevation exaggeration', () => {
  it('uses the requested defaults and supports overall exaggeration through 10×', () => {
    expect(DEFAULT_RELIEF).toEqual({ exaggeration: 1, lowEnabled: false, lowExaggeration: 5, lowThreshold: 20 });
    expect(displayHeight(150, { ...DEFAULT_RELIEF, exaggeration: 10 })).toBe(1500);
    expect(displayHeight(-12, settings)).toBe(-24);
  });
  it.each([[0, 0], [5, 50], [20, 200], [21, 202], [100, 360]])('maps %s m to %s m with independent lower and upper slopes', (height, expected) => {
    expect(displayHeight(height, settings)).toBe(expected);
  });
  it.each([20, 100] as const)('is continuous at 0 m and %s m, including when the lower slope is smaller', threshold => {
    for (const lowExaggeration of [1, 10]) {
      const controls = { ...settings, lowThreshold: threshold, lowExaggeration };
      for (const height of [0, threshold]) {
        const centre = displayHeight(height, controls);
        expect(Math.abs(displayHeight(height - 1e-8, controls) - centre)).toBeLessThan(1e-6);
        expect(Math.abs(displayHeight(height + 1e-8, controls) - centre)).toBeLessThan(1e-6);
      }
      expect(displayHeight(threshold, controls)).toBe(threshold * lowExaggeration);
      expect(displayHeight(threshold + 10, controls)).toBe(threshold * lowExaggeration + 20);
    }
  });
  it('returns the original template when the low range is off or scales match', () => {
    const template = './dem/{z}/{x}/{y}.png';
    expect(reliefTileUrl(template, DEFAULT_RELIEF, 'mapbox')).toBe(template);
    expect(reliefTileUrl(template, { ...settings, lowExaggeration: 2 }, 'mapbox')).toBe(template);
  });
  it('keeps explicit XYZ and round-trips an opaque source template and settings', () => {
    const template = './dem/{z}/{x}/{y}.png?key=a&suffix=%2B';
    const result = reliefTileUrl(template, settings, 'terrarium');
    expect(result.startsWith('nsmts-relief://tiles/{z}/{x}/{y}?')).toBe(true);
    const query = new URL(result).searchParams;
    expect(query.get('template')).toBe(template);
    expect(query.get('encoding')).toBe('terrarium');
    expect(JSON.parse(query.get('settings')!)).toEqual(settings);
  });
  it.each(['mapbox', 'terrarium'] as const)('rewrites %s pixels without mutating input, alpha, no-data or negative depths', encoding => {
    const input = new Uint8ClampedArray([
      ...encode(5, encoding), ...encode(20, encoding), ...encode(100, encoding, 128),
      ...encode(-12, encoding), ...encode(0, encoding), ...encode(100, encoding, 0),
    ]);
    const original = input.slice();
    const output = transformDemRgba(input, settings, encoding);
    expect(input).toEqual(original);
    expect(output).not.toBe(input);
    expect(decode(output, encoding, 0)).toBeCloseTo(25, 6);
    expect(decode(output, encoding, 4)).toBeCloseTo(100, 6);
    expect(decode(output, encoding, 8)).toBeCloseTo(180, 6);
    expect(output[11]).toBe(128);
    expect(output.slice(12)).toEqual(input.slice(12));
    expect(decode(output, encoding, 12) * settings.exaggeration).toBeCloseTo(-24, 6);
    expect(transformDemRgba(input, DEFAULT_RELIEF, encoding)).toEqual(input);
    expect(transformDemRgba(input, { ...settings, lowExaggeration: 2 }, encoding)).toEqual(input);
  });
  it.each(['mapbox', 'terrarium'] as const)('retains %s encoding precision after normalization', encoding => {
    const controls = { ...settings, exaggeration: 3, lowExaggeration: 7 };
    const step = encoding === 'mapbox' ? 0.1 : 1 / 256;
    const input = new Uint8ClampedArray(encode(13.7, encoding));
    const exact = displayHeight(decode(input, encoding), controls) / controls.exaggeration;
    expect(Math.abs(decode(transformDemRgba(input, controls, encoding), encoding) - exact)).toBeLessThanOrEqual(step / 2 + 1e-8);
  });
  it.each(['mapbox', 'terrarium'] as const)('clamps at %s RGB capacity instead of wrapping', encoding => {
    const maximum = new Uint8ClampedArray([255, 255, 255, 255]);
    expect(transformDemRgba(maximum, { ...settings, exaggeration: 1 }, encoding)).toEqual(maximum);
    expect(transformDemRgba(new Uint8ClampedArray([0, 0, 0, 255]), settings, encoding)).toEqual(new Uint8ClampedArray([0, 0, 0, 255]));
  });
  it('rejects malformed pixels and controls rather than dividing by zero', () => {
    expect(() => transformDemRgba(new Uint8ClampedArray(3), settings, 'mapbox')).toThrow('complete RGBA');
    expect(() => reliefTileUrl('x', { ...settings, exaggeration: 0 }, 'mapbox')).toThrow('scales');
    expect(() => reliefTileUrl('x', { ...settings, lowExaggeration: NaN }, 'mapbox')).toThrow('scales');
  });
});

/** Display-only relief controls. Source elevations and measurements stay intact. */
export type ReliefSettings = {
  exaggeration: number;
  lowEnabled: boolean;
  lowExaggeration: number;
  lowThreshold: 20 | 100;
};

export const DEFAULT_RELIEF: ReliefSettings = {
  exaggeration: 1, lowEnabled: false, lowExaggeration: 5, lowThreshold: 20,
};

export type DemEncoding = 'mapbox' | 'terrarium';

export function validateReliefSettings(settings: ReliefSettings): void {
  if (![settings.exaggeration, settings.lowExaggeration].every(value => Number.isFinite(value) && value >= 1 && value <= 10)
    || typeof settings.lowEnabled !== 'boolean' || ![20, 100].includes(settings.lowThreshold)) {
    throw new Error('Relief requires scales from 1 to 10 and a 20 m or 100 m threshold.');
  }
}

/** Continuous at sea-level and the threshold; the upper slope is still overall. */
export function displayHeight(height: number, settings: ReliefSettings): number {
  if (!settings.lowEnabled || height <= 0) return height * settings.exaggeration;
  return settings.lowExaggeration * Math.min(height, settings.lowThreshold)
    + settings.exaggeration * Math.max(0, height - settings.lowThreshold);
}

/** Keep XYZ placeholders in the protocol path; the original template is opaque. */
export function reliefTileUrl(template: string, settings: ReliefSettings, encoding: DemEncoding): string {
  validateReliefSettings(settings);
  if (!settings.lowEnabled || settings.lowExaggeration === settings.exaggeration) return template;
  const query = new URLSearchParams({ template, encoding, settings: JSON.stringify({
    exaggeration: settings.exaggeration, lowEnabled: settings.lowEnabled,
    lowExaggeration: settings.lowExaggeration, lowThreshold: settings.lowThreshold,
  }) });
  return `nsmts-relief://tiles/{z}/{x}/{y}?${query}`;
}

/**
 * Return a fresh RGBA array with display DEM values normalized by the renderer's
 * overall exaggeration. Both encodings use all RGB bits; alpha=0 is left alone
 * as no-data, and partial alpha is retained. Clamp only to encoding capacity.
 */
export function transformDemRgba(input: Uint8ClampedArray, settings: ReliefSettings, encoding: DemEncoding): Uint8ClampedArray {
  validateReliefSettings(settings);
  if (input.length % 4 !== 0) throw new Error('A DEM image must contain complete RGBA pixels.');
  if (encoding !== 'mapbox' && encoding !== 'terrarium') throw new Error('Unsupported DEM encoding.');
  const output = new Uint8ClampedArray(input);
  if (!settings.lowEnabled || settings.lowExaggeration === settings.exaggeration) return output;
  const multiplier = encoding === 'mapbox' ? 10 : 256;
  const offset = encoding === 'mapbox' ? 10000 : 32768;
  for (let i = 0; i < input.length; i += 4) {
    if (input[i + 3] === 0) continue;
    const height = (input[i] * 65536 + input[i + 1] * 256 + input[i + 2]) / multiplier - offset;
    // The low-elevation control never changes underwater or zero-height pixels.
    if (height <= 0) continue;
    const normalized = displayHeight(height, settings) / settings.exaggeration;
    const encoded = Math.max(0, Math.min(16777215, Math.round((normalized + offset) * multiplier)));
    output[i] = encoded >>> 16;
    output[i + 1] = (encoded >>> 8) & 255;
    output[i + 2] = encoded & 255;
  }
  return output;
}

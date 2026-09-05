import { afterEach, describe, expect, it } from 'vitest';
import { basemapSource } from './basemap';
import { provincialReceipt, provincialReceiptUrl, provincialTileUrl } from './provincial';
import { exportAttributionLines } from '../print/pdf/attributionLines';

afterEach(() => { window.history.replaceState(null, '', '/'); });

describe('provincial archive provenance', () => {
  it('resolves the archive and receipt beneath the deployed map subpath', () => {
    window.history.replaceState(null, '', '/apps/nsmarksthespot/map/?position=45,-61,14');
    expect(provincialTileUrl()).toBe(`pmtiles://${window.location.origin}/apps/nsmarksthespot/map/atlas/provincial/${provincialReceipt.archive}`);
    expect(provincialReceiptUrl()).toBe(`${window.location.origin}/apps/nsmarksthespot/map/atlas/provincial/source.json`);
    expect(provincialTileUrl()).not.toContain('position=');
  });

  it('carries snapshot identity, dates and scale into generated PDF attribution', () => {
    const text = exportAttributionLines([basemapSource('day')]).join(' ');
    expect(text).toContain(provincialReceipt.archive);
    expect(text).toContain(provincialReceiptUrl());
    for (const source of provincialReceipt.sources) expect(text).toContain(source.released.slice(0, 10));
    expect(text).toContain('1:10,000');
    expect(text).toContain('2 m');
    expect(text).toContain('do not establish access permission');
    expect(text).toContain('Open Government Licence');
    expect(text).toContain('OpenStreetMap contributors');
  });

  it('pins the same archive when hosted separately from the website', () => {
    expect(provincialTileUrl('https://tiles.example.test/province')).toBe(`pmtiles://https://tiles.example.test/province/${provincialReceipt.archive}`);
    expect(() => provincialTileUrl('file:///tmp/tiles/')).toThrow('public HTTP(S)');
  });

  it('does not credit the provincial archive when the user selects OSM', () => {
    const text = exportAttributionLines([basemapSource('osm')]).join(' ');
    expect(text).not.toContain(provincialReceipt.archive);
    expect(text).not.toContain('Open Government Licence');
  });
});

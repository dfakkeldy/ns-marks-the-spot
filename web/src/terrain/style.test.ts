import { describe, expect, it } from 'vitest';
import { buildTerrainStyle, type TerrainReceipt } from './style';

const receipt: TerrainReceipt = { bounds: [-61.6, 45.74, -61.21, 45.93], terrainMinZoom: 8, terrainMaxZoom: 12,
  historical: { coordinates: [[-61.6, 45.93], [-61.21, 45.93], [-61.21, 45.74], [-61.6, 45.74]] } };

describe('Judique reference layer contract', () => {
  it.each([false, true])('draws roads, bridges and accepted parcels above water (aerial accepted: %s)', accepted => {
    const style = buildTerrainStyle(receipt, accepted, 'historical', 1, true);
    const ids = style.layers.map(layer => layer.id);
    expect(ids.indexOf('water')).toBeGreaterThan(ids.indexOf('contours'));
    expect(ids.indexOf('surface-road-edge')).toBeGreaterThan(ids.indexOf('hydro'));
    expect(ids.indexOf('bridge-road-edge')).toBeGreaterThan(ids.indexOf('surface-roads'));
    expect(ids.at(-1)).toBe('parcels');
    expect(ids.indexOf('contours')).toBeGreaterThan(ids.indexOf('historical'));
    if (accepted) expect(ids.indexOf('contours')).toBeGreaterThan(ids.indexOf('aerial'));
  });
  it('creates no property-boundary requests without separate licence acceptance', () => {
    const style = buildTerrainStyle(receipt, true);
    expect(style.sources).not.toHaveProperty('parcels');
    expect(JSON.stringify(style)).not.toContain('PLAN_NSPRD');
    expect(style.sources.water).toMatchObject({ type: 'geojson', data: './terrain/judique/water.geojson' });
  });
  it('does not create any aerial source until the provincial terms are accepted', () => {
    const style = buildTerrainStyle(receipt, false);
    expect(style.sources).not.toHaveProperty('aerial');
    expect(JSON.stringify(style)).not.toContain('BASE_NSODB');
  });
  it('uses the recorded georeferenced corners rather than stretching the sheet to the terrain extent', () => {
    const style = buildTerrainStyle(receipt, true);
    expect(style.sources.historical).toMatchObject({ type: 'image', coordinates: receipt.historical.coordinates });
    expect(style.terrain).toEqual({ source: 'elevation', exaggeration: 1 });
  });
});

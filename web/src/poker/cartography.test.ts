import { describe, it, expect } from 'vitest';
import { waterStyle, roadStyle } from './cartography';
import { atlasPalettes } from '../atlas/palette';
describe('bounded Atlas source classes', () => {
  it('does not paint mapped swamps, wharves or dams as open water', () => {
    for (const label of ['Lake Water polygon','Coast River Water polygon']) expect(waterStyle(label).fillColor).toBe(atlasPalettes.day.water);
    for (const label of ['Swamp Area polygon','Wharf polygon','Dam polygon']) expect(waterStyle(label).fillColor).not.toBe(atlasPalettes.day.water);
  });
  it('keeps tracks and abandoned roads distinct from ordinary roads', () => {
    expect(roadStyle('Track','TRACK').dashArray).toBeTruthy();
    expect(roadStyle('Local','ROAD - Abandoned - Local').dashArray).toBeTruthy();
    expect(roadStyle('Local','ROAD - Local',true).opacity).toBe(1);
    expect(roadStyle('Driveway','DRIVEWAY',true).opacity).toBe(0);
  });
});

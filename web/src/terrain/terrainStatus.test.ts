import { expect, it } from 'vitest';
import { terrainFailureMessage } from './terrainStatus';

it('keeps a mirrored source name and HTTP status', () => {
  expect(terrainFailureMessage({ sourceId: 'leaf-123', error: new Error('Map tile HTTP 503') }, 'Property boundaries'))
    .toBe('Property boundaries failed to load (HTTP 503). View may be incomplete.');
});
it('recognizes the DEM even when MapLibre omits its source ID', () => {
  expect(terrainFailureMessage({ error: { url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/1/1/1.png', status: 429 } }))
    .toContain('Mapzen terrain failed to load (HTTP 429)');
});
it('retains an unknown source identifier without inventing a name', () => {
  expect(terrainFailureMessage({ sourceId: 'unrecognized', error: new Error('network') })).toContain('Map source unrecognized');
});

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import { FletcherFeaturesLayer } from './FletcherFeaturesLayer';

const fixture = JSON.parse(readFileSync('public/fletcher-features/reviewed.geojson', 'utf8'));
const svgDescriptor = Object.getOwnPropertyDescriptor(L.Browser, 'svg')!;
beforeEach(() => { Object.defineProperty(L.Browser, 'svg', { ...svgDescriptor, value: true }); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture })); });
afterEach(() => { cleanup(); Object.defineProperty(L.Browser, 'svg', svgDescriptor); vi.unstubAllGlobals(); });
function layer(onStatus = vi.fn()) {
  return <MapContainer center={[45.8787475, -61.4906198]} zoom={15}><FletcherFeaturesLayer onStatus={onStatus} /></MapContainer>;
}
describe('reviewed Fletcher features', () => {
  it('selects the corrected church and exposes separate reading and placement evidence', async () => {
    const status = vi.fn(); render(layer(status));
    const marker = await screen.findByTitle('R.C. Church · approximate Fletcher location');
    fireEvent.click(marker);
    expect(await screen.findByText('Approximate location · locally corrected')).toBeVisible();
    expect(screen.getByText(/Reading: clear/)).toBeVisible();
    expect(screen.getByRole('img', { name: /Original Fletcher lettering.*R.C. Church/ })).toHaveAttribute('src', '/fletcher-features/excerpts/F19-JUD-015.jpg');
    fireEvent.click(screen.getByText('Placement and source evidence'));
    expect(screen.getByText(/east of Highway 19, not either TPS prediction/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Corrected church reference' })).toHaveAttribute('href', 'https://www.openstreetmap.org/node/1325630467');
    expect(status).toHaveBeenLastCalledWith(`${fixture.features.length} reviewed annotations · digitization in progress`);
  });
  it('opens both ambiguous services through one keyboard-accessible group', async () => {
    render(layer());
    const group = await screen.findByRole('button', { name: 'Shop / P.O. · approximate Fletcher group' });
    fireEvent.keyDown(group, { key: 'Enter' });
    await waitFor(() => expect(document.querySelectorAll('.fletcher-feature-evidence')).toHaveLength(2));
    expect(screen.getByRole('heading', { name: 'Shop' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'P.O.' })).toBeVisible();
  });
  it('keeps source failure distinct from empty coverage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const status=vi.fn(); render(layer(status));
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('Historical features unavailable. Toggle off and on to retry.'));
    expect(document.querySelector('.fletcher-feature-marker')).toBeNull();
  });
  it('rejects lettering or unreviewed placement instead of drawing a site', async () => {
    const unreviewed=structuredClone(fixture);unreviewed.features[0].properties.placement_status='deferred';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,json:async()=>unreviewed}));
    const status=vi.fn();render(layer(status));
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('Historical features unavailable. Toggle off and on to retry.'));
    expect(document.querySelector('.fletcher-feature-marker')).toBeNull();
  });
});

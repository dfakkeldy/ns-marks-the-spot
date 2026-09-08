import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapContainer } from 'react-leaflet';
import { FletcherFullSheetsPreview } from './FletcherFullSheetsPreview';
import type { MapRenderMode } from './parcelStyle';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
function preview(mode: MapRenderMode = 'interactive') {
  return <MapContainer center={[45.74742, -61.4635]} zoom={17}><FletcherFullSheetsPreview renderMode={mode} /></MapContainer>;
}
describe('full sheets review control', () => {
  it('does not expose an unconfigured preview or add imagery to print captures', () => {
    vi.stubEnv('VITE_FLETCHER_FULL_SHEETS_TILE_BASE_URL', undefined);
    const view = render(preview());
    expect(screen.queryByRole('checkbox')).toBeNull();
    vi.stubEnv('VITE_FLETCHER_FULL_SHEETS_TILE_BASE_URL', 'http://127.0.0.1:4198');
    view.rerender(preview('print'));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.querySelector('.fletcher-full-sheets-tiles')).toBeNull();
  });
  it('removes and restores tiles with its own toggle and cleans up for print', () => {
    vi.stubEnv('VITE_FLETCHER_FULL_SHEETS_TILE_BASE_URL', 'http://127.0.0.1:4198');
    const view = render(preview());
    const check = screen.getByRole('checkbox', {name:'Fletcher · full sheets'});
    expect(document.querySelector('.fletcher-full-sheets-tiles')).not.toBeNull();
    fireEvent.click(check);
    expect(document.querySelector('.fletcher-full-sheets-tiles')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Hidden');
    fireEvent.click(check);
    expect(document.querySelector('.fletcher-full-sheets-tiles')).not.toBeNull();
    view.rerender(preview('print'));
    expect(document.querySelector('.fletcher-full-sheets-tiles')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

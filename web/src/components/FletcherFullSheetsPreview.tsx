import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { FLETCHER_FULL_SHEETS_BOUNDS, fletcherFullSheetsRoot } from '../layers/fletcherFullSheets';
import { FLETCHER_LAYER_Z_INDEX } from './mapPanes';
import type { MapRenderMode } from './parcelStyle';

/** Local review control; absent unless this build explicitly supplies a tile host. */
export function FletcherFullSheetsPreview({ renderMode }: { renderMode: MapRenderMode }) {
  const map = useMap();
  useEffect(() => {
    if (renderMode === 'print') return;
    const root = fletcherFullSheetsRoot();
    if (!root) return;
    const bounds = L.latLngBounds(FLETCHER_FULL_SHEETS_BOUNDS);
    const tiles = L.tileLayer(`${root}/{z}/{x}/{y}.png`, {
      bounds, minZoom: 8, maxNativeZoom: 15, maxZoom: 23,
      noWrap: true, opacity: 0.85, keepBuffer: 1,
      zIndex: FLETCHER_LAYER_Z_INDEX + 1, className: 'fletcher-full-sheets-tiles',
      attribution: '<a href="https://www.davidrumsey.com/">David Rumsey Map Collection / Stanford</a> · <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/">CC BY-NC-SA 3.0</a> · georeferenced, cropped',
    });
    const control = new L.Control({ position: 'bottomleft' });
    const panel = L.DomUtil.create('section', 'fletcher-full-sheets-preview');
    panel.setAttribute('aria-label', 'Full Fletcher sheets preview');
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);
    const label = document.createElement('label');
    const enabled = document.createElement('input');
    enabled.type = 'checkbox'; enabled.checked = true;
    label.append(enabled, ' Fletcher · full sheets'); panel.append(label);
    const note = document.createElement('p');
    note.textContent = 'Cape Mabou · Mabou · Judique · Hawkesbury. Complete sheets; approximate alignment and gaps at some joins.';
    panel.append(note);
    const opacityLabel = document.createElement('label');
    opacityLabel.textContent = 'Opacity';
    const opacity = document.createElement('input');
    opacity.type = 'range'; opacity.min = '0'; opacity.max = '100'; opacity.value = '85';
    opacityLabel.append(opacity); panel.append(opacityLabel);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); panel.append(status);
    const source = document.createElement('a'); source.href = `${root}/source.json`;
    source.textContent = 'Source and accuracy'; source.target = '_blank'; source.rel = 'noopener'; panel.append(source);
    const credits = document.createElement('p');
    credits.append('Rumsey Map Collection / Stanford · ');
    const licence = document.createElement('a');
    licence.href = 'https://creativecommons.org/licenses/by-nc-sa/3.0/';
    licence.textContent = 'CC BY-NC-SA 3.0'; licence.target = '_blank'; licence.rel = 'noopener';
    credits.append(licence); panel.append(credits);
    const exportNote = document.createElement('p');
    exportNote.textContent = 'Preview only · not included in map exports.'; panel.append(exportNote);
    let failed = false;
    const updateStatus = () => {
      if (!enabled.checked) status.textContent = 'Hidden';
      else if (map.getZoom() < 8) status.textContent = 'Zoom in to level 8';
      else if (!map.getBounds().intersects(bounds)) status.textContent = 'Outside sheet coverage';
      else if (failed) status.textContent = 'Some tiles failed to load — toggle to retry';
      else status.textContent = tiles.isLoading() ? 'Loading sheets…' : 'Full-sheet tiles ready';
    };
    enabled.onchange = () => {
      if (enabled.checked) { failed = false; tiles.addTo(map); tiles.redraw(); }
      else tiles.remove();
      updateStatus();
    };
    opacity.oninput = () => tiles.setOpacity(Number(opacity.value) / 100);
    tiles.on('loading load', updateStatus);
    tiles.on('tileerror', () => { failed = true; updateStatus(); });
    map.on('moveend', updateStatus);
    control.onAdd = () => panel;
    control.addTo(map); tiles.addTo(map); updateStatus();
    return () => {
      map.off('moveend', updateStatus); tiles.off(); tiles.remove(); control.remove();
      enabled.onchange = null; opacity.oninput = null;
    };
  }, [map, renderMode]);
  return null;
}

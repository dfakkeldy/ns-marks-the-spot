import { useEffect, useRef, useState } from 'react';
import { AttributionControl, NavigationControl, ScaleControl } from 'maplibre-gl';
import { Map } from '../atlas/mapLibreRuntime';
import { PROVINCE_LICENSE_URL, OPEN_GOVERNMENT_LICENCE_TERMS_URL } from '../licensing/provinceLicense';
import { RUMSEY_ATTRIBUTION, RUMSEY_LICENCE_URL } from '../licensing/rumseyLicense';
import { buildTerrainStyle, DATA, type Surface, type TerrainReceipt } from './style';

type Settings = { surface: Surface; opacity: number; contours: boolean; roads: boolean; parcels: boolean; tilted: boolean; exaggeration: number; reset: number };
function applySettings(map: Map, settings: Settings) {
  if (!map.getLayer('hydro')) return;
  map.setPaintProperty('historical', 'raster-opacity', settings.surface === 'historical' ? settings.opacity : 0);
  if (map.getLayer('aerial')) map.setLayoutProperty('aerial', 'visibility', settings.surface === 'aerial' ? 'visible' : 'none');
  map.setLayoutProperty('contours', 'visibility', settings.contours ? 'visible' : 'none');
  for (const id of ['surface-road-edge', 'surface-roads', 'bridge-road-edge', 'bridge-roads']) map.setLayoutProperty(id, 'visibility', settings.roads ? 'visible' : 'none');
  if (map.getLayer('parcels')) map.setLayoutProperty('parcels', 'visibility', settings.parcels ? 'visible' : 'none');
  if (map.getTerrain()?.exaggeration !== settings.exaggeration) map.setTerrain({ source: 'elevation', exaggeration: settings.exaggeration });
}

function TerrainMap({ settings, aerialAccepted, parcelsAccepted, retry, onStatus }: {
  settings: Settings; aerialAccepted: boolean; parcelsAccepted: boolean; retry: number; onStatus: (value: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const camera = useRef<{ center: [number, number]; zoom: number; pitch: number; bearing: number } | null>(null);
  const latest = useRef(settings);
  useEffect(() => { latest.current = settings; }, [settings]);
  useEffect(() => {
    const abort = new AbortController();
    let map: Map | undefined;
    let resize: ResizeObserver | undefined;
    let timeout: number | undefined;
    let failed = false;
    onStatus('Loading Judique terrain…');
    void fetch(`${DATA}/source.json`, { signal: abort.signal })
      .then(response => { if (!response.ok) throw new Error('Terrain receipt unavailable'); return response.json() as Promise<TerrainReceipt>; })
      .then(receipt => {
        if (abort.signal.aborted) return;
        const [west, south, east, north] = receipt.bounds;
        map = new Map({ container: container.current!, style: buildTerrainStyle(receipt, aerialAccepted, latest.current.surface, latest.current.opacity, parcelsAccepted),
          center: [-61.405, 45.835], zoom: 11.5, pitch: latest.current.tilted ? 55 : 0, bearing: -25,
          ...camera.current,
          maxBounds: [[west, south], [east, north]], minZoom: 10, maxZoom: 16,
          maxPitch: 75, attributionControl: false,
        });
        mapRef.current = map;
        map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
        map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
        map.addControl(new AttributionControl({ compact: true, customAttribution: `${RUMSEY_ATTRIBUTION} · <a href="${RUMSEY_LICENCE_URL}">CC BY-NC-SA 3.0</a> · Judique draft` }), 'bottom-right');
        map.on('load', () => { if (map) applySettings(map, latest.current); });
        map.on('error', event => {
          failed = true;
          const source = 'sourceId' in event ? String(event.sourceId) : '';
          onStatus(`${source === 'aerial' ? 'Aerial imagery' : source === 'historical' ? 'Historical sheet' : 'Terrain or reference layer'} failed to load. The view may be incomplete. Retry to reload.`);
        });
        map.on('idle', () => { if (!failed) onStatus('Ready'); });
        map.on('sourcedataloading', () => { if (!failed) onStatus('Loading Judique layers…'); });
        map.on('webglcontextlost', () => { failed = true; onStatus('Graphics connection lost. Retry to restore the view.'); });
        resize = new ResizeObserver(() => map?.resize());
        resize.observe(container.current!);
        timeout = window.setTimeout(() => { if (!failed && !map?.areTilesLoaded()) onStatus('The terrain is still loading. Check the connection or retry.'); }, 20000);
      }).catch(error => {
        if (error.name !== 'AbortError') onStatus('Judique terrain unavailable. Check the connection and WebGL support, then retry.');
      });
    return () => {
      abort.abort(); window.clearTimeout(timeout); resize?.disconnect();
      if (map) camera.current = { center: map.getCenter().toArray(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
      map?.remove(); mapRef.current = null;
    };
  }, [aerialAccepted, parcelsAccepted, retry, onStatus]);

  useEffect(() => { if (mapRef.current) applySettings(mapRef.current, settings); }, [settings]);
  useEffect(() => { mapRef.current?.easeTo({ pitch: settings.tilted ? 55 : 0, duration: 350 }); }, [settings.tilted]);
  useEffect(() => {
    if (settings.reset) mapRef.current?.easeTo({ center: [-61.405, 45.835], zoom: 11.5, bearing: -25, pitch: latest.current.tilted ? 55 : 0 });
  }, [settings.reset]);
  return <div className="atlas-map" ref={container} aria-label="Interactive 3D Judique terrain with water, contours, roads, bridges and optional property boundaries" />;
}

export function TerrainStudy() {
  const [settings, setSettings] = useState<Settings>({ surface: 'historical', opacity: 0.55, contours: true, roads: true, parcels: false, tilted: true, exaggeration: 1, reset: 0 });
  const [aerialAccepted, setAerialAccepted] = useState(false);
  const [parcelsAccepted, setParcelsAccepted] = useState(false);
  const [status, setStatus] = useState('Loading Judique terrain…');
  const [retry, setRetry] = useState(0);
  return <main className="atlas-study terrain-study" data-mode="day">
    <aside className="atlas-sidebar" aria-label="Judique terrain controls">
      <header className="atlas-brand"><img src="./app-icon-180.png" alt="" width="44" height="44" /><div><strong>NS Marks The Spot</strong><span>Terrain inspection · Sheet 19</span></div></header>
      <section className="atlas-intro"><h1>Judique, in relief.</h1><p>Follow the water through your home sheet. Compare Fletcher’s drawing with the shape of the land.</p></section>
      <section className="atlas-section"><h2>Surface</h2><div className="atlas-modes">
        {(['terrain', 'historical', 'aerial'] as const).map(surface => <button key={surface} aria-pressed={settings.surface === surface} onClick={() => setSettings(s => ({ ...s, surface }))}>{surface === 'historical' ? 'Fletcher' : surface === 'aerial' ? 'Aerial' : 'Terrain'}</button>)}
      </div>
      {settings.surface === 'historical' && <label className="terrain-range" htmlFor="sheet-opacity">Sheet opacity <output>{Math.round(settings.opacity * 100)}%</output><input id="sheet-opacity" type="range" min="0" max="1" step="0.05" value={settings.opacity} onChange={event => setSettings(s => ({ ...s, opacity: Number(event.target.value) }))} /></label>}
      {settings.surface === 'aerial' && !aerialAccepted && <div className="atlas-licence"><p>Provincial aerial imagery has separate <a href={PROVINCE_LICENSE_URL} target="_blank" rel="noreferrer">map-service terms</a>.</p><button onClick={() => setAerialAccepted(true)}>Accept terms & load aerial imagery</button></div>}
      {settings.surface === 'aerial' && aerialAccepted && <p className="atlas-note">NS provincial aerial imagery · capture dates vary.</p>}
      </section>
      <section className="atlas-section"><h2>Reference layers · top to bottom</h2>
        <label className="atlas-check"><input type="checkbox" checked={settings.parcels} onChange={event => setSettings(s => ({ ...s, parcels: event.target.checked }))} />Property boundaries · zoom 14+</label>
        {settings.parcels && !parcelsAccepted && <div className="atlas-licence"><p>Property boundaries use the provincial <a href={PROVINCE_LICENSE_URL} target="_blank" rel="noreferrer">map-service terms</a>.</p><button onClick={() => setParcelsAccepted(true)}>Accept terms & load property boundaries</button></div>}
        {settings.parcels && parcelsAccepted && <p className="atlas-note">Zoom in to see mapped property boundaries. Not a survey or proof of ownership.</p>}
        <label className="atlas-check"><input type="checkbox" checked={settings.roads} onChange={event => setSettings(s => ({ ...s, roads: event.target.checked }))} />Roads & bridges</label>
        <div className="terrain-water-key"><i />Water polygons & network</div>
        <label className="atlas-check"><input type="checkbox" checked={settings.contours} onChange={event => setSettings(s => ({ ...s, contours: event.target.checked }))} />Contour lines</label>
        <p className="atlas-note">Roads, bridges and property boundaries draw above water. These references do not establish access permission.</p>
      </section>
      <section className="atlas-section"><h2>View</h2><div className="atlas-modes">
        <button aria-pressed={settings.tilted} onClick={() => setSettings(s => ({ ...s, tilted: true }))}>3D terrain</button>
        <button aria-pressed={!settings.tilted} onClick={() => setSettings(s => ({ ...s, tilted: false }))}>Overhead</button>
      </div>
      <label className="terrain-range" htmlFor="height-exaggeration">Height exaggeration <output>{settings.exaggeration}×</output><input id="height-exaggeration" type="range" min="1" max="3" step="0.5" value={settings.exaggeration} onChange={event => setSettings(s => ({ ...s, exaggeration: Number(event.target.value) }))} /></label>
      <button className="terrain-reset" onClick={() => setSettings(s => ({ ...s, reset: s.reset + 1 }))}>Return to Judique</button>
      <p className="atlas-note">Drag to move; right-drag to rotate and tilt. Height exaggeration changes the view only.</p>
      </section>
      <footer className="atlas-sidebar-footer"><p>Provisional contour-derived terrain. Supported lakes are flattened to estimated contour-shoreline levels; coastal water uses display zero. Rivers remain unflattened. This is not a validated watershed model.</p>
        <p>Fletcher uses the full-sheet Judique draft. Its alignment remains approximate.</p>
        <details><summary>Sources & method</summary><p>Open NSTDB contours and water polygons, NSRN roads, and Nova Scotia Hydrographic Network. Lake levels are model estimates, not surveyed elevations; source water Z is not used because vertical datums remain unreconciled. <a href={OPEN_GOVERNMENT_LICENCE_TERMS_URL}>Provincial open-data licence</a>.</p><p>Historical imagery: David Rumsey Map Collection / Stanford Libraries. <a href={RUMSEY_LICENCE_URL}>CC BY-NC-SA 3.0</a>.</p><p>30 m terrain grid; source contour intervals vary. Grid spacing does not establish accuracy. <a href={`${DATA}/source.json`}>Source and processing receipt</a>.</p></details>
        <a href="./atlas.html">Atlas study ↗</a>
      </footer>
    </aside>
    <section className="atlas-stage" aria-label="Judique terrain preview">
      <TerrainMap settings={settings} aerialAccepted={aerialAccepted} parcelsAccepted={parcelsAccepted && settings.parcels} retry={retry} onStatus={setStatus} />
      <div className="atlas-map-title"><span>JUDIQUE / SHEET 19</span><strong>{settings.surface === 'historical' ? 'Fletcher · 1884' : settings.surface === 'aerial' ? 'Aerial imagery' : 'Contours & water'}</strong></div>
      <div className="atlas-status" role="status" data-ready={status === 'Ready'}><span>{status}</span>{status !== 'Ready' && !status.startsWith('Loading') && <button onClick={() => setRetry(r => r + 1)}>Retry</button>}</div>
      <div className="terrain-view-caption">{settings.exaggeration}× height · estimated lake levels · roads above water</div>
    </section>
  </main>;
}

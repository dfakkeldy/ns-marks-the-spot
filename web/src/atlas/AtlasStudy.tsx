import { useMemo, useState } from 'react';
import { AtlasMap, type Camera, type View } from './AtlasMap';
import { atlasPlaces } from './places';
import { atlasPalettes } from './palette';
import { buildReviewStyle, type ReviewMode } from './overlays';
import { LETTERING_PLACEMENT, historicalLetteringSpecimens, historicalSiteStates, historicalSiteSvg, historicalSiteSymbols } from './historicalSymbols';
import { fletcherSheets, fletcherSourceReceiptUrl, normalizeFletcherTileBaseUrl } from '../layers/fletcherLayer';
import { PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL } from '../licensing/provinceLicense';
import { RUMSEY_ATTRIBUTION, RUMSEY_COLLECTION_TERMS_URL, RUMSEY_LICENCE_URL } from '../licensing/rumseyLicense';

export function AtlasStudy() {
  const [mode, setMode] = useState<ReviewMode>(() => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day');
  const [camera, setCamera] = useState<Camera>(atlasPlaces[0]);
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState('Loading map…');
  const [retry, setRetry] = useState(0);
  const [parcels, setParcels] = useState(false);
  const [provinceAccepted, setProvinceAccepted] = useState(false);
  const [historical, setHistorical] = useState(false);
  const [opacity, setOpacity] = useState(0.5);
  const historicalHost = useMemo(() => {
    try { return normalizeFletcherTileBaseUrl(); } catch { return null; }
  }, []);
  const style = useMemo(() => buildReviewStyle(mode, { parcels, provinceAccepted, historical, opacity: 1 }, historicalHost),
    [mode, parcels, provinceAccepted, historical, historicalHost]);
  const historyInView = !view || fletcherSheets.some(({ bounds: [[south, west], [north, east]] }) => view.west < east && view.east > west && view.south < north && view.north > south);
  const p = atlasPalettes[mode === 'night' ? 'night' : 'day'];
  const researchUrl = view ? `./?position=${view.latitude.toFixed(6)},${view.longitude.toFixed(6)},${Math.min(19, Math.round(view.zoom + 1))}&layers=modern&taxSale=off` : './';

  return <main className="atlas-study" data-mode={mode === 'night' ? 'night' : 'day'}>
    <aside className="atlas-sidebar" aria-label="Basemap review controls">
      <header className="atlas-brand">
        <img src="./app-icon-180.png" alt="" width="44" height="44" />
        <div><strong>NS Marks The Spot</strong><span>Cartography study · 02</span></div>
      </header>
      <section className="atlas-intro">
        <h1>A Nova Scotia atlas.</h1>
        <p>Modern geography in the paper, olive, ochre and ink of Fletcher's 1884 Cape Breton sheets.</p>
      </section>
      <section className="atlas-section" aria-labelledby="appearance-title">
        <h2 id="appearance-title">Appearance</h2>
        <div className="atlas-modes" role="group" aria-label="Basemap appearance">
          {(['day', 'night', 'osm'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>
            {value === 'day' ? 'Day' : value === 'night' ? 'Night' : 'OSM'}
          </button>)}
        </div>
        <p className="atlas-note">Switch styles at the same position and scale.</p>
      </section>
      <section className="atlas-section atlas-places" aria-labelledby="places-title">
        <h2 id="places-title">Explore the detail</h2>
        <div className="atlas-place-list">
          {atlasPlaces.map((place, index) => <button type="button" key={place.id} onClick={() => setCamera({ ...place })}>
            <span className="atlas-place-number">0{index + 1}</span><span><strong>{place.name}</strong><small>{place.setting}</small></span><span className="atlas-go" aria-hidden="true">↗</span>
          </button>)}
        </div>
      </section>
      <section className="atlas-section" aria-labelledby="overlays-title">
        <h2 id="overlays-title">Read it with layers</h2>
        <label className="atlas-check"><input type="checkbox" checked={parcels} onChange={event => setParcels(event.target.checked)} /><span>Property boundaries</span></label>
        {parcels && !provinceAccepted && <div className="atlas-licence">
          <p>Province data is for personal or research use under its <a href={PROVINCE_LICENSE_URL} target="_blank" rel="noreferrer">restricted map services licence</a>.</p>
          <button type="button" onClick={() => setProvinceAccepted(true)}>Accept licence & show boundaries</button>
        </div>}
        {parcels && provinceAccepted && <p className="atlas-note">{!view || view.zoom < 14 ? <>Zoom in for mapped boundaries. <button type="button" className="atlas-text-button" onClick={() => setCamera({ ...(view ?? camera), zoom: 14.5 })}>Show detail</button></> : 'Live NSPRD boundaries. Not a survey or proof of ownership.'}</p>}
        <label className="atlas-check"><input type="checkbox" checked={historical} disabled={!historicalHost} onChange={event => setHistorical(event.target.checked)} /><span>Fletcher historical sheets</span></label>
        {!historicalHost && <p className="atlas-note">Historical tile hosting is not configured for this preview.</p>}
        {historical && <>
          <label className="atlas-opacity">Sheet opacity <output>{Math.round(opacity * 100)}%</output><input aria-label="Sheet opacity" type="range" min="0" max="100" value={opacity * 100} onChange={event => setOpacity(Number(event.target.value) / 100)} /></label>
          <p className="atlas-note">{historyInView ? 'Project-georeferenced scans. Historical detail and alignment vary. The tile host must allow this preview origin through CORS.' : 'Outside the accepted Cape Breton sheet coverage.'}</p>
        </>}
      </section>
      {mode !== 'osm' && <section className="atlas-section atlas-key" aria-label="Map colour key">
        {[['Water', p.water], ['Woodland', p.wood], ['Land', p.land], ['Farmland', p.farmland], ['Settlement', p.residential], ['Main roads', p.highway]].map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}
      </section>}
      {mode !== 'osm' && <section className="atlas-section" aria-labelledby="specimen-title">
        <h2 id="specimen-title">Historical sites · specimen</h2>
        <div className="atlas-specimen" role="table" aria-label="Historical site symbol specimens">
          {historicalSiteStates.map(state => <div key={state.confidence} role="row" className="atlas-specimen-row">
            {historicalSiteSymbols.map(symbol => <span key={symbol.kind} role="cell" className="atlas-specimen-cell" title={`${symbol.label} · ${state.label}`}
              dangerouslySetInnerHTML={{ __html: historicalSiteSvg(symbol.kind, state.confidence, mode === 'night' ? 'night' : 'day') }} />)}
            <span role="cell" className="atlas-specimen-label">{state.label}</span>
          </div>)}
        </div>
        <p className="atlas-note">{historicalSiteSymbols.map(symbol => symbol.label).join(', ')}. Unlocated design specimens for a later extraction from the sheets; nothing here is placed on the map. Placement states describe where a site could be drawn; they are separate from how clearly its lettering was read.</p>
      </section>}
      {mode !== 'osm' && <section className="atlas-section" aria-labelledby="lettering-title">
        <h2 id="lettering-title">Historical lettering · specimen</h2>
        <ul className="atlas-lettering" aria-label="Transcribed lettering specimens">
          {historicalLetteringSpecimens.map(specimen => <li key={specimen.id}>
            <span className="atlas-lettering-text" lang="en" style={{ fontStyle: specimen.italic ? 'italic' : 'normal' }}>{specimen.wording}</span>
            <span className="atlas-lettering-meta"><span className={`atlas-chip atlas-chip-${specimen.reading}`}>{specimen.reading} reading</span><span>{specimen.id} · {specimen.kind} · placement {LETTERING_PLACEMENT}</span></span>
          </li>)}
        </ul>
        <p className="atlas-note">Printed wordings from the sheet 19 transcription, set in the map's serif as lettering examples only. A reading is about the ink; it never establishes a position. Every specimen has no geometry and is not a mapped feature.</p>
      </section>}
      <footer className="atlas-sidebar-footer">
        <p>Provincial-first Atlas. A mapped road or path does not establish access permission.</p>
        <a href={researchUrl} target="_blank" rel="noreferrer">Open this area in the research map ↗</a>
        <details><summary>Sources & scope</summary>
          <p>Provincial roads, names, hydrography, woodland and municipal boundaries, with supplemental OSM ocean, land use and building footprints via <a href="https://openfreemap.org/">OpenFreeMap</a> and <a href="https://openmaptiles.org/">OpenMapTiles</a>. Atlas covers Nova Scotia; select OpenStreetMap for worldwide detail.</p>
          <p>The research map and PDF export use the same provincial archive and Atlas style.</p>
          {parcels && provinceAccepted && <p>{PROVINCE_ATTRIBUTION} <a href={PROVINCE_LICENSE_URL}>Licence</a>.</p>}
          {historical && <p>{RUMSEY_ATTRIBUTION}. <a href={RUMSEY_LICENCE_URL}>CC BY-NC-SA 3.0</a> · <a href={RUMSEY_COLLECTION_TERMS_URL}>Collection terms</a> · <a href={fletcherSourceReceiptUrl(historicalHost)!}>Source receipt</a>.</p>}
        </details>
      </footer>
    </aside>
    <section className="atlas-stage" aria-label="Map preview">
      <AtlasMap key={retry} style={style} camera={camera} onView={setView} onStatus={setStatus} historicalOpacity={opacity} />
      <div className="atlas-map-title"><span>NS / ATLAS</span><strong>{mode === 'night' ? 'After dusk' : mode === 'day' ? 'Daylight' : 'Standard OSM'}</strong></div>
      <div className="atlas-status" role="status" data-ready={status === 'Ready'}>
        <span>{status === 'Ready' ? 'Map loaded' : status}</span>
        {status !== 'Ready' && status !== 'Loading map…' && <button type="button" onClick={() => { if (view) setCamera(view); setStatus('Loading map…'); setRetry(value => value + 1); }}>Retry</button>}
      </div>
      <div className="atlas-coordinates">{view ? `${view.latitude.toFixed(4)}° N  /  ${Math.abs(view.longitude).toFixed(4)}° W` : 'NOVA SCOTIA, CANADA'}</div>
    </section>
  </main>;
}

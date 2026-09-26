import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, CircleMarker, GeoJSON, MapContainer, Polyline, ScaleControl, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { gunzipSync, strFromU8 } from 'fflate';
import { atlasPalettes } from '../atlas/palette';
import { pathDistanceMetres } from '../services/geodesy';
import { browserLocationFailure, getBrowserLocation, type BrowserLocation } from '../services/browserLocation';
import { MAILING_ATTRIBUTION, MAILING_LICENCE_URL } from '../services/mailingAddresses';
import { OPEN_GOVERNMENT_ATTRIBUTION, OPEN_GOVERNMENT_LICENCE_URL, PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL, PROVINCE_LICENSE_ACCEPTANCE_KEY } from '../licensing/provinceLicense';
import { addressId, addressLabel, civicLabelPoints, searchableAddresses, deliveryStatus, placement, postalOnlyAddresses, readSession, searchAddresses, writeSession, type PokerAddress, type SearchAddress, type PokerData, type PokerState } from './model';
import { waterStyle, roadStyle } from './cartography';
import { namedRoads } from './labels';
import { PokerLabels } from './PokerLabels';
import { applyUpdate, offlineReady, saveOffline, watchForUpdate } from './offline';
import 'leaflet/dist/leaflet.css';
import './poker.css';
const palette = atlasPalettes.day;
const AERIAL = 'https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSODB_10k_WM84/MapServer/tile/{z}/{y}/{x}';
const tileEvents = { tileerror: () => window.dispatchEvent(new Event('poker-aerial-error')) };
function MapContents({ data, state, setState, mapRef, aerial, addresses, postalOnly, location }: {
  data: PokerData; addresses: SearchAddress[]; postalOnly: PokerAddress[]; location: BrowserLocation | null; state: PokerState; setState: React.Dispatch<React.SetStateAction<PokerState>>; mapRef: React.RefObject<L.Map | null>; aerial: boolean;
}) {
  const map = useMap();
  const [view, setView] = useState(0);
  useEffect(() => { mapRef.current = map; return () => { mapRef.current = null; }; }, [map, mapRef]);
  useMapEvents({
    zoomend: () => setView(v => v + 1),
    moveend: () => { const center = map.getCenter(); setState(s => ({ ...s, center: [center.lat, center.lng], zoom: map.getZoom() })); setView(v => v + 1); },
    click: ({ latlng }) => setState(s => s.finished || s.points.length >= 5000 ? s : { ...s, points: [...s.points, { lat: latlng.lat, lng: latlng.lng }] }),
  });
  const labelPoints = useMemo(() => civicLabelPoints(data.civic), [data.civic]);
  const roadNames = useMemo(() => namedRoads(data.roads), [data.roads]);
  // Individual building dots only help once streets are legible; at regional
  // zoom they read as noise over the road network.
  const streetZoom = map.getZoom() >= 14;
  const metres = pathDistanceMetres(state.points);
  const selected = addresses.find(a => addressId(a) === state.selectedId);
  const selectedPlace = selected ? placement(selected) : null;
  return <>
    <GeoJSON data={data.water} interactive={false} style={feature => waterStyle(feature?.properties?.feat_desc ?? '')} />
    <GeoJSON data={data.roads} style={feature => roadStyle(feature?.properties?.roadc_desc ?? '', feature?.properties?.feat_desc ?? '', true)} interactive={false} />
    <GeoJSON data={data.roads} style={feature => roadStyle(feature?.properties?.roadc_desc ?? '', feature?.properties?.feat_desc ?? '')} onEachFeature={(feature, layer) => {
      const name = feature.properties?.street;
      if (typeof name === 'string' && name) { const label = document.createElement('span'); label.textContent = name; layer.bindTooltip(label, { sticky: true }); }
    }} />
    <GeoJSON data={data.footprints} interactive={false} style={{ color: palette.mutedInk, weight: .6, fillColor: palette.building, fillOpacity: 1 }} />
    {streetZoom && <GeoJSON data={data.buildings} interactive={false} pointToLayer={(_, point) => L.circleMarker(point, { radius: 2.5, color: palette.mutedInk, weight: 1, fillColor: palette.building, fillOpacity: 1, interactive: false })} />}
    {aerial && <TileLayer url={AERIAL} maxNativeZoom={19} maxZoom={21} zIndex={450} eventHandlers={tileEvents} />}
    <PokerLabels view={view} roads={roadNames} civic={labelPoints} postal={postalOnly} selected={selectedPlace?.coordinates ?? null} />
    {selectedPlace && <CircleMarker center={[selectedPlace.coordinates[1], selectedPlace.coordinates[0]]} radius={8} interactive={false} pathOptions={{ color: '#b73324', weight: 3, fillOpacity: 0, dashArray: selectedPlace.source === 'postal' ? '4 4' : undefined }} />}
    {state.points.length > 1 && <Polyline positions={state.points} interactive={false} pathOptions={{ color: '#b73324', weight: 4 }} />}
    {state.points.map((point, i) => <CircleMarker key={i} center={point} radius={5} interactive={false} pathOptions={{ color: '#b73324', fillColor: '#fff', fillOpacity: 1 }}>
      {i === state.points.length - 1 && state.points.length > 1 && <Tooltip permanent direction="top" offset={[0,-10]} className={`poker-distance${state.finished && metres > 500 ? ' over-limit' : ''}`}>
        <strong>{metres.toFixed(1)} m</strong>
        {state.finished && <span>{metres > 500 ? 'Card parcel · over 500 m' : 'Within 500 m'}</span>}
      </Tooltip>}
    </CircleMarker>)}
    {location && <>
      <Circle center={[location.latitude, location.longitude]} radius={location.accuracy} interactive={false} pathOptions={{ color: '#176ab4', weight: 1, fillOpacity: .12 }} />
      <CircleMarker center={[location.latitude, location.longitude]} radius={6} interactive={false} pathOptions={{ color: '#fff', weight: 2, fillColor: '#176ab4', fillOpacity: 1 }}>
        <Tooltip permanent direction="top" className="poker-location-label">Last located here · ±{Math.ceil(location.accuracy)} m</Tooltip>
      </CircleMarker>
    </>}
    <ScaleControl position="bottomleft" imperial={false} />
  </>;
}
export function PokerApp() {
  const [state, setState] = useState(readSession);
  const [data, setData] = useState<PokerData | null>(null);
  const [packRevision, setPackRevision] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const [aerialPermitted, setAerialPermitted] = useState(() => {
    try { return localStorage.getItem(PROVINCE_LICENSE_ACCEPTANCE_KEY) === 'accepted'; } catch { return false; }
  });
  const aerial = state.basemap === 'aerial' && aerialPermitted;
  const setAerial = (enabled: boolean) => setState(s => ({ ...s, basemap: enabled ? 'aerial' : 'atlas' }));
  const [aerialError, setAerialError] = useState(false);
  const [licenceDialog, setLicenceDialog] = useState(false);
  const [help, setHelp] = useState(false);
  // A newer saved copy has downloaded while this page runs the older one.
  const [update, setUpdate] = useState<'none' | 'ready' | 'reloading'>('none');
  useEffect(() => watchForUpdate(() => setUpdate(value => value === 'none' ? 'ready' : value)), []);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [location, setLocation] = useState<BrowserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState('');
  const locationRequest = useRef(0);
  const mapRef = useRef<L.Map | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => { locationRequest.current++; }, []);
  useEffect(() => { setStorageFailed(!writeSession(state)); }, [state]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const imageryFailure = () => setAerialError(true);
    window.addEventListener('online', update); window.addEventListener('offline', update); window.addEventListener('poker-aerial-error', imageryFailure);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.getRegistration('/poker').then(async r => { if (r) setSaved(await offlineReady(r)); }).catch(() => {});
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('poker-aerial-error', imageryFailure); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    void (async () => {
      const [response, receiptResponse] = await Promise.all(['poker/data.json.gz','poker/source.json'].map(path => fetch(new URL(path, document.baseURI), { signal: controller.signal })));
      if (!response.ok || !receiptResponse.ok) throw Error('Address download failed. Connect to the internet and retry.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const receipt = await receiptResponse.json();
      const compressed = bytes[0] === 0x1f && bytes[1] === 0x8b;
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      if (hash !== (compressed ? receipt.sha256 : receipt.decodedSha256)) throw Error('Saved address files do not match. Reconnect and save the offline copy again.');
      const value = JSON.parse(strFromU8(compressed ? gunzipSync(bytes) : bytes)) as PokerData;
      if (value.version !== 1 || value.addresses.length !== receipt.totalAddresses || !value.roads.features || !value.civic.length) throw Error('The address pack is incomplete. Reconnect and retry.');
      if (!controller.signal.aborted) { setData(value); setPackRevision(receipt.sha256); }
    })().catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Address download failed.'); });
    return () => controller.abort();
  }, [retry]);
  const addresses = useMemo(() => data ? searchableAddresses(data) : [], [data]);
  const postalOnly = useMemo(() => data ? postalOnlyAddresses(data) : [], [data]);
  const matches = useMemo(() => searchAddresses(addresses, state.query, state.postalCode), [addresses, state.query, state.postalCode]);
  const metres = pathDistanceMetres(state.points);
  const chooseAddress = (address: SearchAddress) => {
    locationRequest.current++;
    setLocating(false); setLocationNotice('');
    setState(s => ({ ...s, selectedId: addressId(address), query: addressLabel(address), points: [], finished: false }));
    setSearchOpen(false); inputRef.current?.blur();
    const [lng, lat] = placement(address).coordinates;
    mapRef.current?.setView([lat, lng], 18);
  };
  const locate = async () => {
    if (!data || !mapRef.current || locating) return;
    const request = ++locationRequest.current;
    setLocating(true); setLocation(null); setLocationNotice('Finding your location…');
    setSearchOpen(false); inputRef.current?.blur();
    try {
      const fix = await getBrowserLocation(navigator.geolocation, { maximumAgeMs: 0 });
      if (request !== locationRequest.current) return;
      const { latitude, longitude, accuracy } = fix;
      if (![latitude, longitude, accuracy].every(Number.isFinite) || accuracy < 0 || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        setLocationNotice('Your device returned an unusable location. Try again.');
        return;
      }
      const [west, south, east, north] = data.bounds;
      if (longitude < west || longitude > east || latitude < south || latitude > north) {
        setLocationNotice('You’re outside Poker’s saved map area.');
        return;
      }
      setLocation(fix); setLocationNotice('');
      const map = mapRef.current;
      map?.setView([latitude, longitude], Math.max(map.getZoom(), 17));
    } catch (error) {
      if (request !== locationRequest.current) return;
      setLocationNotice({
        denied: 'Location access is blocked. Allow location for Poker in your browser settings, then try again.',
        unavailable: 'Your device could not find a location. Try again.',
        timeout: 'Getting your location timed out. Tap the location button to try again.',
        unsupported: 'Location is not available in this browser.',
      }[browserLocationFailure(error)]);
    } finally {
      if (request === locationRequest.current) setLocating(false);
    }
  };
  const save = async () => {
    setSaving(true); setOfflineNotice('Saving the app, addresses and Atlas road map…');
    try { const protectedStorage = await saveOffline(); setSaved(true); setRetry(v => v + 1); setOfflineNotice(protectedStorage ? 'Saved offline on this device.' : 'Saved offline. Your browser may remove downloads if device storage is low.'); }
    catch (error) { setSaved(false); setOfflineNotice(error instanceof Error ? error.message : 'Could not save offline.'); }
    finally { setSaving(false); }
  };
  const finishTrace = () => {
    setState(s => ({ ...s, finished: true }));
    // Keep focus inside the tap handler so mobile browsers can open the keyboard.
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
    // Keep the finished distance visible until the next query is typed.
    setSearchOpen(false);
    // Tooltips do not auto-pan. Expose the final label after it has laid out,
    // without moving the camera while the user is tracing or panning later.
    requestAnimationFrame(() => {
      const map = mapRef.current;
      if (!map) return;
      const container = map.getContainer();
      const label = container.querySelector('.poker-distance:has(strong)')?.getBoundingClientRect();
      const shell = container.closest('.poker-app');
      const dock = shell?.querySelector('.poker-measurement')?.getBoundingClientRect();
      if (!label || !shell || !dock) return;
      const bounds = container.getBoundingClientRect();
      const top = Math.max(bounds.top, ...['.poker-searchbar', '.leaflet-control-zoom', '.poker-basemap', '.poker-locate'].map(selector => shell.querySelector(selector)?.getBoundingClientRect().bottom ?? bounds.top)) + 8;
      const bottom = dock.top - 8;
      const dx = label.left < bounds.left + 8 ? label.left - bounds.left - 8 : Math.max(0, label.right - bounds.right + 8);
      const dy = label.top < top ? label.top - top : Math.max(0, label.bottom - bottom);
      if (dx || dy) map.panBy([dx, dy], { animate: false });
    });
  };
  const toggleAerial = () => {
    if (aerial && !aerialError) { setAerial(false); return; }
    let accepted = false;
    try { accepted = localStorage.getItem(PROVINCE_LICENSE_ACCEPTANCE_KEY) === 'accepted'; } catch { /* Still allow session-only acceptance. */ }
    if (accepted) { setAerialPermitted(true); setAerialError(false); setAerial(true); } else setLicenceDialog(true);
  };
  return <main className="poker-app">
    <h1 className="sr-only">Poker — Judique, Port Hood and Mabou</h1>
    <button className="poker-options" aria-label="Map options" aria-haspopup="dialog" onClick={() => setOptionsOpen(true)}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      <span className={`poker-status-dot${!online ? ' is-offline' : ''}`} aria-hidden="true" />
    </button>
    <section className="poker-searchbar" aria-label="Find an address">
      <input ref={inputRef} type="search" aria-label="Search civic address" placeholder="Civic number, road or postal code" value={state.query}
        onFocus={event => { event.currentTarget.select(); setSearchOpen(true); }}
        onChange={event => { setState(s => ({ ...s, query: event.target.value })); setSearchOpen(true); }}
        onKeyDown={event => { if (event.key === 'Escape') setSearchOpen(false); if (event.key === 'Enter' && matches.length === 1) chooseAddress(matches[0]); }} />
      {searchOpen && data && <div className="poker-results"><div className="poker-results-heading"><span>{matches.length ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}${matches.length > 40 ? ' · showing first 40; refine your search' : ''}` : 'No match in this saved address list.'}</span><button onClick={() => setSearchOpen(false)}>Close results</button></div>
        {state.postalCode && matches.some(a => !a.mailing) && <p>Also showing regional civic addresses with unverified postal codes.</p>}
        <ul>{matches.slice(0,40).map(a => <li key={addressId(a)}><button onClick={() => chooseAddress(a)}>{addressLabel(a)}{!a.mailing && <small>Provincial civic address · postal code unverified{a.civic.properties.add_loc && ` · ${a.civic.properties.add_loc}`}</small>}{!a.civic && <small>Postal building point · no unique provincial civic point</small>}</button></li>)}</ul>
      </div>}
    </section>
    {storageFailed && <p className="poker-storage-error" role="alert">This browser could not save your session.</p>}
    <section className="poker-map" aria-label="Driveway map">
      {loadError ? <div className="poker-load-error" role="alert">{loadError}<button onClick={() => setRetry(v => v + 1)}>Retry</button></div> : !data ? <p className="poker-loading" role="status">Loading local addresses and Atlas road map…</p> :
        <MapContainer center={state.center} zoom={state.zoom} minZoom={9} maxZoom={21} maxBounds={[[data.bounds[1], data.bounds[0]], [data.bounds[3], data.bounds[2]]]} maxBoundsViscosity={.8} preferCanvas doubleClickZoom={false} attributionControl={false}>
          <MapContents key={packRevision} data={data} addresses={addresses} postalOnly={postalOnly} location={location} state={state} setState={setState} mapRef={mapRef} aerial={aerial && online && !aerialError} />
        </MapContainer>}
      <button className="poker-basemap" onClick={toggleAerial} disabled={!online} aria-label={aerial && online && !aerialError ? 'Use Atlas map' : 'Aerial (online)'}>{aerial && online && !aerialError ? 'Atlas' : 'Aerial'}</button>
      <button className="poker-locate" aria-label="Use my location" title="Use my location" aria-busy={locating} disabled={!data || Boolean(loadError) || locating} onClick={() => void locate()}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg>
      </button>
      {locationNotice && <p className="poker-location-notice" role="status">{locationNotice}</p>}
      {aerialError && <p className="poker-map-notice" role="status">Aerial imagery unavailable. Showing Atlas.</p>}
      {update !== 'none' && <div className="poker-update" role="status"><span>Poker updated</span>
        <button disabled={update === 'reloading'} aria-busy={update === 'reloading'} onClick={() => { setUpdate('reloading'); void applyUpdate(); }}>Reload</button></div>}
    </section>
    <section className="poker-measurement" aria-label="Driveway measurement">
      <div className="poker-readout sr-only" role="status"><strong>{state.points.length > 1 ? `${metres.toFixed(1)} m` : 'House → route'}</strong><span>{deliveryStatus(metres, state.finished, state.points.length)}</span></div>
      <div className="poker-measure-actions"><button disabled={state.points.length < 2 || state.finished} onClick={finishTrace}>Finish</button><button disabled={!state.points.length} onClick={() => setState(s => ({ ...s, points: s.points.slice(0,-1), finished: false }))}>Undo point</button><button aria-label="Clear trace" disabled={!state.points.length} onClick={() => setState(s => ({ ...s, points: [], finished: false }))}>Clear</button></div>
    </section>
    <footer className="poker-footer">{!online && <span>Offline · Atlas</span>}<button onClick={() => setHelp(true)}>Sources</button></footer>
    {optionsOpen && <dialog className="poker-modal poker-settings" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={() => setOptionsOpen(false)} aria-labelledby="poker-options-title">
      <div className="poker-modal-heading"><h2 id="poker-options-title">Poker</h2><button autoFocus aria-label="Close map options" onClick={() => setOptionsOpen(false)}>Done</button></div>
      <label className="poker-setting-label" htmlFor="poker-postal-area">Postal area</label>
      <select id="poker-postal-area" aria-label="Postal area" value={state.postalCode} onChange={event => { setState(s => ({ ...s, postalCode: event.target.value, query: '' })); setOptionsOpen(false); setSearchOpen(true); }}>
        <option value="">All saved addresses</option><option value="B0E1P0">Judique · B0E 1P0</option><option value="B0E2W0">Port Hood · B0E 2W0</option><option value="B0E1X0">Mabou · B0E 1X0</option>
      </select>

      <div className="poker-offline-settings">
        <button onClick={() => void save()} disabled={saving || !online}>{saving ? 'Saving…' : saved ? 'Update offline copy' : 'Save offline'}</button>
    <div className="poker-connection" role="status">{online ? saved ? 'Saved for offline use' : 'Online · save once for offline use' : saved ? 'Offline · using saved Atlas map and addresses' : 'Offline · no complete download confirmed'}{storageFailed && ' · Session could not be saved in this browser'}</div>
    {offlineNotice && <div className="poker-notice" role="status">{offlineNotice}</div>}

      </div>
      <p className="poker-settings-help">Your address, map view and trace are saved automatically in this browser.</p>
      <button className="poker-help-link" onClick={() => { setOptionsOpen(false); setHelp(true); }}>Help &amp; sources</button>
    </dialog>}
    {help && <dialog className="poker-modal" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={() => setHelp(false)} aria-labelledby="poker-help"><h2 id="poker-help">Your pocket route map</h2>
      <p>Trace the actual driveway from the house to your delivery route. Civic points may not mark the house, and distances are approximate. A finished trace over 500 metres is flagged for carding.</p>
      <p>Where numbers or road names would overlap, some wait for a closer zoom. Every address point keeps its dot.</p>
      <p>Return to <strong>kinnokilabs.com/poker</strong>. This browser remembers your search, map position and current trace. Selecting a different address starts a new trace. Nothing is uploaded.</p>
      <p>Open <strong>Map options</strong> and tap <strong>Save offline</strong> while connected. Then use your browser’s <strong>Add to Home Screen</strong> or <strong>Install app</strong> option. Each browser or installed copy saves its own session. Clearing website data removes downloads and the saved trace.</p>
      <p>While online, Poker checks for a newer version and downloads it in the background. When it is ready, <strong>Poker updated</strong> appears at the top of the map; tap <strong>Reload</strong> to use it. Your address, map view and trace are kept.</p>
      <p>The offline pack includes the app, civic numbers and a bounded Atlas road map with mapped buildings and water. Aerial imagery needs internet and is not downloaded. If a driveway is not mapped, use aerial imagery online before tracing it.</p>
      <p><strong>Use my location</strong> below zoom asks your browser for a fresh position. The blue dot and circle show the last reading and its reported accuracy. Tap again to update it; this does not follow you or change your trace. Location stays in this browser and can work offline if your device can get a position.</p>
      <p>Typing a leading civic number such as 544 also suggests longer matching addresses, including 5447.</p>
      <p>{data?.addresses.length.toLocaleString()} postal records from June 2026; {data?.addresses.filter(a => !a.civic).length} have no unique verified provincial civic point. Those open at their Statistics Canada building coordinate with a dashed ring, and the ones with no provincial civic point on their road at all are labelled in blue as postal points. Provincial civic addresses missing from that list are also searchable, with their postal codes marked unverified. Postal-area filters also show those regional civic addresses; they do not establish a delivery route. Missing records are not evidence that an address does not exist. This is address lookup, not resident or owner lookup.</p>
      <p>{OPEN_GOVERNMENT_ATTRIBUTION} <a href={OPEN_GOVERNMENT_LICENCE_URL}>Provincial licence</a>. Civic points, NSRN roads, NSTDB buildings and water are dated source features, not verified delivery routes or access permission. <a href={new URL('poker/source.json', document.baseURI).href}>Source dates and receipt</a>.</p>
      <p>{MAILING_ATTRIBUTION} <a href={MAILING_LICENCE_URL}>Statistics Canada licence</a>.</p>
      {aerial && <p>{PROVINCE_ATTRIBUTION} <a href={PROVINCE_LICENSE_URL}>Aerial service licence</a>.</p>}
      <button autoFocus onClick={() => setHelp(false)}>Close help</button>
    </dialog>}
    {licenceDialog && <dialog className="poker-modal" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={() => setLicenceDialog(false)} aria-labelledby="poker-licence"><h2 id="poker-licence">Provincial aerial imagery</h2>
      <p>The Province of Nova Scotia makes no representations, expressed or implied, as to the accuracy, completeness and timeliness of the information, maps and other data, including PID numbers or property boundaries, which are displayed in this map that is presented in this application.</p>
      <p>The map is provided on the understanding that it is not guaranteed to be correct or complete or current, is subject to change, and conclusions drawn or decisions made, based on an interpretation of the data, are the responsibility of the user.</p>
      <p>By continuing to use this application, you agree to the terms of this disclaimer.</p><p><a href={PROVINCE_LICENSE_URL}>Read the service licence</a>. Online viewing only; imagery is not included in the offline pack.</p>
      <button autoFocus onClick={() => { try { localStorage.setItem(PROVINCE_LICENSE_ACCEPTANCE_KEY, 'accepted'); } catch { /* session only */ } setLicenceDialog(false); setAerialPermitted(true); setAerialError(false); setAerial(true); }}>Accept and show aerial</button><button onClick={() => setLicenceDialog(false)}>Cancel</button>
    </dialog>}
  </main>;
}

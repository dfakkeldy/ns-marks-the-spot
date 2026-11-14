import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { guessKind, hostOf, maskUrl, normalizeLayerUrl, validateLayerUrl, validateTermsUrl } from "../parseLayerUrl";
import { probeLayer } from "../probe";
import { userLayerUse } from "../sourceMatch";
import type { UserLayerKind, UserLayerRecord } from "../types";
import type { useUserLayers } from "../useUserLayers";

type Api = ReturnType<typeof useUserLayers>;
const kinds: UserLayerKind[] = ["xyz", "tms", "wms", "arcgis-map", "arcgis-image"];
function newRecord(): UserLayerRecord {
  const now = new Date().toISOString();
  return { id: `user-layer:${crypto.randomUUID()}`, kind: "xyz", role: "overlay", name: "", url: "", attribution: "", termsNote: "", termsUrl: null, minZoom: 0, maxNativeZoom: 19, tileSize: 256, createdAt: now, modifiedAt: now, acknowledgement: null, probe: null, wms: { layers: "", styles: "", format: "image/png", version: "1.3.0", transparent: true }, arcgis: { layers: null } };
}
export function UserLayerControls({ api, statuses, licenceAccepted, onReviewLicence, position }: { api: Api; statuses: Record<string, string>; licenceAccepted: boolean; onReviewLicence: () => void; position: { latitude: number; longitude: number; zoom: number } }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const probeSequence = useRef(0);
  const [draft, setDraft] = useState<UserLayerRecord | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [addressFocused, setAddressFocused] = useState(false);
  const [kindChosen, setKindChosen] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const dialogOpen = draft !== null && !suspended;
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    root?.querySelector<HTMLInputElement>("input")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); probeSequence.current++; setDraft(null); }
      if (event.key !== "Tab" || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]"));
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [dialogOpen]);
  const update = (change: Partial<UserLayerRecord>) => setDraft(current => current && ({ ...current, ...change }));
  const isEditing = !!draft && api.records.some(record => record.id === draft.id);
  const validate = draft && (validateLayerUrl(draft.url, draft.kind) ?? validateTermsUrl(draft.termsUrl ?? ""));
  const canSave = !!draft && !validate && Number.isInteger(draft.minZoom) && Number.isInteger(draft.maxNativeZoom) && draft.minZoom >= 0 && draft.maxNativeZoom <= 23 && draft.minZoom <= draft.maxNativeZoom && !!draft.name.trim() && !!draft.attribution.trim() && !!draft.termsNote.trim() && !!draft.acknowledgement && (draft.kind !== "wms" || !!draft.wms?.layers.trim());
  async function test() {
    if (!draft || validate) return;
    const gate = userLayerUse(draft, undefined, licenceAccepted);
    if (gate.view !== "allowed") { if (gate.view === "needs-acceptance") { setSuspended(true); onReviewLicence(); } setError(gate.reason ?? "Accept the Province licence before testing."); return; }
    const requestKey = (record: UserLayerRecord) => JSON.stringify([record.id, record.url, record.kind, record.tileSize, record.minZoom, record.maxNativeZoom, record.wms, record.arcgis]);
    const key = requestKey(draft);
    const sequence = ++probeSequence.current;
    setTesting(true); setError("");
    try { const probe = await probeLayer({ ...draft, url: normalizeLayerUrl(draft.url, draft.kind) }, licenceAccepted, { lat: position.latitude, lng: position.longitude }, position.zoom); setDraft(current => current && probeSequence.current === sequence && requestKey(current) === key ? { ...current, probe } : current); }
    catch (e) { setError(e instanceof Error ? e.message : "Test failed."); } finally { if (probeSequence.current === sequence) setTesting(false); }
  }
  async function save() {
    if (!draft || !canSave) return;
    await api.save({ ...draft, url: normalizeLayerUrl(draft.url, draft.kind), modifiedAt: new Date().toISOString() }); setDraft(null); setError("");
  }
  return <section aria-label="Your layers"><h3>Your layers</h3><p>Layers you add stay in this browser.</p>
    {api.storageError && <p role="status">Could not save your layers. Changes may last only for this session.</p>}
    <button type="button" disabled={!api.loaded} onClick={() => { probeSequence.current++; setTesting(false); setSuspended(false); setKindChosen(false); setDraft(newRecord()); setShowUrl(false); setError(""); }}>Add your own layer</button>
    {draft && suspended && <button type="button" onClick={() => setSuspended(false)}>Resume editing layer</button>}
    {api.records.map(record => { const gate = userLayerUse(record, undefined, licenceAccepted); const state = api.state[record.id]; return <div key={record.id} className="user-layer-row">
      <label><input type="checkbox" checked={!!state?.enabled} disabled={gate.view === "refused"} onChange={event => { if (event.target.checked && gate.view === "needs-acceptance") { onReviewLicence(); return; } api.setEnabled(record.id, event.target.checked); }} /> {record.name} <strong>Your layer</strong></label>
      <p>Added by you - {hostOf(record.url)} - not an NS Marks The Spot source</p>
      {gate.matched.map(match => <p key={match.layerId}>This address is already offered by NS Marks The Spot as “{match.name}”. The same conditions apply.</p>)}
      {state?.enabled && gate.view === "allowed" && statuses[record.id] && statuses[record.id] !== "Ready" && <p role="status">{statuses[record.id]}</p>}
      {gate.view === "needs-acceptance" && <p>Province licence acceptance is needed to view this layer.</p>}
      {gate.reason && <p>{gate.reason}</p>}
      <p>{record.termsNote} {record.termsUrl && <a href={record.termsUrl} target="_blank" rel="noreferrer">Terms</a>}</p>
      <p>Added {record.createdAt.slice(0, 10)}. {record.probe ? `Last tested ${record.probe.at.slice(0, 10)}.` : "Not tested. Edit this layer to test it."}</p>
      {record.probe?.diagnostic && <p>Test on {record.probe.at.slice(0, 10)}: {record.probe.diagnostic}</p>}
      {record.probe?.display && !record.probe.corsReadable && <p>Draws here. Cannot go in a PDF: the server does not let other sites read its images.</p>}
      <label>Opacity <input type="range" min="0" max="1" step="0.05" value={state?.opacity ?? 1} onChange={event => api.setOpacity(record.id, Number(event.target.value))} /></label>
      <button type="button" onClick={() => { probeSequence.current++; setTesting(false); setSuspended(false); setKindChosen(true); setDraft(record); setShowUrl(false); setError(""); }}>Edit</button> <button type="button" onClick={() => { if (window.confirm(`Remove your layer “${record.name}”?`)) void api.remove(record.id); }}>Remove</button>
    </div>; })}
    {draft && !suspended && createPortal(<div ref={dialogRef} role="dialog" aria-modal="true" aria-label={isEditing ? "Edit your layer" : "Add your own layer"} className="user-layer-dialog"><h3>{isEditing ? "Edit your layer" : "Add your own layer"}</h3>
      <label>Address <input type="text" autoComplete="off" spellCheck={false} readOnly={isEditing && !showUrl} value={showUrl || (!isEditing && addressFocused) ? draft.url : draft.url ? maskUrl(draft.url) : ""} onFocus={() => setAddressFocused(true)} onBlur={() => setAddressFocused(false)} onChange={e => { const url = e.target.value; update({ url, kind: kindChosen ? draft.kind : guessKind(url), acknowledgement: null, probe: null }); }} /></label>
      <button type="button" onClick={() => setShowUrl(!showUrl)}>{showUrl ? "Hide" : "Show"}</button>{draft.url && <p>{maskUrl(draft.url)}</p>}
      <label>Kind <select value={draft.kind} onChange={e => { setKindChosen(true); update({ kind: e.target.value as UserLayerKind, probe: null }); }}>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
      <label>Name <input value={draft.name} onChange={e => update({ name: e.target.value })} /></label>
      <label>Use as <select value={draft.role} onChange={e => update({ role: e.target.value as "base" | "overlay" })}><option value="base">Base map</option><option value="overlay">Overlay</option></select></label>
      <label>Credit line <input value={draft.attribution} onChange={e => update({ attribution: e.target.value })} /></label>
      <label>Terms <input value={draft.termsNote} onChange={e => update({ termsNote: e.target.value })} /></label>
      <label>Terms link <input value={draft.termsUrl ?? ""} onChange={e => update({ termsUrl: e.target.value || null })} /></label>
      <label>Minimum zoom <input type="number" min="0" max="23" value={draft.minZoom} onChange={e => update({ minZoom: Number(e.target.value), probe: null })} /></label>
      <label>Maximum native zoom <input type="number" min="0" max="23" value={draft.maxNativeZoom} onChange={e => update({ maxNativeZoom: Number(e.target.value), probe: null })} /></label>
      <label>Tile size <select value={draft.tileSize} onChange={e => update({ tileSize: Number(e.target.value) as 256 | 512, probe: null })}><option value="256">256</option><option value="512">512</option></select></label>
      {draft.kind === "wms" && <>
        <label>WMS layers <input value={draft.wms?.layers ?? ""} onChange={e => update({ wms: { ...draft.wms!, layers: e.target.value }, probe: null })} /></label>
        <label>WMS styles <input value={draft.wms?.styles ?? ""} onChange={e => update({ wms: { ...draft.wms!, styles: e.target.value }, probe: null })} /></label>
        <label>WMS version <select value={draft.wms?.version ?? "1.3.0"} onChange={e => update({ wms: { ...draft.wms!, version: e.target.value as "1.1.1" | "1.3.0" }, probe: null })}><option>1.3.0</option><option>1.1.1</option></select></label>
        <label>Image format <select value={draft.wms?.format ?? "image/png"} onChange={e => update({ wms: { ...draft.wms!, format: e.target.value as "image/png" | "image/jpeg" }, probe: null })}><option>image/png</option><option>image/jpeg</option></select></label>
        <label><input type="checkbox" checked={draft.wms?.transparent ?? true} onChange={e => update({ wms: { ...draft.wms!, transparent: e.target.checked }, probe: null })} /> Transparent</label>
      </>}
      {(draft.kind === "arcgis-map" || draft.kind === "arcgis-image") && <label>ArcGIS layers <input value={draft.arcgis?.layers ?? ""} onChange={e => update({ arcgis: { layers: e.target.value || null }, probe: null })} /></label>}
      <p>NS Marks The Spot does not provide or check this source. You are responsible for following its terms, including for PDF export and sharing. The address is stored only on this device. Requests go from your device straight to that server, which can see your IP address and the area you view.</p>
      <label><input type="checkbox" checked={!!draft.acknowledgement} onChange={e => update({ acknowledgement: e.target.checked ? { version: 1, at: new Date().toISOString() } : null })} /> I have read this source's terms and I am responsible for how I use it.</label>
      {validate && draft.url && <p>{validate}</p>}{error && <p role="alert">{error}</p>}
      {draft.probe && <><p>Draws: {draft.probe.display ? "yes" : "no"}. PDF export: {draft.probe.corsReadable && userLayerUse(draft, undefined, licenceAccepted).export === "allowed" ? "yes" : "no"}.</p>{draft.probe.diagnostic && <p>{draft.probe.diagnostic}</p>}{userLayerUse(draft, undefined, licenceAccepted).export === "held" && <p>{userLayerUse(draft, undefined, licenceAccepted).reason}</p>}</>}
      <button type="button" disabled={!!validate || testing || !draft.url} onClick={() => void test()}>Test</button>
      <button type="button" onClick={() => { probeSequence.current++; setTesting(false); setDraft(null); }}>Cancel</button><button type="button" disabled={!canSave} onClick={() => void save()}>{isEditing ? "Save" : "Add"}</button>
    </div>, document.body)}
  </section>;
}

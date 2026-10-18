import { useCallback, useState } from 'react';
import { MapContainer } from 'react-leaflet';
import { ElectoralFeatureLayer } from '../src/components/ElectoralFeatureLayer';
import { DistrictInspector } from '../src/components/DistrictInspector';
import { ElectoralLegend } from '../src/components/ElectoralLayerControls';
import { electoralLayerById, type ElectoralLayerId, type ElectoralMode } from '../src/layers/electoralLayers';
import type { ElectoralSelection } from '../src/elections/electoralData';
import type { MapLayerId, MapLayerStatus } from '../src/components/MapCanvas';
import 'leaflet/dist/leaflet.css';
import '../src/styles.css';

// Development verification only, like print.tsx. The fixture supplies an
// accepted-licence prop; it never changes the user's stored licence acceptance.
// Reads the actual public source directly. No provincial extract is bundled.
export function Fixture() {
  const [federalReference,setFederalReference] = useState(false);
  const [source,setSource] = useState<ElectoralLayerId>('provincial-results-2024');
  const [mode,setMode] = useState<ElectoralMode>('winner');
  const [selection,setSelection] = useState<ElectoralSelection|null>(null);
  const [status,setStatus] = useState<MapLayerStatus>({status:'idle'});
  const report = useCallback((_id:MapLayerId,value:MapLayerStatus) => setStatus(value),[]);
  return <main style={{height:'100dvh',display:'flex',flexDirection:'column'}}>
    <header style={{padding:8}}><strong>Electoral component verification</strong><p>Live source · fixture licence state · no saved acceptance</p>
      <label><input type="checkbox" aria-label="Federal reference overlay" checked={federalReference} onChange={e=>setFederalReference(e.target.checked)} />Federal reference overlay</label>
      <label>Source <select aria-label="Electoral source" value={source} onChange={e=>{setSource(e.target.value as ElectoralLayerId);setSelection(null);}}>{Object.values(electoralLayerById).map(layer=><option value={layer.id} key={layer.id}>{layer.name}</option>)}</select></label>
      <label>Display <select aria-label="Results display" value={mode} onChange={e=>setMode(e.target.value as ElectoralMode)}><option value="winner">Winning party</option><option value="margin">Margin of victory</option><option value="turnout">Turnout</option></select></label><span role="status"> {status.status}{status.status==='ready' ? ` · ${status.count} districts` : ''}</span>
      <ElectoralLegend mode={mode} night={false} />
    </header>
    <div style={{position:'relative',flex:1,minHeight:0}}>
      <MapContainer center={[44.8,-65.3]} zoom={Number(new URLSearchParams(window.location.search).get("zoom") ?? 9)} style={{height:'100%',background:'#fbf6ea'}}>
        <ElectoralFeatureLayer layer={electoralLayerById["federal-ridings-2025"]} visible={federalReference} licenceAccepted mode="boundaries" night={false} renderMode="interactive" onSelect={setSelection} />
        <ElectoralFeatureLayer key={source} layer={electoralLayerById[source]} visible licenceAccepted mode={['results','seats'].includes(electoralLayerById[source].electoral.kind) ? mode : 'boundaries'} night={false} renderMode="interactive" onSelect={setSelection} onStatusChange={report} />
      </MapContainer>
      {selection ? <DistrictInspector selection={selection} onClose={()=>setSelection(null)} night={false} /> : null}
    </div>
  </main>;
}

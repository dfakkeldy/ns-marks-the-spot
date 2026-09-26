import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { loadRhodenaTerrain } from './terrainData';
import { visibilityFromPoint, visibilityLabels, type VisibilityResult, type TerrainGrid } from './visibility';
import features from './features.json';
import type { MapLayerId, MapLayerStatus } from '../components/MapCanvas';
const turbines=features.features.filter(f=>f.properties.kind==='turbine').map(f=>({id:f.id,lat:f.geometry.coordinates[1] as number,lng:f.geometry.coordinates[0] as number}));
export function RhodenaVisibility({ onPickingChange, onStatusChange }: {
  onPickingChange: (value:boolean)=>void;
  onStatusChange?: (id:MapLayerId,status:MapLayerStatus)=>void;
}) {
  const map=useMap();const [host,setHost]=useState<HTMLElement|null>(null);
  const [selected,setSelected]=useState('T1');const [picking,setPicking]=useState(false);
  const [results,setResults]=useState<Array<{id:string;result:VisibilityResult}>|null>(null);
  const [message,setMessage]=useState('Loading terrain…');const [retry,setRetry]=useState(0);
  const gridRef=useRef<TerrainGrid|null>(null);const marker=useRef<L.CircleMarker|null>(null);
  useEffect(()=>{
    const container=L.DomUtil.create('div','rhodena-visibility-control');
    L.DomEvent.disableClickPropagation(container);L.DomEvent.disableScrollPropagation(container);
    // Keep a toolbar press from folding the app footer on pointer-down and
    // moving this bottom-anchored button before the matching pointer-up.
    L.DomEvent.on(container,'pointerdown',L.DomEvent.stopPropagation);
    const control=new L.Control({position:'bottomright'});control.onAdd=()=>container;control.addTo(map);setHost(container);
    return()=>{control.remove();marker.current?.remove();};
  },[map]);
  useEffect(()=>{onPickingChange(picking);return()=>onPickingChange(false);},[picking,onPickingChange]);
  useEffect(()=>{
    let cancelled=false;let worker:Worker|undefined;let overlay:L.ImageOverlay|undefined;
    onStatusChange?.('rhodena-visibility',{status:'loading'});
    setMessage('Calculating terrain visibility…');
    void loadRhodenaTerrain().then(grid=>{
      if(cancelled)return;gridRef.current=grid;
      worker=new Worker(new URL('./visibility.worker.ts',import.meta.url),{type:'module'});
      const fail=()=>{if(cancelled)return;setMessage('Visibility calculation unavailable. Retry to load the terrain again.');onStatusChange?.('rhodena-visibility',{status:'error'});};
      worker.onerror=fail;
      worker.onmessage=event=>{
        if(cancelled)return;if(typeof event.data.progress==='number'){setMessage(`Calculating ${selected} visibility… ${event.data.progress}%`);return;}if(event.data.error){fail();return;}
        const {width,height,rgba}=event.data as {width:number;height:number;rgba:Uint8ClampedArray};
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');if(!context){fail();return;}
        const pixels=context.createImageData(width,height);pixels.data.set(rgba);context.putImageData(pixels,0,0);
        const pane=map.getPane('rhodena-visibility')??map.createPane('rhodena-visibility',map.getPane('tilePane'));pane.style.zIndex='242';pane.style.pointerEvents='none';
        overlay=L.imageOverlay(canvas.toDataURL(),grid.meta.bounds as L.LatLngBoundsExpression,{pane:'rhodena-visibility',interactive:false,className:'rhodena-viewshed-raster'}).addTo(map);
        setMessage(`${selected}: preliminary 200 m blade-tip visibility`);onStatusChange?.('rhodena-visibility',{status:'ready'});worker?.terminate();
      };
      worker.postMessage({grid,turbine:turbines.find(t=>t.id===selected)!});
    }).catch(()=>{if(!cancelled){setMessage('Terrain could not be loaded or verified. Retry; a blank overlay is not evidence of invisibility.');onStatusChange?.('rhodena-visibility',{status:'error'});}});
    return()=>{cancelled=true;worker?.terminate();overlay?.remove();};
  },[map,selected,retry,onStatusChange]);
  useEffect(()=>{
    if(!picking)return;
    const click=(e:L.LeafletMouseEvent)=>{
      if(!gridRef.current)return;
      const target=e.originalEvent?.target;
      if(target instanceof Element && target.closest('.rhodena-visibility-control'))return;
      marker.current?.remove();
      setResults(turbines.map(t=>({id:t.id,result:visibilityFromPoint(gridRef.current!,e.latlng,t)})));
      marker.current=L.circleMarker(e.latlng,{radius:6,color:'#1356aa',fillColor:'#fff',fillOpacity:1,weight:3,interactive:false,pmIgnore:true,snapIgnore:true} as L.CircleMarkerOptions).addTo(map);
      setPicking(false);
    };
    map.on('click',click);return()=>{map.off('click',click);};
  },[map,picking]);
  return host?createPortal(<details open className="rhodena-visibility-details" onClick={event=>event.stopPropagation()}><summary>Turbine visibility · preliminary</summary>
    <label>Viewshed for <select aria-label="Viewshed turbine" value={selected} onChange={e=>setSelected(e.target.value)}>{turbines.map(t=><option key={t.id}>{t.id}</option>)}</select></label>
    <p role="status">{message}</p>
    <button type="button" onClick={()=>setPicking(!picking)} disabled={!gridRef.current}>{picking?'Cancel viewpoint':'Choose a viewpoint'}</button>{' '}
    <button type="button" onClick={()=>{marker.current?.remove();marker.current=null;setResults(null);setPicking(false);}}>Clear point</button>
    {message.includes('Retry')?<button type="button" onClick={()=>setRetry(n=>n+1)}>Retry terrain</button>:null}
    {picking?<p>Tap the map near your home to compare all six turbines.</p>:null}
    {results?<section className="rhodena-viewpoint-results" aria-label="Viewpoint comparison"><strong>Turbines from this viewpoint</strong><ul>{results.map(({id,result:r})=><li key={id}><strong>{id}:</strong> {visibilityLabels[r.status]} · {(r.distanceM/1000).toFixed(1)} km{r.status==='potential'?(r.hubPotential?' · hub also potentially visible':' · upper blade may be visible; hub screened'):''}</li>)}</ul><p>This point stays in this browser; it is not saved or shared.</p></section>:null}
    <p className="rhodena-visibility-legend"><span>🟩 Potential tip visibility</span><span>⬛ Terrain screened</span><span>🟨 Near threshold</span><span>Uncoloured: outside coverage or 20 km range</span></p>
    <details><summary>How to read this</summary><p>200 m maximum blade tip; 1.7 m observer. Bare-earth terrain sampled about every 27 m; overview cells about 106 m. Trees, buildings, weather and turbine motion are excluded. The 118 m hub is the 2024 model assumption, not final design.</p><p>Yellow is within a 20 m target-height sensitivity band, not a confidence interval. Earth curvature and an assumed refraction factor of 0.13 are included. Terrain accuracy and local vertical datum are unverified. Use this to identify views to investigate, not as a verified view from a house.</p><p>Mapzen terrain, retrieved September 26, 2026. Contains information licensed under the Open Government Licence – Canada. SRTM/GMTED2010: USGS; ETOPO1: NOAA. <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Source</a>{' · '}<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Licences</a></p></details>
  </details>,host):null;
}

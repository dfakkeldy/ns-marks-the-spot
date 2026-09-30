import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { loadRhodenaTerrain } from './terrainData';
import { combinedVisibility, viewpointSummary, visibilityFromPoint, visibilityLabels, type VisibilityResult, type VisibilityStatus, type TerrainGrid } from './visibility';
import { distanceMetres } from '../services/geodesy';
import features from './features.json';
import type { MapLayerId, MapLayerStatus } from '../components/MapCanvas';
const turbines=features.features.filter(f=>f.properties.kind==='turbine').map(f=>({id:f.id,lat:f.geometry.coordinates[1] as number,lng:f.geometry.coordinates[0] as number}));
/** Same classes as the viewshed raster. */
const lineColors: Partial<Record<VisibilityStatus,string>> = { potential:'#177e70', blocked:'#646971', uncertain:'#cd8b24' };
const ridgeIcon=L.divIcon({className:'rhodena-ridge-marker',iconSize:[16,14],iconAnchor:[8,10],html:'<svg viewBox="0 0 16 14" aria-hidden="true"><path d="M8 1.5 14.5 12.5h-13Z" fill="#7a5a3a" stroke="#fffdf7" stroke-width="1.6" stroke-linejoin="round"/></svg>'});
const km=(metres:number)=>`${(metres/1000).toFixed(1)} km`;
type Viewpoint={at:L.LatLng;results:Array<{id:string;result:VisibilityResult}>};
/** Eye-to-tip sight lines: solid while the line clears bare earth, then a
 * ridge mark and a dotted remainder where the ground first rises into it. */
function drawSightLines(map:L.Map,{at,results}:Viewpoint):L.LayerGroup{
  const pane=map.getPane('rhodena-sightlines')??map.createPane('rhodena-sightlines',map.getPane('tilePane'));
  pane.style.zIndex='244';pane.style.pointerEvents='none';
  const quiet={interactive:false,pmIgnore:true,snapIgnore:true};
  const group=L.layerGroup();
  for(const {id,result} of results){
    const color=lineColors[result.status];if(!color)continue;
    const turbine=turbines.find(t=>t.id===id)!;const end=result.obstruction??turbine;
    L.polyline([at,end],{...quiet,pane:'rhodena-sightlines',color:'#fffdf7',weight:7,opacity:0.8,lineCap:'round'} as L.PolylineOptions).addTo(group);
    L.polyline([at,end],{...quiet,pane:'rhodena-sightlines',color,weight:3.5,lineCap:'round'} as L.PolylineOptions).addTo(group);
    if(result.obstruction){
      L.polyline([result.obstruction,turbine],{...quiet,pane:'rhodena-sightlines',color:'#fffdf7',weight:6,opacity:0.45,lineCap:'round'} as L.PolylineOptions).addTo(group);
      L.polyline([result.obstruction,turbine],{...quiet,pane:'rhodena-sightlines',color,weight:3.2,dashArray:'0.5 7',lineCap:'round'} as L.PolylineOptions).addTo(group);
      L.marker(result.obstruction,{...quiet,icon:ridgeIcon,keyboard:false} as L.MarkerOptions).addTo(group);
    }
  }
  // Above the ridge marks, which can sit right beside the viewpoint.
  const top=map.getPane('rhodena-viewpoint')??map.createPane('rhodena-viewpoint');
  top.style.zIndex='620';top.style.pointerEvents='none';
  L.circleMarker(at,{...quiet,pane:'rhodena-viewpoint',radius:15,stroke:false,fillColor:'#10313a',fillOpacity:0.2} as L.CircleMarkerOptions).addTo(group);
  L.circleMarker(at,{...quiet,pane:'rhodena-viewpoint',radius:7,color:'#10313a',weight:3.5,fillColor:'#ffffff',fillOpacity:1,className:'rhodena-viewpoint-marker'} as L.CircleMarkerOptions).addTo(group);
  return group.addTo(map);
}
export function RhodenaVisibility({ onPickingChange, onStatusChange, pickPending = false, onPickStarted }: {
  onPickingChange: (value:boolean)=>void;
  onStatusChange?: (id:MapLayerId,status:MapLayerStatus)=>void;
  pickPending?: boolean;
  onPickStarted?: ()=>void;
}) {
  const map=useMap();const [host,setHost]=useState<HTMLElement|null>(null);
  const [selected,setSelected]=useState('all');const [picking,setPicking]=useState(false);
  const [viewpoint,setViewpoint]=useState<Viewpoint|null>(null);const results=viewpoint?.results??null;
  const [message,setMessage]=useState('Loading terrain…');const [retry,setRetry]=useState(0);const [gridReady,setGridReady]=useState(false);
  const gridRef=useRef<TerrainGrid|null>(null);
  useEffect(()=>{
    const container=L.DomUtil.create('div','rhodena-visibility-control');
    L.DomEvent.disableClickPropagation(container);L.DomEvent.disableScrollPropagation(container);
    // Keep a toolbar press from folding the app footer on pointer-down and
    // moving this bottom-anchored button before the matching pointer-up.
    L.DomEvent.on(container,'pointerdown',L.DomEvent.stopPropagation);
    const control=new L.Control({position:'bottomright'});control.onAdd=()=>container;control.addTo(map);setHost(container);
    return()=>{control.remove();};
  },[map]);
  useEffect(()=>{onPickingChange(picking);return()=>onPickingChange(false);},[picking,onPickingChange]);
  // While choosing, the panel shrinks to its prompt so it does not cover the place being chosen.
  useEffect(()=>{host?.classList.toggle('picking',picking);},[host,picking]);
  useEffect(()=>{if(pickPending&&gridReady){setPicking(true);onPickStarted?.();}},[pickPending,gridReady,onPickStarted]);
  useEffect(()=>{
    let cancelled=false;let settled=false;let worker:Worker|undefined;let overlay:L.ImageOverlay|undefined;let watchdog:ReturnType<typeof setTimeout>|undefined;
    onStatusChange?.('rhodena-visibility',{status:'loading'});
    setMessage('Calculating terrain visibility…');
    void loadRhodenaTerrain().then(grid=>{
      if(cancelled)return;gridRef.current=grid;setGridReady(true);
      worker=new Worker(new URL('./visibility.worker.ts',import.meta.url),{type:'module'});
      const fail=()=>{if(cancelled||settled)return;settled=true;clearTimeout(watchdog);worker?.terminate();overlay?.remove();setMessage('Visibility calculation unavailable. Retry to load the terrain again. A blank overlay is not evidence of invisibility.');onStatusChange?.('rhodena-visibility',{status:'error'});};
      worker.onerror=fail;worker.onmessageerror=fail;
      // A worker killed by the browser can stop without an error event.
      watchdog=setTimeout(fail,120_000);
      worker.onmessage=event=>{
        if(cancelled||settled)return;
        try {
          if(typeof event.data.progress==='number'){setMessage(`Calculating ${selected==='all'?'all six turbines':selected} visibility… ${event.data.progress}%`);return;}if(event.data.error){fail();return;}
          const {width,height,rgba}=event.data as {width:number;height:number;rgba:Uint8ClampedArray};
          const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          const context=canvas.getContext('2d');if(!context){fail();return;}
          const pixels=context.createImageData(width,height);pixels.data.set(rgba);context.putImageData(pixels,0,0);
          const pane=map.getPane('rhodena-visibility')??map.createPane('rhodena-visibility',map.getPane('tilePane'));pane.style.zIndex='242';pane.style.pointerEvents='none';
          overlay=L.imageOverlay(canvas.toDataURL(),grid.meta.bounds as L.LatLngBoundsExpression,{pane:'rhodena-visibility',interactive:false,className:'rhodena-viewshed-raster'}).addTo(map);
          settled=true;clearTimeout(watchdog);setMessage(selected==='all'?'All six turbines: combined potential visibility':`${selected}: preliminary 200 m blade-tip visibility`);onStatusChange?.('rhodena-visibility',{status:'ready'});worker?.terminate();
        } catch { fail(); }
      };
      worker.postMessage({grid,turbines:selected==='all'?turbines:turbines.filter(t=>t.id===selected)});
    }).catch(()=>{clearTimeout(watchdog);worker?.terminate();if(!cancelled){setMessage('Terrain could not be loaded or verified. Retry; a blank overlay is not evidence of invisibility.');onStatusChange?.('rhodena-visibility',{status:'error'});}});
    return()=>{cancelled=true;clearTimeout(watchdog);worker?.terminate();overlay?.remove();};
  },[map,selected,retry,onStatusChange]);
  useEffect(()=>{
    if(!picking)return;
    // Listen before any layer can: historical features, parcels and other
    // overlays otherwise take the tap for their own popups.
    const container=map.getContainer();container.classList.add('rhodena-picking');
    let down:{x:number;y:number}|null=null;
    const press=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
    const click=(e:MouseEvent)=>{
      if(!gridRef.current||(e.target instanceof Element&&e.target.closest('.leaflet-control')))return;
      if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)return;
      e.stopPropagation();e.preventDefault();
      const at=map.mouseEventToLatLng(e);
      setViewpoint({at,results:turbines.map(t=>({id:t.id,result:visibilityFromPoint(gridRef.current!,at,t)}))});
      setPicking(false);
    };
    container.addEventListener('pointerdown',press,true);container.addEventListener('click',click,true);
    return()=>{container.classList.remove('rhodena-picking');container.removeEventListener('pointerdown',press,true);container.removeEventListener('click',click,true);};
  },[map,picking]);
  useEffect(()=>{
    if(!viewpoint)return;
    const group=drawSightLines(map,viewpoint);
    // The lines are the answer now; the viewshed steps back behind them.
    map.getContainer().classList.add('rhodena-has-viewpoint');
    // Bring every turbine into view, clear of this panel.
    const bounds=L.latLngBounds([viewpoint.at,...turbines.map(t=>L.latLng(t.lat,t.lng))]);
    if(!map.getBounds().contains(bounds)){
      const size=map.getSize(),panel=host?.getBoundingClientRect();
      const wide=size.x>700;
      map.fitBounds(bounds,{paddingTopLeft:[70,70],paddingBottomRight:[wide?(panel?.width??0)+50:30,wide?40:Math.min(size.y*0.5,(panel?.height??0)+30)],maxZoom:15,animate:!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches});
    }
    return()=>{group.remove();map.getContainer().classList.remove('rhodena-has-viewpoint');};
  },[map,viewpoint,host]);
  return host?createPortal(<details open className="rhodena-visibility-details" onClick={event=>event.stopPropagation()}><summary><span>Turbine visibility</span><span className="rhodena-visibility-chip">Preliminary</span></summary>
    <label>Viewshed for <select aria-label="Viewshed selection" value={selected} onChange={e=>setSelected(e.target.value)}><option value="all">All six turbines</option>{turbines.map(t=><option key={t.id}>{t.id}</option>)}</select></label>
    <p role="status">{message}</p>
    <div className="rhodena-visibility-buttons">
      <button type="button" className="rhodena-visibility-pick" onClick={()=>setPicking(!picking)} disabled={!gridReady}>{picking?'Cancel viewpoint':'Choose a viewpoint'}</button>
      <button type="button" onClick={()=>{setViewpoint(null);setPicking(false);}}>Clear point</button>
      {message.includes('Retry')?<button type="button" onClick={()=>setRetry(n=>n+1)}>Retry terrain</button>:null}
    </div>
    {picking?<p className="rhodena-visibility-hint">Tap the map near your home to compare all six turbines.</p>
      :results?null:<p className="rhodena-visibility-intro">Choose a spot to draw a sight line from eye level to each turbine’s blade tip. Where the ground rises into a line, it breaks.</p>}
    {results?<section className="rhodena-viewpoint-results" aria-label="Viewpoint comparison"><strong>Turbines from this viewpoint</strong><p className="rhodena-visibility-summary" data-status={combinedVisibility(results.map(({result})=>result.status))}>{viewpointSummary(results.map(({result})=>result))}</p><ul>{results.map(({id,result:r})=><li key={id} data-status={r.status}><strong>{id}</strong><span>{visibilityLabels[r.status]}{r.status==='potential'?(r.hubPotential?' · hub also potentially visible':' · upper blade may be visible; hub screened'):''}{r.obstruction&&viewpoint?` · ground rises into view ${km(distanceMetres(viewpoint.at,r.obstruction))} away`:''}</span><span className="rhodena-viewpoint-distance">{km(r.distanceM)}</span></li>)}</ul>
      <p className="rhodena-sightline-key"><span><svg viewBox="0 0 28 8" aria-hidden="true"><path d="M2 4H26" stroke="#177e70" strokeWidth="3.5" strokeLinecap="round"/></svg>Sight line clears the ground to the blade tip</span><span><svg viewBox="0 0 28 10" aria-hidden="true"><path d="M2 5H10" stroke="#646971" strokeWidth="3.5" strokeLinecap="round"/><path d="M13 1.5 17.5 8.5h-9Z" fill="#7a5a3a"/><path d="M20 5H27" stroke="#646971" strokeWidth="3" strokeDasharray="0.5 4" strokeLinecap="round"/></svg>Ground rises into the line, then dotted</span></p>
      <p>This point stays in this browser; it is not saved or shared.</p></section>:null}
    <p className="rhodena-visibility-legend"><span><i aria-hidden="true" data-status="potential" />{selected==='all'?'At least one tip potentially visible':'Potential tip visibility'}</span><span><i aria-hidden="true" data-status="blocked" />{selected==='all'?'All six tips terrain-screened':'Terrain screened'}</span><span><i aria-hidden="true" data-status="uncertain" />{selected==='all'?'Uncertain potential visibility':'Near threshold'}</span><span><i aria-hidden="true" />Uncoloured: outside coverage or 20 km range</span></p>
    <details><summary>How to read this</summary><p>The combined view is green when any turbine has potential tip visibility, grey only when all six are terrain-screened, and amber when none has clear potential visibility but at least one is near the threshold. Unassessed turbines prevent a grey result.</p><p>200 m maximum blade tip; 1.7 m observer. Bare-earth terrain sampled about every 27 m; overview cells about 106 m. Trees, buildings, weather and turbine motion are excluded. The 118 m hub is the 2024 model assumption, not final design.</p><p>Yellow is within a 20 m target-height sensitivity band, not a confidence interval. Earth curvature and an assumed refraction factor of 0.13 are included. Terrain accuracy and local vertical datum are unverified. Use this to identify views to investigate, not as a verified view from a house.</p><p>Mapzen terrain, retrieved September 26, 2026. Contains information licensed under the Open Government Licence – Canada. SRTM/GMTED2010: USGS; ETOPO1: NOAA. <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Source</a>{' · '}<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Licences</a></p></details>
  </details>,host):null;
}

import { useEffect } from 'react';
import L, { type PathOptions } from 'leaflet';
import { useMap } from 'react-leaflet';
import type { FeatureCollection, Geometry } from 'geojson';
import type { ContextMapLayer } from '../layers/contextLayerCatalog';
import type { MapLayerId, MapLayerStatus, MapRenderMode } from '../components/MapCanvas';
import { rhodenaFeatureInLayer, type RhodenaLayerId } from './catalog';
import data from './features.json';
interface Properties { kind: string; name: string; note: string; sourceUrl: string; sourceDate: string; accuracy: string; groundElevationM?: number; digitized?: boolean }
const collection = data as FeatureCollection<Geometry, Properties>;
const colors: Record<string,string> = { turbine:'#b24719', receptor:'#176879', study:'#a56a15', 'new-road':'#b24719', upgrade:'#79553a', collector:'#b42d86', transmission:'#7350b6', substation:'#b24719', 'model-substation':'#7350b6' };
/** Local factual extracts never query a viewport or send the user's map position. */
export function RhodenaLayer({ layer, visible, onStatusChange, renderMode, interactive = true }: {
  layer: ContextMapLayer; visible: boolean; renderMode: MapRenderMode; interactive?: boolean;
  onStatusChange?: (id: MapLayerId, status: MapLayerStatus) => void;
}) {
  const map=useMap();
  useEffect(()=>{
    if(!visible){onStatusChange?.(layer.id,{status:'idle'});return;}
    const paneName=`rhodena-${layer.id}`;
    const pane=map.getPane(paneName)??map.createPane(paneName,map.getPane('tilePane'));
    pane.style.zIndex=String(layer.zIndex+(layer.id==='rhodena-turbines'?4:0));
    pane.style.pointerEvents=renderMode==='print'||!interactive?'none':'auto';
    const canInteract=renderMode!=='print'&&interactive;
    const features=collection.features.filter(f=>rhodenaFeatureInLayer(f.properties.kind,layer.id as RhodenaLayerId));
    const group=L.featureGroup().addTo(map);
    if(layer.id==='rhodena-distance-rings'){
      for(const f of features)if(f.geometry.type==='Point') L.circle([f.geometry.coordinates[1],f.geometry.coordinates[0]],{radius:1000,color:'#6d7480',weight:1.5,dashArray:'2 6',fill:false,pane:paneName,interactive:false,pmIgnore:true,snapIgnore:true} as L.CircleOptions).addTo(group);
    }else{
      const style=(f?: GeoJSON.Feature):PathOptions=>({color:colors[f?.properties?.kind]??'#b24719',weight:f?.properties?.kind==='study'?2:3,fillOpacity:0.04,dashArray:f?.properties?.digitized?'7 5':undefined,pmIgnore:true,snapIgnore:true} as PathOptions);
      L.geoJSON<Properties>({type:'FeatureCollection',features} as FeatureCollection<Geometry, Properties>,{pane:paneName,interactive:canInteract,style,
        pointToLayer:(feature,latlng)=>L.circleMarker(latlng,{...style(feature),pane:paneName,radius:feature.properties.kind==='turbine'?7:6,fillOpacity:0.95,interactive:canInteract,bubblingMouseEvents:false}),
        onEachFeature:(feature,featureLayer)=>{
          if(!canInteract)return;
          const p=feature.properties as Properties;
          const article=document.createElement('article');article.className='rhodena-popup';
          const title=document.createElement('strong');title.textContent=p.name;article.append(title);
          for(const value of [p.note,p.sourceDate,p.accuracy,p.groundElevationM!==undefined?`Source ground elevation: ${p.groundElevationM} m. This is separate from turbine height above ground.`:null,feature.geometry.type==='Point'?`Latitude ${feature.geometry.coordinates[1].toFixed(6)}, longitude ${feature.geometry.coordinates[0].toFixed(6)}`:null]){
            if(!value)continue;const text=document.createElement('p');text.textContent=value;article.append(text);
          }
          const link=document.createElement('a');link.href=p.sourceUrl;link.target='_blank';link.rel='noreferrer';link.textContent='Read the source';article.append(link);
          featureLayer.bindPopup(article,{maxWidth:310});
          featureLayer.on('add', () => {
            if (!(featureLayer instanceof L.Path)) return;
            const element=featureLayer.getElement();
            if (!element) return;
            element.setAttribute('tabindex','0');
            element.setAttribute('role','button');
            element.setAttribute('aria-label',p.name);
            element.addEventListener('keydown',event=>{
              const key=(event as KeyboardEvent).key;
              if(key==='Enter'||key===' '){event.preventDefault();event.stopPropagation();featureLayer.openPopup();}
            });
          });
          if(feature.geometry.type==='Point')featureLayer.bindTooltip(p.kind==='turbine'?String(feature.id):p.name,{permanent:p.kind==='turbine',direction:'top',className:'rhodena-label'});
        }
      }).addTo(group);
    }
    onStatusChange?.(layer.id,{status:'ready',count:features.length});
    return()=>{group.remove();};
  },[layer,map,onStatusChange,renderMode,visible,interactive]);
  return null;
}

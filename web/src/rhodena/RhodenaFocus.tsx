import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { RHODENA_BOUNDS } from './catalog';
export function RhodenaFocus({ revision }: { revision: number }) {
  const map=useMap();const handled=useRef(0);
  useEffect(()=>{if(revision<=handled.current)return;handled.current=revision;map.fitBounds(RHODENA_BOUNDS,{padding:[24,24],animate:false});},[map,revision]);
  return null;
}

import type { TerrainGrid, TerrainMeta } from './visibility';
let pending: Promise<TerrainGrid> | undefined;
export function loadRhodenaTerrain(): Promise<TerrainGrid> {
  if(!pending)pending=(async()=>{
    const base=`${import.meta.env.BASE_URL}rhodena/`;
    const [mr,dr]=await Promise.all([fetch(`${base}terrain.json`,{signal:AbortSignal.timeout(30000)}),fetch(`${base}terrain.bin`,{signal:AbortSignal.timeout(30000)})]);
    if(!mr.ok||!dr.ok)throw Error('Terrain source unavailable');
    const meta=await mr.json() as TerrainMeta;const data=await dr.arrayBuffer();
    if(!Number.isInteger(meta.width)||!Number.isInteger(meta.height)||meta.width<2||meta.height<2||meta.width*meta.height*2!==data.byteLength)throw Error('Terrain dimensions invalid');
    const digest=await crypto.subtle.digest('SHA-256',data);
    if(Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')!==meta.sha256)throw Error('Terrain source verification failed');
    const view=new DataView(data),values=new Int16Array(data.byteLength/2);
    for(let i=0;i<values.length;i++)values[i]=view.getInt16(i*2,true);
    return {meta,values};
  })().catch(error=>{pending=undefined;throw error;});
  return pending;
}

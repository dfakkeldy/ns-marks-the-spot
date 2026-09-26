#!/usr/bin/env node
import { createCanvas, loadImage } from 'canvas';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out=new URL('../public/rhodena/',import.meta.url);await mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
if(process.argv.includes('--check')){
 const receipt=JSON.parse(await readFile(new URL('terrain.json',out),'utf8'));
 const data=await readFile(new URL('terrain.bin',out));
 if(data.length!==receipt.width*receipt.height*2||sha(data)!==receipt.sha256)throw Error('Rhodena terrain does not match receipt');
 console.log('Rhodena terrain matches its source receipt.');
}else{
 const z=12,n=2**z;
 const tile=(lat,lon)=>[(lon+180)/360*n,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n];
 const [west,north]=tile(45.96,-61.65).map(Math.floor);const [east,south]=tile(45.63,-61.16).map(Math.floor);
 const width=(east-west+1)*256,height=(south-north+1)*256;
 const canvas=createCanvas(width,height),context=canvas.getContext('2d');const tiles=[];
 const cache=new URL('./.rhodena-cache/terrain/',import.meta.url);await mkdir(cache,{recursive:true});
 for(let y=north;y<=south;y++)for(let x=west;x<=east;x++){
  const url=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;const path=new URL(`${z}-${x}-${y}.png`,cache);
  let bytes;try{bytes=await readFile(path);}catch{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${url}: ${r.status}`);bytes=Buffer.from(await r.arrayBuffer());await writeFile(path,bytes);}
  const image=await loadImage(bytes);if(image.width!==256||image.height!==256)throw Error('Unexpected tile dimensions');
  context.drawImage(image,(x-west)*256,(y-north)*256);tiles.push({url,sha256:sha(bytes)});
 }
 const rgba=context.getImageData(0,0,width,height).data;const bin=Buffer.alloc(width*height*2);let min=Infinity,max=-Infinity,nodata=0;
 for(let i=0;i<width*height;i++){
  const j=i*4,e=rgba[j]*256+rgba[j+1]+rgba[j+2]/256-32768;
  const value=rgba[j+3]===255&&e>-100&&e<2000?Math.round(e*10):-32768;
  if(value===-32768)nodata++;else{min=Math.min(min,value/10);max=Math.max(max,value/10);}bin.writeInt16LE(value,i*2);
 }
 if(nodata>0)throw Error(`Unexpected no-data cells: ${nodata}; review source instead of filling`);
 const lat=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI;
 const receipt={version:1,checked:'2026-09-26',source:'Mapzen Terrain Tiles (Terrarium), zoom 12',sourceUrl:'https://registry.opendata.aws/terrain-tiles/',licenceUrl:'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',attribution:'Mapzen terrain. Contains information licensed under the Open Government Licence – Canada. SRTM/GMTED2010: U.S. Geological Survey. ETOPO1: NOAA.',zoom:z,originX:west*256,originY:north*256,width,height,bounds:[[lat(south+1),west/n*360-180],[lat(north),(east+1)/n*360-180]],encoding:'signed little-endian int16 decimetres; -32768 means no data; cell-centred Web Mercator pixels',sha256:sha(bin),minElevationM:min,maxElevationM:max,tiles,limitations:['Approximate 27 m pixel spacing here; underlying terrain source resolution and acquisition dates vary.','Bare earth: trees and buildings are excluded. Vertical accuracy/datum not locally surveyed or reconciled.','Use DEM ground elevation at both ends, never mix in assessment ground elevations.','Preliminary terrain screening, not a verified view from a house.']};
 await writeFile(new URL('terrain.bin',out),bin);await writeFile(new URL('terrain.json',out),JSON.stringify(receipt,null,2)+'\n');
 console.log(`${tiles.length} source tiles; ${width} × ${height}; ${(bin.length/1e6).toFixed(1)} MB; elevation ${min}–${max} m.`);
}

#!/usr/bin/env node
// Reproducible factual extraction; original PDFs and basemaps are not redistributed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';
const input = JSON.parse(await readFile(new URL('./rhodena/inputs.json', import.meta.url), 'utf8'));
const project = '+proj=utm +zone=20 +datum=NAD83 +units=m +no_defs';
const ll = (p) => proj4(project, 'EPSG:4326', p).map(n => Number(n.toFixed(6)));
const sha = b => createHash('sha256').update(b).digest('hex');
const sourceUrl = key => input.sources[key].url;
const appendix = sourceUrl('appendix-j-m.pdf');
// A similarity fit preserves shape and scale without warping to fit the controls.
function fit(controls) {
  const rows = controls.map(([id,x,y]) => [x,-y,...input.turbines.find(t => t[0] === id).slice(1,3)]);
  const means = [0,1,2,3].map(k => rows.reduce((sum,r) => sum+r[k],0)/rows.length);
  let den=0,a=0,b=0;
  for (const r of rows) { const [x,y,e,n]=r.map((v,k)=>v-means[k]); den+=x*x+y*y; a+=x*e+y*n; b+=x*n-y*e; }
  a/=den;b/=den;
  const transform=([x,y])=>[means[2]+a*(x-means[0])+b*(y+means[1]),means[3]+b*(x-means[0])-a*(y+means[1])];
  return {transform, metresPerPixel:Math.hypot(a,b)};
}
const fits={};const validation={};
for (const [name,sheet] of Object.entries(input.digitization.sheets)) {
  const f=fit(sheet.controls);fits[name]=f;
  const residuals=sheet.controls.map(([id,x,y])=>{const p=f.transform([x,y]);const t=input.turbines.find(t=>t[0]===id);return Math.hypot(p[0]-t[1],p[1]-t[2]);});
  const leaveOneOut=sheet.controls.length>2 ? sheet.controls.map(([id,x,y],i)=>{const p=fit(sheet.controls.filter((_,j)=>j!==i)).transform([x,y]); const t=input.turbines.find(t=>t[0]===id); return Math.hypot(p[0]-t[1],p[1]-t[2]);}) : [];
  if (Math.max(...residuals)>sheet.maxResidualM || leaveOneOut.length && Math.max(...leaveOneOut)>sheet.maxLeaveOneOutM) throw Error(`Registration failed: ${name} ${residuals} ${leaveOneOut}`);
  validation[name]={metresPerPixel:f.metresPerPixel,fitResidualsM:residuals,leaveOneOutM:leaveOneOut,limitation:sheet.controls.length===2?'Two control points: fit residual is not independent accuracy evidence. Checked against the independent overview substation symbol below.':'Symbol-centre cross-validation only; not ground-survey accuracy.'};
}
const substation = fits['2.3B'].transform([1038,468]);
const overviewSubstation = fits['2.2'].transform([727,667]);
const substationCrossCheckM=Math.hypot(substation[0]-overviewSubstation[0],substation[1]-overviewSubstation[1]);
if(substationCrossCheckM>60) throw Error('Substation sheet cross-check failed');
const feature=(id,kind,name,geometry,note,url,date,accuracy,extra={})=>({type:'Feature',id,geometry,properties:{kind,name,note,sourceUrl:url,sourceDate:date,accuracy,...extra}});
const features=input.turbines.map(([id,e,n,lat,lon,elevation])=>{
  const converted=ll([e,n]);
  if(Math.abs(converted[0]-lon)>0.00002 || Math.abs(converted[1]-lat)>0.00002) throw Error('Published coordinate cross-check failed');
  return feature(`T${id}`,'turbine',`T${id} · proposed turbine`,{type:'Point',coordinates:[lon,lat]},'2024 six-turbine assessment. Up to 7 MW each; up to 200 m above ground to blade tip. The July specification models 118 m hub + 81.5 m blade. Final turbine selection and placement are not verified.',`${appendix}#page=${id<5?2:3}`,'July 24, 2024 · Appendix J, Table 1','Published coordinates; survey accuracy not stated',{turbineId:id,easting:e,northing:n,groundElevationM:elevation});
});
features.push(...input.receptors.map(([id,e,n,result])=>feature(`receptor-${id}`,'receptor',`Receptor ${id}${id==='A'?' / noise R1':''}`,{type:'Point',coordinates:ll([e,n])},`Anonymous assessment receptor, not a complete building inventory. April 3, 2024 shadow model: ${result}; worst case, no terrain/obstacle screening. ${id==='A'?'August 15 noise model reports 37.4 dBA from modelled sources and 39.4 dBA with ambient noise; this is a prediction, not a measurement.':''}`,`${appendix}#page=50`,'April 3, 2024 shadow model; August 15, 2024 noise model','Published NAD83 / UTM 20N coordinates; source precision 1 m, accuracy unstated')));
features.push(feature('model-substation','model-substation','Substation · August noise model',{type:'Point',coordinates:ll([623367,5069429])},'Published noise-model input. This differs from the October infrastructure drawing near T5–T6. Do not treat either location as a verified final design.',`${appendix}#page=63`,'August 15, 2024 · Appendix L','Published model coordinate; conflicting source geometry'));
for(const r of input.digitization.features){
 const sheet=input.digitization.sheets[r.sheet];const convert=p=>ll(fits[r.sheet].transform(p));
 const coords=r.type==='Point'?convert(r.pixels):r.type==='Polygon'?[r.pixels.map(convert)]:r.pixels.map(convert);
 features.push(feature(r.id,r.kind,r.name,{type:r.type,coordinates:coords},r.note,`${sourceUrl(sheet.file)}#page=${sheet.page}`,'October 2024 · Drawing '+r.sheet,`Approximate trace · ${r.sheet==='2.2'?'1:50,000; allow at least 50 m':'1:8,000; allow at least 15 m'} display uncertainty; not a survey`,{digitized:true}));
}
// Only the source's categorical facts, never owner names or private contacts.
let parcels=[];
if(process.argv.includes('--sources')) {
 const cache=new URL('./.rhodena-cache/',import.meta.url);await mkdir(cache,{recursive:true});
 for(const [name,s] of Object.entries(input.sources)) {
  const path=new URL(name,cache);let bytes;
  try {bytes=await readFile(path);}catch {const response=await fetch(s.url);if(!response.ok)throw Error(`${s.url}: ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());await writeFile(path,bytes);}
  if(sha(bytes)!==s.sha256)throw Error(`Source changed: ${name}; review before updating`);
  execFileSync('pdftotext',['-layout',fileURLToPath(path),fileURLToPath(new URL(name+'.txt',cache))]);
 }
 const report=await readFile(new URL('rwp-Part-1-EARD-to-Appendix-A-part-a-.pdf.txt',cache),'utf8');
 const table=report.slice(report.indexOf('Table 3.1: Land Parcels within the Study Area',report.indexOf('3.1     Geographical Location')), report.indexOf('The measured areas of the Study Area'));
 parcels=[...table.matchAll(/^\s*(\d{8})\s+(Crown|Private)\s+(Government|Residential|Commercial)\s*$/gm)].map(([,pid,category,landUse])=>({pid,category,landUse}));
 if(parcels.length<70)throw Error('Parcel source table extraction incomplete');
 await writeFile(new URL('./rhodena/parcels.json',import.meta.url),JSON.stringify(parcels,null,2)+'\n');
} else parcels=JSON.parse(await readFile(new URL('./rhodena/parcels.json',import.meta.url),'utf8'));
const output={type:'FeatureCollection',features};
const receipt={checked:input.checked,version:'2024 assessed six-turbine layout',sources:input.sources,registration:validation,substationCrossCheckM,featureCount:features.length,geometrySha256:sha(JSON.stringify(output)),limitations:['Simplified study boundary omits small holes; not for parcel inclusion or area calculation.','Digitized lines are approximate centrelines, not construction footprints, assessment boundaries, legal setbacks, or authorizations.','Sensitive species locations and the three potential WSS identities are not reconstructed.','Noise and shadow model maps are linked, not traced as purported impact boundaries.','PDFs, aerial imagery and original cartography are not redistributed or relicensed. Factual extracts and project annotations retain source attribution.']};
for (const [name,value] of [['features.json',output],['receipt.json',receipt],['parcels.json',parcels]]) {
 const path=new URL('../src/rhodena/'+name,import.meta.url);const text=JSON.stringify(value,name==='receipt.json'?(_,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v:null,2)+'\n';
 if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==text)throw Error(`Regenerate ${name}`);}else await writeFile(path,text);
}
console.log(`Rhodena: ${features.length} features, ${parcels.length} dated parcel categories; substation cross-check ${substationCrossCheckM.toFixed(1)} m.`);

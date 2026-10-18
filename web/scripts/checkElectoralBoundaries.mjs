import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('public/elections');
const receipt = JSON.parse(await readFile(resolve(root,'source.json'),'utf8'));
const expected = {'federal-ridings-2025.geojson':11,'federal-polls-2025.geojson':2260,'municipal-polling-districts.geojson':238,'halifax-council-districts.geojson':16};
if (receipt.sources.length !== 4) throw new Error('Electoral receipt source count changed');
for (const [asset, count] of Object.entries(expected)) {
  const source=receipt.sources.find(s=>s.asset===asset);
  const bytes=await readFile(resolve(root,asset));
  if (!source || createHash('sha256').update(bytes).digest('hex')!==source.sha256) throw new Error(`Receipt hash mismatch: ${asset}`);
  const data=JSON.parse(bytes);
  if (source.featureCount!==count || data.features.length!==count || data.features.some(f=>!f.geometry || !Object.keys(f.properties).length)) throw new Error(`Incomplete electoral asset: ${asset}`);
  if (!source.attribution || !source.licenceUrl || !source.inputs.every(s=>s.sha256 && s.fetchedAt && s.url)) throw new Error(`Missing provenance: ${asset}`);
}
console.log('Electoral boundary assets match their source receipts.');

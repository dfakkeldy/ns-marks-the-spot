import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// A clean build must verify the exact archive its bundled style and receipt name.
export async function checkProvincialAtlas(directory = fileURLToPath(new URL('../public/atlas/provincial/', import.meta.url)), allowHosted = false) {
const receipt = JSON.parse(await readFile(resolve(directory, 'source.json'), 'utf8'));
if (receipt.schemaVersion !== 1 || !/^ns-[0-9a-f]{16}\.pmtiles$/.test(receipt.archive)) {
  throw new Error('Invalid provincial Atlas receipt');
}
let bytes;
try {
  bytes = await readFile(resolve(directory, receipt.archive));
} catch (error) {
  if (error.code !== 'ENOENT' || !allowHosted) throw error;
  const url = `https://tiles.kinnokilabs.com/provincial-atlas/${receipt.archive}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Provincial Atlas download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
if (bytes.subarray(0, 7).toString() !== 'PMTiles' || bytes[7] !== 3 ||
    bytes.length !== receipt.bytes || createHash('sha256').update(bytes).digest('hex') !== receipt.sha256) {
  throw new Error('Provincial Atlas archive is missing, corrupt, or does not match its receipt');
}
const required = ['484g-adjn', 'xf3i-vxcb', 'h8jb-hzrm', 'fpca-jrmt', 'xed8-vvg5', '7bqh-hssn'];
if (receipt.sources.length !== required.length || required.some(id => !receipt.sources.some(source =>
  source.id === id && source.featureCount > 0 && source.released && /^[0-9a-f]{64}$/.test(source.sha256)))) {
  throw new Error('Provincial Atlas source inventory is incomplete');
}
return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const receipt = await checkProvincialAtlas(undefined, true);
  console.log(`Verified provincial Atlas: ${receipt.archive}, ${receipt.sources.length} sources`);
}

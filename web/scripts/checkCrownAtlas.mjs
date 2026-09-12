import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export async function checkCrownAtlas(directory = fileURLToPath(new URL('../public/atlas/crown/', import.meta.url))) {
  const receipt = JSON.parse(await readFile(resolve(directory, 'source.json'), 'utf8'));
  if (receipt.schemaVersion !== 1 || !/^crown-[0-9a-f]{16}\.pmtiles$/.test(receipt.archive) ||
      receipt.source?.id !== '3nka-59nz' || !receipt.source.released ||
      !/^[0-9a-f]{64}$/.test(receipt.source.sha256) ||
      receipt.validation?.acceptedRecords <= 0 ||
      receipt.validation.acceptedRecords + receipt.source.rejectedRecords.length !== receipt.source.featureCount) {
    throw new Error('Invalid Crown Land receipt');
  }
  const bytes = await readFile(resolve(directory, receipt.archive));
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.subarray(0, 7).toString() !== 'PMTiles' || bytes[7] !== 3 ||
      bytes.length !== receipt.bytes || digest !== receipt.sha256 ||
      receipt.archive !== `crown-${digest.slice(0, 16)}.pmtiles`) {
    throw new Error('Crown Land archive does not match its receipt');
  }
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const receipt = await checkCrownAtlas();
  console.log(`Verified Crown Land: ${receipt.archive}, ${receipt.validation.acceptedRecords} dissolved source records`);
}

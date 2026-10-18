import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCrownAtlas } from './checkCrownAtlas.mjs';

test('validates the shipped Crown Land archive and rejects changed bytes or unreconciled records', async () => {
  const receipt = await checkCrownAtlas();
  const dir = await mkdtemp(join(tmpdir(), 'crown-integrity-'));
  try {
    const bytes = await readFile(new URL(`../public/atlas/crown/${receipt.archive}`, import.meta.url));
    await writeFile(join(dir, receipt.archive), bytes);
    receipt.validation.acceptedRecords -= 1;
    await writeFile(join(dir, 'source.json'), JSON.stringify(receipt));
    await assert.rejects(checkCrownAtlas(dir), /Invalid Crown Land receipt/);
    receipt.validation.acceptedRecords += 1;
    await writeFile(join(dir, 'source.json'), JSON.stringify(receipt));
    bytes[100] ^= 1;
    await writeFile(join(dir, receipt.archive), bytes);
    await assert.rejects(checkCrownAtlas(dir), /does not match/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

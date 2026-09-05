import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { checkProvincialAtlas } from './checkProvincialAtlas.mjs';

test('checks local and hosted archive bytes against the pinned receipt', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-integrity-'));
  try {
    const bytes = Buffer.alloc(127);
    bytes.write('PMTiles'); bytes[7] = 3;
    const hash = createHash('sha256').update(bytes).digest('hex');
    const receipt = { schemaVersion: 1, archive: `ns-${hash.slice(0, 16)}.pmtiles`, sha256: hash, bytes: bytes.length,
      sources: ['484g-adjn', 'xf3i-vxcb', 'h8jb-hzrm', 'fpca-jrmt', 'xed8-vvg5', '7bqh-hssn'].map(id =>
        ({ id, featureCount: 1, released: '2026-09-05', sha256: hash })) };
    await writeFile(join(dir, receipt.archive), bytes);
    await writeFile(join(dir, 'source.json'), JSON.stringify(receipt));
    await checkProvincialAtlas(dir);
    await rm(join(dir, receipt.archive));
    const remote = t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
    await checkProvincialAtlas(dir, true);
    assert.equal(remote.mock.calls[0].arguments[0], `https://tiles.kinnokilabs.com/provincial-atlas/${receipt.archive}`);
    remote.mock.mockImplementation(async () => new Response('Unavailable', { status: 503 }));
    await assert.rejects(checkProvincialAtlas(dir, true), /HTTP 503/);
    remote.mock.mockImplementation(async () => new Response(Buffer.alloc(127)));
    await assert.rejects(checkProvincialAtlas(dir, true), /corrupt/);
    remote.mock.restore();
    bytes[100] = 1;
    await writeFile(join(dir, receipt.archive), bytes);
    await assert.rejects(checkProvincialAtlas(dir), /corrupt/);
    bytes[100] = 0;
    await writeFile(join(dir, receipt.archive), bytes);
    receipt.sources.pop();
    await writeFile(join(dir, 'source.json'), JSON.stringify(receipt));
    await assert.rejects(checkProvincialAtlas(dir), /incomplete/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = new URL('../public/mailing-addresses/', import.meta.url);
test('mailing snapshot retains its receipt, all shards and unique source IDs', () => {
  const receipt = JSON.parse(readFileSync(new URL('source.json', root)));
  assert.equal(receipt.referenceDate, '2026-06');
  assert.match(receipt.licenceUrl, /statcan.gc.ca/);
  assert.equal(Object.keys(receipt.files).length, 129);
  const ids = new Set();
  const roads = new Set();
  let count = 0;
  for (const [name, hash] of Object.entries(receipt.files)) {
    const bytes = readFileSync(new URL(name, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name);
    const data = JSON.parse(gunzipSync(bytes));
    assert.equal(data.version, 1);
    if (name === 'index.json.gz') continue;
    for (const [key, records] of Object.entries(data.streets)) {
      assert.ok(!roads.has(key)); roads.add(key);
      for (const row of records) {
        assert.ok(!ids.has(row.id), `Duplicate source address ID ${row.id}`); ids.add(row.id);
        assert.equal(row.coordinates.length, 2);
        assert.ok(row.coordinates.every(Number.isFinite));
        assert.match(row.postalCode, /^[A-Z]\d[A-Z]\d[A-Z]\d$/);
        count++;
      }
    }
  }
  const index = JSON.parse(gunzipSync(readFileSync(new URL('index.json.gz', root))));
  assert.deepEqual(new Set(index.streets.map(row => row.key)), roads);
  assert.equal(count, receipt.counts.included);
  assert.equal(receipt.counts.sourceAddresses, count + receipt.counts.missingBuildingCoordinate + receipt.counts.incompleteMailingAddress);
});

/** Build a postal-code-bounded snapshot with the same conservative joins as the research map. */
import { build } from 'vite';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const cache = process.argv[2] ?? '/tmp/poker-sources';
const temporary = mkdtempSync(join(tmpdir(), 'poker-data-'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  await build({ configFile: false, logLevel: 'error', build: { outDir: temporary, emptyOutDir: false,
    lib: { entry: { civic: resolve('src/services/civicAddresses.ts'), mailing: resolve('src/services/mailingAddresses.ts') }, formats: ['es'], fileName: (_, name) => `${name}.mjs` },
  }});
  const { civicAddressForFeature } = await import(join(temporary, 'civic.mjs'));
  const { matchMailingAddress, normalizeAddress, formatCivicRoadName } = { ...await import(join(temporary, 'mailing.mjs')), ...await import(join(temporary, 'civic.mjs')) };
  const all = readdirSync('public/mailing-addresses').filter(p => /^[0-9a-f]{2}\.json\.gz$/.test(p))
    .flatMap(p => Object.values(JSON.parse(gunzipSync(readFileSync(`public/mailing-addresses/${p}`))).streets).flat());
  const codes = ['B0E1P0', 'B0E2W0', 'B0E1X0'];
  const selected = all.filter(r => codes.includes(r.postalCode));
  const roads = new Map();
  for (const row of all) { const key = normalizeAddress(row.road); if (!roads.has(key)) roads.set(key, []); roads.get(key).push(row); }
  const civicInput = JSON.parse(readFileSync(join(cache, 'civic.json')));
  const civic = civicInput.features.map(civicAddressForFeature).filter(Boolean);
  if (civic.length !== civicInput.features.length) throw Error('Unreadable civic rows: review input before publication');
  const claims = new Map();
  for (const point of civic) {
    const match = matchMailingAddress(point, roads.get(normalizeAddress(formatCivicRoadName(point.properties) ?? '')) ?? []);
    if (match.status !== 'matched') continue;
    if (!claims.has(match.record.id)) claims.set(match.record.id, []);
    claims.get(match.record.id).push(point);
  }
  const addresses = selected.map(mailing => ({ mailing, civic: claims.get(mailing.id)?.length === 1 ? claims.get(mailing.id)[0] : null }));
  const layers = Object.fromEntries(['roads','buildings','footprints','water'].map(name => [name, JSON.parse(readFileSync(join(cache, `${name}.json`)))]));
  const sources = ['civic','roads','buildings','footprints','water'].map(name => JSON.parse(readFileSync(join(cache, `${name}-receipt.json`))));
  for (const [index, name] of ['civic','roads','buildings','footprints','water'].entries()) {
    if (digest(readFileSync(join(cache, `${name}.json`))) !== sources[index].sha256) throw Error(`Source hash mismatch: ${name}`);
  }
  const data = { version: 1, bounds: sources[0].bounds, addresses, civic, ...layers };
  const decoded = JSON.stringify(data);
  const bytes = gzipSync(decoded, { level: 9, mtime: 0 });
  writeFileSync('public/poker/data.json.gz', bytes);
  const receipt = { version: 1, postalCodes: codes, totalAddresses: addresses.length, mappedAddresses: addresses.filter(a => a.civic).length,
    unverifiedAddresses: addresses.filter(a => !a.civic).length, bounds: data.bounds, bytes: bytes.length, sha256: digest(bytes), decodedSha256: digest(decoded), sources,
    mailingSource: JSON.parse(readFileSync('public/mailing-addresses/source.json')),
    matching: 'Exact normalized road, civic number, suffix and unit; building-to-civic distance at most 50 m. Exactly one NAR record per civic point and one civic point per NAR record. Unverified addresses remain listed but cannot be placed.',
    limitations: 'Postal records are June 2026 NAR building-address records, not residents or a complete delivery list. Civic points are not guaranteed house locations. Roads, buildings and water are dated topographic features, not delivery routes or access permission. No aerial imagery is bundled.',
    attribution: 'Contains information licensed under the Open Government Licence – Nova Scotia.',
    licence: 'https://support.novascotia.ca/services/open-data-portal-licence',
  };
  writeFileSync('public/poker/source.json', JSON.stringify(receipt, null, 2)+'\n');
  console.log(`${receipt.totalAddresses} postal addresses; ${receipt.mappedAddresses} verified civic matches; ${receipt.unverifiedAddresses} unverified; ${bytes.length} compressed bytes`);
} finally { rmSync(temporary, { recursive: true, force: true }); }

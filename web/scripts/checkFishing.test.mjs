import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_DIR, checkFishing, checkRules, checkCalendar, checkStockedWaters, readDenylist } from './checkFishing.mjs';
import { buildReceipt, buildStockedWaters, serializeCollection, utmToLonLat } from './buildFishingStockedWaters.mjs';

/** Copy the shipped files, apply one change, refresh the hashes and expect a content failure. */
async function rejectsAfter(change, pattern) {
  const dir = await mkdtemp(join(tmpdir(), 'fishing-check-'));
  try {
    await cp(DEFAULT_DIR, dir, { recursive: true });
    const files = {}; const before = {};
    for (const name of ['spots.geojson', 'rules.json', 'calendar.json', 'stocked-waters.geojson', 'stocked-waters.source.json']) {
      before[name] = JSON.stringify(JSON.parse(await readFile(join(dir, name), 'utf8')));
      files[name] = JSON.parse(before[name]);
    }
    change(files);
    // Rewrite only what changed, so untouched files keep their pinned bytes.
    for (const [name, value] of Object.entries(files)) if (JSON.stringify(value) !== before[name]) await writeFile(join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
    await assert.rejects(checkFishing(dir, { writeHashes: true }), pattern);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const spot = (files, id) => files['spots.geojson'].features.find((f) => f.properties.id === id).properties;

test('the shipped fishing files pass the offline check', async () => {
  const summary = await checkFishing();
  assert.ok(summary.spots >= 20 && summary.rules >= 20 && summary.stockedWaters > 500, JSON.stringify(summary));
});

test('a changed byte fails against the pinned receipt hash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fishing-hash-'));
  try {
    await cp(DEFAULT_DIR, dir, { recursive: true });
    await writeFile(join(dir, 'calendar.json'), `${await readFile(join(dir, 'calendar.json'), 'utf8')} `);
    await assert.rejects(checkFishing(dir), /calendar\.json does not match its pinned SHA-256/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('public spot text rejects drive times, origins, routes and OpenStreetMap', async () => {
  await rejectsAfter((f) => { spot(f, 'S07').why += ' Only 9 min away.'; }, /drive-time phrase/);
  await rejectsAfter((f) => { spot(f, 'S08').access = 'From Exampleton follow the main road.'; }, /origin-relative phrasing/);
  await rejectsAfter((f) => { spot(f, 'S08').why += ' The nearest wharf to Exampleton.'; }, /origin-relative phrasing/);
  await rejectsAfter((f) => { spot(f, 'S02').tip += ' Handy if you are within an hour of Exampleton.'; }, /origin-relative phrasing/);
  await rejectsAfter((f) => { spot(f, 'S01').access += ' The route is short.'; }, /route wording/);
  await rejectsAfter((f) => { spot(f, 'S04').sources.push('https://www.openstreetmap.org/way/1'); }, /OpenStreetMap-derived content/);
  await rejectsAfter((f) => { spot(f, 'S04').sources.push('https://nsgiwa.novascotia.ca/arcgis/rest/services/TRNS/TRNS_NSRN_Roads_UT83/MapServer'); }, /delivery-service endpoints/);
});

test('an optional local denylist rejects its terms in every fishing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fishing-deny-'));
  try {
    const list = join(dir, 'denylist.txt');
    await writeFile(list, '# one term per line\nExampleton\n\nBig Pond Narrows  # trailing comment\n');
    const denylist = await readDenylist(list);
    assert.equal(denylist.length, 2);
    // The shipped files carry neither term.
    await checkFishing(DEFAULT_DIR, { denylist });
    const data = join(dir, 'fishing');
    await cp(DEFAULT_DIR, data, { recursive: true });
    const receiptPath = join(data, 'source.json');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    receipt.spots.curation += ' Checked at exampleton.';
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await assert.rejects(checkFishing(data, { denylist }), /source\.json spots\.curation: local denylist term/);
    // A term is a whole word: 'Harb' never matches the shipped 'Harbour'.
    await writeFile(list, 'Harb\n');
    await checkFishing(DEFAULT_DIR, { denylist: await readDenylist(list) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rule facts, assumed access and night tips stay out of spot free text', async () => {
  await rejectsAfter((f) => { spot(f, 'S03').caution += ' Keep cunner only Jun 19-Sep 6.'; }, /month-day date/);
  await rejectsAfter((f) => { spot(f, 'S07').tip += ' Keep up to 10 perch.'; }, /daily limit/);
  await rejectsAfter((f) => { spot(f, 'S02').tip += ' Rainbows must be 35 cm.'; }, /size limit/);
  await rejectsAfter((f) => { spot(f, 'S05').caution += ' (MPFR s.15(a))'; }, /statute section/);
  await rejectsAfter((f) => { spot(f, 'S12').why += ' Expect the same in 2027.'; }, /projected rules year/);
  await rejectsAfter((f) => { spot(f, 'S09').access = 'The road allowance is assumed to run 10 m each side: fish from the road allowance.'; }, /assumed road allowance/);
  await rejectsAfter((f) => { spot(f, 'S07').tip = 'Fish at dawn for trout.'; }, /hours closed to angling/);
  await rejectsAfter((f) => { spot(f, 'S02').tip += ' Smelt bite after dark.'; }, /hours closed to angling/);
});

test('spot structure, coordinates and references are enforced', async () => {
  await rejectsAfter((f) => { spot(f, 'S01').tier = 'near'; }, /field tier is not on the allowlist/);
  await rejectsAfter((f) => { spot(f, 'S02').id = 'S01'; }, /duplicate id/);
  await rejectsAfter((f) => { f['spots.geojson'].features[0].geometry.coordinates = [-64.5, 45.1]; }, /outside coverageBounds/);
  await rejectsAfter((f) => { f['spots.geojson'].features[0].geometry.coordinates = [-70, 45]; }, /outside Nova Scotia/);
  await rejectsAfter((f) => { spot(f, 'S01').rules_ref.push('no-such-rule'); }, /unknown rules_ref no-such-rule/);
  await rejectsAfter((f) => { spot(f, 'S01').species.push('kraken'); }, /species must be calendar keys/);
  await rejectsAfter((f) => { spot(f, 'S01').peak_months = [1]; }, /peak months must be best months/);
  await rejectsAfter((f) => { f['rules.json'].entries[0].scope.spots.pop(); }, /differs from referencing spots/);
});

test('calendar keeps salmon and eel rules-only and notes free of rule text', async () => {
  await rejectsAfter((f) => { f['calendar.json'].species.atlantic_salmon.months_good = [6, 9]; }, /atlantic_salmon: must exist as rules-only/);
  await rejectsAfter((f) => { f['calendar.json'].species.american_eel.rules_only = false; }, /american_eel: must exist as rules-only/);
  await rejectsAfter((f) => { f['calendar.json'].species.cunner.notes = 'Keep 5 a day.'; }, /daily limit/);
  await rejectsAfter((f) => { f['calendar.json'].species.cunner.pin_exclusions = []; }, /unexpected field pin_exclusions/);
});

test('rules need sources and an in-year window, but never fail because of today\'s date', async () => {
  await rejectsAfter((f) => { delete f['rules.json'].entries[0].source; }, /source needs label/);
  await rejectsAfter((f) => { f['rules.json'].validUntil = '2028-03-31'; }, /within about 14 months/);
  await rejectsAfter((f) => { f['rules.json'].entries[1].validFrom = '2027-12-31'; }, /validFrom <= validUntil/);
  await rejectsAfter((f) => { f['rules.json'].entries[0].text = 'See the 2027 handbook (if 2026 repeats) for bridges.'; }, /projected rules/);
  // Shift every date six years into the past: the file is long expired, yet structurally valid.
  const rules = JSON.parse(await readFile(new URL('../public/fishing/rules.json', import.meta.url), 'utf8'));
  const shift = (d) => `${Number(d.slice(0, 4)) - 6}${d.slice(4)}`;
  const old = { ...rules, rulesYear: rules.rulesYear - 6, checked: shift(rules.checked), validUntil: shift(rules.validUntil),
    entries: rules.entries.map((e) => ({ ...e, validFrom: shift(e.validFrom), validUntil: shift(e.validUntil) })) };
  const errors = [];
  const species = checkCalendar(JSON.parse(await readFile(new URL('../public/fishing/calendar.json', import.meta.url), 'utf8')), errors);
  checkRules(old, species, errors);
  assert.deepEqual(errors, []);
});

test('stocked waters withhold salmon and must match their receipt', async () => {
  await rejectsAfter((f) => { f['stocked-waters.geojson'].features[0].properties.species = ['Atlantic Salmon']; }, /species must be stocked trout species|salmon releases are withheld/);
  await rejectsAfter((f) => { f['stocked-waters.source.json'].rows.withheld += 1; }, /row counts must reconcile/);
  await rejectsAfter((f) => { f['stocked-waters.geojson'].features[0].properties.released_total += 1; }, /size classes must sum to released_total/);
});

test('generator output passes the stocked-waters check and a tampered byte fails it', () => {
  const at = utmToLonLat(450000, 4950000, 20); const h = 0.02;
  const counties = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { county: 'Halifax' }, geometry: { type: 'Polygon',
    coordinates: [[[at[0] - h, at[1] - h], [at[0] + h, at[1] - h], [at[0] + h, at[1] + h], [at[0] - h, at[1] + h], [at[0] - h, at[1] - h]]] } }] };
  const rows = [
    { county: 'Halifax', name: 'TEST', type: 'Lake', easting: '450000', northing: '4950000', number_released: '100', stocking_date: '2025-05-01T00:00:00.000', fish_length_cm: '25', stock: 'Brook Trout' },
    { county: 'Halifax', name: 'TEST', type: 'Lake', easting: '450000', northing: '4950000', number_released: '9', stocking_date: '2025-05-01T00:00:00.000', fish_length_cm: '15', stock: 'Atlantic Salmon' },
    { county: 'Halifax', name: 'LILY', type: 'Lake', easting: '432264', northing: '4942878', number_released: '9', stocking_date: '1984-05-01T00:00:00.000', fish_length_cm: '15', stock: 'Brook Trout' },
  ];
  const { collection, stats } = buildStockedWaters(rows, counties);
  const bytes = Buffer.from(serializeCollection(collection));
  const receipt = buildReceipt({ stats, outputBytes: bytes, features: collection.features.length, retrieved: '2026-10-13',
    rows: Buffer.from(JSON.stringify(rows)), counties: Buffer.from(JSON.stringify(counties)) });
  const errors = [];
  checkStockedWaters(collection, receipt, bytes, errors);
  assert.deepEqual(errors, []);
  checkStockedWaters(collection, receipt, Buffer.concat([bytes, Buffer.from(' ')]), errors);
  assert.match(errors.join('\n'), /does not match stocked-waters\.geojson/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceipt, buildStockedWaters, placeRow, countyIndex, serializeCollection, sizeClass, titleName, utmToLonLat, waterName, withheldReason,
} from './buildFishingStockedWaters.mjs';

/** A small square county polygon (about 4 km across) centred on a lon/lat. */
function square(county, [lon, lat], half = 0.025) {
  return { type: 'Feature', properties: { county }, geometry: { type: 'Polygon', coordinates: [[
    [lon - half, lat - half], [lon + half, lat - half], [lon + half, lat + half], [lon - half, lat + half], [lon - half, lat - half]]] } };
}
const HALIFAX = utmToLonLat(450000, 4950000, 20);
const CAPE_BRETON = utmToLonLat(271308.71, 5121236.3, 21); // "# 20 DAM": an easting below 400,000 that only fits zone 21
const DIGBY = utmToLonLat(729727, 4911623, 19); // an easting above 600,000 that only fits zone 19
const COUNTIES = { type: 'FeatureCollection', features: [
  square('Halifax', HALIFAX), square('Cape Breton', CAPE_BRETON), square('Digby', DIGBY), square('Kings', utmToLonLat(380000, 4990000, 20)),
] };
const row = (over) => ({ county: 'Halifax', name: 'TEST', type: 'Lake', easting: '450000', northing: '4950000', number_released: '100',
  stocking_date: '2025-05-01T00:00:00.000', fish_length_cm: '25', stock: 'Brook Trout', stock_strain: 'Brook Trout - Domestic', ...over });

test('converts NAD83 UTM in the given zone', () => {
  const [lon, lat] = CAPE_BRETON;
  assert.ok(Math.abs(lon - -59.9645) < 0.001 && Math.abs(lat - 46.2063) < 0.001, `${lon},${lat}`);
  const [lon20, lat20] = utmToLonLat(271308.71, 5121236.3, 20);
  assert.ok(lon20 < -65.5 && lat20 > 46, 'the same easting in zone 20 lands in New Brunswick, about 450 km west');
});

test('bins lengths into project size classes', () => {
  assert.deepEqual([40, 35, 34.9, 20, 19.9, 10, 9.9, '', '0', 'x'].map(sizeClass),
    ['large', 'large', 'catchable', 'catchable', 'yearling', 'yearling', 'fry', 'unknown', 'unknown', 'unknown']);
});

test('withholds every salmon release, Atlantic or landlocked, by any field', () => {
  assert.match(withheldReason(row({ stock: 'Atlantic Salmon ' })), /salmon/);
  assert.match(withheldReason(row({ stock: 'Landlocked Salmon' })), /salmon/);
  assert.match(withheldReason(row({ secondary_stocking_objective: 'Atlantic Salmon Enhancement Program' })), /salmon/);
  assert.match(withheldReason(row({ primary_stocking_objective: 'Illegal Introduction' })), /illegal/);
  assert.equal(withheldReason(row({ name: 'SALMON RIVER' })), null, 'a trout release into a water named Salmon is kept');
});

test('normalizes publisher names and adds the type only when missing', () => {
  assert.equal(waterName('  Gillis '), 'GILLIS');
  assert.equal(titleName('COOPER', 'Lake'), 'Cooper Lake');
  assert.equal(titleName("LAKE O'LAW", 'Brook'), "Lake O'Law Brook");
  assert.equal(titleName('ANNAPOLIS RIVER BRICKTON BRIDGE', 'River'), 'Annapolis River Brickton Bridge');
});

test('infers the zone by county and rejects the placeholder and misplaced rows', () => {
  const index = countyIndex(COUNTIES);
  assert.equal(placeRow(row({}), index).zone, 20);
  assert.equal(placeRow(row({ county: 'Cape Breton', easting: '271308.71', northing: '5121236.3' }), index).zone, 21);
  assert.equal(placeRow(row({ county: 'Digby', easting: '729727', northing: '4911623' }), index).zone, 19);
  assert.match(placeRow(row({ easting: '432264', northing: '4942878' }), index).reason, /placeholder/);
  const misplaced = placeRow(row({ county: 'Kings' }), index);
  assert.match(misplaced.reason, /outside Kings County/);
  assert.equal(misplaced.landsIn, 'Halifax', 'the receipt says where a rejected row lands instead');
  assert.match(placeRow(row({ easting: '', northing: '4950000' }), index).reason, /non-numeric/);
});

test('aggregates one point per water with size totals and a reconciled receipt', () => {
  const rows = [
    row({ stocking_date: '2024-05-01T00:00:00.000', fish_length_cm: '40', number_released: '50' }),
    row({ name: 'Test', stocking_date: '2025-06-01T00:00:00.000' }),
    row({ name: 'TEST', easting: '450300', stock: 'Rainbow Trout', fish_length_cm: '8', number_released: '1000', stocking_date: '2019-04-01T00:00:00.000' }),
    row({ name: 'OTHER', type: 'Pond', fish_length_cm: '', number_released: '7' }),
    row({ stock: 'Atlantic Salmon' }),
    row({ county: 'Annapolis', easting: '432264', northing: '4942878' }),
    row({ county: 'Cape Breton', name: '# 20 DAM', easting: '271308.71', northing: '5121236.3' }),
    row({ county: 'Kings' }),
  ];
  const { collection, stats } = buildStockedWaters(rows, COUNTIES);
  assert.deepEqual({ fetched: stats.fetched, accepted: stats.accepted, rejected: stats.rejected, withheld: stats.withheld }, { fetched: 8, accepted: 5, rejected: 2, withheld: 1 });
  const test = collection.features.find((f) => f.properties.source_name === 'TEST').properties;
  assert.deepEqual(test.species, ['Brook Trout', 'Rainbow Trout']);
  assert.deepEqual([test.released_large, test.released_catchable, test.released_fry, test.released_total, test.releases], [50, 100, 1000, 1150, 3]);
  assert.deepEqual([test.years_text, test.last_stocked, test.recent_released, test.utm_zone], ['2019, 2024-2025', '2025-06-01', 150, 20]);
  assert.equal(collection.features.find((f) => f.properties.source_name === 'OTHER').properties.released_unknown, 7);
  assert.equal(collection.features.find((f) => f.properties.source_name === '# 20 DAM').properties.utm_zone, 21);
  assert.ok(!JSON.stringify(collection).includes('Atlantic Salmon'));
  assert.deepEqual(collection.recentWindow, [2023, 2025]);
  const bytes = Buffer.from(serializeCollection(collection));
  assert.deepEqual(JSON.parse(bytes), collection);
  const receipt = buildReceipt({ stats, outputBytes: bytes, features: collection.features.length, retrieved: '2026-10-13',
    rows: Buffer.from(JSON.stringify(rows)), counties: Buffer.from(JSON.stringify(COUNTIES)) });
  assert.equal(receipt.withheldByReason['salmon release (Atlantic or landlocked)'], 1);
  assert.ok(receipt.rejected.every((r) => !/salmon/i.test(JSON.stringify(r))), 'withheld rows never appear in the rejected list');
  assert.deepEqual(receipt.rows, { fetched: 8, accepted: 5, rejected: 2, withheld: 1 });
  assert.equal(receipt.rejected.length, receipt.rows.rejected);
  assert.equal(receipt.output.features, collection.features.length);
});

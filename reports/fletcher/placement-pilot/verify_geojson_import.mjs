// Exercise the actual web GeoJSON parser without installing the web toolchain.
// Requires a Node release providing node:module stripTypeScriptTypes.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';

const repo = new URL('../../../', import.meta.url);
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const errors = stripTypeScriptTypes(readFileSync(new URL('web/src/userMaps/errors.ts', repo), 'utf8'));
const parser = stripTypeScriptTypes(readFileSync(new URL('web/src/userMaps/vector/parsers/geojsonSource.ts', repo), 'utf8'));
assert.ok(parser.includes('"../../errors"'));
const { parseGeoJson } = await import(moduleUrl(parser.replace('"../../errors"', JSON.stringify(moduleUrl(errors)))));
const input = readFileSync(new URL('mapped-annotations.geojson', import.meta.url), 'utf8');
const original = JSON.parse(input);
const parsed = parseGeoJson(input);
assert.equal(parsed.featureCount, 12);
assert.deepEqual(parsed.collection.features, original.features);
assert.equal(parsed.collection.features.filter(f => f.geometry.type === 'Point').length, 8);
assert.equal(parsed.collection.features.filter(f => f.geometry.type === 'Polygon').length, 4);
assert.ok(parsed.bbox.every(Number.isFinite));
console.log('PASS: actual web GeoJSON parser retains all 12 feature IDs, geometries and provenance properties.');

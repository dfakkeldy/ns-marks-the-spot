// Run the real web importer and TPS solver against the delivered draft.
// Bundle with web/node_modules/.bin/rolldown, then run from the repository root.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFletcherGcps, serializeFletcherGcps } from "../../../web/src/userMaps/parsers/fletcherGcps";
import { applyTps, solveTps } from "../../../web/src/userMaps/transform/tps";
import { toMercator } from "../../../web/src/userMaps/transform/webMercator";

const directory = "reports/fletcher/visual-expansion/";
const csv = readFileSync(directory + "judique-sheet19-draft.csv", "utf8");
const parsed = parseFletcherGcps(csv, { pixelSize: { width: 10815, height: 7549 } });
assert.equal(parsed.gcps.length, 39);
assert.equal(parsed.checks.length, 8);
assert.equal(serializeFletcherGcps(parsed, { comments: parsed.comments }), csv);
const saved = parseFletcherGcps(readFileSync("tools/fletcher/measured/sheet-19.csv", "utf8"));
const hand = saved.rows.filter(row => row.id.startsWith("gcp-") && row.role === "control");
assert.equal(hand.length, 15);
for (const row of hand) assert.deepEqual(parsed.rows.find(r => r.id === row.id), row);
const fitted = solveTps(parsed.gcps);
assert.ok(fitted.ok, "Web TPS must accept the delivered controls");
const scores = JSON.parse(readFileSync(directory + "sheet-scores.json", "utf8"));
let maximumDifference = 0;
for (const check of parsed.checks) {
  const record = scores.points.find((row: { id: string }) => row.id === check.id);
  assert.ok(record, `Missing GDAL score for ${check.id}`);
  const expected = toMercator({ lng: record.predicted_lonlat[0], lat: record.predicted_lonlat[1] });
  const actual = applyTps(fitted.params, check.pixel.x, check.pixel.y);
  const difference = Math.hypot(expected.x - actual.x, expected.y - actual.y);
  assert.ok(difference < 0.001, `Web/GDAL disagreement at ${check.id}: ${difference} m`);
  maximumDifference = Math.max(maximumDifference, difference);
}
console.log(JSON.stringify({controls: 39, checks: 8, preserved_hand_controls: 15,
  csv_roundtrip: "byte-identical", maximum_web_gdal_difference_projected_m: maximumDifference}, null, 2));

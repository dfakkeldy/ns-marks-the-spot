#!/usr/bin/env node
// Build the province-wide stocked-waters snapshot from the Nova Scotia Fish
// Hatchery Stocking Records (data.novascotia.ca 8e4a-m6fw, OGL-NS).
//
//   node scripts/buildFishingStockedWaters.mjs                 # fetch, build, write
//   node scripts/buildFishingStockedWaters.mjs --save-raw DIR  # also keep the raw responses
//   node scripts/buildFishingStockedWaters.mjs --from-raw DIR  # rebuild offline from kept responses
//
// The rows carry a bare UTM easting/northing with no zone. Each row is tried in
// zone 20, then 19, then 21, and kept in the first zone that lands inside (or
// within a small buffer of) its own county; the county polygons come from the
// open Municipality Boundaries dataset (7bqh-hssn). Salmon releases are
// withheld by count only. Run by hand; check:fishing verifies the committed bytes.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import proj4 from 'proj4';

export const SOURCE = {
  id: '8e4a-m6fw',
  name: 'Nova Scotia Fish Hatchery Stocking Records',
  url: 'https://data.novascotia.ca/d/8e4a-m6fw',
  api: 'https://data.novascotia.ca/resource/8e4a-m6fw.json',
  metadataUrl: 'https://data.novascotia.ca/api/views/8e4a-m6fw.json',
  query: { $limit: '50000', $order: ':id' },
  licence: 'Open Government Licence – Nova Scotia',
  licenceUrl: 'https://novascotia.ca/opendata/licence.asp',
};
export const COUNTIES = {
  id: '7bqh-hssn',
  name: 'Municipality Boundaries',
  url: 'https://data.novascotia.ca/d/7bqh-hssn',
  api: 'https://data.novascotia.ca/resource/7bqh-hssn.geojson',
  metadataUrl: 'https://data.novascotia.ca/api/views/7bqh-hssn.json',
  // Degrees: 0.0002 is about 20 m, far inside the county buffer below.
  query: { $select: 'county,name,simplify_preserve_topology(the_geom, 0.0002) AS the_geom', $limit: '1000', $order: 'objectid' },
  licence: 'Open Government Licence – Nova Scotia',
};
/** A coordinate the publisher repeats across unrelated counties; it is never a real site. */
export const PLACEHOLDER = { easting: 432264, northing: 4942878 };
export const ZONE_ORDER = [20, 19, 21];
/** Lakes on a county line and coarse publisher coordinates survive; a wrong zone (about 470 km off) never does. */
export const COUNTY_BUFFER_M = 1500;
/** Rows of one water within this distance of each other are one stocked water. */
export const MERGE_M = 1000;
export const RECENT_YEARS = 3;
/** Project size bins from the publisher's fish_length_cm (not publisher categories). */
export const SIZE_BINS = [['large', 35], ['catchable', 20], ['yearling', 10], ['fry', 0]];
export const OUTPUT = fileURLToPath(new URL('../public/fishing/stocked-waters.geojson', import.meta.url));
export const RECEIPT = fileURLToPath(new URL('../public/fishing/stocked-waters.source.json', import.meta.url));

const R = 6371008.8;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const queryText = (query) => Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&');
const round6 = (n) => Math.round(n * 1e6) / 1e6;

export function utmToLonLat(easting, northing, zone) {
  const [lon, lat] = proj4(`+proj=utm +zone=${zone} +datum=NAD83 +units=m +no_defs`, 'EPSG:4326', [easting, northing]);
  return [round6(lon), round6(lat)];
}

export function sizeClass(length) {
  const cm = Number(length);
  if (!Number.isFinite(cm) || cm <= 0) return 'unknown';
  return SIZE_BINS.find(([, min]) => cm >= min)[0];
}

/** Rows that never reach the public file, reported by count only so no location is republished. */
export function withheldReason(row) {
  const text = [row.stock, row.stock_strain, row.primary_stocking_objective, row.secondary_stocking_objective].filter(Boolean).join(' ');
  if (/salmon/i.test(text)) return 'salmon release (Atlantic or landlocked)';
  if (/illegal/i.test(text)) return 'illegal introduction';
  return null;
}

/** The publisher mixes cases ("Gillis" and "GILLIS" are one lake), so names compare uppercased. */
export const waterName = (name) => String(name).trim().replace(/\s+/g, ' ').toUpperCase();

export function titleName(name, type) {
  const words = String(name).trim().split(/\s+/).map((w) => w.toLowerCase().replace(/(^|[-'(])([a-z])/g, (m, p, c) => p + c.toUpperCase()));
  const label = words.join(' ');
  return new RegExp(`\\b${type}\\b`, 'i').test(label) ? label : `${label} ${type}`;
}

function localXY(lon, lat, lat0) { return [lon * Math.PI / 180 * R * Math.cos(lat0 * Math.PI / 180), lat * Math.PI / 180 * R]; }
function ringContains([lon, lat], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i]; const [x2, y2] = ring[j];
    if ((y1 > lat) !== (y2 > lat) && lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1)) inside = !inside;
  }
  return inside;
}
function ringDistanceM(point, ring) {
  const [px, py] = localXY(point[0], point[1], point[1]);
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = localXY(ring[i - 1][0], ring[i - 1][1], point[1]); const [bx, by] = localXY(ring[i][0], ring[i][1], point[1]);
    const dx = bx - ax; const dy = by - ay; const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

/** Index the municipal polygons by county name, with bounding boxes for a cheap prefilter. */
export function countyIndex(geojson) {
  const index = new Map();
  for (const feature of geojson.features ?? []) {
    const county = feature.properties?.county; const g = feature.geometry;
    if (!county || !g) continue;
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const polygon of polygons) {
      const xs = polygon[0].map((p) => p[0]); const ys = polygon[0].map((p) => p[1]);
      const entry = { polygon, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
      if (!index.has(county)) index.set(county, []);
      index.get(county).push(entry);
    }
  }
  return index;
}

export function countyDistanceM(index, county, point, bufferM = COUNTY_BUFFER_M) {
  const polygons = index.get(county);
  if (!polygons) return Infinity;
  const pad = bufferM / 111320 / Math.cos(point[1] * Math.PI / 180);
  let best = Infinity;
  for (const { polygon, bbox } of polygons) {
    if (point[0] < bbox[0] - pad || point[0] > bbox[2] + pad || point[1] < bbox[1] - pad || point[1] > bbox[3] + pad) continue;
    if (ringContains(point, polygon[0]) && !polygon.slice(1).some((hole) => ringContains(point, hole))) return 0;
    for (const ring of polygon) best = Math.min(best, ringDistanceM(point, ring));
  }
  return best;
}

/** Place one row: a lon/lat in the first zone that fits its county, or a rejection reason. */
export function placeRow(row, index, bufferM = COUNTY_BUFFER_M) {
  const easting = Number(row.easting); const northing = Number(row.northing);
  if (!Number.isFinite(easting) || !Number.isFinite(northing) || easting <= 0 || northing <= 0) return { reason: 'missing or non-numeric coordinate' };
  if (Math.round(easting) === PLACEHOLDER.easting && Math.round(northing) === PLACEHOLDER.northing) return { reason: 'publisher placeholder coordinate 432264/4942878' };
  if (!index.has(row.county)) return { reason: 'county has no boundary polygon' };
  for (const zone of ZONE_ORDER) {
    const point = utmToLonLat(easting, northing, zone);
    const distanceM = countyDistanceM(index, row.county, point, bufferM);
    if (distanceM <= bufferM) return { zone, point, distanceM: Math.round(distanceM) };
  }
  // Kept for review in the receipt: how far the zone-20 position is from its county, and where it lands instead.
  const point = utmToLonLat(easting, northing, 20);
  const landsIn = [...index.keys()].find((county) => countyDistanceM(index, county, point, 0) === 0) ?? null;
  return { reason: `outside ${row.county} County in UTM zones 20, 19 and 21`, zone20DistanceM: Math.round(countyDistanceM(index, row.county, point, 1e7)), landsIn };
}

function distanceM(a, b) { const [ax, ay] = localXY(a[0], a[1], a[1]); const [bx, by] = localXY(b[0], b[1], a[1]); return Math.hypot(ax - bx, ay - by); }
function yearsText(years) {
  const runs = [];
  for (const y of years) { const last = runs.at(-1); if (last && y === last[1] + 1) last[1] = y; else runs.push([y, y]); }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
}

export function buildStockedWaters(rows, countiesGeojson, { bufferM = COUNTY_BUFFER_M } = {}) {
  const index = countyIndex(countiesGeojson);
  const withheld = { 'salmon release (Atlantic or landlocked)': 0, 'illegal introduction': 0 }; const rejected = []; const zones = { 19: 0, 20: 0, 21: 0 }; const accepted = [];
  for (const row of rows) {
    const held = withheldReason(row);
    if (held) { withheld[held] = (withheld[held] ?? 0) + 1; continue; }
    const placed = placeRow(row, index, bufferM);
    if (placed.reason) {
      rejected.push({ county: row.county, name: row.name, type: row.type, stocking_date: String(row.stocking_date ?? '').slice(0, 10),
        easting: row.easting, northing: row.northing, reason: placed.reason,
        ...(placed.landsIn !== undefined ? { zone20DistanceFromCountyM: placed.zone20DistanceM, zone20LandsIn: placed.landsIn } : {}) });
      continue;
    }
    zones[placed.zone] += 1;
    accepted.push({ row, ...placed, date: String(row.stocking_date).slice(0, 10) });
  }
  // One water = same county, name and type, with positions within MERGE_M of each other.
  const groups = new Map();
  for (const a of accepted) {
    const key = `${a.row.county}|${waterName(a.row.name)}|${a.row.type}`;
    if (!groups.has(key)) groups.set(key, []);
    const clusters = groups.get(key);
    const hits = clusters.filter((c) => c.some((m) => distanceM(m.point, a.point) <= MERGE_M));
    const merged = [a, ...hits.flat()];
    groups.set(key, [...clusters.filter((c) => !hits.includes(c)), merged]);
  }
  const maxYear = Math.max(...accepted.map((a) => Number(a.date.slice(0, 4))));
  const recentFrom = maxYear - RECENT_YEARS + 1;
  const features = [];
  for (const clusters of groups.values()) for (const members of clusters) {
    const byCoordinate = new Map();
    for (const m of members) {
      const k = `${m.row.easting}|${m.row.northing}`;
      const prev = byCoordinate.get(k) ?? { m, count: 0, latest: '' };
      byCoordinate.set(k, { m: m.date > prev.latest ? m : prev.m, count: prev.count + 1, latest: m.date > prev.latest ? m.date : prev.latest });
    }
    const rep = [...byCoordinate.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest) || (a.m.row.easting < b.m.row.easting ? -1 : 1))[0].m;
    const sizes = Object.fromEntries([...SIZE_BINS.map(([k]) => k), 'unknown'].map((k) => [k, 0]));
    let total = 0; let recent = 0;
    for (const m of members) {
      const n = Math.round(Number(m.row.number_released)) || 0;
      total += n; sizes[sizeClass(m.row.fish_length_cm)] += n;
      if (Number(m.date.slice(0, 4)) >= recentFrom) recent += n;
    }
    const years = [...new Set(members.map((m) => Number(m.date.slice(0, 4))))].sort((a, b) => a - b);
    const species = [...new Set(members.map((m) => m.row.stock.trim()))].sort();
    const r = rep.row;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: rep.point },
      properties: {
        id: `sw-${sha256(`${r.county}|${waterName(r.name)}|${r.type}|${r.easting}|${r.northing}`).slice(0, 12)}`,
        name: titleName(waterName(r.name), r.type), source_name: waterName(r.name), water_type: r.type, county: r.county,
        species, species_text: species.join(', '), years, years_text: yearsText(years),
        last_stocked: members.map((m) => m.date).sort().at(-1), releases: members.length, released_total: total,
        ...Object.fromEntries(Object.entries(sizes).map(([k, v]) => [`released_${k}`, v])),
        recent_released: recent, utm_zone: rep.zone,
      },
    });
  }
  features.sort((a, b) => a.properties.county.localeCompare(b.properties.county) || a.properties.name.localeCompare(b.properties.name) || a.properties.id.localeCompare(b.properties.id));
  rejected.sort((a, b) => a.county.localeCompare(b.county) || a.name.localeCompare(b.name) || a.stocking_date.localeCompare(b.stocking_date));
  const collection = {
    type: 'FeatureCollection',
    name: 'Nova Scotia stocked waters (hatchery records)',
    source: SOURCE.url,
    attribution: 'Contains information licensed under the Open Government Licence – Nova Scotia.',
    label: `Hatchery records ${Math.min(...accepted.map((a) => Number(a.date.slice(0, 4))))}-${maxYear}. ${maxYear + 1} releases are not included. Stocked in a past year does not mean stocked this year, and a stocked water is not proof of public access. A stocking record is not an open season: some stocked rivers are now closed or restricted, so check the current Anglers' Handbook.`,
    recentWindow: [recentFrom, maxYear],
    sizeClasses: 'released_* totals use project bins from fish_length_cm: large 35 cm and over, catchable 20-35 cm, yearling 10-20 cm, fry under 10 cm, unknown when no length is recorded.',
    features,
  };
  const pointUse = new Map();
  for (const f of features) { const k = f.geometry.coordinates.join(','); pointUse.set(k, (pointUse.get(k) ?? 0) + 1); }
  const sharedPoints = [...pointUse.values()].filter((n) => n > 1).length;
  return { collection, stats: { sharedPoints, fetched: rows.length, accepted: accepted.length, rejected: rejected.length, withheld: Object.values(withheld).reduce((a, b) => a + b, 0), withheldByReason: withheld, zones, rejectedRows: rejected } };
}

/** One feature per line keeps refresh diffs reviewable. */
export function serializeCollection(collection) {
  const { features, ...head } = collection;
  const top = JSON.stringify(head);
  return `${top.slice(0, -1)},"features":[\n${features.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`;
}

export function buildReceipt({ stats, outputBytes, features, retrieved, rows, counties, sourceMeta, countyMeta, bufferM = COUNTY_BUFFER_M }) {
  const custom = sourceMeta?.metadata?.custom_fields?.['Detailed Metadata'] ?? {};
  return {
    schemaVersion: 1,
    generator: 'web/scripts/buildFishingStockedWaters.mjs',
    source: {
      id: SOURCE.id, name: SOURCE.name, url: SOURCE.url, api: SOURCE.api, query: queryText(SOURCE.query),
      licence: SOURCE.licence, licenceUrl: SOURCE.licenceUrl, retrieved,
      rowsUpdated: sourceMeta?.rowsUpdatedAt ? new Date(sourceMeta.rowsUpdatedAt * 1000).toISOString() : null,
      publisherCurrency: custom['Usage Considerations'] ?? null, publisherCoverage: custom['Time Period Coverage'] ?? null,
      rawSha256: sha256(rows), metadataSha256: sourceMeta ? sha256(JSON.stringify(sourceMeta)) : null,
    },
    counties: {
      id: COUNTIES.id, name: COUNTIES.name, url: COUNTIES.url, api: COUNTIES.api, query: queryText(COUNTIES.query),
      licence: COUNTIES.licence, retrieved, rowsUpdated: countyMeta?.rowsUpdatedAt ? new Date(countyMeta.rowsUpdatedAt * 1000).toISOString() : null,
      rawSha256: sha256(counties), bufferM,
    },
    method: [
      'Each row is converted from NAD83 UTM in zone 20, then 19, then 21, and kept in the first zone that lands inside its own county or within the buffer of it.',
      'The publisher placeholder coordinate 432264/4942878 and rows that fit no zone are rejected and listed below.',
      `Rows of the same county, name and type within ${MERGE_M} m of each other are one stocked water; its point is the most used coordinate (latest on ties).`,
      'Salmon releases (Atlantic or landlocked, including enhancement and population-establishment releases) and any illegal-introduction rows are withheld and counted only, so their locations are not republished.',
      'Size classes are project bins from fish_length_cm, not publisher categories.',
    ],
    notIncluded: 'Releases from the current year: the province publishes them only on its HTML Weekly Stocking Update page (https://novascotia.ca/fish/sportfishing/hatchery-stocking/stocking-update/), which this snapshot does not scrape.',
    rows: { fetched: stats.fetched, accepted: stats.accepted, rejected: stats.rejected, withheld: stats.withheld },
    sharedPoints: { count: stats.sharedPoints, note: 'Points the publisher gives to more than one water name; each name is kept as published, not merged or corrected.' },
    withheldByReason: stats.withheldByReason,
    zones: stats.zones,
    rejected: stats.rejectedRows,
    output: { file: 'stocked-waters.geojson', features, bytes: outputBytes.length, sha256: sha256(outputBytes) },
  };
}

async function fetchBytes(api, query) {
  const response = await fetch(`${api}?${new URLSearchParams(query)}`, { headers: { 'User-Agent': 'NS Marks The Spot stocked-waters snapshot' } });
  if (!response.ok) throw new Error(`${api}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function main(args = process.argv.slice(2)) {
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const fromRaw = opt('--from-raw'); const saveRaw = opt('--save-raw');
  const output = resolve(opt('--out') ?? OUTPUT); const receiptPath = resolve(opt('--receipt') ?? RECEIPT);
  let rows; let counties; let sourceMeta; let countyMeta; let retrieved;
  if (fromRaw) {
    [rows, counties] = await Promise.all(['rows.json', 'counties.geojson'].map((n) => readFile(resolve(fromRaw, n))));
    [sourceMeta, countyMeta] = await Promise.all(['source-meta.json', 'counties-meta.json'].map(async (n) => JSON.parse(await readFile(resolve(fromRaw, n), 'utf8'))));
    retrieved = (await readFile(resolve(fromRaw, 'retrieved.txt'), 'utf8')).trim();
  } else {
    retrieved = new Date().toISOString().slice(0, 10);
    [rows, counties, sourceMeta, countyMeta] = await Promise.all([
      fetchBytes(SOURCE.api, SOURCE.query), fetchBytes(COUNTIES.api, COUNTIES.query),
      fetchBytes(SOURCE.metadataUrl, {}).then((b) => JSON.parse(b)), fetchBytes(COUNTIES.metadataUrl, {}).then((b) => JSON.parse(b)),
    ]);
    if (saveRaw) {
      await mkdir(saveRaw, { recursive: true });
      await Promise.all([['rows.json', rows], ['counties.geojson', counties], ['source-meta.json', JSON.stringify(sourceMeta)],
        ['counties-meta.json', JSON.stringify(countyMeta)], ['retrieved.txt', `${retrieved}\n`]].map(([n, b]) => writeFile(resolve(saveRaw, n), b)));
    }
  }
  const parsed = JSON.parse(rows);
  if (!Array.isArray(parsed) || parsed.length >= Number(SOURCE.query.$limit)) throw new Error('Unexpected row count; raise $limit or check the source');
  const { collection, stats } = buildStockedWaters(parsed, JSON.parse(counties));
  const outputBytes = Buffer.from(serializeCollection(collection));
  const receipt = buildReceipt({ stats, outputBytes, features: collection.features.length, retrieved, rows, counties, sourceMeta, countyMeta });
  await writeFile(output, outputBytes);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`${collection.features.length} stocked waters from ${stats.accepted} rows; rejected ${stats.rejected}, withheld ${stats.withheld}; zones ${JSON.stringify(stats.zones)}`);
  return { collection, receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

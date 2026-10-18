#!/usr/bin/env node
// Offline gate for web/public/fishing. It validates structure, coordinates,
// identifiers, cross-references, receipt hashes and public-text hygiene. It never
// reads the clock: rule expiry is enforced at runtime, not by the build.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_DIR = fileURLToPath(new URL('../public/fishing/', import.meta.url));
/** Files whose bytes the curated receipt (source.json) pins. */
export const CURATED_FILES = ['spots.geojson', 'rules.json', 'calendar.json', 'LICENCE.txt'];
/** Generous Nova Scotia envelope (excludes Sable Island). */
export const NS_BOUNDS = { west: -66.5, south: 43.3, east: -59.6, north: 47.1 };
export const NS_COUNTIES = ['Annapolis', 'Antigonish', 'Cape Breton', 'Colchester', 'Cumberland', 'Digby', 'Guysborough', 'Halifax',
  'Hants', 'Inverness', 'Kings', 'Lunenburg', 'Pictou', 'Queens', 'Richmond', 'Shelburne', 'Victoria', 'Yarmouth'];

const SPOT_KEYS = ['id', 'name', 'area', 'water_type', 'kind', 'species', 'species_text', 'best_months', 'peak_months',
  'access', 'tip', 'why', 'caution', 'evidence', 'sources', 'rules_ref'];
const SPOT_TEXT_FIELDS = ['access', 'tip', 'why', 'caution'];
const WATER_TYPES = ['salt', 'brackish-tidal', 'fresh-lake'];
const EVIDENCE = ['stocking-data', 'survey-data', 'dfo-assessment', 'park-or-agency', 'reputation', 'inference'];
const STOCKED_SPECIES = ['Brook Trout', 'Rainbow Trout', 'Brown Trout', 'Tiger Trout'];
const SIZE_CLASSES = ['large', 'catchable', 'yearling', 'fry', 'unknown'];
const CALENDAR_KEYS = ['label', 'group', 'months_good', 'months_peak', 'rules_only', 'notes'];
const RULE_KEYS = ['id', 'scope', 'text', 'source', 'validFrom', 'validUntil', 'standing'];
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';

/** Never in any fishing file: OSM/OSRM provenance, drive times and the dedication name. */
export const FORBIDDEN_EVERYWHERE = [
  [/openstreetmap|\bOSM\b/i, 'OpenStreetMap-derived content'],
  [/project-osrm|\bOSRM\b/i, 'OSRM routing content'],
  [/\bDarrell\b/i, 'dedication name belongs on the page, not in data'],
  [/\b\d+\s*min\b/i, 'drive-time phrase'],
];
/** Never in curated copy (spots, rules, calendar). Each spot stands on its own, so no text is relative to a place. */
export const FORBIDDEN_IN_COPY = [
  [/\b(?:within (?:an|one|half an) hour of|an? (?:hour|short drive) from|minutes? (?:from|away)|drive from)\b/i, 'origin-relative phrasing'],
  [/\b[Ff]rom\s+[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*)*,?\s+(?:follow|drive|head|take|turn|go)\b/, 'origin-relative phrasing'],
  [/\b[Nn]earest\b[^.]{0,40}\bto\s+(?:home|town|[A-Z])/, 'origin-relative phrasing'],
  [/\broute\b/i, 'route wording'],
  [/if 2026 repeats|assumed to repeat|2027 handbook/i, 'projected rules'],
];
/** Rule facts belong in rules.json, never in spot free text or calendar notes. */
export const RULE_PATTERNS = [
  [new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?!\\d)`), 'month-day date'],
  [new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b`), 'day-month date'],
  [/\b\d+\s*(?:\/|a|per)\s*day\b/i, 'daily limit'],
  [/\bkeep up to \d+/i, 'daily limit'],
  [/\b\d+(?:\.\d+)?\s*cm\b/i, 'size limit'],
  [/\bs\.\s?\d/, 'statute section'],
  [/\b(?:MPFR|AFR|Fisheries Act|Angling Act|Regulations?|MAR-VAR|GVO-|variation orders?|revok\w*|Contraventions)\b/i, 'statute or order'],
  [/\b2027\b/, 'projected rules year'],
  [/\blicen[cs]e[ds]?\b/i, 'licence rule'],
  [/\bclosed to\b|\bopen (?:all year|year-round)\b/i, 'season rule'],
  [/\b(?:bag|possession) limit|\bminimum size\b|\bmust be (?:kept|released|retained)\b|\bmust keep\b|\bmandatory retention\b/i, 'limit rule'],
  [new RegExp(`\\b(?:keep|retain|release)\\b[^.]{0,30}\\b${MONTH}`), 'retention tied to a month'],
  [new RegExp(`\\b${MONTH}[^.]{0,30}\\b(?:keep|retain|release)\\b`), 'retention tied to a month'],
  [/\$\s?\d/, 'fine amount'],
];
export const ACCESS_PATTERNS = [
  [/assum\w*[^.]{0,40}allowance|allowance[^.]{0,40}assum/i, 'assumed road allowance'],
  [/fish from the road allowance/i, 'instruction to fish a road allowance'],
];
/** Inland waters close 22:00-06:00 and sport fish close at night, so inland tips never point at dark hours. */
export const INLAND_NIGHT = /\b(?:dawn|dusk|after dark|at night|night|overnight|first light|sunrise|sunset)\b/i;
export const ANY_NIGHT = /\b(?:after dark|at night|overnight)\b/i;

/**
 * Optional extra terms, one per line (# starts a comment), from a file outside
 * the repository named by FISHING_DENYLIST. Each is matched as a whole word,
 * ignoring case, in every fishing file. Without the variable nothing is added.
 */
export async function readDenylist(path) {
  const text = await readFile(path, 'utf8');
  return text.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean)
    .map((term) => [new RegExp(`(?<![\\w])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'i'), 'local denylist term']);
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const days = (a, b) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
const addMonths = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

function fail(errors, where, message) { errors.push(`${where}: ${message}`); }
function strings(value, path = '') {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}
export function scan(errors, where, text, patterns) {
  for (const [pattern, label] of patterns) if (pattern.test(text)) fail(errors, where, `${label} (${pattern}) in "${text.slice(0, 80)}"`);
}
function months(errors, where, list, { allowEmpty = true } = {}) {
  if (!Array.isArray(list) || (!allowEmpty && list.length === 0) || list.some((m) => !Number.isInteger(m) || m < 1 || m > 12) ||
      new Set(list).size !== list.length || list.some((m, i) => i && m <= list[i - 1])) fail(errors, where, 'months must be sorted unique integers 1-12');
}
function inBounds(lon, lat, b) { return Number.isFinite(lon) && Number.isFinite(lat) && lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north; }
function boundsValid(b) { return b && ['west', 'south', 'east', 'north'].every((k) => Number.isFinite(b[k])) && b.west < b.east && b.south < b.north; }

export function checkCalendar(calendar, errors) {
  if (calendar?.schemaVersion !== 1 || !calendar.species || typeof calendar.species !== 'object') { fail(errors, 'calendar.json', 'schemaVersion 1 and a species object are required'); return new Set(); }
  for (const [where, text] of strings(calendar)) scan(errors, `calendar.json ${where}`, text, [...FORBIDDEN_EVERYWHERE, ...FORBIDDEN_IN_COPY]);
  for (const [key, row] of Object.entries(calendar.species)) {
    const where = `calendar.json ${key}`;
    if (!/^[a-z][a-z_]*$/.test(key)) fail(errors, where, 'species keys are snake_case');
    if (typeof row.label !== 'string' || !row.label) fail(errors, where, 'label required');
    months(errors, `${where}.months_good`, row.months_good); months(errors, `${where}.months_peak`, row.months_peak);
    if (Array.isArray(row.months_peak) && row.months_peak.some((m) => !row.months_good?.includes(m))) fail(errors, where, 'peak months must be good months');
    if (typeof row.rules_only !== 'boolean') fail(errors, where, 'rules_only must be boolean');
    if (row.rules_only && (row.months_good?.length || row.months_peak?.length)) fail(errors, where, 'rules-only species carry no months');
    if (typeof row.notes !== 'string' || !row.notes || row.notes.length > 320) fail(errors, where, 'notes must be 1-320 characters');
    else scan(errors, `${where}.notes`, row.notes, RULE_PATTERNS);
    for (const k of Object.keys(row)) if (!CALENDAR_KEYS.includes(k)) fail(errors, where, `unexpected field ${k}`);
  }
  for (const key of ['atlantic_salmon', 'american_eel']) {
    const row = calendar.species[key];
    if (!row || !row.rules_only || row.months_good?.length || row.months_peak?.length) fail(errors, `calendar.json ${key}`, 'must exist as rules-only with no months');
  }
  return new Set(Object.keys(calendar.species));
}

export function checkRules(rules, species, errors) {
  const where = 'rules.json';
  if (!Number.isInteger(rules?.rulesYear) || !isDate(rules.validUntil) || !isDate(rules.checked) || typeof rules.validUntilBasis !== 'string') {
    fail(errors, where, 'rulesYear, validUntil, validUntilBasis and checked are required'); return new Map();
  }
  // Structure only: the window must belong to its rules year. Expiry is enforced at runtime.
  if (rules.validUntil <= `${rules.rulesYear}-04-01` || rules.validUntil > `${rules.rulesYear + 1}-06-30`) fail(errors, where, 'validUntil must fall within about 14 months of the rules year');
  if (!Array.isArray(rules.publishedSources) || !rules.publishedSources.length ||
      rules.publishedSources.some((s) => !s.label || !/^https:\/\//.test(s.url ?? ''))) fail(errors, where, 'publishedSources need labels and https URLs');
  if (!Array.isArray(rules.entries) || !rules.entries.length) { fail(errors, where, 'entries required'); return new Map(); }
  for (const [p, text] of strings({ ...rules, entries: undefined })) scan(errors, `${where} ${p}`, text, [...FORBIDDEN_EVERYWHERE, ...FORBIDDEN_IN_COPY]);
  const ids = new Map();
  for (const entry of rules.entries) {
    const at = `${where} ${entry.id}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id ?? '')) fail(errors, at, 'id must be a slug');
    if (ids.has(entry.id)) fail(errors, at, 'duplicate id');
    ids.set(entry.id, entry);
    if (typeof entry.text !== 'string' || entry.text.length < 20 || entry.text.length > 700) fail(errors, at, 'text must be 20-700 characters');
    for (const [p, text] of strings(entry)) scan(errors, `${at} ${p}`, text, [...FORBIDDEN_EVERYWHERE, ...FORBIDDEN_IN_COPY]);
    const s = entry.source;
    if (!s?.label || !/^https:\/\//.test(s.url ?? '') || typeof s.section !== 'string' || !s.section) fail(errors, at, 'source needs label, https url and section');
    if (typeof entry.standing !== 'boolean') fail(errors, at, 'standing must be boolean');
    if (!isDate(entry.validFrom) || !isDate(entry.validUntil) || entry.validFrom > entry.validUntil) fail(errors, at, 'validFrom <= validUntil ISO dates required');
    else if (entry.standing ? entry.validUntil > addMonths(rules.checked, 24) : days(rules.validUntil, entry.validUntil) > 92) {
      fail(errors, at, entry.standing ? 'standing review date must be within 24 months of checked' : 'entry validUntil runs too far past the rules window');
    }
    const scope = entry.scope;
    if (!scope || !Array.isArray(scope.spots) || !Array.isArray(scope.species) || !(scope.spots.length + scope.species.length)) fail(errors, at, 'scope needs spots and/or species arrays');
    else for (const k of scope.species) if (!species.has(k)) fail(errors, at, `unknown species ${k}`);
    for (const k of Object.keys(entry)) if (!RULE_KEYS.includes(k)) fail(errors, at, `unexpected field ${k}`);
  }
  return ids;
}

export function checkSpots(spots, species, rules, coverage, errors) {
  const where = 'spots.geojson';
  if (spots?.type !== 'FeatureCollection' || !Array.isArray(spots.features) || !spots.features.length) { fail(errors, where, 'non-empty FeatureCollection required'); return new Set(); }
  if (!boundsValid(coverage) || !inBounds(coverage.west, coverage.south, NS_BOUNDS) || !inBounds(coverage.east, coverage.north, NS_BOUNDS)) fail(errors, where, 'coverageBounds must sit inside Nova Scotia');
  for (const [p, text] of strings({ ...spots, features: undefined })) scan(errors, `${where} ${p}`, text, [...FORBIDDEN_EVERYWHERE, ...FORBIDDEN_IN_COPY]);
  const ids = new Set();
  for (const feature of spots.features) {
    const p = feature?.properties ?? {}; const at = `${where} ${p.id ?? '?'}`;
    const [lon, lat] = feature?.geometry?.coordinates ?? [];
    if (feature?.type !== 'Feature' || feature.geometry?.type !== 'Point' || feature.geometry.coordinates.length !== 2) fail(errors, at, 'Point feature required');
    if (!inBounds(lon, lat, NS_BOUNDS)) fail(errors, at, 'outside Nova Scotia');
    else if (boundsValid(coverage) && !inBounds(lon, lat, coverage)) fail(errors, at, 'outside coverageBounds');
    for (const k of Object.keys(p)) if (!SPOT_KEYS.includes(k)) fail(errors, at, `field ${k} is not on the allowlist`);
    for (const k of SPOT_KEYS) if (!(k in p)) fail(errors, at, `missing ${k}`);
    if (!/^S\d{2}$/.test(p.id ?? '')) fail(errors, at, 'id must look like S01');
    if (ids.has(p.id)) fail(errors, at, 'duplicate id');
    ids.add(p.id);
    for (const k of ['name', 'area', 'kind', 'species_text']) if (typeof p[k] !== 'string' || !p[k] || p[k].length > 160) fail(errors, at, `${k} must be 1-160 characters`);
    if (!WATER_TYPES.includes(p.water_type)) fail(errors, at, 'unknown water_type');
    if (!EVIDENCE.includes(p.evidence)) fail(errors, at, 'unknown evidence class');
    if (!Array.isArray(p.species) || !p.species.length || p.species.some((s) => !species.has(s))) fail(errors, at, 'species must be calendar keys');
    months(errors, `${at}.best_months`, p.best_months, { allowEmpty: false }); months(errors, `${at}.peak_months`, p.peak_months);
    if (Array.isArray(p.peak_months) && p.peak_months.some((m) => !p.best_months?.includes(m))) fail(errors, at, 'peak months must be best months');
    for (const k of SPOT_TEXT_FIELDS) {
      if (typeof p[k] !== 'string' || !p[k] || p[k].length > 450) { fail(errors, at, `${k} must be 1-450 characters`); continue; }
      scan(errors, `${at}.${k}`, p[k], RULE_PATTERNS);
      if (k === 'access') scan(errors, `${at}.${k}`, p[k], ACCESS_PATTERNS);
    }
    if (typeof p.tip === 'string' && (ANY_NIGHT.test(p.tip) || (p.water_type === 'fresh-lake' && INLAND_NIGHT.test(p.tip)))) fail(errors, at, 'tip points at hours closed to angling');
    if (!Array.isArray(p.sources) || !p.sources.length || new Set(p.sources).size !== p.sources.length ||
        p.sources.some((u) => !/^https:\/\//.test(u) || /nsgiwa\.novascotia\.ca|api-iwls|proxyinternet\.nrcan/.test(u))) fail(errors, at, 'sources must be unique https URLs without delivery-service endpoints');
    if (!Array.isArray(p.rules_ref) || !p.rules_ref.length || new Set(p.rules_ref).size !== p.rules_ref.length) fail(errors, at, 'rules_ref must be unique ids');
    else for (const r of p.rules_ref) if (!rules.has(r)) fail(errors, at, `unknown rules_ref ${r}`);
    for (const [path, text] of strings(p)) scan(errors, `${at} ${path}`, text, [...FORBIDDEN_EVERYWHERE, ...FORBIDDEN_IN_COPY]);
  }
  // rules_ref is the source of truth; each rule's spot scope must mirror it exactly.
  for (const [id, entry] of rules) {
    const referencing = spots.features.filter((f) => f.properties?.rules_ref?.includes(id)).map((f) => f.properties.id).sort();
    const scoped = [...(entry.scope?.spots ?? [])].sort();
    if (JSON.stringify(referencing) !== JSON.stringify(scoped)) fail(errors, `rules.json ${id}`, `scope.spots ${scoped.join(',') || '(none)'} differs from referencing spots ${referencing.join(',') || '(none)'}`);
  }
  return ids;
}

export function checkStockedWaters(collection, receipt, bytes, errors) {
  const where = 'stocked-waters.geojson';
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features) || !collection.features.length) { fail(errors, where, 'non-empty FeatureCollection required'); return; }
  for (const [p, text] of strings({ ...collection, features: undefined })) scan(errors, `${where} ${p}`, text, FORBIDDEN_EVERYWHERE);
  const ids = new Set();
  for (const feature of collection.features) {
    const p = feature?.properties ?? {}; const at = `${where} ${p.id ?? '?'}`;
    const [lon, lat] = feature?.geometry?.coordinates ?? [];
    if (feature?.geometry?.type !== 'Point' || !inBounds(lon, lat, NS_BOUNDS)) fail(errors, at, 'Point inside Nova Scotia required');
    if (!/^sw-[0-9a-f]{12}$/.test(p.id ?? '') || ids.has(p.id)) fail(errors, at, 'unique sw- id required');
    ids.add(p.id);
    if (!NS_COUNTIES.includes(p.county)) fail(errors, at, 'unknown county');
    if (typeof p.name !== 'string' || !p.name || typeof p.source_name !== 'string' || !p.source_name) fail(errors, at, 'name and source_name required');
    if (!Array.isArray(p.species) || !p.species.length || p.species.some((s) => !STOCKED_SPECIES.includes(s))) fail(errors, at, 'species must be stocked trout species');
    // Water names may contain 'Salmon' (trout are stocked in Salmon River); the species must not.
    if (/salmon/i.test(`${p.species} ${p.species_text}`)) fail(errors, at, 'salmon releases are withheld');
    if (!isDate(p.last_stocked) || !Array.isArray(p.years) || !p.years.length || p.years.some((y) => !Number.isInteger(y)) ||
        Number(p.last_stocked.slice(0, 4)) !== p.years.at(-1)) fail(errors, at, 'years and last_stocked must agree');
    const sizes = SIZE_CLASSES.map((k) => p[`released_${k}`]);
    if (sizes.some((n) => !Number.isInteger(n) || n < 0) || sizes.reduce((a, b) => a + b, 0) !== p.released_total) fail(errors, at, 'size classes must sum to released_total');
    if (![19, 20, 21].includes(p.utm_zone)) fail(errors, at, 'utm_zone must be 19, 20 or 21');
  }
  const receiptWhere = 'stocked-waters.source.json';
  if (receipt?.schemaVersion !== 1 || receipt.source?.id !== '8e4a-m6fw' || !isDate(String(receipt.source?.retrieved ?? '').slice(0, 10)) || !receipt.source?.query) {
    fail(errors, receiptWhere, 'source id, query and retrieval date required');
  }
  const rows = receipt?.rows ?? {};
  if (![rows.fetched, rows.accepted, rows.rejected, rows.withheld].every(Number.isInteger) || rows.accepted + rows.rejected + rows.withheld !== rows.fetched ||
      !Array.isArray(receipt?.rejected) || receipt.rejected.length !== rows.rejected) fail(errors, receiptWhere, 'row counts must reconcile with the rejected list');
  if (receipt?.output?.sha256 !== sha256(bytes) || receipt?.output?.bytes !== bytes.length || receipt?.output?.features !== collection.features.length) {
    fail(errors, receiptWhere, 'output hash, size or feature count does not match stocked-waters.geojson');
  }
}

export async function checkFishing(directory = DEFAULT_DIR, { writeHashes = false, denylist } = {}) {
  const errors = [];
  const extra = denylist ?? (process.env.FISHING_DENYLIST ? await readDenylist(process.env.FISHING_DENYLIST) : []);
  const read = (name) => readFile(resolve(directory, name));
  const receiptPath = resolve(directory, 'source.json');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const bytes = Object.fromEntries(await Promise.all(CURATED_FILES.map(async (n) => [n, await read(n)])));
  if (writeHashes) {
    receipt.files = Object.fromEntries(CURATED_FILES.map((n) => [n, { sha256: sha256(bytes[n]), bytes: bytes[n].length }]));
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  if (receipt.schemaVersion !== 1 || !receipt.files) fail(errors, 'source.json', 'schemaVersion 1 and a files block are required');
  for (const name of CURATED_FILES) {
    const pinned = receipt.files?.[name];
    if (pinned?.sha256 !== sha256(bytes[name]) || pinned?.bytes !== bytes[name].length) fail(errors, 'source.json', `${name} does not match its pinned SHA-256 (edit deliberately, then run with --write-hashes)`);
  }
  // The receipt's editorial rules and pin policy state that OpenStreetMap is not used, so they may name it; nothing else is relaxed.
  for (const [p, text] of strings(receipt)) scan(errors, `source.json ${p}`, text, FORBIDDEN_EVERYWHERE.filter(([pattern]) => !pattern.test('openstreetmap')));
  const licence = bytes['LICENCE.txt'].toString('utf8');
  if (!/CC BY 4\.0/.test(licence) || !/Open Government Licence – Nova Scotia/.test(licence) || !/Open Government Licence – Canada/.test(licence)) fail(errors, 'LICENCE.txt', 'must state CC BY 4.0, OGL-NS and OGL-Canada');
  scan(errors, 'LICENCE.txt', licence, FORBIDDEN_EVERYWHERE);
  const calendar = JSON.parse(bytes['calendar.json']);
  const rules = JSON.parse(bytes['rules.json']);
  const spots = JSON.parse(bytes['spots.geojson']);
  const species = checkCalendar(calendar, errors);
  const ruleIds = checkRules(rules, species, errors);
  const spotIds = checkSpots(spots, species, ruleIds, receipt.spots?.coverageBounds, errors);
  for (const [id, entry] of ruleIds) for (const s of entry.scope?.spots ?? []) if (!spotIds.has(s)) fail(errors, `rules.json ${id}`, `unknown spot ${s}`);
  const stockedBytes = await read('stocked-waters.geojson');
  const stocked = JSON.parse(stockedBytes);
  const stockedReceipt = JSON.parse(await read('stocked-waters.source.json'));
  checkStockedWaters(stocked, stockedReceipt, stockedBytes, errors);
  if (extra.length) {
    const files = { 'calendar.json': calendar, 'rules.json': rules, 'spots.geojson': spots, 'source.json': receipt,
      'stocked-waters.geojson': stocked, 'stocked-waters.source.json': stockedReceipt, 'LICENCE.txt': licence };
    for (const [name, value] of Object.entries(files)) for (const [p, text] of strings(value)) scan(errors, `${name} ${p}`.trim(), text, extra);
  }
  if (errors.length) throw new Error(`Fishing data check failed:\n- ${errors.join('\n- ')}`);
  return { spots: spotIds.size, rules: ruleIds.size, species: species.size, stockedWaters: stocked.features.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const directory = args.find((a) => !a.startsWith('--')) ?? DEFAULT_DIR;
  try {
    const summary = await checkFishing(directory, { writeHashes: args.includes('--write-hashes') });
    console.log(`Verified fishing data: ${summary.spots} spots, ${summary.rules} rule entries, ${summary.species} calendar species, ${summary.stockedWaters} stocked waters`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

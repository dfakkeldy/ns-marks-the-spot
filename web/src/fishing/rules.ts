/**
 * The /fishing page's rules gate. `rules.json` is a dated, unofficial summary
 * of the 2026 rules; this module decides which of its entries a reader may
 * see today, and it fails closed: an entry outside its dates, a file past its
 * own date, a malformed entry or a file that did not load all leave the
 * reader with links to the official sources instead of rule text.
 *
 * Nothing here works out whether a season is open now. Entries are shown or
 * hidden as text, never turned into an "open" or "closed" verdict.
 */

export interface RuleSource {
  readonly label: string;
  readonly url: string;
  readonly section: string;
}

export interface RuleEntry {
  readonly id: string;
  readonly scope: { readonly spots: readonly string[]; readonly species: readonly string[] };
  readonly text: string;
  readonly source: RuleSource;
  readonly validFrom: string;
  readonly validUntil: string;
  /** A regulation that does not change yearly; its `validUntil` is a review date. */
  readonly standing: boolean;
}

export interface RulesFile {
  readonly rulesYear: number;
  readonly checked: string;
  /** Non-standing entries are hidden after this date. */
  readonly validUntil: string;
  readonly notice: string;
  readonly entries: readonly RuleEntry[];
  /** Entries the gate could not read, kept only so their species can count them as hidden. */
  readonly dropped: readonly { readonly id: string | null; readonly species: readonly string[] }[];
}

export interface OfficialLink {
  readonly label: string;
  readonly url: string;
}

/**
 * Where a reader goes when the summary is hidden. Landing pages, not this
 * year's PDF: the handbook's file address changes with each edition.
 */
export const OFFICIAL_RULE_LINKS: readonly OfficialLink[] = [
  { label: "Nova Scotia Anglers' Handbook (current edition)", url: "https://www.novascotia.ca/documents/anglers-handbook" },
  { label: "DFO Maritimes recreational fisheries", url: "https://www.dfo-mpo.gc.ca/fisheries-peches/recreational-recreative/maritimes/diadrom-eng.html" },
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** A real calendar date written YYYY-MM-DD; such strings compare in date order. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const HALIFAX_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Today's date in Nova Scotia, YYYY-MM-DD. The rules are the province's and
 * lapse on its calendar, so a reader in another time zone sees them hide at
 * the same moment as one in Halifax, never hours late.
 */
export function halifaxIsoDate(now: Date = new Date()): string {
  const parts = Object.fromEntries(HALIFAX_DATE.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const isHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

function parseEntry(value: unknown): RuleEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Record<string, unknown>;
  const scope = entry.scope as Record<string, unknown> | undefined;
  const source = entry.source as Record<string, unknown> | undefined;
  if (!isText(entry.id) || !isText(entry.text) || typeof entry.standing !== "boolean") return null;
  if (!scope || !isTextList(scope.spots) || !isTextList(scope.species)) return null;
  if (!source || !isText(source.label) || !isHttpsUrl(source.url) || typeof source.section !== "string") return null;
  if (!isIsoDate(entry.validFrom) || !isIsoDate(entry.validUntil) || entry.validFrom > entry.validUntil) return null;
  return {
    id: entry.id,
    scope: { spots: scope.spots, species: scope.species },
    text: entry.text,
    source: { label: source.label, url: source.url, section: source.section },
    validFrom: entry.validFrom,
    validUntil: entry.validUntil,
    standing: entry.standing,
  };
}

/**
 * The file as the gate can trust it, or null when its dates or shape cannot
 * be read. A malformed entry is dropped, so any spot that names it, and any
 * species its scope still names, counts it as hidden rather than showing
 * nothing at all.
 */
export function parseRulesFile(value: unknown): RulesFile | null {
  if (typeof value !== "object" || value === null) return null;
  const file = value as Record<string, unknown>;
  if (!Number.isInteger(file.rulesYear) || !isIsoDate(file.checked) || !isIsoDate(file.validUntil)) return null;
  if (!Array.isArray(file.entries)) return null;
  const entries: RuleEntry[] = [];
  const dropped: { id: string | null; species: readonly string[] }[] = [];
  for (const raw of file.entries) {
    const entry = parseEntry(raw);
    if (entry) {
      entries.push(entry);
      continue;
    }
    const record = (typeof raw === "object" && raw !== null ? raw : {}) as { id?: unknown; scope?: { species?: unknown } };
    const species = record.scope?.species;
    dropped.push({ id: isText(record.id) ? record.id : null, species: isTextList(species) ? species : [] });
  }
  return {
    rulesYear: file.rulesYear as number,
    checked: file.checked,
    validUntil: file.validUntil,
    notice: typeof file.notice === "string" ? file.notice : "",
    entries,
    dropped,
  };
}

export type RuleVisibility = "shown" | "not-yet" | "expired" | "file-expired";

export function ruleVisibility(entry: RuleEntry, file: Pick<RulesFile, "validUntil">, today: string): RuleVisibility {
  if (today < entry.validFrom) return "not-yet";
  if (today > entry.validUntil) return "expired";
  if (!entry.standing && today > file.validUntil) return "file-expired";
  return "shown";
}

export interface RuleSelection {
  readonly shown: readonly RuleEntry[];
  /** Entries a spot or species names that the reader cannot see today. */
  readonly hidden: number;
  /** Of `hidden`, those missing from the file or unreadable, not out of date. */
  readonly unreadable: number;
  /** True when the rules file itself could not be loaded or read. */
  readonly unavailable: boolean;
}

/** The named entries a reader may see today, in the order they are named. */
export function selectRules(file: RulesFile | null, ids: readonly string[], today: string): RuleSelection {
  if (!file || !isIsoDate(today)) return { shown: [], hidden: ids.length, unreadable: 0, unavailable: true };
  const shown: RuleEntry[] = [];
  let hidden = 0;
  let unreadable = 0;
  for (const id of ids) {
    const entry = file.entries.find((candidate) => candidate.id === id);
    if (entry && ruleVisibility(entry, file, today) === "shown") shown.push(entry);
    else {
      hidden += 1;
      if (!entry) unreadable += 1;
    }
  }
  return { shown, hidden, unreadable, unavailable: false };
}

/** Entries scoped to one species (the calendar's rules-only rows use these). */
export function rulesForSpecies(file: RulesFile | null, species: string, today: string): RuleSelection {
  if (!file) return { shown: [], hidden: 0, unreadable: 0, unavailable: true };
  const ids = file.entries.filter(({ scope }) => scope.species.includes(species)).map(({ id }) => id);
  const selection = selectRules(file, ids, today);
  // An unreadable entry that still names the species is held back, not lost.
  const dropped = file.dropped.filter((entry) => entry.species.includes(species)).length;
  return { ...selection, hidden: selection.hidden + dropped, unreadable: selection.unreadable + dropped };
}

export type RulesStamp =
  | { readonly kind: "current"; readonly rulesYear: number; readonly checked: string; readonly validUntil: string }
  | { readonly kind: "expired"; readonly rulesYear: number; readonly checked: string; readonly validUntil: string }
  | { readonly kind: "unavailable" };

/** What the page says about the summary as a whole. */
export function rulesStamp(file: RulesFile | null, today: string): RulesStamp {
  if (!file || !isIsoDate(today)) return { kind: "unavailable" };
  const { rulesYear, checked, validUntil } = file;
  return today > validUntil
    ? { kind: "expired", rulesYear, checked, validUntil }
    : { kind: "current", rulesYear, checked, validUntil };
}

const LONG_DATE = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

/** "October 12, 2026" for a YYYY-MM-DD date. */
export function formatRuleDate(value: string): string {
  if (!isIsoDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return LONG_DATE.format(new Date(Date.UTC(year, month - 1, day)));
}

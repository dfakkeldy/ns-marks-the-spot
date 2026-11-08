import { PROVINCE_ATTRIBUTION } from "./provinceLicense";

/** One licence sentence, stated once, with every source it covers named under it. */
export type AttributionGroup = { licence: string; sources: string[] };
export type GroupedAttributions = { groups: AttributionGroup[]; other: string[] };

const openLicence = (jurisdiction: string) =>
  `Contains information licensed under the Open Government Licence – ${jurisdiction}.`;

/** The Atlas receipts state this sentence without its final stop. */
export const OPEN_LICENCE_NOVA_SCOTIA = openLicence("Nova Scotia");

const CONTAINS = /^Contains information licensed under the Open Government Licence – (Nova Scotia|Canada)\.?\s*(.*)$/su;
const SOURCE_FIRST = /^(.+?); Open Government Licence – (Nova Scotia|Canada)\.\s*(.*)$/su;

/**
 * Splits a credit into the licence it states and the source it names, only for
 * the exact wordings below. Anything else keeps its full text as its own line:
 * this must never rewrite a credit it does not recognise.
 */
function parse(line: string): { licence: string; source: string } | null {
  if (line === PROVINCE_ATTRIBUTION) return { licence: line, source: "" };
  if (line.endsWith(PROVINCE_ATTRIBUTION)) {
    return { licence: PROVINCE_ATTRIBUTION, source: line.slice(0, -PROVINCE_ATTRIBUTION.length).trim() };
  }
  const contains = CONTAINS.exec(line);
  if (contains) return { licence: openLicence(contains[1]), source: contains[2].trim() };
  const sourceFirst = SOURCE_FIRST.exec(line);
  if (sourceFirst) {
    const named = sourceFirst[1].startsWith("Source:") ? sourceFirst[1] : `Source: ${sourceFirst[1]}`;
    return {
      licence: openLicence(sourceFirst[2]),
      source: `${named}.${sourceFirst[3] ? ` ${sourceFirst[3].trim()}` : ""}`,
    };
  }
  return null;
}

/**
 * Lays the licence strip's credits out so a shared licence is stated once.
 * No duplicate lines, every source stays named, and `always` keeps a licence
 * heading when a credit that is not a plain string (the Atlas row, with its
 * links) sits under it.
 */
export function groupAttributions(lines: readonly string[], always: readonly string[] = []): GroupedAttributions {
  const groups = new Map<string, Set<string>>(always.map((licence) => [licence, new Set<string>()]));
  const other = new Set<string>();
  for (const line of lines) {
    const parsed = parse(line);
    if (!parsed) {
      other.add(line);
      continue;
    }
    const sources = groups.get(parsed.licence) ?? new Set<string>();
    if (parsed.source) sources.add(parsed.source);
    groups.set(parsed.licence, sources);
  }
  return {
    groups: Array.from(groups, ([licence, sources]) => ({ licence, sources: Array.from(sources) })),
    other: Array.from(other),
  };
}

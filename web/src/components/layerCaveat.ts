/**
 * A layer row keeps one short honest line at rest; the row's own disclosure
 * holds the whole text. Nothing is cut: when the line is shorter than the
 * caveat, `full` carries every word of it for the disclosure to show.
 */
export const CAVEAT_REST_LENGTH = 76;

const ABBREVIATION = /(?:^|[\s(])(?:St|Ste|Mt|No|Dr|Co|Ltd|Inc|approx|vs|etc|e\.g|i\.e|cf|N\.S)\.$/iu;
const SENTENCE_END = /[.!?](?=\s+[A-Z0-9“"(])/gu;
/** A shorter opening ("Note.") would say nothing on its own. */
const MIN_LEAD_LENGTH = 24;

export function splitCaveat(text: string): { lead: string; full: string | null } {
  if (text.length <= CAVEAT_REST_LENGTH) return { lead: text, full: null };
  for (const match of text.matchAll(SENTENCE_END)) {
    const lead = text.slice(0, match.index + 1);
    if (lead.length >= MIN_LEAD_LENGTH && !ABBREVIATION.test(lead)) return { lead, full: text };
  }
  // Catalogue caveats also run as "fact · fact · fact": rest on the facts that fit.
  const parts = text.split(" · ");
  if (parts.length > 1) {
    let lead = parts[0];
    for (const part of parts.slice(1)) {
      if (`${lead} · ${part}`.length > CAVEAT_REST_LENGTH) break;
      lead = `${lead} · ${part}`;
    }
    return { lead, full: text };
  }
  // One long sentence: the row clamps it, the disclosure has it all.
  return { lead: text, full: text };
}

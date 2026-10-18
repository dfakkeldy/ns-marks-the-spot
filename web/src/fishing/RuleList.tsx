import { OFFICIAL_RULE_LINKS, type RuleSelection, type RulesFile } from "./rules";

/** The official sources, which every rules section ends with whatever it shows. */
export function OfficialRuleLinks({ className = "fishing-official-links" }: { className?: string }) {
  return (
    <ul className={className}>
      {OFFICIAL_RULE_LINKS.map(({ label, url }) => (
        <li key={url}><a href={url} target="_blank" rel="noreferrer">{label}</a></li>
      ))}
    </ul>
  );
}

/**
 * Rule text that passed the gate, each with its citation, then what the gate
 * held back. Hidden text is replaced by the official sources, never by a
 * guess at what the rule might be now.
 */
export function RuleList({ selection, rules }: { selection: RuleSelection; rules: RulesFile | null }) {
  const { shown, hidden, unreadable, unavailable } = selection;
  const outOfDate = hidden - unreadable;
  return (
    <div className="fishing-rules-body">
      {shown.length > 0 ? (
        <ul className="fishing-rule-list">
          {shown.map((entry) => (
            <li key={entry.id}>
              <p>{entry.text}</p>
              <p className="fishing-rule-source">
                <span>{entry.standing ? "Standing rule" : `${rules?.rulesYear ?? ""} rule`.trim()}</span>
                {" · "}
                <a href={entry.source.url} target="_blank" rel="noreferrer">{entry.source.label}</a>
                {entry.source.section ? `, ${entry.source.section}` : null}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {unavailable ? (
        <p className="fishing-rules-hidden" role="note">
          The rules summary could not be loaded. Check the current Anglers&apos; Handbook and DFO notices.
        </p>
      ) : hidden > 0 ? (
        <p className="fishing-rules-hidden" role="note">
          {outOfDate > 0 ? `${outOfDate === 1 ? "One rule is" : `${outOfDate} rules are`} hidden because ${outOfDate === 1 ? "it is outside its" : "they are outside their"} dates. ` : null}
          {unreadable > 0 ? `${unreadable === 1 ? "One rule" : `${unreadable} rules`} could not be read and ${unreadable === 1 ? "is" : "are"} hidden. ` : null}
          Check the current Anglers&apos; Handbook and DFO notices.
        </p>
      ) : null}
      <OfficialRuleLinks />
    </div>
  );
}

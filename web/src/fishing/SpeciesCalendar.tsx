import type { CalendarGroup, FishingCalendar } from "./data";
import { calendarLevel, MONTH_NAMES, monthName } from "./filters";
import { RuleList } from "./RuleList";
import { formatRuleDate, rulesForSpecies, type RulesFile } from "./rules";

const GROUP_LABELS: Readonly<Record<CalendarGroup, string>> = {
  saltwater: "Salt water",
  diadromous: "Sea-run and tidal",
  freshwater: "Fresh water",
};
const GROUP_ORDER: readonly CalendarGroup[] = ["saltwater", "diadromous", "freshwater"];

/** In-panel, not a URL fragment: the address bar holds the map's share state. */
function showRules(key: string) {
  const target = document.getElementById(`fishing-rules-${key}`);
  if (!target) return;
  target.scrollIntoView({ block: "nearest" });
  target.focus({ preventScroll: true });
}

/**
 * When each fish is around, as an HTML table so it reads row by row with a
 * screen reader and scrolls inside itself on a phone. A rules-only species
 * (Atlantic and landlocked salmon, American eel, chain pickerel) gets no
 * months at all, only its gated rules below the table.
 */
export function SpeciesCalendar({ calendar, rules, today, month }: {
  calendar: FishingCalendar | null;
  rules: RulesFile | null;
  today: string;
  month: number | null;
}) {
  if (!calendar || calendar.species.length === 0) {
    return (
      <details className="fishing-calendar" id="fishing-calendar">
        <summary>Species calendar</summary>
        <p className="fishing-calendar-note">The species calendar could not be loaded.</p>
      </details>
    );
  }
  const rulesOnly = calendar.species.filter(({ rulesOnly: only }) => only);
  return (
    <details className="fishing-calendar" id="fishing-calendar">
      <summary>Species calendar <small>· good and peak months</small></summary>
      <p className="fishing-calendar-note">
        {calendar.note} Checked {formatRuleDate(calendar.checked)}.
      </p>
      <div className="fishing-calendar-scroll" role="region" aria-label="Species calendar table" tabIndex={0}>
        <table className="fishing-calendar-table">
          <caption className="visually-hidden">Good and peak months by species. Not open seasons.</caption>
          <thead>
            <tr>
              <th scope="col">Species</th>
              {MONTH_NAMES.map((name, index) => (
                <th key={name} scope="col" className={month === index + 1 ? "is-month" : undefined}>
                  <abbr title={name}>{name.charAt(0)}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          {GROUP_ORDER.map((group) => {
            const rows = calendar.species.filter((species) => species.group === group);
            if (rows.length === 0) return null;
            return (
              <tbody key={group}>
                <tr className="fishing-calendar-group">
                  <th scope="rowgroup" colSpan={13}>{GROUP_LABELS[group]}</th>
                </tr>
                {rows.map((species) => (
                  <tr key={species.key} className={species.rulesOnly ? "is-rules-only" : undefined}>
                    <th scope="row">{species.label}</th>
                    {species.rulesOnly ? (
                      <td colSpan={12} className="fishing-calendar-rules-only">
                        Rules only: no months shown.{" "}
                        <button type="button" className="fishing-calendar-rules-link" onClick={() => showRules(species.key)}>
                          See the rules<span className="visually-hidden"> for {species.label}</span>
                        </button>
                      </td>
                    ) : MONTH_NAMES.map((_, index) => {
                      const cell = index + 1;
                      const level = calendarLevel(species, cell);
                      return (
                        <td key={cell} className={`is-${level}${month === cell ? " is-month" : ""}`}>
                          <span aria-hidden="true">{level === "peak" ? "●" : level === "good" ? "○" : ""}</span>
                          <span className="visually-hidden">{level === "none" ? `${monthName(cell)}: not listed` : `${monthName(cell)}: ${level}`}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="fishing-calendar-key">
        <span aria-hidden="true">●</span> Peak <span aria-hidden="true">○</span> Good. A blank month is not listed; it is not evidence that no fish are there.
      </p>

      {rulesOnly.length > 0 ? (
        <section className="fishing-calendar-rules" aria-labelledby="fishing-rules-only-heading">
          <h4 id="fishing-rules-only-heading">Rules-only species</h4>
          {rulesOnly.map((species) => (
            <div key={species.key} id={`fishing-rules-${species.key}`} className="fishing-calendar-rules-species" tabIndex={-1}>
              <h5>{species.label}</h5>
              {species.notes ? <p>{species.notes}</p> : null}
              <RuleList selection={rulesForSpecies(rules, species.key, today)} rules={rules} />
            </div>
          ))}
        </section>
      ) : null}

      <details className="fishing-calendar-notes">
        <summary>Notes on each species</summary>
        <dl>
          {calendar.species.filter(({ rulesOnly: only, notes }) => !only && notes).map((species) => (
            <div key={species.key}>
              <dt>{species.label}</dt>
              <dd>{species.notes}</dd>
            </div>
          ))}
        </dl>
      </details>
    </details>
  );
}

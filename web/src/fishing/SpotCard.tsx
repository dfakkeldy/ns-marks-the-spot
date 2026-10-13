import { fishingEvidenceLabels, fishingWaterTypes } from "../layers/fishingLayers";
import type { FishingCalendar, FishingSpot } from "./data";
import { monthName, monthStrip, speciesLabel } from "./filters";
import { RuleList } from "./RuleList";
import { formatRuleDate, selectRules, type RulesFile } from "./rules";
import { directionsLinks, spotCoordinates } from "./spotLinks";

/** A short, still-distinct label: several sources often share one host. */
function sourceLabel(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const label = `${hostname.replace(/^www\./u, "")}${pathname === "/" ? "" : pathname.replace(/\/$/u, "")}`;
    return label.length > 64 ? `${label.slice(0, 63)}…` : label;
  } catch {
    return url;
  }
}

export function SpotNumber({ spot }: { spot: Pick<FishingSpot, "number" | "water_type"> }) {
  return (
    <span className="fishing-spot-number" style={{ background: fishingWaterTypes[spot.water_type].color }} aria-hidden="true">
      {spot.number}
    </span>
  );
}

export function SpotCard({ spot, selected, calendar, rules, today, month, onToggle, onShowOnMap }: {
  spot: FishingSpot;
  selected: boolean;
  calendar: FishingCalendar | null;
  rules: RulesFile | null;
  today: string;
  month: number | null;
  onToggle: () => void;
  onShowOnMap: () => void;
}) {
  const detailsId = `fishing-spot-${spot.id}-details`;
  const waterType = fishingWaterTypes[spot.water_type];
  return (
    <li id={`fishing-spot-${spot.id}`} className={`fishing-spot${selected ? " is-selected" : ""}`} data-spot-id={spot.id}>
      <h3 className="fishing-spot-heading">
        <button type="button" className="fishing-spot-toggle" aria-expanded={selected} aria-controls={detailsId} onClick={onToggle}>
          <SpotNumber spot={spot} />
          <span className="fishing-spot-title">
            <span className="visually-hidden">Spot {spot.number}: </span>
            <strong>{spot.name}</strong>
            <small>{spot.area} · {waterType.label}</small>
          </span>
        </button>
      </h3>
      {selected ? <SpotDetails id={detailsId} spot={spot} calendar={calendar} rules={rules} today={today} month={month} onShowOnMap={onShowOnMap} /> : null}
    </li>
  );
}

function SpotDetails({ id, spot, calendar, rules, today, month, onShowOnMap }: {
  id: string;
  spot: FishingSpot;
  calendar: FishingCalendar | null;
  rules: RulesFile | null;
  today: string;
  month: number | null;
  onShowOnMap: () => void;
}) {
  const directions = directionsLinks(spot);
  const ruleSelection = selectRules(rules, spot.rules_ref, today);
  const monthsId = `${id}-months`;
  return (
    <div id={id} className="fishing-spot-details">
      <p className="fishing-spot-kind">{spot.kind}</p>

      <ul className="fishing-chips" aria-label="Species noted here (not a catch record)">
        {spot.species.map((key) => <li key={key}>{speciesLabel(key, calendar)}</li>)}
      </ul>

      <div className="fishing-month-strip">
        <p id={monthsId}>Good and peak months</p>
        <ol aria-labelledby={monthsId}>
          {monthStrip(spot).map(({ month: cell, level }) => (
            <li key={cell} className={`is-${level}${month === cell ? " is-month" : ""}`}>
              <span aria-hidden="true">{monthName(cell).charAt(0)}</span>
              <span className="visually-hidden">
                {monthName(cell)}: {level === "peak" ? "peak" : level === "good" ? "good" : "not listed"}
              </span>
            </li>
          ))}
        </ol>
        <p className="fishing-month-note">
          <span className="fishing-key is-peak" aria-hidden="true" /> Peak{" "}
          <span className="fishing-key is-good" aria-hidden="true" /> Good. When fish are around and fishing
          is reported good, not open seasons.
        </p>
      </div>

      <dl className="fishing-spot-facts">
        <div>
          <dt>Access <span>(not permission)</span></dt>
          <dd>{spot.access}</dd>
        </div>
        {spot.tip ? <div><dt>Tip</dt><dd>{spot.tip}</dd></div> : null}
        <div>
          <dt>Why it is listed</dt>
          <dd>
            {spot.why}{" "}
            <span className={`fishing-evidence fishing-evidence--${spot.evidence}`}>{fishingEvidenceLabels[spot.evidence]}</span>
          </dd>
        </div>
        {spot.caution ? <div className="fishing-spot-caution"><dt>Caution</dt><dd>{spot.caution}</dd></div> : null}
      </dl>

      <div className="fishing-directions">
        <a href={directions.google} target="_blank" rel="noreferrer">Directions in Google Maps</a>
        <a href={directions.apple} target="_blank" rel="noreferrer">Directions in Apple Maps</a>
      </div>
      <p className="fishing-coordinates">
        Pin at <span className="fishing-coordinates-value">{spotCoordinates(spot)}</span>. Directions lead to the pin;
        they do not show public access, parking or a right of way.
      </p>
      <button type="button" className="fishing-show-on-map" onClick={onShowOnMap}>Show on the map</button>

      <details className="fishing-rules">
        <summary>
          Rules to check here
          {rules ? <small> · {rules.rulesYear} summary, checked {formatRuleDate(rules.checked)}</small> : null}
        </summary>
        {rules?.notice ? <p className="fishing-rules-notice">{rules.notice}</p> : null}
        <RuleList selection={ruleSelection} rules={rules} />
      </details>

      {spot.sources.length > 0 ? (
        <details className="fishing-sources">
          <summary>Sources ({spot.sources.length})</summary>
          <ul>
            {spot.sources.map((url) => (
              <li key={url}><a href={url} target="_blank" rel="noreferrer">{sourceLabel(url)}</a></li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

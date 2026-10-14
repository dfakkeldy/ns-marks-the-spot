import type { FishingDataState } from "./data";
import { monthName } from "./filters";
import { OfficialRuleLinks } from "./RuleList";
import { formatRuleDate, halifaxIsoDate, rulesStamp } from "./rules";

/** The page's dedication: a first name only. */
export const FISHING_DEDICATION = "For Darrell, who never needed a reason to go fishing.";

function ShoreIllustration() {
  return (
    <svg className="fishing-hero-art" viewBox="0 0 360 132" role="img" aria-label="A fishing rod over a calm cove at first light">
      <defs>
        <linearGradient id="fishing-hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f3a46" />
          <stop offset="1" stopColor="#1d5a63" />
        </linearGradient>
      </defs>
      <rect width="360" height="132" fill="url(#fishing-hero-sky)" />
      <circle cx="286" cy="58" r="22" fill="#f2c98f" opacity="0.9" />
      <path d="M0 84 C40 70 78 74 116 80 C160 87 196 70 236 72 C280 74 318 86 360 78 V132 H0 Z" fill="#163f47" />
      <path d="M0 96 H360 V132 H0 Z" fill="#0c2e36" />
      <g stroke="#9fd6e2" strokeLinecap="round" fill="none" opacity="0.55">
        <path d="M24 106 h40 M92 114 h56 M190 108 h34 M252 118 h62" strokeWidth="2" />
        <path d="M262 100 h36" strokeWidth="1.5" />
      </g>
      <path className="fishing-hero-rod" d="M38 132 L176 34" stroke="#fbf6ea" strokeWidth="3" strokeLinecap="round" />
      <path className="fishing-hero-line" d="M176 34 C204 46 214 80 218 103" stroke="#fbf6ea" strokeWidth="1.2" fill="none" opacity="0.85" />
      <circle cx="218" cy="104" r="3.5" fill="#efbb87" />
      <path d="M210 110 q8 -4 16 0" stroke="#efbb87" strokeWidth="1.4" fill="none" opacity="0.8" />
    </svg>
  );
}

/** The /fishing summary: purpose, the rules stamp, quick filters and the dedication. */
export function FishingHero({ data, activeMonth, onShowMonth, onFit }: {
  data: FishingDataState;
  activeMonth: number | null;
  onShowMonth: (month: number | null) => void;
  onFit: () => void;
}) {
  const today = halifaxIsoDate();
  const currentMonth = new Date().getMonth() + 1;
  const stamp = data.status === "ready" ? rulesStamp(data.data.rules, today) : null;
  const showingThisMonth = activeMonth === currentMonth;
  return (
    <section className="fishing-hero" aria-labelledby="fishing-hero-title">
      <ShoreIllustration />
      <div className="fishing-hero-body">
        <p className="fishing-hero-eyebrow">Shore, wharf and lake fishing · Cape Breton and the Strait</p>
        <h2 id="fishing-hero-title">Fishing spots</h2>
        <p className="fishing-hero-lede">
          Hand-picked shore, wharf and lake spots, the months each fish is around, and the rules
          to check before you go.
        </p>
        <div className="fishing-hero-status">
          <span aria-hidden="true" />
          {stamp === null ? (
            <p>{data.status === "error" ? "The rules summary could not be loaded." : "Loading the rules summary…"} Check the current Anglers&apos; Handbook and DFO notices.</p>
          ) : stamp.kind === "current" ? (
            <p>
              Rules summary for the {stamp.rulesYear} licence year, checked {formatRuleDate(stamp.checked)}.
              Dated rules hide themselves after {formatRuleDate(stamp.validUntil)}. Not the official text.
            </p>
          ) : stamp.kind === "expired" ? (
            <p>
              The {stamp.rulesYear} rules summary passed its date on {formatRuleDate(stamp.validUntil)}, so its dated
              rules are hidden. Check the current Anglers&apos; Handbook and DFO notices.
            </p>
          ) : (
            <p>The rules summary could not be loaded. Check the current Anglers&apos; Handbook and DFO notices.</p>
          )}
        </div>
        {stamp?.kind !== "current" ? <OfficialRuleLinks className="fishing-hero-links" /> : null}
        <div className="fishing-hero-actions">
          <button type="button" className="fishing-hero-primary" onClick={() => onShowMonth(showingThisMonth ? null : currentMonth)}>
            {showingThisMonth ? "Show every month" : `Spots for ${monthName(currentMonth)}`}
          </button>
          <button type="button" className="fishing-hero-link" onClick={onFit}>
            Zoom to all spots
          </button>
        </div>
        <p className="fishing-hero-dedication">{FISHING_DEDICATION}</p>
      </div>
    </section>
  );
}

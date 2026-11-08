import "./SetupMapKey.css";
import { useId, useState, type ReactNode } from "react";

/**
 * The /pointtupper map key as a shared pattern: laid over the map, translucent,
 * collapsible, a row for each kind of mark. A row with `onToggle` is a switch
 * for the layer it explains. The rows come from the catalogues and data the map
 * draws with (themes/setupMapKeys.tsx), so a key cannot name a mark the map lacks.
 */

export interface SetupKeyEntry {
  readonly label: string;
  readonly graphic: ReactNode;
}

export interface SetupKeyRow {
  readonly label: string;
  readonly graphic?: ReactNode;
  /** The layer's state, or undefined for a row that only explains. */
  readonly on?: boolean;
  readonly onToggle?: () => void;
  /** The layer's current state in words: loading, zoom floor, a count. */
  readonly hint?: string | null;
  /** The several marks one layer draws, listed under its row. */
  readonly entries?: readonly SetupKeyEntry[];
}

export interface SetupKeyGroup {
  readonly title: string;
  readonly rows: readonly SetupKeyRow[];
}

const OPEN_KEY = "ns-marks-the-spot:setup-key-open:v1";
/** Open where the map can spare the key's width, folded on a phone, until the reader chooses. */
const KEY_OPEN_QUERY = "(min-width: 1168px)";

function initiallyOpen(): boolean {
  try {
    const saved = localStorage.getItem(OPEN_KEY);
    if (saved === "open") return true;
    if (saved === "closed") return false;
  } catch { /* Storage can be blocked; fall back to the width. */ }
  return typeof window.matchMedia !== "function" || window.matchMedia(KEY_OPEN_QUERY).matches;
}

export function SetupMapKey({ groups, note, onShowSources }: {
  groups: readonly SetupKeyGroup[];
  note?: ReactNode;
  /** Brings the layer list, where each layer keeps its source and caveats, into view. */
  onShowSources?: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const bodyId = useId();
  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? "open" : "closed"); } catch { /* The choice simply is not remembered. */ }
  };
  return (
    <aside className={`setup-key${open ? " is-open" : ""}`} aria-label="Map key">
      <h2 className="setup-key-heading">
        <button type="button" className="setup-key-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggleOpen}>
          <span>Map key</span>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2.5 7.5 6 4 9.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </h2>
      <div id={bodyId} className="setup-key-body" hidden={!open}>
        {groups.map((group) => (
          <section key={group.title} className="setup-key-group">
            <h3>{group.title}</h3>
            {group.rows.map((row) => <KeyRow key={row.label} row={row} />)}
          </section>
        ))}
        {note || onShowSources ? (
          <p className="setup-key-note">
            {note}{note && onShowSources ? " " : null}
            {onShowSources ? <button type="button" className="setup-key-link" onClick={onShowSources}>Sources and caveats</button> : null}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function KeyRow({ row }: { row: SetupKeyRow }) {
  const label = (
    <>
      {row.graphic ? <span className="setup-key-swatch">{row.graphic}</span> : null}
      <span className="setup-key-label">
        {row.label}
        {row.hint ? <small>{row.hint}</small> : null}
      </span>
    </>
  );
  const dimmed = row.onToggle !== undefined && row.on === false;
  return (
    <div>
      {row.onToggle ? (
        <button type="button" className="setup-key-row" aria-pressed={row.on} onClick={row.onToggle}>
          {label}
          <span className="setup-key-switch" aria-hidden="true" />
        </button>
      ) : <div className="setup-key-row is-static">{label}</div>}
      {row.entries?.length ? (
        <ul className={`setup-key-entries${dimmed ? " is-off" : ""}`}>
          {row.entries.map((entry) => <li key={entry.label}><span className="setup-key-swatch">{entry.graphic}</span>{entry.label}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/** A circular point marker, as the map's context dots draw it. */
export function KeyDot({ color, numbered = false }: { color: string; numbered?: boolean }) {
  return (
    <svg viewBox="0 0 30 18" width="30" height="18" aria-hidden="true" focusable="false">
      <circle cx="15" cy="9" r={numbered ? 8 : 5} fill={color} stroke="#ffffff" strokeWidth="1.5" />
      {numbered ? <text x="15" y="12.4" textAnchor="middle" fontSize="10" fontWeight="700" fill="#ffffff">1</text> : null}
    </svg>
  );
}

/** A traced line with the width and dash the map gives it. */
export function KeyLine({ color, width = 3, dash }: { color: string; width?: number; dash?: string }) {
  return (
    <svg viewBox="0 0 30 12" width="30" height="12" aria-hidden="true" focusable="false">
      <line x1="2" y1="6" x2="28" y2="6" stroke="#fffdf7" strokeWidth={width + 3} strokeLinecap="round" opacity="0.78" />
      <line x1="2" y1="6" x2="28" y2="6" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  );
}

/** A filled area, at the opacity the map draws it. */
export function KeyArea({ color, fillOpacity = 0.35 }: { color: string; fillOpacity?: number }) {
  return (
    <svg viewBox="0 0 30 12" width="30" height="12" aria-hidden="true" focusable="false">
      <rect x="6" y="1" width="18" height="10" rx="2" fill={color} fillOpacity={fillOpacity} stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

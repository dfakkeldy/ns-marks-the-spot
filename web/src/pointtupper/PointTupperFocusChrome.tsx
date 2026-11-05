import type { FocusChromeContext } from '../focus/focusDefinition';
import { POINT_TUPPER_LICENCE_URL, POINT_TUPPER_SOURCES_URL, pointTupperSiteKinds } from '../layers/pointTupperLayers';
import { POINT_TUPPER_CHECKED, POINT_TUPPER_FACT_GROUPS, POINT_TUPPER_TIMELINE, type SourcedLine } from './facts';
import { pointMarker, type Swatch } from './mapKey';
import { MarkerSwatch } from './PointTupperMapLegend';

/**
 * The key's own symbol beside the facts about something the map draws, so the
 * brief teaches the map: the terminal, the generating station, Landrie Lake
 * and the turbines. Facts about decisions and people get none.
 */
const FACT_GLYPHS: Readonly<Record<string, Swatch>> = {
  Announced: { kind: 'marker', marker: pointTupperSiteKinds.terminal.marker, color: pointTupperSiteKinds.terminal.color },
  Grid: { kind: 'marker', marker: pointTupperSiteKinds.power.marker, color: pointTupperSiteKinds.power.color },
  Water: { kind: 'marker', marker: pointTupperSiteKinds.water.marker, color: pointTupperSiteKinds.water.color },
  Wind: pointMarker('planned-wind-turbines'),
  'Wind nearby': pointMarker('canadian-wind-turbines'),
};

/**
 * A decorative dusk view across the Strait: tanks, a jetty, a stack and a
 * transmission line. It is an illustration, not a site drawing; the campus
 * footprint has not been published.
 */
function StraitIllustration() {
  return (
    <svg className="pointtupper-hero-art" viewBox="0 0 360 132" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="pointtupper-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d2233" />
          <stop offset="0.55" stopColor="#21455a" />
          <stop offset="0.9" stopColor="#d99a52" />
        </linearGradient>
        <linearGradient id="pointtupper-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b5266" />
          <stop offset="1" stopColor="#0d2233" />
        </linearGradient>
      </defs>
      <rect width="360" height="132" fill="url(#pointtupper-sky)" />
      <g fill="#f6f1e6" opacity="0.6">
        <circle cx="38" cy="14" r="0.8" />
        <circle cx="122" cy="26" r="0.6" />
        <circle cx="300" cy="12" r="0.7" />
        <circle cx="214" cy="20" r="0.5" />
      </g>
      {/* The far shore, across the Strait. */}
      <path d="M0 88 C40 80 86 78 130 82 C170 86 206 76 250 78 C292 80 330 86 360 84 V96 H0 Z" fill="#1a3a4b" />
      {/* Transmission towers and their lines. */}
      <g stroke="#9fb7c4" strokeWidth="1" fill="none" opacity="0.85">
        <path d="M18 92 L24 58 L30 92 M20 70 H28 M21 64 H27" />
        <path d="M70 90 L76 54 L82 90 M72 66 H80 M73 60 H79" />
        <path d="M24 60 Q50 70 76 56 M24 64 Q50 74 76 60" />
        <path d="M76 56 Q100 64 118 62 M76 60 Q100 68 118 66" />
      </g>
      {/* The stack, with a light at the top. */}
      <rect x="128" y="40" width="7" height="56" fill="#cfd8dd" />
      <circle className="pointtupper-hero-beacon" cx="131.5" cy="38" r="1.6" fill="#ff6b57" />
      {/* Storage tanks. */}
      <g fill="#e9eef0">
        <rect x="200" y="80" width="26" height="14" rx="2" />
        <rect x="230" y="78" width="30" height="16" rx="2" />
        <rect x="264" y="81" width="24" height="13" rx="2" />
      </g>
      <g fill="#c3cdd2">
        <ellipse cx="213" cy="80" rx="13" ry="2" />
        <ellipse cx="245" cy="78" rx="15" ry="2" />
        <ellipse cx="276" cy="81" rx="12" ry="2" />
      </g>
      {/* The near shore and the jetty reaching into the Strait. */}
      <path d="M0 96 H360 V132 H0 Z" fill="url(#pointtupper-water)" />
      <path d="M150 96 H340 V100 H150 Z" fill="#163243" />
      <path d="M296 99 L250 112 L332 112 Z" fill="#163243" opacity="0.9" />
      <rect x="248" y="111" width="86" height="3" fill="#d6dde0" />
      <g stroke="#f0b45a" strokeLinecap="round" opacity="0.55">
        <path d="M30 116 h40 M100 122 h52 M182 118 h30" strokeWidth="1.6" />
        <path d="M128 106 h10" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

function factGroupId(title: string): string {
  return `pointtupper-facts-${title.toLowerCase().replace(/[^a-z]+/gu, '-')}`;
}

/** One summary line: the fact, its source, then any qualification with its own source. */
function FactRow({ fact }: { fact: SourcedLine }) {
  const glyph = FACT_GLYPHS[fact.label];
  return (
    <div>
      <dt>
        {glyph?.kind === 'marker' ? (
          <span className="pointtupper-fact-glyph" aria-hidden="true">
            <MarkerSwatch marker={glyph.marker} color={glyph.color} size={glyph.marker.glyph === 'turbine' ? 16 : 14} />
          </span>
        ) : null}
        {fact.label}
      </dt>
      <dd>
        <p>
          {fact.text}{' '}
          <a href={fact.sourceUrl} target="_blank" rel="noreferrer">{fact.sourceLabel}</a>
        </p>
        {fact.note && (
          <p className="pointtupper-fact-note">
            {fact.note.text}{' '}
            <a href={fact.note.sourceUrl} target="_blank" rel="noreferrer">{fact.note.sourceLabel}</a>
          </p>
        )}
      </dd>
    </div>
  );
}

/** Seventy years of big projects on the Strait, oldest first, ending on the day the record was last read. */
function StraitTimeline() {
  return (
    <section className="pointtupper-timeline" aria-labelledby="pointtupper-timeline-title">
      <h3 id="pointtupper-timeline-title">Seventy years on the Strait</h3>
      <ol>
        {POINT_TUPPER_TIMELINE.map((event) => (
          <li key={`${event.when}-${event.text}`}>
            <span className="pointtupper-when">{event.when}</span>
            <p>
              {event.text}{' '}
              <a href={event.sourceUrl} target="_blank" rel="noreferrer">{event.sourceLabel}</a>
            </p>
          </li>
        ))}
        {/* The record is unfinished: the line runs on, dashed, to the day it was last read. */}
        <li className="pointtupper-timeline-now">
          <span className="pointtupper-when">Now</span>
          <p>The record so far, read <time dateTime={POINT_TUPPER_CHECKED.iso}>{POINT_TUPPER_CHECKED.text}</time>.</p>
        </li>
      </ol>
    </section>
  );
}

/** The /pointtupper summary: what was announced and what the record shows, each fact with its source. */
export function PointTupperFocusHero({ fitToFocus, closeMobileControls }: FocusChromeContext) {
  return (
    <section className="pointtupper-hero" aria-labelledby="pointtupper-hero-title">
      <StraitIllustration />
      <div className="pointtupper-hero-body">
        <p className="pointtupper-hero-eyebrow">Strait of Canso · Richmond County, Nova&nbsp;Scotia</p>
        <h2 id="pointtupper-hero-title">Point Tupper</h2>
        <p className="pointtupper-hero-lede">
          Where the announced data-centre campus would go: the terminal, the grid, the water and seventy
          years of industry on the Strait. Every line names its source.
        </p>
        <p className="pointtupper-checked">
          Sources checked <time dateTime={POINT_TUPPER_CHECKED.iso}>{POINT_TUPPER_CHECKED.text}</time>
        </p>
        {POINT_TUPPER_FACT_GROUPS.map((group) => (
          <section key={group.title} className="pointtupper-fact-group" aria-labelledby={factGroupId(group.title)}>
            <h3 id={factGroupId(group.title)}>{group.title}</h3>
            <dl className="pointtupper-facts">
              {group.facts.map((fact) => <FactRow key={fact.label} fact={fact} />)}
            </dl>
          </section>
        ))}
        <StraitTimeline />
        <p className="pointtupper-hero-note">
          The campus footprint has not been published, so the map does not draw it.
        </p>
        <a className="pointtupper-hero-link" href={POINT_TUPPER_SOURCES_URL} target="_blank" rel="noreferrer">
          Every source, and what it supports
        </a>
        <div className="pointtupper-hero-actions">
          <button
            type="button"
            className="pointtupper-hero-primary"
            onClick={() => {
              fitToFocus();
              closeMobileControls();
            }}
          >
            Zoom to Point Tupper
          </button>
        </div>
        <p className="pointtupper-hero-byline">Built by Dan Fakkeldy with Claude Code, from public sources.</p>
      </div>
      {/* The far shore's line, closing the night room before the map's tools. */}
      <svg className="pointtupper-hero-shore" viewBox="0 0 360 14" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0 0 H360 V6 C330 8 292 2 250 4 C206 6 170 14 130 10 C86 6 40 4 0 9 Z" />
      </svg>
    </section>
  );
}

export function PointTupperGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="4" width="3" height="16" fill="currentColor" />
      <rect x="11" y="12" width="9" height="8" rx="1.2" fill="currentColor" />
      <path d="M3 21 H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PointTupperBrandMark() {
  return (
    <>
      <span aria-hidden="true"><PointTupperGlyph /></span>
      <strong>Point Tupper<span className="pointtupper-brand-suffix"> site</span></strong>
      {/* The sheet rises from below, so the pill points up to it. */}
      <svg className="pointtupper-brand-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M2.5 7.5 6 4 9.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </>
  );
}

export function PointTupperFooterNote() {
  return (
    <p>
      A screening and research map, not legal proof. Each layer keeps its own source, date and caveats, and
      an empty or failed layer is not evidence of absence. The key places are the project&apos;s own wording
      under CC BY 4.0 (<a href={POINT_TUPPER_LICENCE_URL} target="_blank" rel="noreferrer">licence notes</a>,{' '}
      <a href={POINT_TUPPER_SOURCES_URL} target="_blank" rel="noreferrer">sources</a>).
    </p>
  );
}

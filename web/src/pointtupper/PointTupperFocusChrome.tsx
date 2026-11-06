import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { FocusBounds, FocusChromeContext } from '../focus/focusDefinition';
import { POINT_TUPPER_LICENCE_URL, POINT_TUPPER_SOURCES_URL, pointTupperSiteKinds } from '../layers/pointTupperLayers';
import { POINT_TUPPER_CHECKED, POINT_TUPPER_FACT_GROUPS, POINT_TUPPER_TIMELINE, type SourcedLine } from './facts';
import { pointMarker, type Swatch } from './mapKey';
import { POINT_TUPPER_PHONE_SHEET_SHARE, POINT_TUPPER_PLACE_BOUNDS } from './focus';
import { MarkerSwatch } from './PointTupperMapLegend';

interface MappedPlace {
  /** Spoken in the pill's name: "Show the terminal on the map". */
  readonly name: string;
  /** The pill's text: the map's own label for the place, so brief and map name it alike. */
  readonly label: string;
  readonly swatch: Swatch;
  readonly bounds: FocusBounds;
}

const TERMINAL: MappedPlace = {
  name: 'the terminal',
  label: 'EverWind terminal',
  swatch: { kind: 'marker', marker: pointTupperSiteKinds.terminal.marker, color: pointTupperSiteKinds.terminal.color },
  bounds: POINT_TUPPER_PLACE_BOUNDS.terminal,
};
const POWER: MappedPlace = {
  name: 'the generating station',
  label: 'Generating station',
  swatch: { kind: 'marker', marker: pointTupperSiteKinds.power.marker, color: pointTupperSiteKinds.power.color },
  bounds: POINT_TUPPER_PLACE_BOUNDS.power,
};
const WATER: MappedPlace = {
  name: 'Landrie Lake',
  label: 'Landrie Lake',
  swatch: { kind: 'marker', marker: pointTupperSiteKinds.water.marker, color: pointTupperSiteKinds.water.color },
  bounds: POINT_TUPPER_PLACE_BOUNDS.water,
};
const TURBINES: MappedPlace = {
  name: 'the Point Tupper wind farm',
  label: '12 turbines',
  swatch: pointMarker('canadian-wind-turbines'),
  bounds: POINT_TUPPER_PLACE_BOUNDS.turbines,
};

const EVERWIND_WIND: MappedPlace = {
  name: 'Upper Afton and Windy Ridge, the two of the four the map draws,',
  label: 'Upper Afton, Windy Ridge',
  swatch: pointMarker('planned-wind-turbines'),
  bounds: POINT_TUPPER_PLACE_BOUNDS.everwindWind,
};

/**
 * Facts about something the map draws carry the key's own symbol in a pill
 * that takes the map there, so the brief teaches the map and leads into it.
 * Facts about decisions, people and places off this map get none.
 */
const FACT_PLACES: Readonly<Record<string, MappedPlace>> = {
  Announced: TERMINAL,
  Grid: POWER,
  Water: WATER,
  Wind: EVERWIND_WIND,
  'Wind nearby': TURBINES,
};

/** Timeline events about a place the map draws: its symbol, which also takes the map there. */
const TIMELINE_PLACES: Readonly<Record<string, MappedPlace>> = {
  '1969': WATER,
  '2026': TERMINAL,
};

function Glyph({ swatch, size }: { swatch: Swatch; size: number }) {
  return swatch.kind === 'marker'
    ? <MarkerSwatch marker={swatch.marker} color={swatch.color} size={swatch.marker.glyph === 'turbine' ? size + 2 : size} />
    : null;
}

const PHONE_QUERY = '(max-width: 860px)';
/** The phone sheet's full-height stop (pointTupperPage.css); without it the sheet rests at 60%. */
const SHEET_FULL = 'pointtupper-sheet-full';

function isPhone(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;
}

/** Pixels of map the middle-stop sheet covers: its share of the screen plus the licence strip and gap. */
function phoneSheetInset(): number {
  return Math.round(window.innerHeight * POINT_TUPPER_PHONE_SHEET_SHARE) + 80;
}

/**
 * The phone sheet opens at 60%, with the site in the map above it, and rises
 * to full height once the reader scrolls into the brief; scrolling back to
 * the top returns it to 60%.
 */
function usePhoneSheetStops(heroRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const rail = heroRef.current?.closest<HTMLElement>('.layer-rail');
    if (!rail) return undefined;
    const onScroll = () => {
      if (!isPhone()) return;
      if (rail.scrollTop > 120) rail.classList.add(SHEET_FULL);
      else if (rail.scrollTop < 24) rail.classList.remove(SHEET_FULL);
    };
    rail.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      rail.removeEventListener('scroll', onScroll);
      rail.classList.remove(SHEET_FULL);
    };
  }, [heroRef]);
}

/** A source link: it opens in a new tab, and says so. */
function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="pointtupper-source" href={href} target="_blank" rel="noreferrer">
      {children}<span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * A decorative dusk view across the Strait: tanks, a jetty, a stack and a
 * transmission line. It is an illustration, not a site drawing; the campus
 * footprint has not been published.
 */
function StraitIllustration() {
  return (
    <svg className="pointtupper-hero-art" viewBox="0 0 360 132" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="pointtupper-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#10283a" />
          <stop offset="0.55" stopColor="#21455a" />
          <stop offset="0.9" stopColor="#d99a52" />
        </linearGradient>
        <linearGradient id="pointtupper-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b5266" />
          <stop offset="1" stopColor="#10283a" />
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
      <circle className="pointtupper-hero-beacon pointtupper-hero-beacon-halo" cx="131.5" cy="38" r="5" fill="#ff6b57" opacity="0.25" />
      <circle className="pointtupper-hero-beacon" cx="131.5" cy="38" r="2.2" fill="#ff6b57" />
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
function FactRow({ fact, onShowPlace }: { fact: SourcedLine; onShowPlace: (place: MappedPlace) => void }) {
  const place = FACT_PLACES[fact.label];
  return (
    <div>
      <dt>
        <span>{fact.label}</span>
        {place ? (
          <button type="button" className="pointtupper-place" aria-label={`Show ${place.name} on the map`} onClick={() => onShowPlace(place)}>
            <span className="pointtupper-place-glyph" aria-hidden="true"><Glyph swatch={place.swatch} size={12} /></span>
            {place.label}
          </button>
        ) : null}
      </dt>
      <dd>
        <p>
          {fact.text}{' '}
          <SourceLink href={fact.sourceUrl}>{fact.sourceLabel}</SourceLink>
        </p>
        {fact.note && (
          <p className="pointtupper-fact-note">
            {fact.note.text}{' '}
            <SourceLink href={fact.note.sourceUrl}>{fact.note.sourceLabel}</SourceLink>
          </p>
        )}
      </dd>
    </div>
  );
}

/** Seventy years of big projects on the Strait, oldest first, ending on what the record does not show yet. */
function StraitTimeline({ onShowPlace }: { onShowPlace: (place: MappedPlace) => void }) {
  return (
    <section className="pointtupper-timeline" aria-labelledby="pointtupper-timeline-title">
      <h3 id="pointtupper-timeline-title">Seventy years on the Strait</h3>
      <ol>
        {POINT_TUPPER_TIMELINE.map((event) => {
          const place = TIMELINE_PLACES[event.when];
          return (
            <li key={`${event.when}-${event.text}`}>
              <span className="pointtupper-when">
                {event.when}
                {place ? (
                  <button type="button" className="pointtupper-timeline-place" aria-label={`Show ${place.name} on the map`} onClick={() => onShowPlace(place)}>
                    <Glyph swatch={place.swatch} size={12} />
                  </button>
                ) : null}
              </span>
              <p>
                {event.text}{' '}
                <SourceLink href={event.sourceUrl}>{event.sourceLabel}</SourceLink>
              </p>
            </li>
          );
        })}
        {/* The record is unfinished: the line runs on, dashed, past "Now" and
            alongside what it does not show yet. */}
        <li className="pointtupper-timeline-now">
          <span className="pointtupper-when">Now</span>
          <p>The record so far.</p>
          <p className="pointtupper-hero-note">
            The campus footprint has not been published, so the map does not draw it.
          </p>
        </li>
      </ol>
    </section>
  );
}

/** The /pointtupper summary: what was announced and what the record shows, each fact with its source. */
export function PointTupperFocusHero({ fitToFocus, fitToBounds, closeMobileControls }: FocusChromeContext) {
  const heroRef = useRef<HTMLElement>(null);
  usePhoneSheetStops(heroRef);
  const showPlace = (place: MappedPlace) => {
    const rail = heroRef.current?.closest<HTMLElement>('.layer-rail');
    if (rail && isPhone()) {
      // On a phone the brief stays open at its middle stop, and the place is
      // framed in the map above it, so the reader keeps their place in the text.
      rail.classList.remove(SHEET_FULL);
      fitToBounds(place.bounds, { insetBottom: phoneSheetInset() });
      return;
    }
    fitToBounds(place.bounds);
    closeMobileControls();
  };
  return (
    <section ref={heroRef} className="pointtupper-hero" aria-labelledby="pointtupper-hero-title">
      <StraitIllustration />
      <div className="pointtupper-hero-body">
        <p className="pointtupper-hero-eyebrow">
          <span>Strait of Canso</span> <span>Richmond County, Nova Scotia</span>
        </p>
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
              {group.facts.map((fact) => <FactRow key={fact.label} fact={fact} onShowPlace={showPlace} />)}
            </dl>
          </section>
        ))}
        <StraitTimeline onShowPlace={showPlace} />
        <a className="pointtupper-hero-link" href={POINT_TUPPER_SOURCES_URL} target="_blank" rel="noreferrer">
          Every source, and what it supports<span className="visually-hidden"> (opens in a new tab)</span>
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
          {/* The key, which says this on a wide screen, is folded or hidden on a phone. */}
          <p className="pointtupper-hero-hint">Then tap a place for its source and date.</p>
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
      {/* Says what the pill opens, without an arrow that would have to pick a direction. */}
      <span className="pointtupper-brand-hint" aria-hidden="true">Brief</span>
    </>
  );
}

export function PointTupperFooterNote() {
  return (
    <p>
      A screening and research map, not legal proof. Each layer keeps its own source, date and caveats, and
      an empty or failed layer is not evidence of absence. The key places are the project&apos;s own wording
      under CC BY 4.0 (<SourceLink href={POINT_TUPPER_LICENCE_URL}>licence notes</SourceLink>,{' '}
      <SourceLink href={POINT_TUPPER_SOURCES_URL}>sources</SourceLink>).
    </p>
  );
}

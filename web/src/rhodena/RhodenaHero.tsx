import { RHODENA_SOURCE } from './catalog';

/**
 * A decorative dusk view west over St. George's Bay: six turbines on a ridge.
 * It is an illustration, not a visual simulation — the map and the viewshed
 * are where positions and visibility live.
 */
const TURBINES = [
  { x: 166, y: 102, s: 0.74, spin: 7.4, phase: -1.1 },
  { x: 199, y: 96, s: 0.8, spin: 8.2, phase: -3.6 },
  { x: 233, y: 93, s: 0.86, spin: 7.8, phase: -0.4 },
  { x: 268, y: 93, s: 0.9, spin: 8.6, phase: -5.2 },
  { x: 303, y: 98, s: 0.8, spin: 7.1, phase: -2.3 },
  { x: 336, y: 105, s: 0.74, spin: 8.9, phase: -4.4 },
];
const BLADE = 'M-0.5,-1.2 C2.2,-5.5 1.5,-15 0.35,-25 L-0.15,-25 C-0.95,-15 -1.3,-6 -0.5,-1.2 Z';

function RidgeIllustration() {
  return (
    <svg className="rhodena-hero-art" viewBox="0 0 360 156" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="rhodena-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b2630" />
          <stop offset="0.42" stopColor="#1d4852" />
          <stop offset="0.74" stopColor="#b9805f" />
          <stop offset="0.9" stopColor="#efbb87" />
        </linearGradient>
        <radialGradient id="rhodena-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe3bd" />
          <stop offset="0.35" stopColor="#f6c48f" stopOpacity="0.85" />
          <stop offset="1" stopColor="#efbb87" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rhodena-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3f6f78" />
          <stop offset="1" stopColor="#153a43" />
        </linearGradient>
      </defs>
      <rect width="360" height="156" fill="url(#rhodena-sky)" />
      <g fill="#fbf6ea">
        <circle cx="222" cy="16" r="0.9" opacity="0.7" />
        <circle cx="301" cy="28" r="0.7" opacity="0.55" />
        <circle cx="147" cy="22" r="0.6" opacity="0.5" />
        <circle cx="338" cy="11" r="0.8" opacity="0.6" />
        <circle cx="262" cy="40" r="0.5" opacity="0.4" />
        <circle cx="96" cy="12" r="0.6" opacity="0.45" />
      </g>
      <circle cx="62" cy="112" r="46" fill="url(#rhodena-sun)" opacity="0.55" />
      <circle cx="62" cy="113" r="11" fill="#ffe3bd" opacity="0.95" />
      <path d="M0,112 H360 V156 H0 Z" fill="url(#rhodena-sea)" />
      <path d="M78,113 C104,106 146,88 206,78 C246,72 292,74 330,82 C344,85 354,88 360,90 L360,156 L78,156 Z" fill="#3a646c" />
      {TURBINES.map((turbine, index) => {
        const hubY = turbine.y - 36 * turbine.s;
        return (
          <g key={index} className="rhodena-hero-turbine">
            <path
              d={`M${turbine.x - 1.35 * turbine.s},${turbine.y + 4} L${turbine.x - 0.6 * turbine.s},${hubY} L${turbine.x + 0.6 * turbine.s},${hubY} L${turbine.x + 1.35 * turbine.s},${turbine.y + 4} Z`}
              fill="#e8efee"
            />
            <rect x={turbine.x - 1.2 * turbine.s} y={hubY - 1.5 * turbine.s} width={4.2 * turbine.s} height={2.6 * turbine.s} rx={0.9 * turbine.s} fill="#e8efee" />
            <circle className="rhodena-hero-beacon" cx={turbine.x + 1.6 * turbine.s} cy={hubY - 1.9 * turbine.s} r={0.95 * turbine.s} fill="#ff6b57" />
            <g transform={`translate(${turbine.x} ${hubY}) scale(${turbine.s})`}>
              <g className="rhodena-hero-rotor" style={{ animationDuration: `${turbine.spin}s`, animationDelay: `${turbine.phase}s` }}>
                <circle r="25.5" fill="none" />
                <path d={BLADE} fill="#f4f7f6" />
                <path d={BLADE} fill="#f4f7f6" transform="rotate(120)" />
                <path d={BLADE} fill="#f4f7f6" transform="rotate(240)" />
                <circle r="1.5" fill="#fbf6ea" />
              </g>
            </g>
          </g>
        );
      })}
      <path d="M66,156 C82,134 98,118 124,110 C144,105 160,102 180,100 C206,95 232,91 260,92 C288,93 312,98 334,105 C346,109 354,112 360,114 L360,156 Z" fill="#1b434c" />
      <g stroke="#ffd9ad" strokeLinecap="round" opacity="0.75">
        <path d="M48,116 H76" strokeWidth="1.4" />
        <path d="M40,121 H84" strokeWidth="1" opacity="0.7" />
        <path d="M53,126 H70" strokeWidth="0.9" opacity="0.6" />
      </g>
      <path d="M0,156 L0,138 C44,130 92,126 136,124 C188,122 238,124 286,130 C318,134 342,138 360,141 L360,156 Z" fill="#10313a" />
      <g fill="none" stroke="#efbb87" strokeWidth="0.6" opacity="0.22">
        <path d="M0,146 C60,138 130,134 190,134 C250,134 310,140 360,148" />
        <path d="M0,152 C70,146 140,142 200,142 C262,142 318,147 360,153" />
      </g>
    </svg>
  );
}

/** A small turbine mark for the page's map chrome. */
export function TurbineGlyph() {
  const blade = 'M11.35,10 C11.2,6.5 11.6,3.6 12,1.6 C12.55,3.6 12.85,6.5 12.65,10 Z';
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M11.15,22.5 L11.55,10.6 H12.45 L12.85,22.5 Z" fill="currentColor" />
      <path d={blade} fill="currentColor" />
      <path d={blade} fill="currentColor" transform="rotate(120 12 10)" />
      <path d={blade} fill="currentColor" transform="rotate(240 12 10)" />
      <circle cx="12" cy="10" r="1.45" fill="currentColor" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21s-6.5-6.2-6.5-11.2A6.5 6.5 0 0 1 18.5 9.8C18.5 14.8 12 21 12 21Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="9.8" r="2.3" fill="currentColor" />
    </svg>
  );
}

export function RhodenaHero({ visibilityOn, onToggleVisibility, onCheckViewpoint, onFit }: {
  visibilityOn: boolean;
  onToggleVisibility: () => void;
  onCheckViewpoint: () => void;
  onFit: () => void;
}) {
  return (
    <section className="rhodena-hero" aria-labelledby="rhodena-hero-title">
      <RidgeIllustration />
      <div className="rhodena-hero-body">
        <p className="rhodena-hero-eyebrow">Proposed wind project · Inverness County</p>
        <h2 id="rhodena-hero-title">Rhodena Wind</h2>
        <p className="rhodena-hero-lede">
          Where the six turbines of the 2024 assessed layout would stand in the
          hills above Creignish — and where they might be seen from.
        </p>
        <dl className="rhodena-hero-facts">
          <div><dt>Proposed turbines</dt><dd>6</dd></div>
          <div><dt>Maximum capacity</dt><dd>42<small>MW</small></dd></div>
          <div><dt>Maximum tip height</dt><dd>200<small>m</small></dd></div>
        </dl>
        <p className="rhodena-hero-status">
          <span aria-hidden="true" />
          <span>
            <a href={`${RHODENA_SOURCE}EA_Approval_RhodenaWind.pdf`} target="_blank" rel="noreferrer">Conditional EA approval</a>
            {' '}January 6, 2025. Developer targets 2030, subject to change.
          </span>
        </p>
        <div className="rhodena-hero-actions">
          <button type="button" className="rhodena-hero-primary" onClick={onToggleVisibility}>
            <EyeIcon />
            {visibilityOn ? 'Hide turbine visibility' : 'Show turbine visibility'}
          </button>
          <button type="button" className="rhodena-hero-secondary" onClick={onCheckViewpoint}>
            <PinIcon />
            Check the view from a spot
          </button>
          <button type="button" className="rhodena-hero-link" onClick={onFit}>
            Zoom to the project area
          </button>
        </div>
      </div>
    </section>
  );
}

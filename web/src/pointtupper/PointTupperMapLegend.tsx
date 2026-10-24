import { useId, useState } from 'react';
import { contextMarkerSvg } from '../components/contextMarkers';
import type { FocusChromeContext } from '../focus/focusDefinition';
import type { ContextMarker } from '../layers/contextLayerTypes';
import { PROPERTY_BOUNDARY_MIN_ZOOM } from '../layers/layerCatalog';
import { pointTupperSiteKinds, type PointTupperSiteKind } from '../layers/pointTupperLayers';
import { pointTupperLegendGroups, type LegendRow, type Swatch } from './mapKey';

/**
 * The /pointtupper map key: laid over the map, translucent, collapsible, and
 * every row a switch for the layer it explains (rows in mapKey.ts).
 */

const SITE_KINDS = Object.keys(pointTupperSiteKinds) as PointTupperSiteKind[];
const SHORT_KIND_LABELS: Readonly<Record<PointTupperSiteKind, string>> = {
  terminal: 'Terminal',
  power: 'Power',
  water: 'Water supply',
  community: "Mi'kmaw community",
};

const OPEN_KEY = 'ns-marks-the-spot:pointtupper-key-open:v1';

/** Open on a desktop, folded on a phone, until the reader chooses. */
function initiallyOpen(): boolean {
  try {
    const saved = localStorage.getItem(OPEN_KEY);
    if (saved === 'open') return true;
    if (saved === 'closed') return false;
  } catch { /* Storage can be blocked; fall back to the width. */ }
  return typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 860px)').matches;
}

/** Markup built from catalogue constants only (contextMarkers.ts), never from source data. */
function MarkerSwatch({ marker, color, size }: { marker: ContextMarker; color: string; size: number }) {
  return <span className="pointtupper-key-marker" dangerouslySetInnerHTML={{ __html: contextMarkerSvg({ ...marker, size }, color) }} />;
}

function SwatchGraphic({ swatch }: { swatch: Swatch }) {
  switch (swatch.kind) {
    case 'marker':
      return <MarkerSwatch marker={swatch.marker} color={swatch.color} size={swatch.marker.glyph === 'turbine' ? 24 : 18} />;
    case 'line':
      return (
        <svg viewBox="0 0 30 12" width="30" height="12" aria-hidden="true" focusable="false">
          {swatch.casing ? <line x1="3" y1="6" x2="27" y2="6" stroke={swatch.casing} strokeWidth={swatch.width + 2.5} strokeLinecap="round" /> : null}
          <line x1="3" y1="6" x2="27" y2="6" stroke={swatch.color} strokeWidth={swatch.width} strokeLinecap="round" strokeDasharray={swatch.dash?.join(' ')} />
        </svg>
      );
    case 'area':
      return (
        <svg viewBox="0 0 30 12" width="30" height="12" aria-hidden="true" focusable="false">
          <rect x="6" y="1" width="18" height="10" rx="2" fill={swatch.color} fillOpacity={swatch.fillOpacity} stroke={swatch.color} strokeWidth="1.4" />
        </svg>
      );
    case 'tanks':
      return (
        <svg viewBox="0 0 30 12" width="30" height="12" aria-hidden="true" focusable="false">
          {[8, 15, 22].map((cx) => <circle key={cx} cx={cx} cy="6" r="3.2" fill={swatch.color} fillOpacity={swatch.fillOpacity} stroke={swatch.color} strokeWidth="1" />)}
        </svg>
      );
    case 'parcel':
      // The map draws parcels teal by day and yellow at night or over imagery; CSS follows the appearance.
      return (
        <svg className="pointtupper-key-parcel" viewBox="0 0 30 12" width="30" height="12" aria-hidden="true" focusable="false">
          <path d="M3 10 V2 H14 V10 M14 6 H27" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        </svg>
      );
  }
}

function rowHint(row: LegendRow, on: boolean, context: FocusChromeContext): string | null {
  if (row.layer.kind === 'parcels') {
    if (!context.licenceAccepted) return 'Needs the Province licence';
    return `From zoom ${PROPERTY_BOUNDARY_MIN_ZOOM}`;
  }
  if (!on) return null;
  const status = context.layerStatuses[row.layer.id];
  if (!status) return null;
  switch (status.status) {
    case 'zoom': return `Zoom in to see (zoom ${status.minZoom}+)`;
    case 'loading': return 'Loading…';
    case 'error':
    case 'source-error': return 'Did not load; pan to retry';
    case 'outside-coverage': return 'Outside this view';
    case 'returned-empty': return row.countNoun ? `No ${row.countNoun} in view` : null;
    case 'ready': return row.countNoun && status.count !== undefined ? `${status.count} ${status.count === 1 ? row.countNoun.replace(/s$/u, '') : row.countNoun} in view` : null;
    default: return null;
  }
}

export function PointTupperMapLegend(context: FocusChromeContext) {
  const [open, setOpen] = useState(initiallyOpen);
  const bodyId = useId();
  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? 'open' : 'closed'); } catch { /* The choice simply is not remembered. */ }
  };
  const isOn = (row: LegendRow) => row.layer.kind === 'parcels'
    ? context.licenceAccepted && context.provinceLayers.nsprd
    : context.contextLayers[row.layer.id];
  const toggleRow = (row: LegendRow) => {
    if (row.layer.kind === 'parcels') {
      if (!context.licenceAccepted) context.reviewProvinceLicence();
      else context.setProvinceLayerVisibility('nsprd', !context.provinceLayers.nsprd);
      return;
    }
    context.setContextLayerVisibility(row.layer.id, !context.contextLayers[row.layer.id]);
  };
  const sitesOn = context.contextLayers['point-tupper-sites'];

  return (
    <aside className={`pointtupper-key${open ? ' is-open' : ''}`} aria-label="Map key">
      <button type="button" className="pointtupper-key-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggleOpen}>
        <span>Map key</span>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2.5 7.5 6 4 9.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div id={bodyId} className="pointtupper-key-body" hidden={!open}>
        {pointTupperLegendGroups.map((group) => (
          <section key={group.title} className="pointtupper-key-group">
            <h3>{group.title}</h3>
            {group.rows.map((row) => {
              const on = isOn(row);
              const hint = rowHint(row, on, context);
              return (
                <div key={row.label}>
                  <button type="button" className="pointtupper-key-row" aria-pressed={on} onClick={() => toggleRow(row)}>
                    <span className="pointtupper-key-swatch"><SwatchGraphic swatch={row.swatch} /></span>
                    <span className="pointtupper-key-label">
                      {row.label}
                      {hint ? <small>{hint}</small> : null}
                    </span>
                    <span className="pointtupper-key-switch" aria-hidden="true" />
                  </button>
                  {row.layer.kind === 'context' && row.layer.id === 'point-tupper-sites' ? (
                    <ul className={`pointtupper-key-kinds${sitesOn ? '' : ' is-off'}`} aria-label="Kinds of key place">
                      {SITE_KINDS.map((kind) => (
                        <li key={kind}>
                          <MarkerSwatch marker={pointTupperSiteKinds[kind].marker} color={pointTupperSiteKinds[kind].color} size={16} />
                          {SHORT_KIND_LABELS[kind]}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </section>
        ))}
        <p className="pointtupper-key-note">Tap a row to show or hide it. Each layer&apos;s source and caveats are in the layer list.</p>
      </div>
    </aside>
  );
}

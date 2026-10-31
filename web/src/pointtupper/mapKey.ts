import { contextLayerCatalog, type ContextLayerId } from '../layers/contextLayerCatalog';
import type { ContextMarker } from '../layers/contextLayerTypes';
import { pointTupperSiteKinds } from '../layers/pointTupperLayers';

/**
 * The rows of the /pointtupper map key (PointTupperMapLegend.tsx). Colours,
 * widths and dashes are read from the catalogue entries the map draws with,
 * so the key cannot drift from the map.
 */

export type Swatch =
  | { readonly kind: 'marker'; readonly marker: ContextMarker; readonly color: string }
  | { readonly kind: 'line'; readonly color: string; readonly width: number; readonly dash?: readonly number[]; readonly casing?: string }
  | { readonly kind: 'area'; readonly color: string; readonly fillOpacity: number }
  | { readonly kind: 'tanks'; readonly color: string; readonly fillOpacity: number }
  | { readonly kind: 'parcel' };

export interface LegendRow {
  readonly label: string;
  readonly swatch: Swatch;
  readonly layer: { readonly kind: 'context'; readonly id: ContextLayerId } | { readonly kind: 'parcels' };
  /** What to count when the layer reports how many features are in view. */
  readonly countNoun?: string;
}

export interface LegendGroup {
  readonly title: string;
  readonly rows: readonly LegendRow[];
}

const catalogueEntry = (id: ContextLayerId) => {
  const layer = contextLayerCatalog.find((entry) => entry.id === id);
  if (!layer) throw new Error(`Point Tupper key names a layer the catalogue lacks: ${id}`);
  return layer;
};

const openLine = (id: ContextLayerId): Swatch => {
  const style = catalogueEntry(id).openData;
  return { kind: 'line', color: style?.color ?? '#555555', width: style?.lineWidth ?? 1.2, dash: style?.dash, casing: style?.casing };
};

const openArea = (id: ContextLayerId, kind: 'area' | 'tanks' = 'area'): Swatch => {
  const style = catalogueEntry(id).openData;
  return { kind, color: style?.color ?? '#555555', fillOpacity: style?.fillOpacity ?? 0.25 };
};

const pointMarker = (id: ContextLayerId): Swatch => {
  const style = catalogueEntry(id).featureRenderer?.defaultStyle;
  if (!style?.marker) throw new Error(`Point Tupper key expects a marker on ${id}`);
  return { kind: 'marker', marker: style.marker, color: style.fillColor ?? style.color };
};

export const pointTupperLegendGroups: readonly LegendGroup[] = [
  {
    title: 'The site',
    rows: [{ label: 'Key places', swatch: { kind: 'marker', marker: pointTupperSiteKinds.terminal.marker, color: pointTupperSiteKinds.terminal.color }, layer: { kind: 'context', id: 'point-tupper-sites' }, countNoun: 'places' }],
  },
  {
    title: 'Wind',
    rows: [
      { label: 'Wind turbines, installed', swatch: pointMarker('canadian-wind-turbines'), layer: { kind: 'context', id: 'canadian-wind-turbines' }, countNoun: 'turbines' },
      { label: 'Wind turbines, planned', swatch: pointMarker('planned-wind-turbines'), layer: { kind: 'context', id: 'planned-wind-turbines' }, countNoun: 'turbines' },
    ],
  },
  {
    title: 'Grid and fuel',
    rows: [
      { label: 'Transmission lines', swatch: openLine('transmission-lines'), layer: { kind: 'context', id: 'transmission-lines' } },
      { label: 'Substations', swatch: openArea('substations'), layer: { kind: 'context', id: 'substations' } },
      { label: 'Pipelines', swatch: openLine('pipelines'), layer: { kind: 'context', id: 'pipelines' } },
      { label: 'Tanks', swatch: openArea('tanks', 'tanks'), layer: { kind: 'context', id: 'tanks' } },
    ],
  },
  {
    title: 'Shore and land',
    rows: [
      { label: 'Wharves', swatch: openArea('wharves-coastal-structures'), layer: { kind: 'context', id: 'wharves-coastal-structures' } },
      { label: 'Property lines', swatch: { kind: 'parcel' }, layer: { kind: 'parcels' } },
    ],
  },
];

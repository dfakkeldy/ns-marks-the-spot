import { TaxSaleDateDot } from "../components/TaxSaleDateLegend";
import { KeyArea, KeyDot, KeyLine, type SetupKeyEntry, type SetupKeyGroup, type SetupKeyRow } from "../components/SetupMapKey";
import type { TaxSaleEvent } from "../data/taxSaleCatalog";
import type { FocusChromeContext } from "../focus/focusDefinition";
import { contextLayerCatalog, type ContextLayerId } from "../layers/contextLayerCatalog";
import { fishingWaterTypes, type FishingWaterType } from "../layers/fishingLayers";
import { PROPERTY_BOUNDARY_MIN_ZOOM } from "../layers/layerCatalog";
import { SwatchGraphic } from "../pointtupper/PointTupperMapLegend";
import { pointTupperLegendGroups } from "../pointtupper/mapKey";
import { rhodenaFeatureColors, RHODENA_LINE_DASH } from "../rhodena/catalog";
import {
  TAX_SALE_DATE_BAND_LABEL,
  TAX_SALE_DATE_BAND_ORDER,
  taxSaleDateBand,
  type TaxSaleDateBand,
} from "../services/taxSaleDateBands";

/**
 * Which marks each setup's map key names. Every row reads its colour and label
 * from the catalogue entry, or the date band, that the map draws with, and a
 * row appears only for a layer the setup can really show.
 */

const catalogue = (id: ContextLayerId) => {
  const layer = contextLayerCatalog.find((entry) => entry.id === id);
  if (!layer) throw new Error(`Map key names a layer the catalogue lacks: ${id}`);
  return layer;
};

/** A legend line without the words a swatch already shows ("· dashed orange"). */
const shortLabel = (label: string) => label.split(" · ")[0];

function statusHint(id: ContextLayerId, on: boolean, context: FocusChromeContext): string | null {
  if (!on) return null;
  const status = context.layerStatuses[id];
  switch (status?.status) {
    case "zoom": return `Zoom in to see (zoom ${status.minZoom}+)`;
    case "loading": return "Loading…";
    case "error":
    case "source-error": return "Did not load; pan to retry";
    case "outside-coverage": return "Outside this view";
    case "returned-empty": return "None returned in this view";
    case "licence-blocked": return "Needs the Province licence";
    default: return null;
  }
}

/** A row that explains one context layer and is its switch. */
function layerRow(
  context: FocusChromeContext,
  id: ContextLayerId,
  label: string,
  graphic?: SetupKeyRow["graphic"],
  entries?: readonly SetupKeyEntry[],
): SetupKeyRow {
  const on = context.contextLayers[id];
  return {
    label,
    graphic,
    entries,
    on,
    hint: statusHint(id, on, context),
    onToggle: () => context.setContextLayerVisibility(id, !on),
  };
}

const pointColor = (id: ContextLayerId): string => {
  const layer = catalogue(id);
  return layer.legend[0]?.color ?? layer.featureRenderer?.defaultStyle.fillColor ?? layer.featureRenderer?.defaultStyle.color ?? "#555555";
};

export function fishingKeyGroups(context: FocusChromeContext): SetupKeyGroup[] {
  const waterTypes = Object.keys(fishingWaterTypes) as FishingWaterType[];
  const stocked = catalogue("stocked-waters");
  const areas = catalogue("protected-conservation-areas");
  return [
    {
      title: "Hand-picked",
      rows: [layerRow(context, "fishing-spots", "Numbered spots", undefined, waterTypes.map((type) => ({
        label: fishingWaterTypes[type].label,
        graphic: <KeyDot color={fishingWaterTypes[type].color} numbered />,
      })))],
    },
    {
      title: "Published records",
      rows: [
        layerRow(context, "stocked-waters", "Stocked waters", undefined, stocked.legend.map(({ label, color }) => ({
          label: label.replace(/^Stocked /u, "").replace(/^./u, (first) => first.toUpperCase()),
          graphic: <KeyDot color={color ?? "#555555"} />,
        }))),
        layerRow(context, "dfo-small-craft-harbours-core", "Core fishing harbours", <KeyDot color={pointColor("dfo-small-craft-harbours-core")} />),
        layerRow(context, "dfo-small-craft-harbours-non-core", "Non-core fishing harbours", <KeyDot color={pointColor("dfo-small-craft-harbours-non-core")} />),
        layerRow(context, "wsc-hydrometric-stations", "Hydrometric stations", <KeyDot color={pointColor("wsc-hydrometric-stations")} />),
        layerRow(context, "campgrounds", "Campgrounds", <KeyDot color={pointColor("campgrounds")} />),
      ],
    },
    {
      title: "Areas",
      // The publisher's colours, at the quarter strength this setup draws them.
      rows: [layerRow(context, "protected-conservation-areas", "Protected areas", undefined, areas.legend.map(({ label, color }) => ({
        label,
        graphic: <KeyArea color={color ?? "#555555"} fillOpacity={0.25} />,
      })))],
    },
  ];
}

export function rhodenaKeyGroups(context: FocusChromeContext): SetupKeyGroup[] {
  const lineEntries = catalogue("rhodena-infrastructure").legend
    .filter(({ label }) => label.includes("dashed"))
    .map(({ label, color }) => ({ label: shortLabel(label), graphic: <KeyLine color={color ?? "#555555"} dash={RHODENA_LINE_DASH} /> }));
  const visibility = catalogue("rhodena-visibility").legend.filter(({ color }) => color !== undefined);
  return [
    {
      title: "The proposal, 2024 EA",
      rows: [
        layerRow(context, "rhodena-turbines", "Published turbine positions", <KeyDot color={rhodenaFeatureColors.turbine} />),
        layerRow(context, "rhodena-infrastructure", "Proposed infrastructure", undefined, [
          ...lineEntries,
          { label: "Substation, drawing", graphic: <KeyDot color={rhodenaFeatureColors.substation} /> },
          { label: "Substation, noise model", graphic: <KeyDot color={rhodenaFeatureColors["model-substation"]} /> },
        ]),
        layerRow(context, "rhodena-study", "Study area outline", <KeyLine color={rhodenaFeatureColors.study} width={2} dash={RHODENA_LINE_DASH} />),
      ],
    },
    {
      title: "Screening",
      rows: [
        layerRow(context, "rhodena-visibility", "Turbine visibility", undefined, visibility.map(({ label, color }) => ({
          label: shortLabel(label),
          graphic: <KeyArea color={color ?? "#555555"} fillOpacity={0.45} />,
        }))),
      ],
    },
  ];
}

export function pointTupperKeyGroups(context: FocusChromeContext): SetupKeyGroup[] {
  return pointTupperLegendGroups.map((group) => ({
    title: group.title,
    rows: group.rows.map((row): SetupKeyRow => {
      const graphic = <SwatchGraphic swatch={row.swatch} />;
      if (row.layer.kind === "context") return layerRow(context, row.layer.id, row.label, graphic);
      // Property lines need the Province licence first: the row opens it.
      return context.licenceAccepted
        ? {
            label: row.label,
            graphic,
            on: context.provinceLayers.nsprd,
            hint: `From zoom ${PROPERTY_BOUNDARY_MIN_ZOOM}`,
            onToggle: () => context.setProvinceLayerVisibility("nsprd", !context.provinceLayers.nsprd),
          }
        : { label: row.label, graphic, on: false, hint: "Needs the Province licence", onToggle: context.reviewProvinceLicence };
    }),
  }));
}

/** One row per date band that has a sale: a band with none has no dot to explain. */
export function taxSaleKeyGroups(events: readonly TaxSaleEvent[], now: number): SetupKeyGroup[] {
  const counts = new Map<TaxSaleDateBand, number>();
  for (const event of events) {
    const band = taxSaleDateBand(event, now);
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  return [{
    title: "Dot colour · sale date",
    rows: TAX_SALE_DATE_BAND_ORDER.filter((band) => (counts.get(band) ?? 0) > 0).map((band) => {
      const count = counts.get(band) ?? 0;
      return {
        label: TAX_SALE_DATE_BAND_LABEL[band],
        graphic: <TaxSaleDateDot band={band} />,
        hint: count === 1 ? "1 sale" : `${count} sales`,
      };
    }),
  }];
}

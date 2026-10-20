import type { ComponentType } from "react";
import { contextLayerCatalog, type ContextLayerId } from "../layers/contextLayerCatalog";
import type { LayerCategoryId } from "../layers/layerCategories";
import type { MapPosition, ShareLayerId } from "../services/mapShareState";
import type { BuiltInMapThemeId } from "../themes/mapThemes";

/** South-west and north-east corners, in the order Leaflet's fitBounds takes. */
export type FocusBounds = [[number, number], [number, number]];

/**
 * Research-map features a focus page can leave out. Appearance, export and
 * reviewed Fletcher features are not listed: every focus page moves the first
 * two into its footer and leaves the third out.
 */
export type FocusHiddenFeature = "tax-sale" | "my-maps" | "setup-picker";

/** Page state a focus page may carry in its links (see `shareParams`). */
export type FocusShareParam = "month" | "spot";

/**
 * A focus page's own filter and selection, held by App so the panel and the
 * map layer read the same values. Pages that do not use them ignore them.
 */
export interface FocusPageState {
  /** Month filter, 1-12; written to links as `month=` when the page shares it. */
  readonly month: number | null;
  /** Species filter key; page-only, never written to links. */
  readonly species: string | null;
  /** Selected item (a spot id); written to links as `spot=` when the page shares it. */
  readonly spotId: string | null;
  /** Rises each time the selected item's panel entry should be brought into view. */
  readonly panelReveal: number;
  /** Rises each time the map should be brought to the selected item. */
  readonly mapReveal: number;
}

export const EMPTY_FOCUS_PAGE_STATE: FocusPageState = { month: null, species: null, spotId: null, panelReveal: 0, mapReveal: 0 };

/**
 * What App hands a focus page's own chrome. A page's components act on the
 * map through these, never through App state directly.
 */
export interface FocusChromeContext {
  readonly contextLayers: Readonly<Record<ContextLayerId, boolean>>;
  readonly setContextLayerVisibility: (id: ContextLayerId, visible: boolean) => void;
  readonly pageState: FocusPageState;
  readonly setPageState: (update: Partial<FocusPageState>) => void;
  /** Open the phone sheet on the page's panel; a no-op on wider screens, where the panel always shows. */
  readonly openMobileControls: () => void;
  /** Close the phone sheet so the map shows; a no-op on wider screens. */
  readonly closeMobileControls: () => void;
  /** Fit the map to the page's `fitBounds`. */
  readonly fitToFocus: () => void;
  /** Ask `rhodena-visibility` to start a viewpoint pick once its terrain is ready. */
  readonly startViewpointPick: () => void;
}

/** Each time `revision` rises, the map fits `bounds`. */
export interface FocusFitRequest {
  readonly revision: number;
  readonly bounds: FocusBounds | null;
}

/**
 * A single-purpose page (/rhodena, /fishing) that mounts the research map with a fixed
 * setup, a shorter panel and its own chrome. App reads everything
 * page-specific from here instead of branching on the page's name.
 */
export interface FocusDefinition {
  /** Matches the registry key; also the `${id}-focus` shell class prefix. */
  readonly id: string;
  /** The setup a fresh visit opens with; its layers must all be offered. */
  readonly themeId: BuiltInMapThemeId;
  /** The page's visually hidden h1. */
  readonly pageTitle: string;
  /** Panel categories, in the order the page lists them. */
  readonly categoryIds: readonly LayerCategoryId[];
  /** Every layer the panel offers and a shared link may turn on. */
  readonly allowLayerIds: ReadonlySet<ShareLayerId>;
  /** Never offered, even when `allowLayerIds` names the layer. */
  readonly denyLayerIds: ReadonlySet<ShareLayerId>;
  /** The camera when the link carries no `position`. */
  readonly initialPosition: MapPosition;
  /** Where "zoom to the area" and choosing the page's setup take the map. */
  readonly fitBounds: FocusBounds;
  readonly hiddenFeatures: ReadonlySet<FocusHiddenFeature>;
  /** A two-way Map/Aerial switch under the 3D control. */
  readonly backgroundSwitch: boolean;
  /**
   * Fit `fitBounds` when the link carries no `position`, instead of opening
   * on `initialPosition` alone: for a page whose area is wider than a phone
   * shows at the initial zoom.
   */
  readonly fitOnOpen?: boolean;
  /** Page state the page's links carry; the rest stays out of the URL. */
  readonly shareParams?: ReadonlySet<FocusShareParam>;
  readonly chrome: {
    /** Replaces the rail's "Explore Nova Scotia" heading. */
    readonly Hero: ComponentType<FocusChromeContext>;
    /** Optional page content between the setup controls and the layer list. */
    readonly Panel?: ComponentType<FocusChromeContext>;
    /** The phone's map-chrome button that opens the page's summary sheet. */
    readonly brand: { readonly label: string; readonly Mark: ComponentType };
    /** Closes the footer, after the full-map link. */
    readonly FooterNote: ComponentType;
  };
}

type FocusLayerSets = Pick<FocusDefinition, "allowLayerIds" | "denyLayerIds">;

/** Whether the page offers a layer. With no focus, every layer is offered. */
export function focusOffersLayer(focus: FocusLayerSets | undefined, id: string): boolean {
  if (!focus) return true;
  const layerId = id as ShareLayerId;
  return focus.allowLayerIds.has(layerId) && !focus.denyLayerIds.has(layerId);
}

/** The ids the page offers, in their original order (shared links use this). */
export function filterFocusLayerIds<T extends string>(
  focus: FocusLayerSets | undefined,
  ids: readonly T[],
): T[] {
  return ids.filter((id) => focusOffersLayer(focus, id));
}

export function focusHides(
  focus: Pick<FocusDefinition, "hiddenFeatures"> | undefined,
  feature: FocusHiddenFeature,
): boolean {
  return focus?.hiddenFeatures.has(feature) ?? false;
}

/**
 * Every context layer filed under one of the categories, including ones
 * added after the page was written. Pair with `denyLayerIds` to keep a
 * specific layer of an allowed category off the page.
 */
export function contextLayerIdsInCategories(
  categoryIds: readonly LayerCategoryId[],
): ShareLayerId[] {
  return contextLayerCatalog
    .filter(({ category }) => categoryIds.some((id) => id === category))
    .map(({ id }) => id);
}

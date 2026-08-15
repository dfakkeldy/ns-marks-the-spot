import type { LayerCategoryId } from "../layers/layerCategories";
import type { MapMode, ShareLayerId } from "../services/mapShareState";
import type { MapThemeDefinition } from "./mapThemes";

export interface ThemeComparableState {
  layerIds: readonly ShareLayerId[];
  opacityOverrides: Readonly<Partial<Record<ShareLayerId, number>>>;
  taxSaleEnabled: boolean;
  mapMode: MapMode;
}

export interface ThemeCapabilities {
  licenceAccepted: boolean;
  availableLayerIds: ReadonlySet<ShareLayerId>;
  restrictedLayerIds: ReadonlySet<ShareLayerId>;
}

export interface ResolvedTheme {
  target: ThemeComparableState & {
    preferredCategoryIds: readonly LayerCategoryId[];
  };
  blockedLayerIds: ShareLayerId[];
  unavailableLayerIds: ShareLayerId[];
  status: "exact" | "partial";
}

export function resolveTheme(
  theme: MapThemeDefinition,
  capabilities: ThemeCapabilities,
): ResolvedTheme {
  const unavailableLayerIds = theme.layerIds.filter(
    (id) => !capabilities.availableLayerIds.has(id),
  );
  const blockedLayerIds = theme.layerIds.filter(
    (id) => capabilities.availableLayerIds.has(id)
      && capabilities.restrictedLayerIds.has(id)
      && !capabilities.licenceAccepted,
  );
  const excluded = new Set([...unavailableLayerIds, ...blockedLayerIds]);
  const layerIds = theme.layerIds.filter((id) => !excluded.has(id));

  return {
    target: {
      layerIds,
      opacityOverrides: Object.fromEntries(
        Object.entries(theme.opacityOverrides).filter(([id]) =>
          layerIds.includes(id as ShareLayerId),
        ),
      ),
      preferredCategoryIds: theme.preferredCategoryIds,
      taxSaleEnabled: theme.taxSaleEnabled,
      mapMode: theme.mapMode,
    },
    blockedLayerIds,
    unavailableLayerIds,
    status: excluded.size === 0 ? "exact" : "partial",
  };
}

function normalizedLayerIds(layerIds: readonly ShareLayerId[]): string {
  return [...layerIds].sort().join(",");
}

function normalizedOpacityOverrides(
  opacityOverrides: ThemeComparableState["opacityOverrides"],
): string {
  return Object.entries(opacityOverrides)
    .filter(([, opacity]) => opacity !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([layerId, opacity]) => `${layerId}:${opacity}`)
    .join(",");
}

export function matchTheme(
  state: ThemeComparableState,
  themes: readonly MapThemeDefinition[],
): MapThemeDefinition | undefined {
  const layerIds = normalizedLayerIds(state.layerIds);
  const opacityOverrides = normalizedOpacityOverrides(state.opacityOverrides);

  return themes.find((theme) => (
    normalizedLayerIds(theme.layerIds) === layerIds
    && normalizedOpacityOverrides(theme.opacityOverrides) === opacityOverrides
    && theme.taxSaleEnabled === state.taxSaleEnabled
    && (!state.taxSaleEnabled || theme.mapMode === state.mapMode)
  ));
}

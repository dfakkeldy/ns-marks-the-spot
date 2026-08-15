import {
  isLayerCategoryId,
  type LayerCategoryId,
} from "../layers/layerCategories";
import {
  isShareLayerId,
  type MapMode,
  type ShareLayerId,
} from "../services/mapShareState";
import {
  validateMapTheme,
  type CustomMapThemeDefinition,
  type MapThemeDefinition,
  type MapThemeState,
} from "./mapThemes";

export const CUSTOM_THEME_STORAGE_KEY = "ns-marks-the-spot:custom-themes";

const THEME_LIBRARY_LOAD_WARNING = "Your custom-theme library could not be loaded.";
const THEME_LIBRARY_SAVE_WARNING = "Your custom themes could not be saved in this browser.";
const CUSTOM_THEME_DESCRIPTION = "A custom map theme.";

interface StoredCustomThemeV1 {
  id: string;
  name: string;
  layerIds: string[];
  opacityOverrides: Record<string, number>;
  preferredCategoryIds: string[];
  taxSaleEnabled: boolean;
  mapMode: MapMode;
}

interface StoredThemeLibraryV1 {
  version: 1;
  themes: StoredCustomThemeV1[];
}

export type CustomThemeLoadResult =
  | {
    status: "loaded";
    themes: CustomMapThemeDefinition[];
    warning: null;
  }
  | {
    status: "partial" | "fatal";
    themes: CustomMapThemeDefinition[];
    warning: string;
  };

export type ThemeSaveResult =
  | { ok: true }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMapMode(value: unknown): value is MapMode {
  return value === "current" || value === "historical";
}

function assertThemeId(id: string): void {
  if (!id.trim()) {
    throw new Error("Custom theme ID is required.");
  }
}

function assertThemeName(name: string): string {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error("Custom theme name is required.");
  }
  return normalizedName;
}

function assertThemeState(
  state: MapThemeState,
  preferredCategoryIds: readonly LayerCategoryId[],
): void {
  if (!isMapMode(state.mapMode)) {
    throw new Error("invalid map mode");
  }

  const errors = validateMapTheme({
    id: "custom-validation",
    kind: "custom",
    name: "Custom validation",
    description: CUSTOM_THEME_DESCRIPTION,
    ...state,
    preferredCategoryIds,
  });
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
}

function freezeCustomTheme(theme: CustomMapThemeDefinition): CustomMapThemeDefinition {
  return Object.freeze({
    ...theme,
    layerIds: Object.freeze([...theme.layerIds]),
    opacityOverrides: Object.freeze({ ...theme.opacityOverrides }),
    preferredCategoryIds: Object.freeze([...theme.preferredCategoryIds]),
  });
}

function createTheme(
  id: string,
  name: string,
  state: MapThemeState,
  preferredCategoryIds: readonly LayerCategoryId[],
): CustomMapThemeDefinition {
  assertThemeId(id);
  const normalizedName = assertThemeName(name);
  assertThemeState(state, preferredCategoryIds);

  return freezeCustomTheme({
    id,
    kind: "custom",
    name: normalizedName,
    description: CUSTOM_THEME_DESCRIPTION,
    layerIds: state.layerIds,
    opacityOverrides: state.opacityOverrides,
    preferredCategoryIds,
    taxSaleEnabled: state.taxSaleEnabled,
    mapMode: state.mapMode,
  });
}

function assertCustomThemes(themes: readonly MapThemeDefinition[]): void {
  const ids = new Set<string>();

  for (const theme of themes) {
    if (theme.kind !== "custom") {
      throw new Error("Built-in themes are not accepted by the custom-theme repository.");
    }
    if (ids.has(theme.id)) {
      throw new Error(`duplicate ID: ${theme.id}`);
    }
    ids.add(theme.id);
    createTheme(theme.id, theme.name, theme, theme.preferredCategoryIds);
  }
}

function toStoredTheme(theme: MapThemeDefinition): StoredCustomThemeV1 {
  return {
    id: theme.id,
    name: theme.name,
    layerIds: [...theme.layerIds],
    opacityOverrides: { ...theme.opacityOverrides },
    preferredCategoryIds: [...theme.preferredCategoryIds],
    taxSaleEnabled: theme.taxSaleEnabled,
    mapMode: theme.mapMode,
  };
}

function restorationWarning(messages: readonly string[]): string | null {
  return messages.length === 0
    ? null
    : `Some saved custom-theme details could not be restored: ${messages.join("; ")}.`;
}

function parseStoredTheme(
  value: unknown,
  seenIds: Set<string>,
  warnings: string[],
): CustomMapThemeDefinition | null {
  if (!isRecord(value)) {
    warnings.push("an invalid theme entry");
    return null;
  }

  const { id, name, layerIds, opacityOverrides, preferredCategoryIds, taxSaleEnabled, mapMode } = value;
  if (typeof id !== "string" || !id.trim()) {
    warnings.push("a theme without a valid ID");
    return null;
  }
  if (seenIds.has(id)) {
    warnings.push(`duplicate ID: ${id}`);
    return null;
  }
  if (typeof name !== "string" || !name.trim()) {
    warnings.push(`theme ${id} without a valid name`);
    return null;
  }
  if (!Array.isArray(layerIds) || !Array.isArray(preferredCategoryIds) || !isRecord(opacityOverrides)
    || typeof taxSaleEnabled !== "boolean" || !isMapMode(mapMode)) {
    warnings.push(`theme ${id}`);
    return null;
  }

  const validLayerIds: ShareLayerId[] = [];
  const layerIdSet = new Set<ShareLayerId>();
  for (const layerId of layerIds) {
    if (!isShareLayerId(layerId)) {
      warnings.push(`layer ID: ${String(layerId)}`);
    } else if (!layerIdSet.has(layerId)) {
      validLayerIds.push(layerId);
      layerIdSet.add(layerId);
    } else {
      warnings.push(`duplicate layer ID: ${layerId}`);
    }
  }

  const validCategoryIds: LayerCategoryId[] = [];
  const categoryIdSet = new Set<LayerCategoryId>();
  for (const categoryId of preferredCategoryIds) {
    if (!isLayerCategoryId(categoryId)) {
      warnings.push(`category ID: ${String(categoryId)}`);
    } else if (!categoryIdSet.has(categoryId)) {
      validCategoryIds.push(categoryId);
      categoryIdSet.add(categoryId);
    } else {
      warnings.push(`duplicate category ID: ${categoryId}`);
    }
  }

  const validOpacityOverrides: Partial<Record<ShareLayerId, number>> = {};
  for (const [layerId, opacity] of Object.entries(opacityOverrides)) {
    if (!isShareLayerId(layerId)) {
      warnings.push(`opacity layer ID: ${layerId}`);
    } else if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      warnings.push(`invalid opacity: ${layerId}`);
    } else {
      validOpacityOverrides[layerId] = opacity;
    }
  }

  try {
    const theme = createTheme(id, name, {
      layerIds: validLayerIds,
      opacityOverrides: validOpacityOverrides,
      taxSaleEnabled,
      mapMode,
    }, validCategoryIds);
    seenIds.add(id);
    return theme;
  } catch {
    warnings.push(`theme ${id}`);
    return null;
  }
}

function parseStoredThemeLibrary(value: unknown): CustomThemeLoadResult {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.themes)) {
    throw new Error("Invalid custom-theme library.");
  }

  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const themes = value.themes
    .map((theme) => parseStoredTheme(theme, seenIds, warnings))
    .filter((theme): theme is CustomMapThemeDefinition => theme !== null);

  const warning = restorationWarning(warnings);
  return warning === null
    ? { status: "loaded", themes, warning: null }
    : { status: "partial", themes, warning };
}

export function loadCustomThemes(storage: Storage): CustomThemeLoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(CUSTOM_THEME_STORAGE_KEY);
  } catch {
    return {
      status: "fatal",
      themes: [],
      warning: THEME_LIBRARY_LOAD_WARNING,
    };
  }
  if (raw === null) {
    return { status: "loaded", themes: [], warning: null };
  }

  try {
    return parseStoredThemeLibrary(JSON.parse(raw));
  } catch {
    return {
      status: "fatal",
      themes: [],
      warning: THEME_LIBRARY_LOAD_WARNING,
    };
  }
}

export function saveCustomThemes(
  themes: readonly MapThemeDefinition[],
  storage: Storage,
): ThemeSaveResult {
  try {
    assertCustomThemes(themes);
  } catch (error) {
    if (error instanceof Error && error.message === "Built-in themes are not accepted by the custom-theme repository.") {
      return { ok: false, message: "Only custom themes can be saved in this browser." };
    }
    return { ok: false, message: THEME_LIBRARY_SAVE_WARNING };
  }

  const document: StoredThemeLibraryV1 = {
    version: 1,
    themes: themes.map(toStoredTheme),
  };
  try {
    storage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(document));
    return { ok: true };
  } catch {
    return { ok: false, message: THEME_LIBRARY_SAVE_WARNING };
  }
}

export function createCustomTheme(
  name: string,
  state: MapThemeState,
  preferredCategoryIds: readonly LayerCategoryId[],
  id: string = crypto.randomUUID(),
): CustomMapThemeDefinition {
  return createTheme(id, name, state, preferredCategoryIds);
}

export function renameCustomTheme(
  themes: readonly MapThemeDefinition[],
  id: string,
  name: string,
): CustomMapThemeDefinition[] {
  assertCustomThemes(themes);
  const normalizedName = assertThemeName(name);
  return themes.map((theme) => (
    theme.id === id
      ? createTheme(theme.id, normalizedName, theme, theme.preferredCategoryIds)
      : theme as CustomMapThemeDefinition
  ));
}

export function updateCustomTheme(
  themes: readonly MapThemeDefinition[],
  id: string,
  state: MapThemeState,
  preferredCategoryIds: readonly LayerCategoryId[],
): CustomMapThemeDefinition[] {
  assertCustomThemes(themes);
  assertThemeState(state, preferredCategoryIds);
  return themes.map((theme) => (
    theme.id === id
      ? createTheme(theme.id, theme.name, state, preferredCategoryIds)
      : theme as CustomMapThemeDefinition
  ));
}

export function duplicateCustomTheme(
  themes: readonly MapThemeDefinition[],
  id: string,
  duplicateId: string = crypto.randomUUID(),
): CustomMapThemeDefinition[] {
  assertCustomThemes(themes);
  if (themes.some((theme) => theme.id === duplicateId)) {
    throw new Error(`duplicate ID: ${duplicateId}`);
  }
  const theme = themes.find((candidate) => candidate.id === id);
  if (!theme) {
    throw new Error(`Custom theme not found: ${id}`);
  }
  return [
    ...(themes as readonly CustomMapThemeDefinition[]),
    createTheme(duplicateId, theme.name, theme, theme.preferredCategoryIds),
  ];
}

export function deleteCustomTheme(
  themes: readonly MapThemeDefinition[],
  id: string,
): CustomMapThemeDefinition[] {
  assertCustomThemes(themes);
  return themes.filter((theme) => theme.id !== id) as CustomMapThemeDefinition[];
}

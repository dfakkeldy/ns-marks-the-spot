import type { FocusBounds } from "../focus/focusDefinition";
import { fletcherSheets } from "../layers/fletcherLayer";
import { PROPERTY_BOUNDARY_MIN_ZOOM } from "../layers/layerCatalog";
import { NOVA_SCOTIA_BOUNDS, type MapPosition } from "../services/mapShareState";
import type { BuiltInMapThemeId } from "./mapThemes";

/**
 * Where a built-in setup opens the map. Web-only metadata: the native
 * presentation fixture (`buildMapPresentationFixture`) never reads it, so the
 * five iOS-parity setups keep their layer lists and opacities unchanged.
 *
 * - `zoom-floor`: keep the centre, and zoom in to at least `zoom`, where the
 *   setup's main layer first draws.
 * - `position`: a fixed centre and zoom.
 * - `position-unless-zoomed`: a reader already looking closely at a place
 *   stays there; from an overview the map goes to `position`.
 * - `fit`: frame an area.
 * - `notice-extent`: frame the current tax-sale notices once their parcels
 *   load (MapCanvas's InitialTaxSaleBoundsController).
 */
export type ThemeCamera =
  | { readonly kind: "zoom-floor"; readonly zoom: number }
  | { readonly kind: "position"; readonly position: MapPosition }
  /** Keep a view already at `position.zoom` or closer; otherwise go to `position`. */
  | { readonly kind: "position-unless-zoomed"; readonly position: MapPosition }
  | { readonly kind: "fit"; readonly bounds: FocusBounds }
  | { readonly kind: "notice-extent" };

/** Each time `revision` rises, the map moves to `camera`. */
export interface ThemeCameraRequest {
  readonly revision: number;
  readonly camera: ThemeCamera | null;
}

/** Civic numbers draw from this zoom (PokerMapTools). */
export const POKER_CIVIC_MIN_ZOOM = 16;

/** The 24 published Fletcher sheets together: Cape Breton Island. */
export const FLETCHER_COVERAGE_BOUNDS: FocusBounds = [
  [
    Math.min(...fletcherSheets.map(({ bounds }) => bounds[0][0])),
    Math.min(...fletcherSheets.map(({ bounds }) => bounds[0][1])),
  ],
  [
    Math.max(...fletcherSheets.map(({ bounds }) => bounds[1][0])),
    Math.max(...fletcherSheets.map(({ bounds }) => bounds[1][1])),
  ],
];

const PROVINCE_BOUNDS: FocusBounds = [
  [NOVA_SCOTIA_BOUNDS.south, NOVA_SCOTIA_BOUNDS.west],
  [NOVA_SCOTIA_BOUNDS.north, NOVA_SCOTIA_BOUNDS.east],
];

/**
 * Rhodena's six proposed turbines (T1-T6, rhodena/features.json) span about
 * 2 km. At zoom 13 their badges stand apart; at the page's overview zoom 11
 * they pile into one mark.
 */
export const RHODENA_TURBINES_POSITION: MapPosition = {
  latitude: 45.765,
  longitude: -61.43,
  zoom: 13,
};

/**
 * Poker opens where civic numbers already draw: the densest civic block of
 * the published mail-route data (`public/poker/data.json.gz`, 2,696 civic
 * points; about 90 of them fall inside a phone's view here, in Port Hood).
 * The generic home centre at zoom 16 opened on forest.
 */
export const POKER_OPENING_POSITION: MapPosition = {
  latitude: 46.0125,
  longitude: -61.532,
  zoom: POKER_CIVIC_MIN_ZOOM,
};

/**
 * Explore keeps the home camera (no entry). Fishing and Point Tupper take the
 * camera of their focus pages (focus/registry.ts). Georeferencing frames the
 * reader's own map, so it has none either.
 */
export const builtInThemeCameras: Readonly<Partial<Record<BuiltInMapThemeId, ThemeCamera>>> = {
  "tax-sale-research": { kind: "notice-extent" },
  "forestry-field-access": { kind: "zoom-floor", zoom: PROPERTY_BOUNDARY_MIN_ZOOM },
  "historical-maps": { kind: "fit", bounds: FLETCHER_COVERAGE_BOUNDS },
  "electoral-districts": { kind: "fit", bounds: PROVINCE_BOUNDS },
  rhodena: { kind: "position", position: RHODENA_TURBINES_POSITION },
  poker: { kind: "position-unless-zoomed", position: POKER_OPENING_POSITION },
};

export function themeCameraFor(themeId: string | null | undefined): ThemeCamera | undefined {
  if (!themeId) return undefined;
  return (builtInThemeCameras as Readonly<Record<string, ThemeCamera | undefined>>)[themeId];
}

/**
 * The position a cold open of the setup starts from, given the position it
 * would otherwise use. A `fit` or `notice-extent` camera is applied after the
 * map mounts, so it leaves the start position alone.
 */
export function themeOpeningPosition(camera: ThemeCamera | undefined, fallback: MapPosition): MapPosition {
  if (camera?.kind === "position") return camera.position;
  if (camera?.kind === "position-unless-zoomed") return fallback.zoom >= camera.position.zoom ? fallback : camera.position;
  if (camera?.kind === "zoom-floor") return { ...fallback, zoom: Math.max(fallback.zoom, camera.zoom) };
  return fallback;
}

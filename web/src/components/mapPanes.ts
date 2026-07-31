import type { ProvinceLayerId } from "../layers/layerCatalog";

export const PROVINCE_LAYER_Z_INDEXES: Record<ProvinceLayerId, number> = {
  "ns-aerial": 150,
  contours: 180,
  nsprd: 200,
  "water-features": 210,
  "crown-lands": 220,
  buildings: 225,
  "flood-risk": 230,
  roads: 235,
  waterfalls: 250,
};

/**
 * Environmental-health risk layers classify every bedrock unit, so they render
 * as a wall-to-wall wash rather than a sparse overlay. They sit just above the
 * aerial imagery and below contours so parcels, roads, and water stay readable
 * on top of them.
 */
export const ENVIRONMENTAL_HEALTH_LAYER_Z_INDEX = 165;

/**
 * Old-growth policy polygons are forestry context, not parcel evidence. They
 * sit above contours but below NSPRD, water, roads, and selected parcels so
 * those more precise reference layers remain legible.
 */
export const OLD_GROWTH_POLICY_PANE = "old-growth-policy-pane";
export const OLD_GROWTH_POLICY_PANE_Z_INDEX = 190;

/**
 * Zoning is a broad thematic fill, so it sits above the Province raster layers
 * but below the parcel-specific overlays a user is actively inspecting.
 */
export const ZONING_PANE = "municipal-zoning-pane";
export const ZONING_PANE_Z_INDEX = 300;

export const MINERAL_PROXIMITY_PANE = "mineral-proximity-parcels-pane";
export const MINERAL_PROXIMITY_PANE_Z_INDEX = 390;

/**
 * Well points sit above the default overlay pane (400) so they stay readable
 * over area overlays, and below the established-parcel pane so tax-sale
 * selection remains the visual authority.
 */
export const WELL_LOG_PANE = "ns-well-logs-pane";
export const WELL_LOG_PANE_Z_INDEX = 405;

export const ESTABLISHED_PARCEL_PANE = "established-parcel-overlays-pane";
export const ESTABLISHED_PARCEL_PANE_Z_INDEX = 420;

/**
 * Active measurements are the user's current focus, so they render above
 * every parcel overlay. Kept below 500 where the map's HTML controls sit.
 */
export const MEASURE_PANE = "measure-pane";
export const MEASURE_PANE_Z_INDEX = 430;

/**
 * User vector data ("Your data") is annotation the user placed deliberately,
 * so it renders above every data overlay including selected parcels (420) —
 * but below an active measurement (430), which is always the immediate
 * focus. Rendered with a canvas renderer; see UserVectorLayers.
 */
export const USER_VECTOR_PANE = "user-vector-pane";
export const USER_VECTOR_PANE_Z_INDEX = 425;

/**
 * User-loaded rasters sit directly above the aerial imagery (150) and below
 * every data overlay (environmental health 165, contours 180, parcels 200,
 * roads 235, waterfalls 250) so parcel lines and roads stay readable on top
 * of a draped scan. The scan is context, not the subject of inspection.
 */
export const USER_MAPS_PANE = "user-maps-pane";
export const USER_MAPS_PANE_Z_INDEX = 160;

/**
 * The historical raster is context: it sits above the modern/aerial basemap
 * and below user maps and every evidence/data overlay.
 */
export const FLETCHER_LAYER_Z_INDEX = 155;

/**
 * Georeferencing control points sit above every data overlay — the app's own
 * panes top out at MEASURE_PANE_Z_INDEX (430) — and above Leaflet's built-in
 * marker (600) and tooltip (650) panes, because a control point buried under
 * a parcel marker cannot be clicked or dragged. Deliberately BELOW Leaflet's
 * popup pane (700): a parcel-identify popup should still read on top, and
 * matching 700 exactly would leave the order to DOM insertion.
 */
export const GEOREFERENCE_PANE = "georeference-pane";
export const GEOREFERENCE_PANE_Z_INDEX = 660;

import type { ProvinceLayerId } from "../layers/layerCatalog";

export const PROVINCE_LAYER_Z_INDEXES: Record<ProvinceLayerId, number> = {
  "ns-aerial": 150,
  nsprd: 200,
  "water-features": 210,
  "crown-lands": 220,
  buildings: 225,
  "flood-risk": 230,
  roads: 235,
  waterfalls: 250,
};

export const MINERAL_PROXIMITY_PANE = "mineral-proximity-parcels-pane";
export const MINERAL_PROXIMITY_PANE_Z_INDEX = 390;

export const ESTABLISHED_PARCEL_PANE = "established-parcel-overlays-pane";
export const ESTABLISHED_PARCEL_PANE_Z_INDEX = 420;

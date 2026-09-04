import type { StyleSpecification } from 'maplibre-gl';
import { fletcherSheets, fletcherTileUrl } from '../layers/fletcherLayer';
import { nativeLayerCatalog } from '../layers/layerCatalog';
import { PROVINCE_ATTRIBUTION } from '../licensing/provinceLicense';
import { RUMSEY_ATTRIBUTION, RUMSEY_LICENCE_URL } from '../licensing/rumseyLicense';
import type { AtlasMode } from './palette';
import { buildAtlasStyle, buildOsmStyle } from './style';

export type ReviewMode = AtlasMode | 'osm';
export type OverlayOptions = { parcels: boolean; provinceAccepted: boolean; historical: boolean; opacity: number };

export function buildReviewStyle(mode: ReviewMode, overlays: OverlayOptions, historicalHost: string | null): StyleSpecification {
  const style = mode === 'osm' ? buildOsmStyle() : buildAtlasStyle(mode);
  if (overlays.historical && historicalHost) {
    for (const { sheet, bounds: [[south, west], [north, east]] } of fletcherSheets) {
      const id = `fletcher-${sheet}`;
      style.sources[id] = { type: 'raster', tiles: [fletcherTileUrl(sheet, historicalHost)!],
        tileSize: 256, minzoom: 8, maxzoom: 16, bounds: [west, south, east, north],
        attribution: `${RUMSEY_ATTRIBUTION} · <a href="${RUMSEY_LICENCE_URL}">CC BY-NC-SA 3.0</a> · project-georeferenced Fletcher sheets` };
      style.layers.push({ id, type: 'raster', source: id, paint: { 'raster-opacity': overlays.opacity, 'raster-fade-duration': 0 } });
    }
  }
  if (overlays.parcels && overlays.provinceAccepted) {
    const parcel = nativeLayerCatalog.find(layer => layer.id === 'nsprd')!;
    const params = new URLSearchParams({ bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', transparent: 'true', f: 'image',
      dynamicLayers: parcel.exportOptions!.dynamicLayers! });
    style.sources.parcels = { type: 'raster', tiles: [`${parcel.serviceUrl}/export?${params}&bbox={bbox-epsg-3857}`],
      tileSize: 256, minzoom: 14, maxzoom: 19,
      bounds: [-66.5, 43.3, -59.5, 47.3], attribution: PROVINCE_ATTRIBUTION };
    style.layers.push({ id: 'parcels', type: 'raster', source: 'parcels', minzoom: 14,
      paint: { 'raster-opacity': parcel.opacity, 'raster-fade-duration': 0 } });
  }
  return style;
}

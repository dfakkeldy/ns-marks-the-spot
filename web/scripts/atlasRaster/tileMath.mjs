// Web Mercator tile arithmetic for the Atlas raster package.
//
// Tile addresses follow the XYZ slippy-map scheme: 2^z tiles across at zoom z,
// x from the antimeridian, y from the north. MapLibre draws a tile 512 CSS px
// wide at map zoom z, so a metatile of `tiles` × `tiles` addresses plus a
// `buffer` of tile widths on every side is `(tiles + 2 * buffer) * 512` CSS px.

export const TILE_CSS_PX = 512;
export const METATILE_TILES = 4;
export const METATILE_BUFFER_TILES = 0.5;
export const MAX_LATITUDE = 85.0511287798066;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Fractional tile coordinates of a longitude/latitude at a zoom. */
export function lonLatToTile(lon, lat, zoom) {
  const scale = 2 ** zoom;
  const phi = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * D2R;
  return {
    x: (lon + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * scale,
  };
}

/** Longitude/latitude of fractional tile coordinates; integers give a tile's north-west corner. */
export function tileToLonLat(x, y, zoom) {
  const scale = 2 ** zoom;
  return [x / scale * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * R2D];
}

export function tileBounds(zoom, x, y) {
  const [west, north] = tileToLonLat(x, y, zoom);
  const [east, south] = tileToLonLat(x + 1, y + 1, zoom);
  return { west, south, east, north };
}

/** Integer address of the tile containing a point. */
export function tileContaining(lon, lat, zoom) {
  const max = 2 ** zoom - 1;
  const { x, y } = lonLatToTile(lon, lat, zoom);
  return { x: Math.max(0, Math.min(max, Math.floor(x))), y: Math.max(0, Math.min(max, Math.floor(y))) };
}

/** Inclusive tile range whose tiles overlap the bbox by more than an edge. */
export function bboxToTileRange(bbox, zoom) {
  const max = 2 ** zoom - 1;
  const nw = lonLatToTile(bbox.west, bbox.north, zoom);
  const se = lonLatToTile(bbox.east, bbox.south, zoom);
  const clamp = (value) => Math.max(0, Math.min(max, value));
  return {
    xMin: clamp(Math.floor(nw.x)), xMax: clamp(Math.ceil(se.x) - 1),
    yMin: clamp(Math.floor(nw.y)), yMax: clamp(Math.ceil(se.y) - 1),
  };
}

/** Origin (north-west tile) of the metatile holding a tile; metatiles align to multiples of `tiles`. */
export function metatileOrigin(x, y, tiles = METATILE_TILES) {
  return { mx: Math.floor(x / tiles) * tiles, my: Math.floor(y / tiles) * tiles };
}

export function metatileIntersectsRange(mx, my, range, tiles = METATILE_TILES) {
  return mx <= range.xMax && mx + tiles - 1 >= range.xMin && my <= range.yMax && my + tiles - 1 >= range.yMin;
}

/**
 * MapLibre camera and pixel layout for one metatile. The view is centred on
 * the middle of the block so tile edges fall on whole CSS pixels; the central
 * block starts `offsetCss` pixels from the top-left of the canvas.
 */
export function metatileView(zoom, mx, my, { tiles = METATILE_TILES, buffer = METATILE_BUFFER_TILES } = {}) {
  const half = tiles / 2;
  return {
    zoom, mx, my, tiles, buffer,
    center: tileToLonLat(mx + half, my + half, zoom),
    sizeCss: (tiles + 2 * buffer) * TILE_CSS_PX,
    offsetCss: buffer * TILE_CSS_PX,
    nw: tileToLonLat(mx, my, zoom),
    se: tileToLonLat(mx + tiles, my + tiles, zoom),
  };
}

/** Device-pixel rectangle of one tile inside a metatile canvas rendered at `pixelRatio`. */
export function sliceRect(view, x, y, pixelRatio = 2) {
  const size = TILE_CSS_PX * pixelRatio;
  return {
    sx: (view.offsetCss + (x - view.mx) * TILE_CSS_PX) * pixelRatio,
    sy: (view.offsetCss + (y - view.my) * TILE_CSS_PX) * pixelRatio,
    size,
  };
}

export function parseZoomRange(text) {
  const match = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(String(text).trim());
  if (!match) throw new Error(`Zoom range must look like 9-13 or 12, not "${text}".`);
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  if (min > max) throw new Error(`Zoom range ${text} runs backwards.`);
  return [min, max];
}

export function parseBbox(text) {
  const parts = String(text).split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`Bounding box must be west,south,east,north, not "${text}".`);
  }
  const [west, south, east, north] = parts;
  if (west >= east || south >= north || Math.abs(south) > MAX_LATITUDE || Math.abs(north) > MAX_LATITUDE ||
      west < -180 || east > 180) {
    throw new Error(`Bounding box ${text} is not a valid west,south,east,north extent.`);
  }
  return { west, south, east, north };
}

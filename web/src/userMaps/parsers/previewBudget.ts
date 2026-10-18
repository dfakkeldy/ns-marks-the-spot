/**
 * The preview raster's long-edge budget, in pixels.
 *
 * Lives in its own module — not geoTiffSource — because it is the ONE value
 * the always-loaded import pipeline needs from that file. geoTiffSource
 * statically imports the geotiff library (~50 KB gzip), and importing the
 * constant from there dragged the whole decoder into the entry chunk for
 * every visitor, TIFF import or not. geoTiffSource re-exports it, so decoder
 * code keeps its existing import path.
 */
export const PREVIEW_MAX_DIMENSION = 4096;

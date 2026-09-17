// Frozen published input: reports/fletcher/retile-20260913/source.json.
export const FLETCHER_TILE_REVISION = 'fletcher-full-sheets-20260913.1';
export const FLETCHER_MAX_NATIVE_ZOOM = 15;

export type FletcherSheet = { sheet: number; bounds: [[number, number], [number, number]] };

/** Source-sheet footprints; the imagery is already composited in the tile build. */
export const fletcherSheets: readonly FletcherSheet[] = [
  { sheet: 1, bounds: [[46.9616094, -60.7331201], [47.1303101, -60.3513361]] },
  { sheet: 2, bounds: [[46.7829336, -60.4780884], [46.9711727, -60.0696244]] },
  { sheet: 3, bounds: [[46.7811189, -60.9072136], [46.9749118, -60.4558101]] },
  { sheet: 4, bounds: [[46.6168071, -60.4785375], [46.7928056, -60.0881746]] },
  { sheet: 5, bounds: [[46.6083531, -60.8548867], [46.7835487, -60.4704527]] },
  { sheet: 6, bounds: [[46.6127345, -61.2252621], [46.7932668, -60.8479248]] },
  { sheet: 7, bounds: [[46.4451559, -60.4711264], [46.635469, -60.1262183]] },
  { sheet: 8, bounds: [[46.4398942, -60.8795904], [46.62054, -60.4536542]] },
  { sheet: 9, bounds: [[46.4478174, -61.2232858], [46.6151411, -60.8547969]] },
  { sheet: 10, bounds: [[46.2663797, -60.8588842], [46.4512525, -60.4422007]] },
  { sheet: 11, bounds: [[46.2708819, -61.2714804], [46.4527379, -60.8493621]] },
  { sheet: 12, bounds: [[46.0706614, -60.8535392], [46.274297, -60.4704976]] },
  { sheet: 13, bounds: [[46.0956159, -61.2311011], [46.2751353, -60.8413221]] },
  { sheet: 14, bounds: [[46.091847, -61.6152657], [46.2699194, -61.2231061]] },
  { sheet: 15, bounds: [[45.9194474, -61.2242739], [46.0997272, -60.8476553]] },
  { sheet: 16, bounds: [[45.9208535, -61.6018359], [46.0946815, -61.2201866]] },
  { sheet: 17, bounds: [[45.7415267, -60.8508443], [45.9263837, -60.464434]] },
  { sheet: 18, bounds: [[45.7468554, -61.2286757], [45.9223533, -60.8425798]] },
  { sheet: 19, bounds: [[45.7450374, -61.5959519], [45.9251653, -61.219468]] },
  { sheet: 20, bounds: [[45.5572192, -60.8484637], [45.7489867, -60.4723391]] },
  { sheet: 21, bounds: [[45.5725647, -61.2224773], [45.747733, -60.840873]] },
  { sheet: 22, bounds: [[45.570741, -61.596446], [45.7497389, -61.2200519]] },
  { sheet: 23, bounds: [[45.3971006, -61.2197375], [45.5777837, -60.846712]] },
  { sheet: 24, bounds: [[45.3768803, -61.5924485], [45.5771235, -61.219423]] },
];

/** One raster layer prevents duplicate requests and repeated opacity at seams. */
export const fletcherTileRegions: readonly { id: string; bounds: [[number, number], [number, number]] }[] = [
  { id: 'mosaic', bounds: [[45.37688026971942, -61.615265674701156], [47.13031012425374, -60.0696243968451]] },
];

function environmentTileBaseUrl(): string {
  // An explicit empty override keeps tile hosting disabled for isolated builds.
  return import.meta.env.VITE_FLETCHER_TILE_BASE_URL ?? "https://tiles.kinnokilabs.com";
}

export function normalizeFletcherTileBaseUrl(
  value = environmentTileBaseUrl(),
): string | null {
  const trimmed = value.trim().replace(/\/+$/u, "");
  if (!trimmed) return null;

  const url = new URL(trimmed);
  const isLocalDevelopment =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !isLocalDevelopment) {
    throw new Error("Fletcher tiles require HTTPS outside local development.");
  }
  if (url.hostname.toLowerCase().includes("oldmapsonline")) {
    throw new Error("OldMapsOnline is not an allowed Fletcher tile source.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Fletcher tile base URL must not contain credentials or query state.");
  }
  return trimmed;
}

export function fletcherTileUrl(
  baseUrl = normalizeFletcherTileBaseUrl(),
): string | null {
  if (!baseUrl) return null;
  return `${baseUrl}/${FLETCHER_TILE_REVISION}/{z}/{x}/{y}.png`;
}

export function fletcherSourceReceiptUrl(
  baseUrl = normalizeFletcherTileBaseUrl(),
): string | null {
  if (!baseUrl) return null;
  return `${baseUrl}/${FLETCHER_TILE_REVISION}/source.json`;
}

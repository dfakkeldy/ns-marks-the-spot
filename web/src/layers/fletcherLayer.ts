export const FLETCHER_TILE_REVISION =
  "fletcher-direct-rumsey-20260831.1";

export type FletcherSheet = {
  sheet: number;
  bounds: [[number, number], [number, number]];
};

export const fletcherSheets: readonly FletcherSheet[] = [
  { sheet: 1, bounds: [[46.96525940034928, -60.8203125], [47.14116119721896, -60.435791015625]] },
  { sheet: 2, bounds: [[46.7925382703598, -60.46875], [46.96525940034928, -60.084228515625]] },
  { sheet: 3, bounds: [[46.7925382703598, -60.8477783203125], [46.969008033119586, -60.46875]] },
  { sheet: 4, bounds: [[46.611714625368954, -60.4742431640625], [46.796298989977444, -60.0787353515625]] },
  { sheet: 5, bounds: [[46.619261036171515, -60.8477783203125], [46.7925382703598, -60.46875]] },
  { sheet: 6, bounds: [[46.619261036171515, -61.2213134765625], [46.796298989977444, -60.8367919921875]] },
  { sheet: 7, bounds: [[46.437856895024204, -60.46875], [46.623033847214735, -60.084228515625]] },
  { sheet: 8, bounds: [[46.441642327624976, -60.8477783203125], [46.61548796222357, -60.46875]] },
  { sheet: 9, bounds: [[46.44921240385256, -61.226806640625], [46.619261036171515, -60.8477783203125]] },
  { sheet: 10, bounds: [[46.27103747280261, -60.8477783203125], [46.44542749723385, -60.46875]] },
  { sheet: 11, bounds: [[46.27103747280261, -61.2322998046875], [46.44542749723385, -60.8477783203125]] },
  { sheet: 12, bounds: [[46.09228143052648, -60.853271484375], [46.278631221560865, -60.4632568359375]] },
  { sheet: 13, bounds: [[46.09989991062731, -61.2213134765625], [46.27483447871402, -60.8477783203125]] },
  { sheet: 14, bounds: [[46.09228143052648, -61.600341796875], [46.278631221560865, -61.2103271484375]] },
  { sheet: 15, bounds: [[45.924408558629, -61.2213134765625], [46.09609080214316, -60.8477783203125]] },
  // Sheets 16 and 19 remain the feature-led TPS refits; as of this revision
  // they are cropped to their neat line like every other sheet, so the full-sheet
  // extent they carried in 20260828.1 is gone again.
  { sheet: 16, bounds: [[45.912944127373926, -61.611328125], [46.09989991062731, -61.2103271484375]] },
  { sheet: 17, bounds: [[45.74452698046843, -60.853271484375], [45.92822950933617, -60.4632568359375]] },
  { sheet: 18, bounds: [[45.74452698046843, -61.226806640625], [45.924408558629, -60.8367919921875]] },
  { sheet: 19, bounds: [[45.74452698046843, -61.6168212890625], [45.9320501968563, -61.2103271484375]] },
  { sheet: 20, bounds: [[45.73685954736048, -60.8477783203125], [45.924408558629, -60.4632568359375]] },
  { sheet: 21, bounds: [[45.56790960986129, -61.226806640625], [45.75985868785574, -60.8367919921875]] },
  { sheet: 22, bounds: [[45.510196544985575, -61.5948486328125], [45.698506587388465, -61.204833984375]] },
  { sheet: 23, bounds: [[45.394592696926615, -61.226806640625], [45.58328975600631, -60.831298828125]] },
  { sheet: 24, bounds: [[45.398449976304086, -61.58935546875], [45.57560020947801, -61.2158203125]] },
] as const;

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
  sheet: number,
  baseUrl = normalizeFletcherTileBaseUrl(),
): string | null {
  if (!baseUrl) return null;
  return `${baseUrl}/${FLETCHER_TILE_REVISION}/sheet-${String(sheet).padStart(2, "0")}/{z}/{x}/{y}.png`;
}

export function fletcherSourceReceiptUrl(
  baseUrl = normalizeFletcherTileBaseUrl(),
): string | null {
  if (!baseUrl) return null;
  return `${baseUrl}/${FLETCHER_TILE_REVISION}/source.json`;
}

export const FLETCHER_TILE_REVISION =
  "fletcher-direct-rumsey-20260726.1";

export type FletcherSheet = {
  sheet: number;
  bounds: [[number, number], [number, number]];
};

export const fletcherSheets: readonly FletcherSheet[] = [
  { sheet: 1, bounds: [[46.96525940034928, -60.8203125], [47.14116119721896, -60.435791015625]] },
  { sheet: 2, bounds: [[46.7925382703598, -60.46875], [46.96525940034928, -60.084228515625]] },
  { sheet: 3, bounds: [[46.7925382703598, -60.8477783203125], [46.969008033119586, -60.46875]] },
  { sheet: 4, bounds: [[46.581518465658, -60.523681640625], [46.82637528602131, -60.029296875]] },
  { sheet: 5, bounds: [[46.619261036171515, -60.8477783203125], [46.7925382703598, -60.46875]] },
  { sheet: 6, bounds: [[46.619261036171515, -61.2213134765625], [46.796298989977444, -60.8367919921875]] },
  { sheet: 7, bounds: [[46.403776166694634, -60.53466796875], [46.653206871226644, -60.029296875]] },
  { sheet: 8, bounds: [[46.441642327624976, -60.8477783203125], [46.61548796222357, -60.46875]] },
  { sheet: 9, bounds: [[46.44921240385256, -61.226806640625], [46.619261036171515, -60.8477783203125]] },
  { sheet: 10, bounds: [[46.27103747280261, -60.8477783203125], [46.44542749723385, -60.46875]] },
  { sheet: 11, bounds: [[46.27103747280261, -61.2322998046875], [46.44542749723385, -60.8477783203125]] },
  { sheet: 12, bounds: [[46.046548446306204, -60.919189453125], [46.297610989881086, -60.413818359375]] },
  { sheet: 13, bounds: [[46.09989991062731, -61.2213134765625], [46.27483447871402, -60.8477783203125]] },
  { sheet: 14, bounds: [[46.05798524479302, -61.666259765625], [46.305201055811956, -61.160888671875]] },
  { sheet: 15, bounds: [[45.924408558629, -61.2213134765625], [46.09609080214316, -60.8477783203125]] },
  { sheet: 16, bounds: [[45.920587344733654, -61.5948486328125], [46.09989991062731, -61.2213134765625]] },
  { sheet: 17, bounds: [[45.71001523943371, -60.919189453125], [45.958787640356405, -60.413818359375]] },
  { sheet: 18, bounds: [[45.7138509302922, -61.2872314453125], [45.95496879511337, -60.787353515625]] },
  { sheet: 19, bounds: [[45.71768635790719, -61.6607666015625], [45.958787640356405, -61.160888671875]] },
  { sheet: 20, bounds: [[45.70617928533084, -60.9136962890625], [45.95496879511337, -60.413818359375]] },
  { sheet: 21, bounds: [[45.53713668039858, -61.292724609375], [45.790509467524714, -60.7928466796875]] },
  { sheet: 22, bounds: [[45.47554027158592, -61.6607666015625], [45.725356423410155, -61.160888671875]] },
  { sheet: 23, bounds: [[45.36758436884979, -61.2872314453125], [45.61403741135092, -60.787353515625]] },
  { sheet: 24, bounds: [[45.398449976304086, -61.58935546875], [45.57560020947801, -61.2158203125]] },
] as const;

function environmentTileBaseUrl(): string {
  return import.meta.env.VITE_FLETCHER_TILE_BASE_URL ?? "";
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

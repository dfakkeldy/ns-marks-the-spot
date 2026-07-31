import type { PrintLayerSource } from "../../services/printSnapshot";

/**
 * Attribution lines for the GeoPDF export strip, deduplicated by attribution
 * TEXT rather than by layer.
 *
 * One line per layer put the identical 149-character `PROVINCE_ATTRIBUTION`
 * on the page four times over with the app's default layer set — roughly 850
 * characters of strip for maybe 400 characters of actual obligation, which
 * overran the space the strip has and got the tail silently cut. Collapsing
 * every source that shares an attribution onto one line naming all of them
 * keeps the obligation complete and the strip short enough to render.
 *
 * `licenceUrl` is appended when the publisher states one. The spec requires
 * "licence names and URLs, and the capture timestamp"; the `window.print()`
 * flow already rendered the URLs and only the export path was dropping them.
 *
 * Insertion order is preserved (first-seen attribution first), which keeps the
 * strip in the same base-map-upward order as `captureLayerIds`.
 */
export function exportAttributionLines(
  sources: PrintLayerSource[],
): string[] {
  const grouped = new Map<
    string,
    { names: string[]; licenceUrl: string | null }
  >();
  for (const source of sources) {
    const existing = grouped.get(source.attribution);
    if (!existing) {
      grouped.set(source.attribution, {
        names: [source.name],
        licenceUrl: source.licenceUrl,
      });
      continue;
    }
    if (!existing.names.includes(source.name)) {
      existing.names.push(source.name);
    }
  }
  return [...grouped].map(([attribution, { names, licenceUrl }]) => {
    const line = `${names.join(", ")}: ${attribution}`;
    return licenceUrl ? `${line} — ${licenceUrl}` : line;
  });
}

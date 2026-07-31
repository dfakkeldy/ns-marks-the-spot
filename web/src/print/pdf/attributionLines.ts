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
 * The group key is the attribution text AND the licence URL together, not
 * attribution text alone. `OPEN_GOVERNMENT_ATTRIBUTION` is paired with three
 * different licence URLs across layer families (resources/hydro/forestry/well
 * logs use `OPEN_GOVERNMENT_LICENCE_URL`; coastal flood uses
 * `COASTAL_HAZARD_LICENCE_URL`; environmental health uses
 * `OPEN_GOVERNMENT_LICENCE_TERMS_URL`) — grouping on text alone silently
 * discarded whichever URL lost the "first source wins" race and asserted the
 * survivor's licence over data it doesn't cover. Keying on both fields means
 * two sources only merge when they truly share one licence document; two
 * sources with the same words but different URLs get their own lines. (The
 * `PROVINCE_ATTRIBUTION` grouping below is safe either way today because
 * `DEPARTMENTAL_AGREEMENT_LICENCE_URL` and `PROVINCE_LICENSE_URL` happen to be
 * equal strings — keying on both fields makes that coincidence irrelevant.)
 *
 * Insertion order is preserved (first-seen attribution first), which keeps the
 * strip in the same base-map-upward order as `captureLayerIds`.
 */
export function exportAttributionLines(
  sources: PrintLayerSource[],
): string[] {
  const grouped = new Map<
    string,
    { names: string[]; attribution: string; licenceUrl: string | null }
  >();
  for (const source of sources) {
    const key = `${source.attribution} ${source.licenceUrl ?? ""}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        names: [source.name],
        attribution: source.attribution,
        licenceUrl: source.licenceUrl,
      });
      continue;
    }
    if (!existing.names.includes(source.name)) {
      existing.names.push(source.name);
    }
  }
  return [...grouped.values()].map(({ names, attribution, licenceUrl }) => {
    const line = `${names.join(", ")}: ${attribution}`;
    return licenceUrl ? `${line} — ${licenceUrl}` : line;
  });
}

import type { ShareLayerId } from "./mapShareState";
import type { PrintLayerSource, PrintSnapshot } from "./printSnapshot";

export function renderedPrintLayerSources(
  snapshot: PrintSnapshot,
  renderedLayerIds: readonly ShareLayerId[],
  includeAerial: boolean,
): PrintLayerSource[] {
  const renderedIds = new Set(
    renderedLayerIds.filter((id) => includeAerial || id !== "ns-aerial"),
  );
  const seenSourceIds = new Set<string>();
  return snapshot.layerSources.filter((source) => {
    if (!renderedIds.has(source.id) || seenSourceIds.has(source.id)) return false;
    seenSourceIds.add(source.id);
    return true;
  });
}

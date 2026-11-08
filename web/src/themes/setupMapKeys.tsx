import { SetupMapKey } from "../components/SetupMapKey";
import type { TaxSaleEvent } from "../data/taxSaleCatalog";
import type { FocusChromeContext } from "../focus/focusDefinition";
import { fishingKeyGroups, pointTupperKeyGroups, rhodenaKeyGroups, taxSaleKeyGroups } from "./setupMapKeyGroups";
import { useShowLayerList } from "./showLayerList";

/** Each setup's map key, over the map. */

export function FishingMapKey(context: FocusChromeContext) {
  const showSources = useShowLayerList(context.openMobileControls);
  return <SetupMapKey groups={fishingKeyGroups(context)} note="Tap a mark for its source and date." onShowSources={showSources} />;
}

export function RhodenaMapKey(context: FocusChromeContext) {
  const showSources = useShowLayerList(context.openMobileControls);
  return <SetupMapKey groups={rhodenaKeyGroups(context)} note="Approximate traces, not final design." onShowSources={showSources} />;
}

export function PointTupperSetupKey(context: FocusChromeContext) {
  const showSources = useShowLayerList(context.openMobileControls);
  return <SetupMapKey groups={pointTupperKeyGroups(context)} note="Tap a place for its source and date." onShowSources={showSources} />;
}

export function TaxSaleMapKey({ context, events, now }: { context: FocusChromeContext; events: readonly TaxSaleEvent[]; now: number }) {
  const showSources = useShowLayerList(context.openMobileControls);
  const groups = taxSaleKeyGroups(events, now);
  if (groups[0].rows.length === 0) return null;
  return <SetupMapKey groups={groups} note="Tap a dot for its notice. Confirm dates with the municipality." onShowSources={showSources} />;
}

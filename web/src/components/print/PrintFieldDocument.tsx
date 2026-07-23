import type { ReactNode } from "react";
import type { PrintQrResult } from "../../services/printQr";
import { printedLayerIds, type PrintScale, type PrintSnapshot } from "../../services/printSnapshot";
import {
  ActiveLayerLegend,
  ApproximateScale,
  PrintHeader,
  PrintPatternDefinitions,
  PrintReceipt,
  PrintScaleOmission,
  RequiredAttribution,
} from "./PrintResearchDocument";

export function PrintFieldDocument({
  snapshot,
  map,
  includeAerial,
  scale,
  shareUrl,
  qr,
  belowZoomLayerIds,
}: {
  snapshot: PrintSnapshot;
  map: ReactNode;
  includeAerial: boolean;
  scale: PrintScale;
  shareUrl: string;
  qr: PrintQrResult;
  belowZoomLayerIds: readonly string[];
}) {
  const renderedSources = snapshot.layerSources.filter(({ id }) =>
    printedLayerIds([...snapshot.layerIds], includeAerial).includes(id),
  );
  const events = snapshot.events.map((event) => `${event.name}: ${event.status}`).join(" · ");
  return (
    <article className="print-document print-field-document">
      <PrintPatternDefinitions />
      <section className="print-page print-field-page">
        <PrintHeader snapshot={snapshot} title="Parcel field sheet" />
        <p className="print-field-mode">{snapshot.mode === "historical" ? "Historical map state" : "Current map state"}{events ? ` · ${events}` : ""}</p>
        <div className="print-field-map-frame">{map}</div>
        <ActiveLayerLegend sources={renderedSources} />
        <PrintScaleOmission sources={snapshot.layerSources} belowZoomLayerIds={belowZoomLayerIds} />
        <ApproximateScale scale={scale} />
        <RequiredAttribution snapshot={snapshot} />
        <p className="print-general-limitations">Field reference only. Confirm access, conditions, boundaries, and permissions on site and from authoritative sources.</p>
        <PrintReceipt shareUrl={shareUrl} qr={qr} />
      </section>
    </article>
  );
}

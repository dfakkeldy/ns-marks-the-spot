import type { ReactNode } from "react";
import type { PrintQrResult } from "../../services/printQr";
import type { ShareLayerId } from "../../services/mapShareState";
import { type PrintScale, type PrintSnapshot } from "../../services/printSnapshot";
import { renderedPrintLayerSources } from "../../services/printRenderedLayers";
import {
  ActiveLayerLegend,
  ApproximateScale,
  PrintCaptureContext,
  PrintHeader,
  PrintMapFailure,
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
  renderedLayerIds,
  belowZoomLayerIds,
  failedLayerIds,
}: {
  snapshot: PrintSnapshot;
  map: ReactNode;
  includeAerial: boolean;
  scale: PrintScale;
  shareUrl: string;
  qr: PrintQrResult;
  renderedLayerIds: readonly ShareLayerId[];
  belowZoomLayerIds: readonly string[];
  failedLayerIds: readonly string[];
}) {
  const renderedSources = renderedPrintLayerSources(snapshot, renderedLayerIds, includeAerial);
  return (
    <article className="print-document print-field-document">
      <PrintPatternDefinitions />
      <section className="print-page print-field-page">
        <PrintHeader snapshot={snapshot} title="Parcel field sheet" />
        <PrintCaptureContext snapshot={snapshot} />
        <div className="print-field-map-frame">{map}</div>
        <div className="print-field-support">
          <ActiveLayerLegend sources={renderedSources} />
          <div className="print-field-details">
            <PrintScaleOmission sources={snapshot.layerSources} belowZoomLayerIds={belowZoomLayerIds} />
            <PrintMapFailure sources={snapshot.layerSources} failedLayerIds={failedLayerIds} />
            <ApproximateScale scale={scale} />
            <RequiredAttribution mapSources={renderedSources} evidenceSources={[]} />
          </div>
        </div>
        <p className="print-general-limitations">Field reference only. Confirm access, conditions, boundaries, and permissions on site and from authoritative sources.</p>
        <PrintReceipt shareUrl={shareUrl} qr={qr} />
      </section>
    </article>
  );
}

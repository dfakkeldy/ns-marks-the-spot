import type { ReactNode } from "react";
import type { PrintQrResult } from "../../services/printQr";
import type { ShareLayerId } from "../../services/mapShareState";
import { type PrintScale, type PrintSnapshot } from "../../services/printSnapshot";
import { renderedPrintLayerSources } from "../../services/printRenderedLayers";
import {
  ActiveLayerLegend,
  ApproximateScale,
  FieldRequiredAttribution,
  PrintCaptureContext,
  PrintHeader,
  PrintMapFailure,
  NorthIndicator,
  PrintPatternDefinitions,
  PrintReceipt,
  PrintScaleOmission,
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
      <section className="print-page print-field-page">
        <PrintPatternDefinitions />
        <PrintHeader snapshot={snapshot} title="Parcel field sheet" />
        <PrintCaptureContext snapshot={snapshot} />
        <div className="print-field-map-frame">
          {map}
          <NorthIndicator />
        </div>
        <div className="print-field-support">
          <ActiveLayerLegend
            sources={renderedSources}
            showSourceDates={false}
            mapMode={snapshot.mode}
          />
          <div className="print-field-details">
            <PrintScaleOmission sources={snapshot.layerSources} belowZoomLayerIds={belowZoomLayerIds} />
            <PrintMapFailure sources={snapshot.layerSources} failedLayerIds={failedLayerIds} />
            <ApproximateScale scale={scale} />
            <FieldRequiredAttribution mapSources={renderedSources} />
          </div>
        </div>
        <p className="print-general-limitations">
          <strong>
            Field screening/reference material only. Not a survey or an access
            conclusion.
          </strong>{" "}
          Confirm conditions, boundaries, and permissions on site and from
          authoritative sources.
        </p>
        <PrintReceipt shareUrl={shareUrl} qr={qr} />
      </section>
    </article>
  );
}

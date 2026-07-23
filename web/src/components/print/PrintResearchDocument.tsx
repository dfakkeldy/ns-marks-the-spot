import type { ReactNode } from "react";
import type { PrintQrResult } from "../../services/printQr";
import {
  type PrintLayerSource,
  type PrintScale,
  type PrintSnapshot,
} from "../../services/printSnapshot";
import type { ShareLayerId } from "../../services/mapShareState";
import {
  reportedEvidenceAttributions,
  type PrintEvidenceAttribution,
} from "../../services/printEvidenceAttribution";
import { renderedPrintLayerSources } from "../../services/printRenderedLayers";
import { PrintEvidenceAppendix } from "./PrintEvidenceAppendix";

export function PrintReceipt({
  shareUrl,
  qr,
}: {
  shareUrl: string;
  qr: PrintQrResult;
}) {
  return (
    <footer className="print-receipt">
      <a href={shareUrl} className="print-share-url">{shareUrl}</a>
      {qr.status === "ready" ? (
        <span
          className="print-qr"
          aria-label="QR code for this exact map state"
          dangerouslySetInnerHTML={{ __html: qr.svg }}
        />
      ) : (
        <span className="print-qr-fallback">QR unavailable</span>
      )}
    </footer>
  );
}

export function PrintPatternDefinitions() {
  return (
    <svg className="print-pattern-definitions" aria-hidden="true">
      <defs>
        <pattern
          id="print-selected-parcel-hatch"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="#efefef" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#777" strokeWidth="2" />
        </pattern>
      </defs>
    </svg>
  );
}

export function PrintHeader({ snapshot, title }: {
  snapshot: PrintSnapshot;
  title: string;
}) {
  return (
    <header className="print-header">
      <div>
        <p className="print-kicker">NS Marks The Spot</p>
        <h1>{title}</h1>
      </div>
      <div className="print-header-receipt">
        <p>PID {snapshot.pid}</p>
        <p>Generated: {snapshot.generatedAt}</p>
      </div>
    </header>
  );
}

export function ActiveLayerLegend({ sources }: { sources: readonly PrintLayerSource[] }) {
  return (
    <section className="print-active-layer-legend" aria-labelledby="print-active-layers">
      <h2 id="print-active-layers">Active map layers</h2>
      {sources.length === 0 ? (
        <p>No optional map layers were rendered.</p>
      ) : (
        <ul>
          {sources.map((source) => (
            <li key={source.id}>
              <strong>{source.name}</strong>
              <span>{source.sourceDate}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ApproximateScale({ scale }: { scale: PrintScale }) {
  return (
    <section className="print-scale" aria-label="Approximate scale">
      <strong>Approximate scale</strong>
      <span className="print-scale-bar" style={{ width: `${scale.pixels}px` }} />
      <span>{scale.label}</span>
    </section>
  );
}

export function RequiredAttribution({
  mapSources,
  evidenceSources,
}: {
  mapSources: readonly PrintLayerSource[];
  evidenceSources: readonly PrintEvidenceAttribution[];
}) {
  const candidates = [
    ...mapSources.map((source) => ({ ...source, label: source.name })),
    ...evidenceSources,
  ];
  const seenSourceIds = new Set<string>();
  const sources = candidates.filter(({ id }) => {
    if (seenSourceIds.has(id)) return false;
    seenSourceIds.add(id);
    return true;
  });
  const attributions = [...new Set(
    sources.map(({ attribution }) => attribution).filter(Boolean),
  )];
  if (attributions.length === 0) return null;

  return (
    <section className="print-required-attribution" aria-label="Source attribution and licences">
      {attributions.map((attribution) => <p key={attribution}>{attribution}</p>)}
      <ul className="print-attribution-links">
        {sources.map((source) => (
          <li key={source.id}>
            <a href={source.sourceUrl}>{source.label} source</a>
            {source.licenceUrl ? <a href={source.licenceUrl}>{source.label} licence</a> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function stateText(
  state: PrintSnapshot["evidence"]["buildings"],
): string {
  if (state.status === "pending" || state.status === "error") {
    return "Source unavailable at export time.";
  }
  if (state.value.count === 0) return "0";
  return state.value.count.toLocaleString("en-CA");
}

export function ResearchFactGrid({ snapshot }: { snapshot: PrintSnapshot }) {
  const mappedArea = snapshot.evidence.mappedArea;
  return (
    <section className="print-fact-grid" aria-label="Parcel facts">
      <dl>
        <div><dt>PID</dt><dd>{snapshot.pid}</dd></div>
        <div><dt>Mapped area</dt><dd>{mappedArea?.label ?? "No mapped area returned."}</dd></div>
        <div><dt>Mapped buildings</dt><dd>{stateText(snapshot.evidence.buildings)}</dd></div>
      </dl>
    </section>
  );
}

export function EvidenceStatusGrid({ snapshot }: { snapshot: PrintSnapshot }) {
  const assessment = snapshot.evidence.assessments;
  const entries = [
    `Civic addresses: ${snapshot.evidence.civicAddresses.status === "ready" ? "captured" : "unavailable"}`,
    `Assessment: ${assessment.status === "ready" ? `${assessment.value.accounts.length} account${assessment.value.accounts.length === 1 ? "" : "s"} captured` : "unavailable"}`,
    `Roads and water: ${snapshot.evidence.mappedContext.status === "ready" ? "captured" : "unavailable"}`,
    `Flood evidence: ${snapshot.evidence.floodHazard.status === "ready" ? "captured" : "unavailable"}`,
    `Resource evidence: ${snapshot.evidence.resources.status === "ready" ? "captured" : "unavailable"}`,
  ];
  return (
    <section className="print-evidence-status-grid" aria-label="Evidence receipt status">
      <h2>Evidence receipt status</h2>
      <ul>
        {entries.map((entry) => (
          <li key={entry}><span>{entry}</span></li>
        ))}
      </ul>
    </section>
  );
}

export function PrintScaleOmission({
  sources,
  belowZoomLayerIds,
}: {
  sources: readonly PrintLayerSource[];
  belowZoomLayerIds: readonly string[];
}) {
  const names = belowZoomLayerIds.map((id) =>
    sources.find((source) => source.id === id)?.name ?? id,
  );
  return names.length > 0 ? (
    <p className="print-scale-omission">Not rendered at this print scale: {names.join(", ")}.</p>
  ) : null;
}

export function PrintMapFailure({
  sources,
  failedLayerIds,
}: {
  sources: readonly PrintLayerSource[];
  failedLayerIds: readonly string[];
}) {
  const names = failedLayerIds.map((id) =>
    sources.find((source) => source.id === id)?.name ?? id,
  );
  return names.length > 0 ? (
    <p className="print-map-failure">Map rendering incomplete: {names.join(", ")} source failed at export time.</p>
  ) : null;
}

export function PrintCaptureContext({ snapshot }: { snapshot: PrintSnapshot }) {
  const mode = snapshot.mode === "historical" ? "Historical map state" : "Current map state";
  const selectedEventCount = new Set(snapshot.eventIds).size;
  const selectedEvents = snapshot.events.slice(0, selectedEventCount);
  return (
    <div className="print-capture-context">
      <span>{mode}</span>
      {selectedEvents.length > 0 ? (
        <span className="print-event-context">
          {selectedEvents.map((event) => (
            <span key={`${event.name}-${event.status}`}>{event.name}: {event.status}</span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

export function PrintResearchDocument({
  snapshot,
  map,
  includeAerial,
  includeAppendix,
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
  includeAppendix: boolean;
  scale: PrintScale;
  shareUrl: string;
  qr: PrintQrResult;
  renderedLayerIds: readonly ShareLayerId[];
  belowZoomLayerIds: readonly string[];
  failedLayerIds: readonly string[];
}) {
  const renderedSources = renderedPrintLayerSources(snapshot, renderedLayerIds, includeAerial);
  const evidenceSources = reportedEvidenceAttributions(snapshot);
  return (
    <article className="print-document print-research-document">
      <PrintPatternDefinitions />
      <section className="print-page print-research-summary">
        <PrintHeader snapshot={snapshot} title="Parcel research summary" />
        <PrintCaptureContext snapshot={snapshot} />
        <div className="print-research-map-frame">{map}</div>
        <div className="print-research-support">
          <ResearchFactGrid snapshot={snapshot} />
          <EvidenceStatusGrid snapshot={snapshot} />
          <ActiveLayerLegend sources={renderedSources} />
          <div className="print-research-details">
            <PrintScaleOmission sources={snapshot.layerSources} belowZoomLayerIds={belowZoomLayerIds} />
            <PrintMapFailure sources={snapshot.layerSources} failedLayerIds={failedLayerIds} />
            <ApproximateScale scale={scale} />
          </div>
          <RequiredAttribution mapSources={renderedSources} evidenceSources={evidenceSources} />
        </div>
        <p className="print-general-limitations">
          <strong>Screening evidence only.</strong> Not a survey, title opinion, access conclusion, appraisal, or proof of absence.
        </p>
        <PrintReceipt shareUrl={shareUrl} qr={qr} />
      </section>
      {includeAppendix ? <PrintEvidenceAppendix snapshot={snapshot} /> : null}
    </article>
  );
}

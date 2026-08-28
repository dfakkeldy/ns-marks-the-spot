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
  requiredSelectedGeometryAttribution,
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
    <div className="print-receipt">
      <div className="print-receipt-copy">
        <strong className="print-receipt-label">Exact map receipt</strong>
        <a href={shareUrl} className="print-share-url">{shareUrl}</a>
      </div>
      {qr.status === "ready" ? (
        <img
          className="print-qr"
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.svg)}`}
          alt="QR code for this exact map state"
        />
      ) : (
        <span className="print-qr-fallback">QR unavailable</span>
      )}
    </div>
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

const GENERATED_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formattedGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = GENERATED_MONTHS[date.getUTCMonth()];
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${date.getUTCFullYear()} · ${hours}:${minutes} UTC`;
}

export function PrintHeader({ snapshot, title, kind }: {
  snapshot: PrintSnapshot;
  title: string;
  kind: "research" | "field";
}) {
  return (
    <header className="print-header">
      <div className="print-document-tab">
        <span>{kind === "field" ? "FIELD SHEET" : "RESEARCH"}</span>
        <strong>PID {snapshot.pid}</strong>
      </div>
      <div className="print-title-lockup">
        <p className="print-kicker">NS Marks The Spot</p>
        <h1>{title}</h1>
      </div>
      <div className="print-header-receipt">
        <span>Captured</span>
        <time dateTime={snapshot.generatedAt}>
          {formattedGeneratedAt(snapshot.generatedAt)}
        </time>
      </div>
    </header>
  );
}

const PRINT_LEGEND_SYMBOL_KINDS: Record<ShareLayerId, string> = {
  modern: "basemap-grid",
  fletcher: "historical-raster",
  "ns-aerial": "aerial-tone",
  nsprd: "parcel-boundary",
  "crown-lands": "crown-hatch",
  "flood-risk": "watershed-boundary",
  waterfalls: "waterfall-point",
  "water-features": "water-lines",
  roads: "road-corridor",
  "main-roads": "road-corridor",
  "place-names": "place-label",
  buildings: "building-footprints",
  contours: "contour-lines",
  "mineral-occurrences": "mineral-point",
  "mineral-tenure": "tenure-hatch",
  "abandoned-mines": "mine-point",
  "mineral-proximity-parcels": "proximity-boundary",
  "inverness-hydro-potential": "hydro-classes",
  "old-growth-policy": "old-growth-policy-statuses",
  "ns-well-logs": "well-accuracy-points",
  "published-river-flood-zones": "river-flood-bands",
  "coastal-flood-current": "coastal-current",
  "coastal-flood-2050": "coastal-2050",
  "coastal-flood-2100": "coastal-2100",
  "arsenic-risk-wells": "arsenic-risk-bands",
  "uranium-risk-wells": "uranium-risk-bands",
  "manganese-risk-wells": "manganese-risk-bands",
  "surficial-aquifers": "aquifer-extent",
  "zoning-inverness": "zoning-inverness-fill",
  "zoning-victoria": "zoning-victoria-fill",
  "zoning-richmond": "zoning-richmond-fill",
  "zoning-cumberland": "zoning-cumberland-fill",
  "zoning-halifax": "zoning-halifax-fill",
};

export function ActiveLayerLegend({
  sources,
  showSourceDates = true,
  mapMode,
}: {
  sources: readonly PrintLayerSource[];
  showSourceDates?: boolean;
  mapMode?: PrintSnapshot["mode"];
}) {
  return (
    <section className="print-active-layer-legend" aria-labelledby="print-active-layers">
      <h2 id="print-active-layers">Active map layers</h2>
      <ul className="print-map-symbol-key" aria-label="Map symbols">
        <li>
          <span
            className="print-layer-symbol print-layer-symbol--selected-parcel"
            data-symbol-kind="selected-parcel-hatch"
            aria-hidden="true"
          />
          <span><strong>Selected parcel</strong></span>
        </li>
        {mapMode ? (
          <li>
            <span
              className={`print-layer-symbol print-layer-symbol--${mapMode}-tax-sale`}
              data-symbol-kind={
                mapMode === "historical"
                  ? "historical-record-parcel"
                  : "current-notice-parcel"
              }
              aria-hidden="true"
            />
            <span>
              <strong>
                {mapMode === "historical"
                  ? "Historical tax-sale parcel"
                  : "Current tax-sale parcel"}
              </strong>
            </span>
          </li>
        ) : null}
      </ul>
      {sources.length === 0 ? (
        <p>No optional map layers were rendered.</p>
      ) : (
        <ul>
          {sources.map((source) => (
            <li key={source.id}>
              <span
                className={`print-layer-symbol print-layer-symbol--${source.id}`}
                data-symbol-kind={PRINT_LEGEND_SYMBOL_KINDS[source.id]}
                aria-hidden="true"
              >
                {source.id === "inverness-hydro-potential"
                  ? Array.from({ length: 7 }, (_, index) => (
                      <span
                        key={index}
                        className={`print-hydro-class-sample print-hydro-class-sample--${index + 1}`}
                      />
                    ))
                  : null}
              </span>
              <span>
                <strong>{source.name}</strong>
                {showSourceDates ? <span>{source.sourceDate}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NorthIndicator() {
  return (
    <div className="print-north-indicator" aria-label="North">
      <span aria-hidden="true">↑</span>
      <strong>N</strong>
    </div>
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

type AttributionSource = {
  id: string;
  label: string;
  sourceUrl: string;
  attribution: string;
  licenceUrl: string | null;
};

function attributionMaterial(
  mapSources: readonly PrintLayerSource[],
  evidenceSources: readonly PrintEvidenceAttribution[],
): { sources: AttributionSource[]; attributions: string[] } {
  const candidates: AttributionSource[] = [
    ...mapSources.map((source) => ({ ...source, label: source.name })),
    ...evidenceSources,
  ];
  const seenSourceIds = new Set<string>();
  const sources = candidates.filter(({ id }) => {
    if (seenSourceIds.has(id)) return false;
    seenSourceIds.add(id);
    return true;
  });
  return {
    sources,
    attributions: [...new Set(
      sources.map(({ attribution }) => attribution).filter(Boolean),
    )],
  };
}

export function RequiredAttribution({
  mapSources,
  evidenceSources,
}: {
  mapSources: readonly PrintLayerSource[];
  evidenceSources: readonly PrintEvidenceAttribution[];
}) {
  const { sources, attributions } = attributionMaterial(mapSources, evidenceSources);
  if (sources.length === 0) return null;
  const firstSourceIdByLicenceUrl = new Map<string, string>();
  for (const source of sources) {
    if (source.licenceUrl && !firstSourceIdByLicenceUrl.has(source.licenceUrl)) {
      firstSourceIdByLicenceUrl.set(source.licenceUrl, source.id);
    }
  }

  return (
    <section className="print-required-attribution" aria-label="Source attribution and licences">
      <h2>Sources and licences</h2>
      {attributions.map((attribution) => <p key={attribution}>{attribution}</p>)}
      {evidenceSources.some(({ id }) => id === "nsprd-selected-geometry") ? (
        <p>NSPRD geometry is approximate and is not a legal survey.</p>
      ) : null}
      <ul className="print-attribution-links">
        {sources.map((source) => (
          <li key={source.id}>
            <a href={source.sourceUrl}>{source.label} source</a>
            {source.licenceUrl &&
            firstSourceIdByLicenceUrl.get(source.licenceUrl) === source.id ? (
              <a href={source.licenceUrl}>{source.label} licence</a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FieldRequiredAttribution({
  mapSources,
}: {
  mapSources: readonly PrintLayerSource[];
}) {
  const { sources, attributions } = attributionMaterial(mapSources, [
    requiredSelectedGeometryAttribution(),
  ]);
  const seenLicenceUrls = new Set<string>();
  const licences = sources.filter(({ licenceUrl }) => {
    if (!licenceUrl || seenLicenceUrls.has(licenceUrl)) return false;
    seenLicenceUrls.add(licenceUrl);
    return true;
  });
  if (sources.length === 0) return null;

  return (
    <section className="print-required-attribution print-field-required-attribution" aria-label="Source attribution and licences">
      <h2>Sources and licences</h2>
      {attributions.map((attribution) => <p key={attribution}>{attribution}</p>)}
      <p>NSPRD geometry is approximate and is not a legal survey.</p>
      <ul className="print-attribution-links">
        {licences.map((source) => (
          <li key={source.licenceUrl}>
            <a href={source.licenceUrl ?? undefined}>{source.label} licence</a>
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
  if (state.value.count === 0) {
    return "No mapped building feature returned.";
  }
  const points = `${state.value.pointCount.toLocaleString("en-CA")} point${
    state.value.pointCount === 1 ? "" : "s"
  }`;
  const polygons =
    `${state.value.polygonCount.toLocaleString("en-CA")} polygon${
      state.value.polygonCount === 1 ? "" : "s"
    }`;
  return `${state.value.count.toLocaleString("en-CA")} mapped feature${
    state.value.count === 1 ? "" : "s"
  } (${points}, ${polygons}).`;
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
  const dwellings = snapshot.evidence.dwellings;
  const entries = [
    `Civic addresses: ${snapshot.evidence.civicAddresses.status === "ready" ? "captured" : "unavailable"}`,
    `Assessment: ${assessment.status === "ready" ? `${assessment.value.accounts.length} account${assessment.value.accounts.length === 1 ? "" : "s"} captured` : "unavailable"}`,
    `Dwelling characteristics: ${dwellings.status === "ready" ? `${dwellings.value.length} account${dwellings.value.length === 1 ? "" : "s"} captured` : "unavailable"}`,
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
  const mode = !snapshot.taxSaleEnabled
    ? "Map state"
    : snapshot.mode === "historical"
      ? "Historical map state"
      : "Current map state";
  const eventsById = new Map<string, PrintSnapshot["events"][number]>();
  for (const event of snapshot.events) {
    if (!eventsById.has(event.id)) eventsById.set(event.id, event);
  }
  const selectedEvents = snapshot.taxSaleEnabled
    ? [...new Set(snapshot.eventIds)].flatMap((id) => {
        const event = eventsById.get(id);
        return event ? [event] : [];
      })
    : [];
  return (
    <div className="print-capture-context">
      <span>{mode}</span>
      {selectedEvents.length > 0 ? (
        <span className="print-event-context">
          {selectedEvents.map((event) => (
            <span key={event.id}>{event.name}: {event.status}</span>
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
      <section className="print-page print-research-summary">
        <PrintPatternDefinitions />
        <PrintHeader
          snapshot={snapshot}
          title="Parcel research summary"
          kind="research"
        />
        <PrintCaptureContext snapshot={snapshot} />
        <div className="print-research-map-frame">
          {map}
          <NorthIndicator />
        </div>
        <div className="print-research-support">
          <ResearchFactGrid snapshot={snapshot} />
          <EvidenceStatusGrid snapshot={snapshot} />
          <ActiveLayerLegend
            sources={renderedSources}
            mapMode={snapshot.taxSaleEnabled ? snapshot.mode : undefined}
          />
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

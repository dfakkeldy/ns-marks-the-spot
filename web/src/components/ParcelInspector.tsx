import { useEffect, useRef, type ReactNode } from "react";
import {
  eventLifecycleStatus,
  type TaxSaleEvent,
  type TaxSaleListing,
} from "../data/taxSaleCatalog";
import {
  calculateFinancialComparison,
  historicalOutcomeLabel,
  type HistoricalRecordContext,
} from "../data/historicalTaxSales";
import {
  COASTAL_HAZARD_LICENCE_URL,
  COASTAL_HAZARD_NOTICES,
  resourceLayerCatalog,
} from "../layers/layerCatalog";
import {
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_URL,
} from "../licensing/provinceLicense";
import {
  CIVIC_ADDRESS_DATASET_URL,
  OPEN_GOVERNMENT_ATTRIBUTION,
  OPEN_GOVERNMENT_LICENCE_URL,
  civicAddressShortfall,
  noReadableCivicAddresses,
  type CivicAddressReading,
} from "../services/civicAddresses";
import {
  googleMapsDirectionsUrl,
  plusCodeForCoordinates,
} from "../services/googleMaps";
import {
  ADJACENT_ROAD_DISTANCE_METRES,
  roadsNamedByCivicAddress,
  type MappedArea,
  type ParcelContext,
} from "../services/parcelContext";
import type { ParcelFloodHazardEvidence } from "../services/floodHazard";
import type { MapMode } from "../services/mapShareState";
import type { ParcelResourceIntersections } from "../services/parcelResources";
import {
  BUILDINGS_DATASET_URL,
  type ParcelBuildingCount,
} from "../services/buildings";
import {
  PVSC_ASSESSMENT_DATASET_URL,
  PVSC_ASSESSMENT_SOURCE_DATE,
  PVSC_OPEN_DATA_ATTRIBUTION,
  PVSC_OPEN_DATA_LICENCE_URL,
  type ParcelAssessmentResult,
} from "../services/pvscAssessments";
import {
  PVSC_DWELLING_DATASET_URL,
  PVSC_DWELLING_SOURCE_DATE,
  type PvscDwelling,
  type PvscDwellingAccount,
} from "../services/pvscDwellings";
import {
  currency,
  eventDate,
  eventDateLabel,
  eventLifecycleLabel,
  historicalSaleMethodLabel,
  listingStatusLabel,
  matchMethodLabel,
} from "../services/taxSaleFormat";
import { viewpointParcelUrl } from "../services/viewpoint";

export type SelectedEvidenceRequest = { pid: string; generation: number };

/**
 * Rendered wherever evidence depends on parcel geometry that is KNOWN not to
 * resolve. Distinct from a source error on purpose: nothing was queried, so
 * nothing "failed" — the parcel simply cannot be evaluated spatially.
 */
/**
 * Said by every source that depends on the parcel's outline when the outline
 * never arrived — whether NSPRD answered with no such parcel or did not answer
 * at all. Which of those happened is reported once, by the search or lookup
 * message; what each source here can say is only that it was never asked.
 */
export const GEOMETRY_UNAVAILABLE_MESSAGE =
  "Not evaluated — this PID's NSPRD geometry is unavailable in the Province parcel service.";

export type ParcelContextState =
  | { request: SelectedEvidenceRequest | null; status: "idle" | "loading" | "error" | "geometry-unavailable"; value: ParcelContext }
  | { request: SelectedEvidenceRequest; status: "ready"; value: ParcelContext };

export type CivicAddressState =
  | { request: SelectedEvidenceRequest | null; status: "idle" | "loading" | "error" | "geometry-unavailable"; value: CivicAddressReading }
  | { request: SelectedEvidenceRequest; status: "ready"; value: CivicAddressReading };

export type ParcelResourceState =
  /**
   * "error" and "geometry-unavailable" are TERMINAL: before they existed, a
   * selected PID whose NSPRD geometry never resolved (empty result or a
   * failed fetch with no retry trigger) left every geometry-dependent
   * section on "Checking…" forever — a known condition presented as
   * indefinite progress.
   */
  | { request: SelectedEvidenceRequest | null; status: "idle" | "loading" | "error" | "geometry-unavailable"; value: ParcelResourceIntersections }
  | { request: SelectedEvidenceRequest; status: "ready"; value: ParcelResourceIntersections };

export type FloodHazardState =
  | { request: SelectedEvidenceRequest | null; status: "idle" | "loading" | "error" | "geometry-unavailable" }
  | { request: SelectedEvidenceRequest; status: "ready"; value: ParcelFloodHazardEvidence };

export type BuildingCountState =
  | { request: SelectedEvidenceRequest | null; status: "idle" | "loading" | "error" | "geometry-unavailable" }
  | { request: SelectedEvidenceRequest; status: "ready"; value: ParcelBuildingCount };

export type AssessmentState =
  | { request: SelectedEvidenceRequest | null; status: "idle" | "loading" | "error" | "geometry-unavailable" }
  | { request: SelectedEvidenceRequest; status: "ready"; value: ParcelAssessmentResult };

/**
 * "blocked", "no-account" and "geometry-unavailable" are three different
 * reasons the dwelling dataset was never asked, and each is rendered with its
 * own cause. Collapsing them told a reader the dataset had answered, or named
 * a source outage that never happened.
 */
export type DwellingState =
  | {
      request: SelectedEvidenceRequest | null;
      status:
        | "idle"
        | "loading"
        | "error"
        | "blocked"
        | "no-account"
        // The notice gave an AAN and PVSC returned no assessment record for
        // it: an account was available to ask with, and the assessment
        // dataset answered. That is not "no account was matched".
        | "no-record-for-notice-aan"
        | "geometry-unavailable";
    }
  | {
      request: SelectedEvidenceRequest;
      status: "ready";
      value: PvscDwellingAccount[];
    };

/**
 * Explanatory caveat prose behind a disclosure. The DATA above it and the
 * source/attribution lines stay visible — the licence obligations and the
 * one-line caveat are never collapsed, only the multi-sentence
 * interpretation, which had grown to outweigh the facts it protects. Same
 * pattern as the rail's "Source & scale" rows.
 */
function EvidenceCaveat({ children }: { children: ReactNode }) {
  return (
    <details className="evidence-caveat">
      <summary>What this does and doesn&apos;t show</summary>
      {children}
    </details>
  );
}

function HistoricalOutcomeDetails({
  context,
  selectedPid,
}: {
  context: HistoricalRecordContext;
  selectedPid: string;
}) {
  const { event, record } = context;
  const comparison = calculateFinancialComparison(event, record);
  const awaitingResults = event.resultStatus === "awaiting-official-results";
  const winningBidLabel =
    record.winningBidCents !== null
      ? currency.format(record.winningBidCents / 100)
      : record.outcome === "unsold"
        ? "No winning bid - official result says no bids"
        : awaitingResults
          ? "Awaiting official results"
          : "Not published in verified sources";

  return (
    <article className="historical-outcome-card">
      <header>
        <div>
          <strong>
            {awaitingResults
              ? "Outcome pending"
              : historicalOutcomeLabel(record.outcome)}
          </strong>
          <span>{eventDate.format(new Date(`${event.saleDate}T12:00:00-03:00`))}</span>
        </div>
        <span className={`outcome-marker ${record.outcome}`}>
          Historical record
        </span>
      </header>
      <dl className="parcel-facts historical-facts">
        <div>
          <dt>Municipality</dt>
          <dd>{event.municipality}</dd>
        </div>
        <div>
          <dt>Event / method</dt>
          <dd>
            {event.id} · {historicalSaleMethodLabel(event.saleMethod)}
          </dd>
        </div>
        <div>
          <dt>{event.listingIdentifierLabel}</dt>
          <dd className="fact-figure">{record.listingIdentifier}</dd>
        </div>
        <div>
          <dt>PID / match</dt>
          <dd className="fact-figure">
            {selectedPid} · {matchMethodLabel(context)}
          </dd>
        </div>
        <div>
          <dt>Official location</dt>
          <dd>{record.civicDescription}</dd>
        </div>
        <div>
          <dt>{event.advertisedAmountLabel}</dt>
          <dd className="fact-figure">
            {currency.format(record.advertisedAmountCents / 100)}
          </dd>
        </div>
        <div>
          <dt>Winning bid</dt>
          <dd className="fact-figure">{winningBidLabel}</dd>
        </div>
        {comparison ? (
          <>
            <div>
              <dt>Difference</dt>
              <dd className="fact-figure">
                {currency.format(comparison.differenceCents / 100)}
              </dd>
            </div>
            <div>
              <dt>Above {event.advertisedAmountLabel.toLocaleLowerCase()}</dt>
              <dd className="fact-figure">
                {comparison.percentageAbove.toFixed(2)}%
              </dd>
            </div>
            <div>
              <dt>Winning-bid multiple</dt>
              <dd className="fact-figure">
                {comparison.winningBidMultiple.toFixed(2)}×
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Redemption field</dt>
          <dd>{record.redemptionLabel}</dd>
        </div>
        <div>
          <dt>Source snapshots</dt>
          <dd>
            Notice {event.noticeSnapshotDate} · {event.resultSnapshotDate
              ? `result ${event.resultSnapshotDate}`
              : `results checked ${event.resultCheckedOn}`}
          </dd>
        </div>
        <div>
          <dt>Retrieved</dt>
          <dd>{event.retrievedOn}</dd>
        </div>
      </dl>
      {record.pids.length > 1 ? (
        <p className="multi-pid-warning">
          This one listing covers {record.pids.length} PIDs ({record.pids.join(", ")}).
          The listing-level amounts are not divided between parcels.
        </p>
      ) : null}
      {record.resultNote ? <p className="historical-result-note">{record.resultNote}</p> : null}
      <div className="historical-source-links">
        <a href={event.noticeUrl} target="_blank" rel="noreferrer">
          Official notice
        </a>
        {event.resultUrl ? (
          <a href={event.resultUrl} target="_blank" rel="noreferrer">
            Official result
          </a>
        ) : event.landingPageUrl ? (
          <a href={event.landingPageUrl} target="_blank" rel="noreferrer">
            Check official results
          </a>
        ) : null}
      </div>
      <p className="historical-limit">
        {awaitingResults
          ? "Dated notice record only; no result is claimed. It is not a current offering and does not prove a sale, present ownership, title, redemption, legal access, or parcel status."
          : "Dated outcome only. It is not a current offering and does not prove present ownership, title, redemption, legal access, or parcel status."}
      </p>
    </article>
  );
}

export function ParcelInspector({
  pid,
  context,
  mappedArea,
  buildingCount,
  assessmentState,
  dwellingState,
  mappedContext,
  civicAddresses,
  historicalContexts,
  pidInAnyIncludedNotice,
  resourceIntersections,
  floodHazard,
  taxSaleEnabled,
  mapMode,
  shareUrl,
  shareMessage,
  onCopyShareUrl,
  onExportEvidence,
  onPrintExport,
  canPrintExport,
  evidenceReady,
  now,
  dismissOnEscape,
  onClose,
}: {
  pid: string;
  context?: { event: TaxSaleEvent; listing: TaxSaleListing };
  mappedArea: MappedArea | null;
  buildingCount: BuildingCountState;
  assessmentState: AssessmentState;
  dwellingState: DwellingState;
  mappedContext: ParcelContextState;
  civicAddresses: CivicAddressState;
  historicalContexts: HistoricalRecordContext[];
  pidInAnyIncludedNotice: boolean;
  resourceIntersections: ParcelResourceState;
  floodHazard: FloodHazardState;
  taxSaleEnabled: boolean;
  mapMode: MapMode;
  shareUrl: string;
  shareMessage: string | null;
  onCopyShareUrl: () => void;
  onExportEvidence: () => void;
  onPrintExport: () => void;
  canPrintExport: boolean;
  evidenceReady: boolean;
  now: number;
  /**
   * Whether Escape should close this panel. App keeps it false while a
   * dialog, the mobile controls sheet, the print preview or a georeference
   * session is open: the panel is the bottom layer under all of those, and
   * the rule App states for the controls sheet applies here too — "so one
   * keypress never closes two layers".
   */
  dismissOnEscape: boolean;
  onClose: () => void;
}) {
  const listing = context?.listing;
  const event = context?.event;
  const firstHistoricalContext = historicalContexts[0];
  const lifecycleStatus = event
    ? eventLifecycleStatus(event, now)
    : undefined;
  const historical = lifecycleStatus === "historical";
  const needsResultVerification = lifecycleStatus === "verify-results";

  // Escape has to work from wherever the reader is, not only once focus has
  // been Tabbed into the panel: nothing focuses this panel when it opens, and
  // it is normally reached by tapping a parcel on the map, so a handler on
  // the <aside> would almost never fire. The listener goes on `document`, and
  // App decides through `dismissOnEscape` whether this panel is the layer the
  // reader is actually in.
  //
  // stopPropagation because MeasureTool holds a WINDOW keydown for Escape and
  // window is the last hop after document. MapCanvas already records what
  // sharing the key costs — "one Escape both clears the measurement and
  // closes the panel". With this panel open, one Escape closes this panel and
  // a measurement in progress survives to the next press. The georeferencer's
  // window listener is unscoped on purpose ("closing this panel from anywhere
  // is intended"), so App holds `dismissOnEscape` false for the whole of a
  // georeference session rather than letting this listener outrank it.
  //
  // onClose is read through a ref for the reason useDialogChrome gives in
  // App.tsx: "The dismiss handler lives in a ref so inline-arrow props don't
  // re-run the mount effect".
  const dismissRef = useRef(onClose);
  dismissRef.current = onClose;
  useEffect(() => {
    if (!dismissOnEscape) {
      return;
    }
    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") {
        return;
      }
      keyEvent.stopPropagation();
      dismissRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dismissOnEscape]);

  return (
    <aside className="parcel-inspector" aria-label={`Parcel ${pid} details`}>
      {/* Heading and close button in one row that does not scroll. The button
          used to be absolutely positioned inside this panel, which is its own
          scrollport, so it was translated by the scroll offset and left the
          screen with the first swipe of content — and on a phone, where the
          panel is full-screen and the map chrome, zoom and location controls
          are hidden behind it, that was the only way out. */}
      <div className="inspector-header">
        <h2>
          {listing?.addressOrDescription ??
            listing?.location ??
            firstHistoricalContext?.record.civicDescription ??
            `PID ${pid}`}
        </h2>
        <button
          className="inspector-close"
          type="button"
          onClick={onClose}
          aria-label="Close parcel details"
        >
          ×
        </button>
      </div>
      <p className={listing ? "notice-status" : "parcel-status"}>
        {listing
          ? historical
            ? "Historical result - not available"
            : needsResultVerification
              ? "Past sale date — verify results with the municipality."
            : "Listed in official notice"
          : historicalContexts.length > 0
            ? `${historicalContexts.length} historical tax-sale ${historicalContexts.length === 1 ? "record" : "records"}`
            : "NSPRD parcel"}
      </p>
      {taxSaleEnabled ? (
        <p className={`parcel-mode-marker ${mapMode}`}>
          {mapMode === "current" ? "Current-notice mode" : "Historical-records mode"}
        </p>
      ) : null}
      <dl className="parcel-facts">
        {event ? (
          <>
            <div>
              <dt>Municipality</dt>
              <dd>{event.municipality}</dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd>
                {eventDateLabel(event)} · {eventLifecycleLabel(event, now)}
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>PID</dt>
          <dd className="fact-figure">{pid}</dd>
        </div>
        {mappedArea ? (
          <div>
            <dt>Mapped area</dt>
            <dd className="fact-figure">{mappedArea.label}</dd>
          </div>
        ) : null}
        <div>
          <dt>Mapped buildings</dt>
          <dd className="fact-figure" aria-live="polite">
            {buildingCount.status === "ready"
              ? buildingCount.value.count.toLocaleString("en-CA")
              : buildingCount.status === "error"
                ? "Unavailable"
                : buildingCount.status === "geometry-unavailable"
                  ? "Not evaluated"
                  : "Checking…"}
          </dd>
        </div>
        {listing ? (
          <>
            {listing.lien ? (
              <div>
                <dt>Lien</dt>
                <dd className="fact-figure">{listing.lien}</dd>
              </div>
            ) : null}
            {listing.aan ? (
              <div>
                <dt>AAN</dt>
                <dd className="fact-figure">{listing.aan}</dd>
              </div>
            ) : null}
            <div>
              <dt>Official location</dt>
              <dd>{listing.location}</dd>
            </div>
            <div>
              <dt>{listing.financial.label}</dt>
              <dd className="fact-figure">
                {currency.format(listing.financial.amountCents / 100)}
              </dd>
            </div>
            <div>
              <dt>Redemption</dt>
              <dd>{listing.redemptionLabel}</dd>
            </div>
            <div>
              <dt>Listing status</dt>
              <dd>{listingStatusLabel(listing)}</dd>
            </div>
            <div>
              <dt>Source retrieved</dt>
              <dd className="fact-figure">{event?.retrievedOn}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {mappedArea ? (
        <p className="mapped-area-note">
          Calculated from NSPRD geometry and approximate; not a survey.
        </p>
      ) : null}
      <p className="mapped-area-note building-count-note">
        Count of NSTDB building features intersecting the PID. An empty result
        does not prove no building exists. Source:{" "}
        <a href={BUILDINGS_DATASET_URL} target="_blank" rel="noreferrer">
          Nova Scotia Topographic Database — Buildings
        </a>
        , counted through the Province&apos;s NSTDB buildings map service.{" "}
        {PROVINCE_ATTRIBUTION}{" "}
        <a href={PROVINCE_LICENSE_URL} target="_blank" rel="noreferrer">
          Read the Province licence
        </a>
        .
      </p>
      <EvidenceCaveat>
        <p className="mapped-area-note">
          Smaller buildings are mapped as points; larger buildings as
          polygons. The NSTDB is compiled from aerial photography whose
          capture date varies by area, so recent construction may not appear
          for years. The count does not establish current structures,
          occupancy, condition, use, or permits.
        </p>
      </EvidenceCaveat>
      <AssessmentDetails
        state={assessmentState}
        listingPids={listing?.pids ?? []}
      />
      <DwellingDetails state={dwellingState} />
      {historicalContexts.length > 0 ? (
        <section className="historical-outcomes" aria-label="Historical tax-sale records">
          <h3>Historical tax-sale records</h3>
          {historicalContexts.map((historicalContext) => (
            <HistoricalOutcomeDetails
              key={historicalContext.record.recordId}
              context={historicalContext}
              selectedPid={pid}
            />
          ))}
        </section>
      ) : null}
      <CivicAddressDetails state={civicAddresses} />
      <MappedContextDetails state={mappedContext} civicAddresses={civicAddresses} />
      <FloodHazardDetails state={floodHazard} />
      <ParcelResourceDetails state={resourceIntersections} />
      {listing ? (
        <p className="sale-warning">
          <span aria-hidden="true">!</span>
          {historical
            ? "This is a dated historical result, not a currently available property."
            : listing.listingStatus === "withdrawn"
              ? `The municipality's current notice revision strikes this listing out. Verify status directly with ${event?.shortMunicipality}; this map does not imply access, clear title, possession or buildability.`
            : needsResultVerification
              ? `The advertised sale date has passed. Verify results and current status with ${event?.shortMunicipality}. This map does not imply access, clear title, possession or buildability.`
            : `Properties may be paid, removed or deferred. Verify current status with ${event?.shortMunicipality}. This map does not imply access, clear title, possession or buildability.`}
        </p>
      ) : taxSaleEnabled && historicalContexts.length === 0 ? (
        pidInAnyIncludedNotice ? (
          <p className="sale-warning neutral">
            This PID appears in a municipal notice included by this map, but
            that record is hidden by the current mode or filters (or its
            geometry is unavailable in NSPRD).
          </p>
        ) : (
          <p className="sale-warning neutral">
            This PID is not listed in any municipal notice included by this map.
          </p>
        )
      ) : null}
      {event ? (
        <a
          className="primary-action inspector-action"
          href={event.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          View direct official source
        </a>
      ) : null}
      <a
        className="secondary-action inspector-action viewpoint-action"
        href={viewpointParcelUrl(pid)}
        target="_blank"
        rel="noreferrer"
      >
        Open parcel in ViewPoint
      </a>
      <div className="evidence-actions">
        <button className="secondary-action" type="button" onClick={onCopyShareUrl}>
          Copy share link
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={!evidenceReady}
          title={
            evidenceReady ? undefined : "Waiting for selected-parcel evidence"
          }
          onClick={onExportEvidence}
        >
          Export evidence note
        </button>
        {canPrintExport ? (
          <button className="secondary-action" type="button" onClick={onPrintExport}>
            Print / export
          </button>
        ) : null}
      </div>
      <p className="share-status" role="status" aria-live="polite">
        {shareMessage}
      </p>
      <a className="share-url-preview" href={shareUrl}>
        Open this exact map state
      </a>
    </aside>
  );
}

function dwellingFactsLabel(dwelling: PvscDwelling): string {
  return [
    dwelling.style,
    dwelling.squareFeetLivingArea !== null
      ? `${dwelling.squareFeetLivingArea.toLocaleString("en-CA")} sq ft living area`
      : null,
    dwelling.livingUnits !== null
      ? `${dwelling.livingUnits.toLocaleString("en-CA")} living unit${dwelling.livingUnits === 1 ? "" : "s"}`
      : null,
    dwelling.bathrooms !== null
      ? `${dwelling.bathrooms.toLocaleString("en-CA")} bathroom${dwelling.bathrooms === 1 ? "" : "s"}`
      : null,
    dwelling.garage === null ? null : dwelling.garage ? "Garage" : "No garage",
    dwelling.underConstruction ? "Under construction" : null,
  ]
    .filter((fact): fact is string => fact !== null)
    .join(" · ");
}

function DwellingDetails({ state }: { state: DwellingState }) {
  const accounts = state.status === "ready" ? state.value : [];

  return (
    <section className="assessment-evidence dwelling-evidence" aria-label="PVSC dwellings">
      <h3>PVSC dwellings</h3>
      {state.status === "idle" || state.status === "loading" ? (
        <p className="assessment-status" role="status">
          Checking PVSC residential dwelling data…
        </p>
      ) : state.status === "blocked" ? (
        <p className="assessment-status" role="status">
          Dwelling records were not looked up because the PVSC assessment
          account lookup was unavailable.
        </p>
      ) : state.status === "geometry-unavailable" ? (
        <p className="assessment-status" role="status">
          Not evaluated — this PID&apos;s NSPRD geometry is unavailable, so no
          assessment account could be matched and the dwelling dataset was not
          asked.
        </p>
      ) : state.status === "no-account" ? (
        <p className="assessment-status" role="status">
          No PVSC assessment account was matched to this parcel, so the dwelling
          dataset could not be asked about it.
        </p>
      ) : state.status === "no-record-for-notice-aan" ? (
        <p className="assessment-status" role="status">
          The municipal notice supplied an AAN, but PVSC returned no assessment
          record for it, so the dwelling dataset was not asked.
        </p>
      ) : state.status === "error" ? (
        <p className="assessment-status error" role="status">
          PVSC dwelling data is unavailable. No absence is inferred.
        </p>
      ) : accounts.length === 0 ? (
        <p className="assessment-status">
          No residential dwelling record was returned for this parcel&apos;s
          matched accounts. This does not prove no building exists — commercial
          and other non-residential structures are not in this dataset.
        </p>
      ) : (
        <>
          <div className="assessment-accounts">
            {accounts.map((account) => (
              <article key={account.aan} className="assessment-account">
                {accounts.length > 1 ? <h4>AAN {account.aan}</h4> : null}
                <ul>
                  {account.dwellings.map((dwelling, index) => (
                    <li key={index}>
                      <strong>
                        {dwelling.yearBuilt !== null
                          ? `Built ${dwelling.yearBuilt}`
                          : "Build year not published"}
                      </strong>
                      <span>{dwellingFactsLabel(dwelling)}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="assessment-caveat">
            Assessment dwelling records are fresher than aerial mapping but are
            not a building census. Multi-unit parcels can repeat living-unit
            totals across records, and records do not establish current
            condition, occupancy, or permits.
          </p>
        </>
      )}
      <p className="assessment-source">
        Source: <a href={PVSC_DWELLING_DATASET_URL} target="_blank" rel="noreferrer">
          PVSC residential dwelling characteristics
        </a>{" "}
        · {PVSC_DWELLING_SOURCE_DATE}. {PVSC_OPEN_DATA_ATTRIBUTION}{" "}
        <a href={PVSC_OPEN_DATA_LICENCE_URL} target="_blank" rel="noreferrer">
          Licence
        </a>
        .
      </p>
    </section>
  );
}

function AssessmentDetails({
  state,
  listingPids,
}: {
  state: AssessmentState;
  listingPids: string[];
}) {
  const result = state.status === "ready" ? state.value : null;
  const accountCount = result?.accounts.length ?? 0;
  const heading = accountCount === 1
    ? "PVSC assessment account"
    : "PVSC assessment accounts";

  return (
    <section className="assessment-evidence" aria-label={heading}>
      <h3>{heading}</h3>
      {state.status === "idle" || state.status === "loading" ? (
        <p className="assessment-status" role="status">
          Checking PVSC open assessment data…
        </p>
      ) : state.status === "geometry-unavailable" ? (
        <p className="assessment-status" role="status">
          {GEOMETRY_UNAVAILABLE_MESSAGE} No spatial account match was
          attempted, and no municipal notice supplied an AAN.
        </p>
      ) : state.status === "error" ? (
        <p className="assessment-status error" role="status">
          PVSC open assessment data is unavailable. No absence is inferred.
        </p>
      ) : !result || result.accounts.length === 0 ? (
        <p className="assessment-status">
          {result?.matchMethod === "notice-aan"
            ? "No record was returned for the official notice AAN in the PVSC open dataset. This does not prove no assessment account exists."
            : "No PVSC account point from the open dataset was mapped inside this parcel. This does not prove no assessment account or assessed value exists."}
        </p>
      ) : (
        <>
          <p className="assessment-match">
            {result.matchMethod === "notice-aan"
              ? "Matched by official notice AAN."
              : result.accounts.length === 1
                ? "Matched by a PVSC account point inside the mapped parcel."
                : `${result.accounts.length} PVSC account points were mapped inside this parcel. Values are shown separately and are not summed.`}
          </p>
          {result.matchMethod === "notice-aan" && listingPids.length > 1 ? (
            <p className="assessment-warning">
              This notice AAN covers {listingPids.length} PIDs. These account
              values are not assigned to each PID individually.
            </p>
          ) : null}
          <div className="assessment-accounts">
            {result.accounts.map((account) => {
              const current = account.records[0];
              if (!current) return null;
              return (
                <article key={account.aan} className="assessment-account">
                  <h4>AAN {account.aan}</h4>
                  <dl>
                    <div>
                      <dt>Tax year</dt>
                      <dd>{current.taxYear}</dd>
                    </div>
                    <div>
                      <dt>Assessed value</dt>
                      <dd>{currency.format(current.assessedValue)}</dd>
                    </div>
                    <div>
                      <dt>Taxable assessment</dt>
                      <dd>{currency.format(current.taxableAssessedValue)}</dd>
                    </div>
                  </dl>
                  {account.records.length > 1 ? (
                    <details>
                      <summary>Assessment history</summary>
                      <ul>
                        {account.records.map((record) => (
                          <li key={record.taxYear}>
                            <strong>{record.taxYear}</strong>
                            <span>
                              {currency.format(record.assessedValue)} assessed ·{" "}
                              {currency.format(record.taxableAssessedValue)} taxable
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
          {result.accounts[0]?.records[0] ? (
            <p className="assessment-caveat">
              The {result.accounts[0].records[0].taxYear} assessment reflects
              market value as of January 1, {result.accounts[0].records[0].taxYear - 1}
              {" "}and physical state as of December 1, {result.accounts[0].records[0].taxYear - 1}.
              It is not today’s sale price or an appraisal. Taxable assessment may differ.
            </p>
          ) : null}
        </>
      )}
      <p className="assessment-source">
        Source: <a href={PVSC_ASSESSMENT_DATASET_URL} target="_blank" rel="noreferrer">
          PVSC assessed and taxable assessment history
        </a>{" "}
        · {PVSC_ASSESSMENT_SOURCE_DATE}. {PVSC_OPEN_DATA_ATTRIBUTION}{" "}
        <a href={PVSC_OPEN_DATA_LICENCE_URL} target="_blank" rel="noreferrer">
          Licence
        </a>
        .
      </p>
    </section>
  );
}

const COASTAL_HAZARD_MAP_URL = "https://nsgi.novascotia.ca/chm";
const PUBLISHED_RIVER_FLOOD_URL =
  "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/flood_risk_areas/MapServer";

function FloodHazardDetails({ state }: { state: FloodHazardState }) {
  if (state.status !== "ready") {
    return (
      <section className="flood-hazard-evidence" aria-label="Flood hazard evidence">
        <h3>Flood hazard evidence</h3>
        {state.status === "geometry-unavailable" ? (
          <p className="mapped-context-status" role="status">
            {GEOMETRY_UNAVAILABLE_MESSAGE}
          </p>
        ) : state.status === "error" ? (
          <p className="mapped-context-status error" role="status">
            Flood hazard mapping is unavailable right now; absence is not
            inferred.
          </p>
        ) : (
          <p className="mapped-context-status" role="status">
            Checking published river and coastal hazard mapping…
          </p>
        )}
      </section>
    );
  }

  const { river, coastal } = state.value;
  return (
    <section className="flood-hazard-evidence" aria-label="Flood hazard evidence">
      <h3>Flood hazard evidence</h3>
      <div className="flood-hazard-group">
        <h4>Published river mapping</h4>
        {river.status === "published-intersection" ? (
          <ul>
            {river.aep.map(({ annualExceedanceProbabilityPercent, relationship, places }) => (
              <li key={`${annualExceedanceProbabilityPercent}:${relationship}`}>
                {annualExceedanceProbabilityPercent}% annual-exceedance {relationship === "area" ? "flood area" : "boundary"} intersects the parcel ({places.join(", ")}).
              </li>
            ))}
          </ul>
        ) : river.status === "within-published-layer-extent" ? (
          <p>
            No published river flood geometry intersected. The parcel is within a
            published layer’s geographic extent, but the service has no study-coverage
            polygon; absence is not inferred.
          </p>
        ) : river.status === "outside-published-layer-extents" ? (
          <p>
            Outside the geographic extents of the four published river-flood study
            layers. River flood probability is not assessed.
          </p>
        ) : (
          <p className="error">Published river source unavailable; no absence is inferred.</p>
        )}
      </div>
      <div className="flood-hazard-group">
        <h4>Coastal scenarios</h4>
        {/* Compact status rows instead of three near-identical sentences;
            the distinct states (error vs no-intersection vs intersection)
            stay distinct, and the shared not-proof caveat renders once
            below whenever any row needs it. */}
        <ul className="coastal-scenario-list">
          {coastal.map((result) => {
            const label = result.scenario === "current" ? "Current" : result.scenario;
            if (result.status === "error") {
              return <li key={result.scenario}>{label}: source unavailable — no absence is inferred.</li>;
            }
            if (result.status === "geometry-unavailable") {
              return (
                <li key={result.scenario}>
                  {label}: not evaluated — this parcel has no usable outline to sample against.
                </li>
              );
            }
            // Nothing measured is not nothing found. A parcel that took no
            // sample gets its own row so the no-hit sentence keeps meaning a
            // parcel that was sampled and came back dry.
            if (result.status === "not-sampled") {
              return (
                <li key={result.scenario}>
                  {label}: this parcel is too small at the sampled resolution to read off the
                  scenario map, so nothing was measured.
                </li>
              );
            }
            if (result.status === "no-intersection") {
              return <li key={result.scenario}>{label}: no mapped pixels intersected this parcel.</li>;
            }
            const area = result.approximateAffectedSquareMetres === null
              ? ""
              : ` (${Math.round(result.approximateAffectedSquareMetres).toLocaleString("en-CA")} m²)`;
            return (
              <li key={result.scenario}>
                {label}: approximately {result.approximateAffectedPercent}% of mapped parcel area{area} intersects the scenario.
              </li>
            );
          })}
        </ul>
        {coastal.some(({ status }) => status === "no-intersection") ? (
          <p className="mapped-area-note">
            No intersecting pixels is not proof of no coastal hazard.
          </p>
        ) : null}
      </div>
      <p className="flood-hazard-caveat">
        A 1% or 5% annual-exceedance probability describes the mapped flood event,
        not a universal probability for the whole PID. Coastal 2050 and 2100 values
        are sea-level scenarios, not additional probabilities. Raster area is an
        approximate screen, not a survey, elevation certificate, or insurance finding.
      </p>
      <p className="flood-hazard-sources">
        Sources: <a href={PUBLISHED_RIVER_FLOOD_URL} target="_blank" rel="noreferrer">published river layers</a>{" "}
        and <a href={COASTAL_HAZARD_MAP_URL} target="_blank" rel="noreferrer">Nova Scotia Coastal Hazard Map</a>.{" "}
        Coastal data <a href={COASTAL_HAZARD_LICENCE_URL} target="_blank" rel="noreferrer">licence and notices</a>.
      </p>
      {/* Conditions of using the coastal data, not a credit line, so they are
          read from the catalogue the credit line, the printed page and the
          exported strip read rather than typed out again here. */}
      <div className="flood-hazard-licence-notice">
        {COASTAL_HAZARD_NOTICES.map((notice) => (
          <p key={notice}>{notice}</p>
        ))}
      </div>
    </section>
  );
}

/**
 * Why a road named only by a civic address might be missing from the list.
 *
 * Four different reasons, and one sentence for all of them said the file had
 * not answered when it had failed, or when it had answered in part.
 */
function civicAddressShortfallReason(state: CivicAddressState): string {
  if (state.status === "error") {
    return "The civic address file is unavailable right now, so a road named only by an address on this parcel would not be listed.";
  }
  if (state.status === "geometry-unavailable") {
    return "The civic address file was not asked — this PID's NSPRD geometry is unavailable — so a road named only by an address on this parcel would not be listed.";
  }
  if (state.status === "ready") {
    return "A civic address point here could not be read, so a road named only by that address would not be listed.";
  }
  return "The civic address file has not answered, so a road named only by an address on this parcel would not be listed.";
}

function CivicAddressDetails({ state }: { state: CivicAddressState }) {
  // A row the browser could not read is not a row that is not there. The list
  // and the absence sentence both have to say so, or a partial read reads as
  // proof that no address is mapped inside the parcel.
  const addresses = state.status === "ready" ? state.value.addresses : [];
  const unreadableRows = state.status === "ready" ? state.value.unreadableRows : 0;
  const heading =
    state.status === "ready" && addresses.length === 1
      ? "Mapped civic address"
      : "Mapped civic addresses";

  return (
    <section className="civic-addresses">
      <h3>{heading}</h3>
      <p className="civic-address-caveat prominent">
        <strong>Authoritative mapped civic points only.</strong>{" "}
        Mapped physical-address points are not proof of ownership, mailing
        address, access, occupancy, or legal parcel status.
      </p>
      {state.status === "idle" || state.status === "loading" ? (
        <p className="civic-address-status" role="status">
          Looking up mapped civic addresses…
        </p>
      ) : state.status === "geometry-unavailable" ? (
        <p className="civic-address-status" role="status">
          {GEOMETRY_UNAVAILABLE_MESSAGE}
        </p>
      ) : state.status === "error" ? (
        <p className="civic-address-status error" role="status">
          Civic address lookup is unavailable right now.
        </p>
      ) : addresses.length === 0 ? (
        <p className="civic-address-status">
          {unreadableRows > 0
            ? noReadableCivicAddresses(unreadableRows)
            : "No civic address point is mapped inside this parcel."}
        </p>
      ) : (
        <ul>
          {addresses.map(({ pntid, label, coordinates }) => {
            const plusCode = plusCodeForCoordinates(coordinates);

            return (
              <li key={pntid}>
                <span>{label}</span>
                <a
                  className="plus-code-link"
                  href={googleMapsDirectionsUrl(coordinates)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${plusCode} — Directions in Google Maps`}
                >
                  <span className="plus-code">{plusCode}</span>
                  <span>Directions in Google Maps</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {addresses.length > 0 && unreadableRows > 0 ? (
        <p className="civic-address-status">
          {civicAddressShortfall(unreadableRows)}
        </p>
      ) : null}
      <p className="civic-address-source">
        Source: {" "}
        <a href={CIVIC_ADDRESS_DATASET_URL} target="_blank" rel="noreferrer">
          Nova Scotia Civic Address File
        </a>
        .
      </p>
      <p className="civic-address-source">
        <span>{OPEN_GOVERNMENT_ATTRIBUTION}</span>{" "}
        <a
          href={OPEN_GOVERNMENT_LICENCE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open Government Licence – Nova Scotia
        </a>
      </p>
    </section>
  );
}

function MappedFeatureList({
  title,
  emptyMessage,
  features,
}: {
  title: string;
  emptyMessage: string;
  features: ParcelContext["roads"];
}) {
  const relationshipLabel = (
    relationship: ParcelContext["roads"][number]["relationship"],
  ) => {
    switch (relationship) {
      case "intersects":
        return "Intersects parcel";
      case "adjacent":
        return `Adjacent within ${ADJACENT_ROAD_DISTANCE_METRES} m`;
      case "civic-address":
        return "Named by civic address";
    }
  };

  return (
    <section className="mapped-context-group">
      <h3>{title}</h3>
      {features.length > 0 ? (
        <ul>
          {features.map(({ name, kind, relationship }) => (
            <li key={`${name}:${kind}:${relationship}`}>
              <strong>{name}</strong>
              <span>
                {name.toLocaleLowerCase() !== kind.toLocaleLowerCase()
                  ? `${kind} · `
                  : ""}
                {relationshipLabel(relationship)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyMessage}</p>
      )}
    </section>
  );
}

function MappedContextDetails({
  state,
  civicAddresses,
}: {
  state: ParcelContextState;
  civicAddresses: CivicAddressState;
}) {
  // Only the sources that actually answered may be named in the empty
  // sentence, and only a source read in full may be reported as having found
  // nothing. A lookup still loading, failed, or never run for want of
  // geometry has not looked; a lookup with unreadable rows has looked at part
  // of what it was sent, and one of those rows can carry a road name.
  const addressesAnswered = civicAddresses.status === "ready";
  const mappedRoads = state.status === "ready" ? state.value.roads : [];
  const civicRoads = addressesAnswered
    ? roadsNamedByCivicAddress(mappedRoads, civicAddresses.value.addresses)
    : [];
  const unreadableAddressRows = addressesAnswered
    ? civicAddresses.value.unreadableRows
    : 0;
  const addressesReadInFull = addressesAnswered && unreadableAddressRows === 0;

  // The road layers and the address file are two sources, and one failing is
  // not the other going quiet: a road the address file named belongs on the
  // panel whatever the NSTDB service did, which is what the printed appendix
  // already does.
  if (state.status !== "ready") {
    return (
      <div className="mapped-context">
        <p
          className={`mapped-context-status${state.status === "error" ? " error" : ""}`}
          role="status"
        >
          {state.status === "geometry-unavailable"
            ? GEOMETRY_UNAVAILABLE_MESSAGE
            : state.status === "error"
              ? "Mapped road and water intersections are unavailable right now."
              : "Loading mapped road and water intersections…"}
        </p>
        {civicRoads.length > 0 ? (
          <MappedFeatureList
            title="Roads named by civic address"
            emptyMessage="No civic address on this parcel names a road."
            features={civicRoads}
          />
        ) : null}
        {addressesReadInFull ? null : (
          <p className="road-access-caveat">
            {civicAddressShortfallReason(civicAddresses)}
          </p>
        )}
        {civicRoads.length > 0 ? (
          // The caveat belongs to the roads shown, whichever source named
          // them, so it cannot be left behind in the ready branch.
          <p className="road-access-caveat">
            Adjacency and civic addressing are useful map context, not proof of
            legal access or road frontage.
          </p>
        ) : null}
      </div>
    );
  }

  const roads = [...state.value.roads, ...civicRoads];

  return (
    <div className="mapped-context">
      <MappedFeatureList
        title="Roads at or beside parcel"
        emptyMessage={
          addressesReadInFull
            ? "No intersecting, adjacent, or civic-address road was found for this parcel."
            : "No mapped road intersects or runs beside this parcel."
        }
        features={roads}
      />
      {addressesReadInFull ? null : (
        // A list missing the roads one source would have named looks exactly
        // like a complete one, so the shortfall is said under it — naming the
        // reason the file's roads are missing, not one sentence for all four.
        <p className="road-access-caveat">
          {civicAddressShortfallReason(civicAddresses)}
        </p>
      )}
      <p className="road-access-caveat">
        Adjacency and civic addressing are useful map context, not proof of legal
        access or road frontage.
      </p>
      <MappedFeatureList
        title="Intersecting water features"
        emptyMessage="No mapped water feature intersects this parcel."
        features={state.value.water}
      />
    </div>
  );
}

function ParcelResourceDetails({ state }: { state: ParcelResourceState }) {
  if (state.status !== "ready") {
    return (
      <section className="parcel-resources" aria-label="Geology & resource context">
        <h3>Geology &amp; resource context</h3>
        {state.status === "geometry-unavailable" ? (
          <p className="mapped-context-status" role="status">
            {GEOMETRY_UNAVAILABLE_MESSAGE}
          </p>
        ) : state.status === "error" ? (
          <p className="mapped-context-status error" role="status">
            Resource sources are unavailable right now; absence is not
            inferred.
          </p>
        ) : (
          <p className="mapped-context-status" role="status">
            Checking official mapped resource sources against this parcel…
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="parcel-resources" aria-label="Geology & resource context">
      <h3>Geology &amp; resource context</h3>
      {resourceLayerCatalog.map((layer) => {
        const result = state.value[layer.id];
        return (
          <div className="parcel-resource-group" key={layer.id}>
            <h4>{layer.name}</h4>
            {result.status === "error" ? (
              <p className="mapped-context-status error">
                Source unavailable; no absence is inferred.
              </p>
            ) : result.intersections.length === 0 ? (
              <p>
                {layer.id === "mineral-occurrences"
                  ? "No published mineral occurrence was returned on or within 1 km of this parcel."
                  : "No mapped intersection was returned for this parcel."}
              </p>
            ) : (
              <ul>
                {result.intersections.map(({ id, name, detail, relationship }) => (
                  <li key={`${layer.id}:${id}`}>
                    <strong>{name}</strong>
                    {layer.id === "mineral-occurrences" ? (
                      <span>
                        {id} · {relationship === "on-parcel" ? "On parcel" : "Within 1 km"}
                      </span>
                    ) : null}
                    {detail ? <span>{detail}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            <a href={layer.sourceUrl} target="_blank" rel="noreferrer">
              {layer.name} source
            </a>
          </div>
        );
      })}
      <p className="resource-intersection-caveat">
        On-parcel and nearby published records are screening context only. This
        context does not prove mineralization, deposit extent, grade,
        recoverability, value, mineral rights, access, permission to explore, or
        source completeness.
      </p>
    </section>
  );
}

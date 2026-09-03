import type { ReactNode } from "react";
import {
  ADJACENT_ROAD_DISTANCE_METRES,
  roadsNamedByCivicAddress,
} from "../../services/parcelContext";
import {
  printEvidenceMessage,
  type PrintSnapshot,
} from "../../services/printSnapshot";
import type { PvscDwelling } from "../../services/pvscDwellings";
import {
  civicAddressShortfall,
  noReadableCivicAddresses,
} from "../../services/civicAddresses";
import {
  printEvidenceAttribution,
  type PrintEvidenceAttribution,
} from "../../services/printEvidenceAttribution";

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

function EvidenceProvenance({
  source,
  capturedAt,
}: {
  source: PrintEvidenceAttribution;
  capturedAt: string;
}) {
  return (
    <div className="print-evidence-provenance">
      <p>
        Source:{" "}
        <a href={source.sourceUrl} target="_blank" rel="noreferrer">
          {source.label}
        </a>
      </p>
      <p>{source.sourceDate}</p>
      <p>Captured for print: {capturedAt}</p>
      <p>Authority: {source.authority}</p>
      <p>Limitation: {source.limitation}</p>
      <p>{source.attribution}</p>
      <p>
        Licence:{" "}
        <a href={source.licenceUrl} target="_blank" rel="noreferrer">
          {source.licenceUrl}
        </a>
      </p>
    </div>
  );
}

function EvidenceSection({
  heading,
  source,
  snapshot,
  children,
}: {
  heading: string;
  source: PrintEvidenceAttribution;
  snapshot: PrintSnapshot;
  children: ReactNode;
}) {
  return (
    <section className="print-evidence-section">
      <h3>{heading}</h3>
      {children}
      <EvidenceProvenance source={source} capturedAt={snapshot.capturedAt} />
    </section>
  );
}

function SelectedEvents({ snapshot }: { snapshot: PrintSnapshot }) {
  const eventsById = new Map(snapshot.events.map((event) => [event.id, event]));
  const selectedEvents = [...new Set(snapshot.eventIds)].flatMap((id) => {
    const event = eventsById.get(id);
    return event ? [event] : [];
  });

  return (
    <EvidenceSection
      heading="Selected tax-sale events"
      source={printEvidenceAttribution("nsprd-selected-geometry")}
      snapshot={snapshot}
    >
      {selectedEvents.length === 0 ? (
        <p>No selected tax-sale event evidence was captured.</p>
      ) : (
        selectedEvents.map((event) => (
          <article key={event.id} className="print-evidence-event">
            <h4>{event.name}</h4>
            <p>Status: {event.status}</p>
            {event.facts.map((fact) => (
              <p key={`${event.id}-${fact.label}-${fact.value}`}>
                {fact.label}: {fact.value}
              </p>
            ))}
            {event.sources.map((source) => (
              <p key={`${event.id}-${source.sourceUrl}`}>
                Source:{" "}
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                  {source.label}
                </a>
              </p>
            ))}
            <p>{event.limitation}</p>
          </article>
        ))
      )}
    </EvidenceSection>
  );
}

function MappedArea({ snapshot }: { snapshot: PrintSnapshot }) {
  const area = snapshot.evidence.mappedArea;
  return (
    <EvidenceSection
      heading="Mapped parcel area"
      source={printEvidenceAttribution("nsprd-selected-geometry")}
      snapshot={snapshot}
    >
      {area ? (
        <>
          <p>{area.squareMetres.toLocaleString("en-CA")} m²</p>
          <p>{area.acres.toLocaleString("en-CA")} acres</p>
        </>
      ) : (
        <p>No mapped parcel area returned.</p>
      )}
    </EvidenceSection>
  );
}

function Buildings({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.buildings;
  let result: ReactNode;
  if (state.status !== "ready") {
    result = <p>{printEvidenceMessage(state)}</p>;
  } else if (state.value.count === 0) {
    result = <p>No mapped building feature returned.</p>;
  } else {
    result = (
      <p>
        {state.value.count} mapped building feature
        {state.value.count === 1 ? "" : "s"}: {state.value.pointCount} point and{" "}
        {state.value.polygonCount} polygon.
      </p>
    );
  }
  return (
    <EvidenceSection
      heading="Mapped buildings"
      source={printEvidenceAttribution("building-evidence")}
      snapshot={snapshot}
    >
      {result}
    </EvidenceSection>
  );
}

function assessmentMatchDescription(matchMethod: "notice-aan" | "spatial") {
  return matchMethod === "notice-aan"
    ? "Matched directly from the municipal notice AAN."
    : "Matched by published account points inside the mapped parcel geometry.";
}

function Assessments({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.assessments;
  let result: ReactNode;
  if (state.status !== "ready") {
    result = <p>{printEvidenceMessage(state)}</p>;
  } else {
    result = (
      <>
        <p>{assessmentMatchDescription(state.value.matchMethod)}</p>
        {state.value.accounts.length === 0 ? (
          <p>No assessment account returned by the named source.</p>
        ) : (
          <ul>
            {state.value.accounts.map((account) => (
              <li key={account.aan}>
                <strong>AAN {account.aan}</strong>
                <ul>
                  {account.records.map((record) => (
                    <li key={record.taxYear}>
                      {record.taxYear}: {currency.format(record.assessedValue)}{" "}
                      assessed; {currency.format(record.taxableAssessedValue)}{" "}
                      taxable.
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <EvidenceSection
      heading="Assessment accounts"
      source={printEvidenceAttribution("pvsc-assessments")}
      snapshot={snapshot}
    >
      {result}
    </EvidenceSection>
  );
}

function dwellingFacts(dwelling: PvscDwelling): string {
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

function Dwellings({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.dwellings;
  let result: ReactNode;
  if (state.status !== "ready") {
    result = <p>{printEvidenceMessage(state)}</p>;
  } else if (state.value.length === 0) {
    result = (
      <p>
        No residential dwelling record was returned for the matched accounts.
        This does not prove no building exists; commercial and other
        non-residential structures are not in this dataset.
      </p>
    );
  } else {
    result = (
      <ul>
        {state.value.map((account) => (
          <li key={account.aan}>
            <strong>AAN {account.aan}</strong>
            <ul>
              {account.dwellings.map((dwelling, index) => (
                <li key={index}>
                  <strong>
                    {dwelling.yearBuilt !== null
                      ? `Built ${dwelling.yearBuilt}`
                      : "Build year not published"}
                  </strong>
                  <span>{dwellingFacts(dwelling)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <EvidenceSection
      heading="PVSC dwelling characteristics"
      source={printEvidenceAttribution("pvsc-dwellings")}
      snapshot={snapshot}
    >
      {result}
    </EvidenceSection>
  );
}

function Addresses({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.civicAddresses;
  let result: ReactNode;
  if (state.status !== "ready") {
    result = <p>{printEvidenceMessage(state)}</p>;
  } else if (state.value.addresses.length === 0) {
    // A printed absence outlives the session that produced it. It may only be
    // written when every returned row was read.
    result = (
      <p>
        {state.value.unreadableRows > 0
          ? noReadableCivicAddresses(state.value.unreadableRows)
          : "No mapped record returned by the named source."}
      </p>
    );
  } else {
    result = (
      <>
        <ul>
          {state.value.addresses.map((address) => (
            <li key={address.pntid}>
              {address.label} (PNTID {address.pntid})
            </li>
          ))}
        </ul>
        {state.value.unreadableRows > 0 ? (
          <p>{civicAddressShortfall(state.value.unreadableRows)}</p>
        ) : null}
      </>
    );
  }

  return (
    <EvidenceSection
      heading="Civic addresses"
      source={printEvidenceAttribution("civic-addresses")}
      snapshot={snapshot}
    >
      {result}
    </EvidenceSection>
  );
}

const relationshipLabel = {
  intersects: "Intersects parcel",
  // The distance the road query actually asked for, so a printed sheet can
  // never name a distance the lookup did not use.
  adjacent: `Adjacent within ${ADJACENT_ROAD_DISTANCE_METRES} m`,
  "civic-address": "Named by civic address",
  "on-parcel": "On parcel",
  "within-1km": "Within 1 km",
} as const;

function ContextList({
  features,
}: {
  features: readonly {
    readonly name: string;
    readonly kind: string;
    readonly relationship: "intersects" | "adjacent" | "civic-address";
  }[];
}) {
  if (features.length === 0) {
    return <p>No mapped record returned by the named source.</p>;
  }
  return (
    <ul>
      {features.map((feature, index) => (
        <li key={`${feature.name}-${index}`}>
          {feature.name} ({feature.kind}) —{" "}
          {relationshipLabel[feature.relationship]}
        </li>
      ))}
    </ul>
  );
}

function Context({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.mappedContext;
  const addresses = snapshot.evidence.civicAddresses;
  // Roads and water come from one lookup, so one unsettled sentence serves
  // both sections, and it is the state's own.
  const unsettled =
    state.status === "ready" ? null : <p>{printEvidenceMessage(state)}</p>;
  // The panel merges the addressed roads into one list. On paper they get
  // their own section instead, so the NSTDB provenance block below the mapped
  // list never credits a road name the address file supplied. Before this the
  // printed sheet simply dropped a road the reader had just seen on screen.
  const civicRoads =
    addresses.status === "ready"
      ? roadsNamedByCivicAddress(
          state.status === "ready" ? state.value.roads : [],
          addresses.value.addresses,
        )
      : [];
  // A partial read is not an answer about the whole parcel: one of the rows
  // that could not be read may carry a road name.
  const addressesReadInFull =
    addresses.status === "ready" && addresses.value.unreadableRows === 0;

  return (
    <>
      <EvidenceSection
        heading="Mapped roads"
        source={printEvidenceAttribution("road-evidence")}
        snapshot={snapshot}
      >
        {state.status === "ready" ? (
          <ContextList features={state.value.roads} />
        ) : (
          unsettled
        )}
      </EvidenceSection>
      <EvidenceSection
        heading="Roads named by civic address"
        source={printEvidenceAttribution("civic-addresses")}
        snapshot={snapshot}
      >
        {addresses.status !== "ready" ? (
          // The four ways it can be missing are four different sentences: the
          // appendix already prints the state's own reason above, and this
          // line must not contradict it.
          <p>
            {printEvidenceMessage(addresses)} A road named only by a civic
            address on this parcel would not be listed.
          </p>
        ) : (
          <>
            {civicRoads.length > 0 ? (
              <ContextList features={civicRoads} />
            ) : addressesReadInFull && state.status === "ready" ? (
              <p>
                No civic address on this parcel names a road the mapped road
                layers did not already return.
              </p>
            ) : addressesReadInFull ? (
              <p>No civic address on this parcel names a road.</p>
            ) : null}
            {addressesReadInFull ? null : (
              <p>
                A civic address point here could not be read, so a road named
                only by that address would not be listed.
              </p>
            )}
          </>
        )}
      </EvidenceSection>
      <EvidenceSection
        heading="Mapped water"
        source={printEvidenceAttribution("water-evidence")}
        snapshot={snapshot}
      >
        {state.status === "ready" ? (
          <ContextList features={state.value.water} />
        ) : (
          unsettled
        )}
      </EvidenceSection>
    </>
  );
}

function RiverResult({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.riverFlood;
  // A flood lookup that never settled and a river source that answered badly
  // are different reasons for the same blank, and the reader is owed the one
  // that happened. The coastal source's silence is not one of those reasons:
  // it has its own slot, and this half prints what the river source said.
  if (state.status !== "ready") {
    return (
      <>
        <p>{printEvidenceMessage(state)}</p>
        <p>No absence of published river mapping is inferred.</p>
      </>
    );
  }
  if (state.value.status === "error") {
    return (
      <p>
        Published river source unavailable at export time; no absence is
        inferred.
      </p>
    );
  }
  const river = state.value;
  if (river.status === "outside-published-layer-extents") {
    return <p>Outside published river-study extents.</p>;
  }
  if (river.status === "within-published-layer-extent") {
    return (
      <p>
        Within a published layer extent; no study coverage or parcel probability
        is implied.
      </p>
    );
  }
  return (
    <ul>
      {river.aep.map((entry) => (
        <li
          key={`${entry.annualExceedanceProbabilityPercent}-${entry.relationship}`}
        >
          {entry.annualExceedanceProbabilityPercent}% AEP {entry.relationship}:{" "}
          {entry.places.join(", ")}
        </li>
      ))}
    </ul>
  );
}

function CoastalResult({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.coastalFlood;
  if (state.status !== "ready") {
    return (
      <>
        <p>{printEvidenceMessage(state)}</p>
        <p>No absence of coastal hazard is inferred.</p>
      </>
    );
  }
  if (state.value.length === 0) {
    return <p>No coastal scenario result was captured.</p>;
  }
  return (
    <ul>
      {state.value.map((scenario) => {
        if (scenario.status === "error") {
          return (
            <li key={scenario.scenario}>
              {scenario.scenario}: source unavailable at export time; no absence
              is inferred.
            </li>
          );
        }
        if (scenario.status === "geometry-unavailable") {
          return (
            <li key={scenario.scenario}>
              {scenario.scenario}: not evaluated — this parcel had no usable
              outline to sample against at export time.
            </li>
          );
        }
        if (scenario.status === "unanswered") {
          return (
            <li key={scenario.scenario}>
              {scenario.scenario}: the scenario service had not answered when
              this page was made, so nothing was measured. Its silence is not
              evidence that the scenario misses this parcel.
            </li>
          );
        }
        if (scenario.status === "not-sampled") {
          return (
            <li key={scenario.scenario}>
              {scenario.scenario}: this parcel is too small at the sampled
              resolution to read off the scenario map, so nothing was measured.
              No share of the parcel is reported.
            </li>
          );
        }
        if (scenario.status === "no-intersection") {
          return (
            <li key={scenario.scenario}>
              <p>
                No {scenario.scenario} map pixels intersected this parcel; this
                is not proof of no coastal hazard.
              </p>
              <p>
                {scenario.stormAnnualExceedanceProbabilityPercent}% AEP storm
                surge; {scenario.sampledParcelPixels.toLocaleString("en-CA")}{" "}
                parcel pixels sampled; approximately{" "}
                {scenario.approximateAffectedPercent}% and{" "}
                {scenario.approximateAffectedSquareMetres?.toLocaleString(
                  "en-CA",
                ) ?? "unknown"}{" "}
                m² affected.
              </p>
            </li>
          );
        }
        return (
          <li key={scenario.scenario}>
            <p>
              {scenario.scenario}: approximately{" "}
              {scenario.approximateAffectedPercent}% of sampled parcel pixels
              affected.
            </p>
            <p>
              {scenario.stormAnnualExceedanceProbabilityPercent}% AEP storm
              surge; {scenario.sampledParcelPixels.toLocaleString("en-CA")}{" "}
              parcel pixels sampled; approximately{" "}
              {scenario.approximateAffectedSquareMetres?.toLocaleString(
                "en-CA",
              ) ?? "unknown"}{" "}
              m² affected.
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function FloodHazard({ snapshot }: { snapshot: PrintSnapshot }) {
  return (
    <section className="print-evidence-section">
      <h3>Flood evidence</h3>
      <section aria-labelledby="print-river-evidence">
        <h4 id="print-river-evidence">Published river mapping</h4>
        <RiverResult snapshot={snapshot} />
        <EvidenceProvenance
          source={printEvidenceAttribution("published-river-flood-evidence")}
          capturedAt={snapshot.capturedAt}
        />
      </section>
      <section aria-labelledby="print-coastal-evidence">
        <h4 id="print-coastal-evidence">Coastal scenarios</h4>
        <CoastalResult snapshot={snapshot} />
        <EvidenceProvenance
          source={printEvidenceAttribution("coastal-flood-evidence")}
          capturedAt={snapshot.capturedAt}
        />
      </section>
    </section>
  );
}

function Resources({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.resources;
  const entries = [
    {
      id: "mineral-occurrences" as const,
      label: "Mineral occurrences",
      source: printEvidenceAttribution("mineral-occurrence-evidence"),
    },
    {
      id: "mineral-tenure" as const,
      label: "Mineral tenure",
      source: printEvidenceAttribution("mineral-tenure-evidence"),
    },
    {
      id: "abandoned-mines" as const,
      label: "Abandoned mine openings",
      source: printEvidenceAttribution("abandoned-mine-evidence"),
    },
  ];

  return (
    <section className="print-evidence-section">
      <h3>Resources</h3>
      {entries.map(({ id, label, source }) => {
        let result: ReactNode;
        if (state.status !== "ready") {
          result = <p>{label}: {printEvidenceMessage(state)}</p>;
        } else if (state.value[id].status === "error") {
          result = <p>{label}: Source unavailable at export time.</p>;
        } else if (state.value[id].intersections.length === 0) {
          result = <p>{label}: No mapped record returned by the named source.</p>;
        } else {
          result = (
            <ul>
              {state.value[id].intersections.map((entry) => (
                <li key={entry.id}>
                  {entry.name}
                  {entry.relationship
                    ? ` — ${relationshipLabel[entry.relationship]}`
                    : ""}
                  {entry.detail ? `: ${entry.detail}` : ""}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <section key={id} aria-label={label}>
            <h4>{label}</h4>
            {result}
            <EvidenceProvenance
              source={source}
              capturedAt={snapshot.capturedAt}
            />
          </section>
        );
      })}
    </section>
  );
}

export function PrintEvidenceAppendix({
  snapshot,
}: {
  snapshot: PrintSnapshot;
}) {
  return (
    <section
      className="print-page print-evidence-page"
      aria-labelledby="print-evidence-appendix"
    >
      <header className="print-appendix-header">
        <h2 id="print-evidence-appendix">Evidence appendix</h2>
        <p>PID {snapshot.pid}</p>
      </header>
      <p>
        This appendix preserves the captured evidence state, including
        unavailable, unanswered, and no-hit results. Screening results are not
        legal, survey, access, condition, value, permission, service, or
        feasibility conclusions.
      </p>
      {snapshot.taxSaleEnabled ? <SelectedEvents snapshot={snapshot} /> : null}
      <MappedArea snapshot={snapshot} />
      <Buildings snapshot={snapshot} />
      <Assessments snapshot={snapshot} />
      <Dwellings snapshot={snapshot} />
      <Addresses snapshot={snapshot} />
      <Context snapshot={snapshot} />
      <FloodHazard snapshot={snapshot} />
      <Resources snapshot={snapshot} />
    </section>
  );
}

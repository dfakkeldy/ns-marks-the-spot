import type { ReactNode } from "react";
import type { PrintSnapshot } from "../../services/printSnapshot";
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
    result = <p>Source unavailable at export time.</p>;
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
    result = <p>Source unavailable at export time.</p>;
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

function Addresses({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.civicAddresses;
  let result: ReactNode;
  if (state.status !== "ready") {
    result = <p>Source unavailable at export time.</p>;
  } else if (state.value.length === 0) {
    result = <p>No mapped record returned by the named source.</p>;
  } else {
    result = (
      <ul>
        {state.value.map((address) => (
          <li key={address.pntid}>
            {address.label} (PNTID {address.pntid})
          </li>
        ))}
      </ul>
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
  adjacent: "Adjacent within 20 m",
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
  const unavailable = <p>Source unavailable at export time.</p>;

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
          unavailable
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
          unavailable
        )}
      </EvidenceSection>
    </>
  );
}

function RiverResult({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.floodHazard;
  if (state.status !== "ready" || state.value.river.status === "error") {
    return (
      <p>
        Published river source unavailable at export time; no absence is
        inferred.
      </p>
    );
  }
  const river = state.value.river;
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
  const state = snapshot.evidence.floodHazard;
  if (state.status !== "ready") {
    return (
      <p>
        Coastal source unavailable at export time; no absence is inferred.
      </p>
    );
  }
  if (state.value.coastal.length === 0) {
    return <p>No coastal scenario result was captured.</p>;
  }
  return (
    <ul>
      {state.value.coastal.map((scenario) => {
        if (scenario.status === "error") {
          return (
            <li key={scenario.scenario}>
              {scenario.scenario}: source unavailable at export time; no absence
              is inferred.
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
        if (state.status !== "ready" || state.value[id].status === "error") {
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
        unavailable and no-hit results. Screening results are not legal,
        survey, access, condition, value, permission, service, or feasibility
        conclusions.
      </p>
      <SelectedEvents snapshot={snapshot} />
      <MappedArea snapshot={snapshot} />
      <Buildings snapshot={snapshot} />
      <Assessments snapshot={snapshot} />
      <Addresses snapshot={snapshot} />
      <Context snapshot={snapshot} />
      <FloodHazard snapshot={snapshot} />
      <Resources snapshot={snapshot} />
    </section>
  );
}

import type { PrintSnapshot } from "../../services/printSnapshot";

const currency = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

function Buildings({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.buildings;
  if (state.status === "pending") return <p>Source unavailable at export time.</p>;
  if (state.status === "error") return <p>Source unavailable at export time.</p>;
  if (state.value.count === 0) return <p>No mapped building feature returned.</p>;
  return <p>{state.value.count} mapped building feature{state.value.count === 1 ? "" : "s"}: {state.value.pointCount} point and {state.value.polygonCount} polygon.</p>;
}

function Assessments({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.assessments;
  if (state.status === "pending") return <p>Source unavailable at export time.</p>;
  if (state.status === "error") return <p>Source unavailable at export time.</p>;
  if (state.value.accounts.length === 0) return <p>No assessment account returned by the named source.</p>;
  return <ul>{state.value.accounts.map((account) => (
    <li key={account.aan}>
      <strong>AAN {account.aan}</strong>
      <ul>{account.records.map((record) => (
        <li key={record.taxYear}>{record.taxYear}: {currency.format(record.assessedValue)} assessed; {currency.format(record.taxableAssessedValue)} taxable.</li>
      ))}</ul>
    </li>
  ))}</ul>;
}

function Addresses({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.civicAddresses;
  if (state.status === "pending") return <p>Source unavailable at export time.</p>;
  if (state.status === "error") return <p>Source unavailable at export time.</p>;
  if (state.value.length === 0) return <p>No mapped record returned by the named source.</p>;
  return <ul>{state.value.map((address) => <li key={address.pntid}>{address.label} (PNTID {address.pntid})</li>)}</ul>;
}

const relationshipLabel = {
  intersects: "Intersects parcel",
  adjacent: "Adjacent within 20 m",
  "civic-address": "Named by civic address",
  "on-parcel": "On parcel",
  "within-1km": "Within 1 km",
} as const;

function Context({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.mappedContext;
  if (state.status === "pending") return <p>Source unavailable at export time.</p>;
  if (state.status === "error") return <p>Source unavailable at export time.</p>;
  const features = [...state.value.roads, ...state.value.water];
  if (features.length === 0) return <p>No mapped record returned by the named source.</p>;
  return <ul>{features.map((feature, index) => (
    <li key={`${feature.name}-${index}`}>{feature.name} ({feature.kind}) — {relationshipLabel[feature.relationship]}</li>
  ))}</ul>;
}

function FloodHazard({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.floodHazard;
  if (state.status === "pending") return <p>Source unavailable at export time.</p>;
  if (state.status === "error") return <p>Source unavailable at export time.</p>;
  const { river, coastal } = state.value;
  if (river.status === "outside-published-layer-extents") return <p>Outside published river-study extents.</p>;
  if (river.status === "within-published-layer-extent") return <p>Within a published layer extent; no study coverage or parcel probability is implied.</p>;
  if (river.status === "error") return <p>Source unavailable at export time.</p>;
  return (
    <>
      <ul>{river.aep.map((entry) => <li key={`${entry.annualExceedanceProbabilityPercent}-${entry.relationship}`}>{entry.annualExceedanceProbabilityPercent}% AEP {entry.relationship}: {entry.places.join(", ")}</li>)}</ul>
      {coastal.length > 0 ? (
        <ul>{coastal.map((scenario) => {
          if (scenario.status === "error") {
            return <li key={scenario.scenario}>{scenario.scenario}: Source unavailable at export time.</li>;
          }
          return <li key={scenario.scenario}>{scenario.scenario}: {scenario.status}; approximately {scenario.approximateAffectedPercent}% of sampled parcel pixels affected.</li>;
        })}</ul>
      ) : null}
    </>
  );
}

function Resources({ snapshot }: { snapshot: PrintSnapshot }) {
  const state = snapshot.evidence.resources;
  if (state.status === "pending") return <p>Source unavailable at export time.</p>;
  if (state.status === "error") return <p>Source unavailable at export time.</p>;
  const results = [
    state.value["mineral-occurrences"],
    state.value["mineral-tenure"],
    state.value["abandoned-mines"],
  ];
  return <ul>{results.map((result, index) => {
    const source = ["Mineral occurrences", "Mineral tenure", "Abandoned mine openings"][index];
    if (result.status === "error") return <li key={source}>{source}: Source unavailable at export time.</li>;
    if (result.intersections.length === 0) return <li key={source}>{source}: No mapped record returned by the named source.</li>;
    return <li key={source}>{source}<ul>{result.intersections.map((entry) => (
      <li key={entry.id}>{entry.name}{entry.relationship ? ` — ${relationshipLabel[entry.relationship]}` : ""}{entry.detail ? `: ${entry.detail}` : ""}</li>
    ))}</ul></li>;
  })}</ul>;
}

export function PrintEvidenceAppendix({ snapshot }: { snapshot: PrintSnapshot }) {
  return (
    <section className="print-page print-evidence-page" aria-labelledby="print-evidence-appendix">
      <header className="print-appendix-header"><h2 id="print-evidence-appendix">Evidence appendix</h2><p>PID {snapshot.pid}</p></header>
      <section className="print-evidence-section"><h3>Mapped buildings</h3><Buildings snapshot={snapshot} /></section>
      <section className="print-evidence-section"><h3>Assessment accounts</h3><Assessments snapshot={snapshot} /></section>
      <section className="print-evidence-section"><h3>Civic addresses</h3><Addresses snapshot={snapshot} /></section>
      <section className="print-evidence-section"><h3>Mapped roads and water</h3><Context snapshot={snapshot} /></section>
      <section className="print-evidence-section"><h3>Flood evidence</h3><FloodHazard snapshot={snapshot} /></section>
      <section className="print-evidence-section"><h3>Resources</h3><Resources snapshot={snapshot} /></section>
    </section>
  );
}

import type { MapMode, MapPosition } from "./mapShareState";
import {
  PVSC_ASSESSMENT_DATASET_URL,
  PVSC_ASSESSMENT_SOURCE_DATE,
  PVSC_OPEN_DATA_ATTRIBUTION,
  PVSC_OPEN_DATA_LICENCE_URL,
  type ParcelAssessmentResult,
} from "./pvscAssessments";
import {
  PVSC_DWELLING_DATASET_URL,
  PVSC_DWELLING_SOURCE_DATE,
  type PvscDwelling,
  type PvscDwellingAccount,
} from "./pvscDwellings";

type EvidenceSource = {
  name: string;
  sourceUrl: string;
  sourceDate: string;
};

type EvidenceResult = {
  name: string;
  sourceUrl: string;
  status: "ready" | "error";
  results: string[];
  emptyMessage?: string;
};

type EvidenceEvent = {
  name: string;
  sources: Array<{ label: string; sourceUrl: string }>;
};

type AssessmentEvidence =
  | { status: "ready"; result: ParcelAssessmentResult }
  | { status: "error" };

type DwellingEvidence =
  | { status: "ready"; accounts: PvscDwellingAccount[] }
  | { status: "error" }
  | { status: "blocked" };

export type EvidenceNoteInput = {
  generatedAt: Date;
  pid: string;
  mode: MapMode;
  shareUrl: string;
  position: MapPosition;
  activeLayers: EvidenceSource[];
  events: EvidenceEvent[];
  civicAddresses: Array<{ label: string; sourceUrl: string }>;
  assessmentEvidence: AssessmentEvidence;
  dwellingEvidence: DwellingEvidence;
  resourceResults: EvidenceResult[];
};

export type EvidenceNote = {
  filename: string;
  markdown: string;
};

function filenameTimestamp(date: Date): string {
  return date.toISOString().replace(/\.000Z$/u, "Z").replace(/:/gu, "-");
}

function resultLines(result: EvidenceResult): string[] {
  if (result.status === "error") {
    return [`- ${result.name}: source unavailable at export time.`];
  }
  if (result.results.length === 0) {
    return [`- ${result.name}: ${result.emptyMessage ?? "No mapped intersection returned."}`];
  }
  return result.results.map((item) => `- ${result.name}: ${item}`);
}

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

function assessmentLines(evidence: AssessmentEvidence): string[] {
  if (evidence.status === "error") {
    return ["PVSC assessment source unavailable at export time."];
  }

  const { accounts, matchMethod } = evidence.result;
  if (accounts.length === 0) {
    return [
      matchMethod === "notice-aan"
        ? "No PVSC assessment history was returned for the municipal notice AAN."
        : "No PVSC assessment account point was returned inside the mapped parcel geometry.",
    ];
  }

  const methodNote = matchMethod === "notice-aan"
    ? "This account was matched directly from the municipal notice AAN."
    : "These accounts were spatially matched using their published point coordinates and the mapped parcel geometry.";
  const multipleNote = accounts.length > 1
    ? ["", "Multiple assessment accounts were returned. They are kept separate and are not summed."]
    : [];
  const accountLines = accounts.flatMap(({ aan, records }) => [
    "",
    `### AAN ${aan}`,
    "",
    ...records.map(
      ({ taxYear, assessedValue, taxableAssessedValue }) =>
        `- ${taxYear}: assessed ${currency.format(assessedValue)}; taxable assessed ${currency.format(taxableAssessedValue)}`,
    ),
  ]);

  return [methodNote, ...multipleNote, ...accountLines];
}

function dwellingFacts(dwelling: PvscDwelling): string {
  return [
    dwelling.yearBuilt !== null
      ? `built ${dwelling.yearBuilt}`
      : "build year not published",
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
    dwelling.garage === null ? null : dwelling.garage ? "garage" : "no garage",
    dwelling.underConstruction ? "under construction" : null,
  ]
    .filter((fact): fact is string => fact !== null)
    .join(" · ");
}

function dwellingLines(evidence: DwellingEvidence): string[] {
  if (evidence.status === "error") {
    return ["PVSC residential dwelling source unavailable at export time."];
  }
  if (evidence.status === "blocked") {
    return [
      "Dwelling records were not looked up because no PVSC assessment account could be resolved.",
    ];
  }
  if (evidence.accounts.length === 0) {
    return [
      "No residential dwelling record was returned for the matched assessment accounts. This does not prove no building exists; commercial and other non-residential structures are not in this dataset.",
    ];
  }
  return evidence.accounts.flatMap(({ aan, dwellings }) => [
    "",
    `### AAN ${aan}`,
    "",
    ...dwellings.map((dwelling) => `- ${dwellingFacts(dwelling)}`),
  ]);
}

export function buildEvidenceNote(input: EvidenceNoteInput): EvidenceNote {
  const generated = input.generatedAt.toISOString();
  const layers = input.activeLayers.length > 0
    ? input.activeLayers.map(
        ({ name, sourceUrl, sourceDate }) =>
          `- [${name}](${sourceUrl}) — ${sourceDate}`,
      )
    : ["- No optional map layers enabled."];
  const civic = input.civicAddresses.length > 0
    ? input.civicAddresses.map(
        ({ label, sourceUrl }) => `- [${label}](${sourceUrl})`,
      )
    : ["- No mapped civic address point returned inside the parcel."];
  const resources = input.resourceResults.flatMap(resultLines);
  const assessments = assessmentLines(input.assessmentEvidence);
  const dwellings = dwellingLines(input.dwellingEvidence);
  const events = input.events.length > 0
    ? input.events.flatMap(({ name, sources }) => [
        `### ${name}`,
        "",
        ...sources.map(
          ({ label, sourceUrl }) => `- [${label}](${sourceUrl})`,
        ),
      ])
    : ["No included municipal event is associated with this parcel in the selected mode."];

  const markdown = [
    "# NS Marks The Spot parcel evidence note",
    "",
    `Generated: ${generated}`,
    `PID: ${input.pid}`,
    `Mode: ${input.mode === "current" ? "Current notices" : "Historical records"}`,
    `Map position: ${input.position.latitude.toFixed(5)}, ${input.position.longitude.toFixed(5)} at zoom ${input.position.zoom}`,
    `[Open this map state](${input.shareUrl})`,
    "",
    "## Event",
    "",
    ...events,
    "",
    "## Active map sources",
    "",
    ...layers,
    "",
    "## Authoritative mapped civic points",
    "",
    ...civic,
    "",
    "Mapped physical-address points are not proof of ownership, access, occupancy, mailing address, or legal parcel status.",
    "",
    "## PVSC assessment accounts",
    "",
    ...assessments,
    "",
    `[PVSC assessed-value history open-data source](${PVSC_ASSESSMENT_DATASET_URL}) — ${PVSC_ASSESSMENT_SOURCE_DATE}`,
    `[Open Data & Information Government Licence](${PVSC_OPEN_DATA_LICENCE_URL})`,
    PVSC_OPEN_DATA_ATTRIBUTION,
    "",
    "Assessment values are dated public assessment records, not a current market appraisal or sale price. A point-in-parcel match is screening evidence and does not establish title, ownership, legal parcel-account linkage, or that every account associated with the parcel was returned.",
    "",
    "## PVSC residential dwelling records",
    "",
    ...dwellings,
    "",
    `[PVSC residential dwelling characteristics open-data source](${PVSC_DWELLING_DATASET_URL}) — ${PVSC_DWELLING_SOURCE_DATE}`,
    "",
    "Assessment dwelling records are fresher than aerial mapping but are not a building census. Multi-unit parcels can repeat living-unit totals across records, and records do not establish current condition, occupancy, or permits.",
    "",
    "## Geology and resource context",
    "",
    ...resources,
    ...input.resourceResults.map(
      ({ name, sourceUrl }) => `- [${name} source](${sourceUrl})`,
    ),
    "",
    "Mapped intersections and proximity to a published record are screening evidence only. A returned-empty result does not prove absence. This evidence does not prove mineralization, deposit extent, grade, recoverability, value, mineral rights, access, permission to explore, or completeness of the published inventory.",
    "",
    "## General limitations",
    "",
    "NSPRD geometry and mapped area are approximate and are not a legal survey. Road adjacency and civic addressing do not prove legal access or frontage. Tax-sale notices and results are dated source records and require current verification with the municipality.",
    "",
  ].join("\n");

  return {
    filename: `ns-marks-evidence-${input.pid}-${filenameTimestamp(input.generatedAt)}.md`,
    markdown,
  };
}

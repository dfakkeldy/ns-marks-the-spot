import type { MapMode, MapPosition } from "./mapShareState";

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

export type EvidenceNoteInput = {
  generatedAt: Date;
  pid: string;
  mode: MapMode;
  shareUrl: string;
  position: MapPosition;
  activeLayers: EvidenceSource[];
  events: EvidenceEvent[];
  civicAddresses: Array<{ label: string; sourceUrl: string }>;
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
    `Mode: ${input.mode === "current" ? "Current notices" : "Historical results"}`,
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
    "## Geology and resource context",
    "",
    ...resources,
    ...input.resourceResults.map(
      ({ name, sourceUrl }) => `- [${name} source](${sourceUrl})`,
    ),
    "",
    "Mapped intersections and proximity to a published record are screening evidence only. This evidence does not prove mineralization, deposit extent, grade, recoverability, value, mineral rights, access, permission to explore, or completeness of the published inventory.",
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

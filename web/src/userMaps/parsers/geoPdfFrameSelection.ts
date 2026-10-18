import type {
  ParsedPdfRegistration,
  PdfManualReason,
  PdfRegistrationFlavor,
} from "../types";
import { GEO_PDF_APPROVED_RULES } from "./geoPdfApprovedRules";
import type { GeoPdfMetadataExtraction } from "./geoPdfMetadata";

export type ApprovedGeoPdfRule = {
  ruleId: "usgs-ustopo-map-layers-v1";
  producer: string;
  family: PdfRegistrationFlavor;
  structureId: string;
  registrationCount: number;
  completeLabels: readonly string[];
};

const MANUAL_REASON_PRECEDENCE: PdfManualReason[] = [
  "unreadable",
  "invalid",
  "unsupported-crs",
  "unsupported",
  "absent",
];

export function manualReasonFor(
  rejected: GeoPdfMetadataExtraction["rejected"],
): PdfManualReason {
  for (const reason of MANUAL_REASON_PRECEDENCE) {
    if (reason === "absent" || rejected.some((row) => row.reason === reason)) {
      return reason;
    }
  }
  return "absent";
}

function sameStringMultiset(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function ruleMatches(
  extraction: GeoPdfMetadataExtraction,
  rule: ApprovedGeoPdfRule,
): boolean {
  const structure = extraction.pageStructure;
  return (
    extraction.producer === rule.producer &&
    structure !== null &&
    structure.family === rule.family &&
    structure.structureId === rule.structureId &&
    structure.registrationCount === rule.registrationCount &&
    sameStringMultiset(structure.completeLabels, rule.completeLabels) &&
    extraction.rejected.length === 0 &&
    extraction.candidates.length === structure.registrationCount &&
    extraction.candidates.every(({ flavor }) => flavor === rule.family)
  );
}

function selectByApprovedRule(
  extraction: GeoPdfMetadataExtraction,
  rules: readonly ApprovedGeoPdfRule[],
): ParsedPdfRegistration | null {
  for (const rule of rules) {
    if (!ruleMatches(extraction, rule)) {
      continue;
    }
    const matches = extraction.candidates.filter(
      ({ embeddedLabel }) => embeddedLabel === "Map Layers",
    );
    if (matches.length !== 1) {
      continue;
    }
    return {
      status: "automatic",
      selection: { kind: "producer-rule", ruleId: rule.ruleId },
      selected: matches[0],
      candidates: extraction.candidates,
    };
  }
  return null;
}

export function selectGeoPdfFrame(
  extraction: GeoPdfMetadataExtraction,
  approvedRules: readonly ApprovedGeoPdfRule[] = GEO_PDF_APPROVED_RULES,
): ParsedPdfRegistration {
  if (extraction.candidates.length === 0) {
    return {
      status: "manual",
      reason: manualReasonFor(extraction.rejected),
    };
  }
  if (extraction.candidates.length === 1) {
    return {
      status: "automatic",
      selection: { kind: "sole" },
      selected: extraction.candidates[0],
      candidates: extraction.candidates,
    };
  }
  return (
    selectByApprovedRule(extraction, approvedRules) ?? {
      status: "selection-required",
      candidates: extraction.candidates,
    }
  );
}

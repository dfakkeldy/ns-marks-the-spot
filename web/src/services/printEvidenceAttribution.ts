import {
  CIVIC_ADDRESS_DATASET_URL,
  OPEN_GOVERNMENT_ATTRIBUTION,
  OPEN_GOVERNMENT_LICENCE_URL,
} from "./civicAddresses";
import type { PrintSnapshot } from "./printSnapshot";
import {
  PVSC_ASSESSMENT_DATASET_URL,
  PVSC_OPEN_DATA_ATTRIBUTION,
  PVSC_OPEN_DATA_LICENCE_URL,
} from "./pvscAssessments";

export type PrintEvidenceAttribution = {
  id: string;
  label: string;
  sourceUrl: string;
  attribution: string;
  licenceUrl: string;
};

export function reportedEvidenceAttributions(
  snapshot: PrintSnapshot,
): PrintEvidenceAttribution[] {
  const sources: PrintEvidenceAttribution[] = [];
  if (snapshot.evidence.civicAddresses.status === "ready") {
    sources.push({
      id: "civic-addresses",
      label: "Civic address evidence",
      sourceUrl: CIVIC_ADDRESS_DATASET_URL,
      attribution: OPEN_GOVERNMENT_ATTRIBUTION,
      licenceUrl: OPEN_GOVERNMENT_LICENCE_URL,
    });
  }
  if (snapshot.evidence.assessments.status === "ready") {
    sources.push({
      id: "pvsc-assessments",
      label: "PVSC assessment evidence",
      sourceUrl: PVSC_ASSESSMENT_DATASET_URL,
      attribution: PVSC_OPEN_DATA_ATTRIBUTION,
      licenceUrl: PVSC_OPEN_DATA_LICENCE_URL,
    });
  }
  if (snapshot.evidence.resources.status === "ready") {
    sources.push({
      id: "resource-evidence",
      label: "Resource evidence",
      sourceUrl: "https://novascotia.ca/natr/meb/download/",
      attribution: OPEN_GOVERNMENT_ATTRIBUTION,
      licenceUrl: OPEN_GOVERNMENT_LICENCE_URL,
    });
  }
  return sources;
}

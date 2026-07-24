import {
  floodHazardLayerCatalog,
  provinceLayerCatalog,
  resourceLayerCatalog,
} from "../layers/layerCatalog";
import {
  PROVINCE_ATTRIBUTION,
  PROVINCE_LICENSE_URL,
} from "../licensing/provinceLicense";
import { BUILDINGS_DATASET_URL } from "./buildings";
import {
  CIVIC_ADDRESS_DATASET_URL,
  OPEN_GOVERNMENT_ATTRIBUTION,
  OPEN_GOVERNMENT_LICENCE_URL,
} from "./civicAddresses";
import { NSPRD_LAYER_URL } from "./nsprd";
import type { PrintSnapshot } from "./printSnapshot";
import {
  PVSC_ASSESSMENT_DATASET_URL,
  PVSC_ASSESSMENT_SOURCE_DATE,
  PVSC_OPEN_DATA_ATTRIBUTION,
  PVSC_OPEN_DATA_LICENCE_URL,
} from "./pvscAssessments";

export type PrintEvidenceSourceId =
  | "nsprd-selected-geometry"
  | "building-evidence"
  | "road-evidence"
  | "water-evidence"
  | "published-river-flood-evidence"
  | "coastal-flood-evidence"
  | "civic-addresses"
  | "pvsc-assessments"
  | "mineral-occurrence-evidence"
  | "mineral-tenure-evidence"
  | "abandoned-mine-evidence";

export type PrintEvidenceAttribution = {
  id: PrintEvidenceSourceId;
  label: string;
  sourceUrl: string;
  sourceDate: string;
  attribution: string;
  licenceUrl: string;
  authority: string;
  limitation: string;
};

function provinceLayer(id: "nsprd" | "roads" | "water-features" | "buildings") {
  const layer = provinceLayerCatalog.find((candidate) => candidate.id === id);
  if (!layer) throw new Error(`Missing print evidence layer metadata for ${id}.`);
  return layer;
}

function floodLayer(id: "published-river-flood-zones" | "coastal-flood-current") {
  const layer = floodHazardLayerCatalog.find((candidate) => candidate.id === id);
  if (!layer) throw new Error(`Missing print flood metadata for ${id}.`);
  return layer;
}

function resourceLayer(
  id: "mineral-occurrences" | "mineral-tenure" | "abandoned-mines",
) {
  const layer = resourceLayerCatalog.find((candidate) => candidate.id === id);
  if (!layer) throw new Error(`Missing print resource metadata for ${id}.`);
  return layer;
}

const nsprd = provinceLayer("nsprd");
const roads = provinceLayer("roads");
const water = provinceLayer("water-features");
const buildings = provinceLayer("buildings");
const publishedRiver = floodLayer("published-river-flood-zones");
const coastal = floodLayer("coastal-flood-current");

const EVIDENCE_SOURCES: Record<
  PrintEvidenceSourceId,
  PrintEvidenceAttribution
> = {
  "nsprd-selected-geometry": {
    id: "nsprd-selected-geometry",
    label: "NSPRD selected geometry",
    sourceUrl: NSPRD_LAYER_URL,
    sourceDate: nsprd.sourceDate,
    attribution: PROVINCE_ATTRIBUTION,
    licenceUrl: PROVINCE_LICENSE_URL,
    authority: "NSPRD supplies the mapped parcel geometry and approximate mapped area.",
    limitation: "NSPRD geometry is approximate and is not a legal survey.",
  },
  "building-evidence": {
    id: "building-evidence",
    label: "Building evidence",
    sourceUrl: BUILDINGS_DATASET_URL,
    sourceDate: buildings.sourceDate,
    attribution: PROVINCE_ATTRIBUTION,
    licenceUrl: PROVINCE_LICENSE_URL,
    authority: "NSTDB point and polygon building features are counted where they intersect the mapped parcel.",
    limitation: "An empty count does not prove no building exists or establish current structures, occupancy, condition, use, or permits.",
  },
  "road-evidence": {
    id: "road-evidence",
    label: "Road evidence",
    sourceUrl: roads.serviceUrl,
    sourceDate: roads.sourceDate,
    attribution: PROVINCE_ATTRIBUTION,
    licenceUrl: PROVINCE_LICENSE_URL,
    authority: "NSTDB road, trail, bridge, rail, ferry, and culvert features supply mapped road context.",
    limitation: "Mapped intersection, proximity, or a civic road name does not prove frontage, legal access, maintenance, or passability.",
  },
  "water-evidence": {
    id: "water-evidence",
    label: "Water evidence",
    sourceUrl: water.serviceUrl,
    sourceDate: water.sourceDate,
    attribution: PROVINCE_ATTRIBUTION,
    licenceUrl: PROVINCE_LICENSE_URL,
    authority: "NSTDB water points, lines, and areas supply mapped water context.",
    limitation: "Mapped water context does not establish flow, navigability, access, condition, or environmental status.",
  },
  "published-river-flood-evidence": {
    id: "published-river-flood-evidence",
    label: "Published river flood evidence",
    sourceUrl: publishedRiver.sourceUrl,
    sourceDate: publishedRiver.sourceDate,
    attribution: PROVINCE_ATTRIBUTION,
    licenceUrl: PROVINCE_LICENSE_URL,
    authority: "Published 5% and 1% annual-exceedance river layers cover four named study areas.",
    limitation: "Coverage, no-hit, and intersection states do not create a universal flood probability for the parcel.",
  },
  "coastal-flood-evidence": {
    id: "coastal-flood-evidence",
    label: "Coastal flood evidence",
    sourceUrl: coastal.sourceUrl,
    sourceDate: coastal.sourceDate,
    attribution: OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: coastal.licenceUrl,
    authority: "The Nova Scotia Coastal Hazard Map supplies current, 2050, and 2100 sea-level scenarios with a 1% AEP storm surge.",
    limitation: "Raster overlap is an approximate screen, not a survey, elevation certificate, insurance finding, or parcel-wide probability.",
  },
  "civic-addresses": {
    id: "civic-addresses",
    label: "Civic address evidence",
    sourceUrl: CIVIC_ADDRESS_DATASET_URL,
    sourceDate: "Live Nova Scotia Civic Address File",
    attribution: OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: OPEN_GOVERNMENT_LICENCE_URL,
    authority: "The Nova Scotia Civic Address File supplies authoritative mapped physical-address points.",
    limitation: "A mapped civic point does not prove ownership, mailing address, access, occupancy, or legal parcel status.",
  },
  "pvsc-assessments": {
    id: "pvsc-assessments",
    label: "PVSC assessment evidence",
    sourceUrl: PVSC_ASSESSMENT_DATASET_URL,
    sourceDate: PVSC_ASSESSMENT_SOURCE_DATE,
    attribution: PVSC_OPEN_DATA_ATTRIBUTION,
    licenceUrl: PVSC_OPEN_DATA_LICENCE_URL,
    authority: "PVSC supplies dated assessed and taxable assessed value history.",
    limitation: "Assessment records are not a current market appraisal, sale price, title record, or complete parcel-account linkage.",
  },
  "mineral-occurrence-evidence": {
    id: "mineral-occurrence-evidence",
    label: "Mineral occurrence evidence",
    sourceUrl: resourceLayer("mineral-occurrences").sourceUrl,
    sourceDate: resourceLayer("mineral-occurrences").sourceDate,
    attribution: OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: OPEN_GOVERNMENT_LICENCE_URL,
    authority: "The provincial occurrence inventory supplies published mineral occurrence points.",
    limitation: "An occurrence or proximity does not prove mineralization, extent, grade, recoverability, value, rights, access, or completeness.",
  },
  "mineral-tenure-evidence": {
    id: "mineral-tenure-evidence",
    label: "Mineral tenure evidence",
    sourceUrl: resourceLayer("mineral-tenure").sourceUrl,
    sourceDate: resourceLayer("mineral-tenure").sourceDate,
    attribution: OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: OPEN_GOVERNMENT_LICENCE_URL,
    authority: "NovaROC supplies published exploration-licence and mineral-lease polygons.",
    limitation: "Mineral tenure is a provincial right and is not land ownership, access, or permission to explore.",
  },
  "abandoned-mine-evidence": {
    id: "abandoned-mine-evidence",
    label: "Abandoned mine evidence",
    sourceUrl: resourceLayer("abandoned-mines").sourceUrl,
    sourceDate: resourceLayer("abandoned-mines").sourceDate,
    attribution: OPEN_GOVERNMENT_ATTRIBUTION,
    licenceUrl: OPEN_GOVERNMENT_LICENCE_URL,
    authority: "The provincial inventory supplies published abandoned mine opening points.",
    limitation: "Inventory locations and field conditions can change; this is screening context, not a site-safety conclusion.",
  },
};

export function printEvidenceAttribution(
  id: PrintEvidenceSourceId,
): PrintEvidenceAttribution {
  return EVIDENCE_SOURCES[id];
}

export function requiredSelectedGeometryAttribution(): PrintEvidenceAttribution {
  return EVIDENCE_SOURCES["nsprd-selected-geometry"];
}

export function reportedEvidenceAttributions(
  snapshot: PrintSnapshot,
): PrintEvidenceAttribution[] {
  void snapshot;
  return [
    EVIDENCE_SOURCES["nsprd-selected-geometry"],
    EVIDENCE_SOURCES["building-evidence"],
    EVIDENCE_SOURCES["road-evidence"],
    EVIDENCE_SOURCES["water-evidence"],
    EVIDENCE_SOURCES["published-river-flood-evidence"],
    EVIDENCE_SOURCES["coastal-flood-evidence"],
    EVIDENCE_SOURCES["civic-addresses"],
    EVIDENCE_SOURCES["pvsc-assessments"],
    EVIDENCE_SOURCES["mineral-occurrence-evidence"],
    EVIDENCE_SOURCES["mineral-tenure-evidence"],
    EVIDENCE_SOURCES["abandoned-mine-evidence"],
  ];
}

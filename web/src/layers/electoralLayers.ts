import type { ContextLayerDescriptor } from './contextLayerTypes';
import { PROVINCE_ATTRIBUTION, PROVINCE_LICENSE_URL, OPEN_GOVERNMENT_ATTRIBUTION, OPEN_GOVERNMENT_LICENCE_TERMS_URL } from '../licensing/provinceLicense';

export type ElectoralMode = 'boundaries' | 'winner' | 'margin' | 'turnout';
export interface ElectoralSource {
  level: 'Provincial' | 'Federal' | 'Municipal';
  kind: 'districts' | 'polls' | 'results' | 'seats';
  expectedCount: number;
  asset?: string;
}
const BND = 'https://nsgiwa.novascotia.ca/arcgis/rest/services/BND/';
export const ELECTION_BOUNDARY_NOTE = '2024 results use their own 55-district boundaries. Inverness was divided in April 2026; the new district has no separate 2024 result.';
export const ENS_RESULTS_URL = 'https://electionsnovascotia.ca/generalElection_42nd';
export const ENS_WORKBOOK_URL = 'https://electionsnovascotia.ca/files/GeneralElection_42nd/42PGE_PollbyPoll_AllEDs_TurnOut_FINAL.xlsx';
export const CANADA_LICENCE = 'https://open.canada.ca/en/open-government-licence-canada';
export const CANADA_ATTRIBUTION = 'Elections Canada. Contains information licensed under the Open Government Licence – Canada.';
export const HALIFAX_LICENCE = 'https://data-hrm.hub.arcgis.com/pages/open-data-licence';
export const HALIFAX_ATTRIBUTION = 'Contains information licenced under the Open Government Licence—Halifax.';
const defaults = {
  category: 'elections-districts', delivery: 'electoral', licence: 'province-restricted',
  licenceUrl: PROVINCE_LICENSE_URL, attribution: `Elections Nova Scotia (GeoNOVA). ${PROVINCE_ATTRIBUTION}`,
  scale: 'Display boundaries, not a survey or voting-location guide; provincial queries use a fixed source simplification of at most 3.4 m', coverage: 'Nova Scotia',
  minZoom: 7, maxZoom: 20, opacity: 1, zIndex: 230, exportOptions: { layers: 'show:0', transparent: true },
  legend: [{ label: 'Provincial district · solid survey blue', color: '#1e66cc' }],
} as const;
export const electoralLayers = [
  { ...defaults, id: 'provincial-districts-2026', name: 'Provincial districts · 2026',
    serviceUrl: `${BND}BND_ElectoralBoundaries_UT83/MapServer/4`, sourceUrl: `${BND}BND_ElectoralBoundaries_UT83/MapServer/4`,
    sourceDate: 'April 9, 2026 boundary release', webCaveat: '56 districts. Boundaries and results are separate records.',
    electoral: { level: 'Provincial', kind: 'districts', expectedCount: 56 },
  },
  { ...defaults, id: 'provincial-polls-2026', name: 'Provincial polling divisions · March 2026',
    serviceUrl: `${BND}BND_ElectoralBoundaries_UT83/MapServer/3`, sourceUrl: `${BND}BND_ElectoralBoundaries_UT83/MapServer/3`,
    sourceDate: 'March 2026 package; Inverness and ED 56 revised April 9, 2026', minZoom: 12,
    webCaveat: 'Polling divisions are areas, not voting locations. Institutional polls have no population or elector labels.',
    electoral: { level: 'Provincial', kind: 'polls', expectedCount: 1817 },
  },
  { ...defaults, id: 'provincial-results-2024', name: 'General election results · 2024',
    serviceUrl: `${BND}BND_GeneralElectionResults_UT83/MapServer/7`, sourceUrl: ENS_RESULTS_URL,
    sourceDate: 'November 26, 2024 general election', webCaveat: ELECTION_BOUNDARY_NOTE,
    electoral: { level: 'Provincial', kind: 'results', expectedCount: 55 },
  },
  { ...defaults, id: 'provincial-seats-2026', name: 'Seats · to June 23, 2026',
    serviceUrl: `${BND}BND_DistributionOfSeats_UT83/MapServer/0`, sourceUrl: `${BND}BND_DistributionOfSeats_UT83/MapServer/0`,
    sourceDate: 'June 23, 2026 seats snapshot; live publisher service', webCaveat: 'Seats and caucus at this source date, including by-elections. Not the 2024 election result.',
    electoral: { level: 'Provincial', kind: 'seats', expectedCount: 56 },
  },
  { ...defaults, id: 'federal-ridings-2025', name: 'Federal ridings · 2023 order',
    serviceUrl: '', sourceUrl: 'https://open.canada.ca/data/en/dataset/97a2a33c-54cc-4f2e-82c1-047ad8212f05',
    licence: 'canada-open', licenceUrl: CANADA_LICENCE, attribution: CANADA_ATTRIBUTION,
    sourceDate: 'April 28, 2025; 2023 Representation Order', webCaveat: '11 ridings. Elections Canada KMZ, converted for display; multipart districts retained.', zIndex: 233,
    legend: [{ label: 'Federal riding · dashed deep water', color: '#0a4f5c' }],
    electoral: { level: 'Federal', kind: 'districts', expectedCount: 11, asset: 'federal-ridings-2025.geojson' },
  },
  { ...defaults, id: 'federal-polls-2025', name: 'Federal polling divisions · 2025',
    serviceUrl: '', sourceUrl: 'https://open.canada.ca/data/en/dataset/97a2a33c-54cc-4f2e-82c1-047ad8212f05',
    licence: 'canada-open', licenceUrl: CANADA_LICENCE, attribution: CANADA_ATTRIBUTION, minZoom: 12,
    sourceDate: 'April 28, 2025 writ boundaries; May 2025 technical guide',
    webCaveat: '2,260 division identifiers in 2,269 source placemarks. Small unlabelled squares mark mobile or single-building polls, not neighbourhoods.',
    legend: [{ label: 'Federal polling division · dashed', color: '#0a4f5c' }, { label: 'Unlabelled square · institution; counts suppressed' }],
    electoral: { level: 'Federal', kind: 'polls', expectedCount: 2260, asset: 'federal-polls-2025.geojson' },
  },
  { ...defaults, id: 'municipal-polling-districts', name: 'Municipal polling districts', serviceUrl: '',
    sourceUrl: 'https://data.novascotia.ca/d/gcep-xeci', licence: 'province-open',
    licenceUrl: OPEN_GOVERNMENT_LICENCE_TERMS_URL, attribution: OPEN_GOVERNMENT_ATTRIBUTION,
    sourceDate: 'Publisher regulations vary; fetched September 13, 2026 UTC',
    webCaveat: '238 records. Current boundary-review parity unverified; confirm boundaries with the municipality.',
    legend: [{ label: 'Municipal polling district · dotted lichen', color: '#5a7343' }],
    electoral: { level: 'Municipal', kind: 'districts', expectedCount: 238, asset: 'municipal-polling-districts.geojson' },
  },
  { ...defaults, id: 'halifax-council-districts', name: 'Halifax council districts · 2024', serviceUrl: '',
    sourceUrl: 'https://www.arcgis.com/home/item.html?id=04c5bee564f84b4a8f1c8dd305896079',
    licence: 'halifax-open', licenceUrl: HALIFAX_LICENCE, attribution: HALIFAX_ATTRIBUTION,
    sourceDate: '2024 districts; open-data item modified July 3, 2025', coverage: 'Halifax Regional Municipality',
    webCaveat: '16 districts from Halifax Open Data. District boundaries are not polling locations.',
    legend: [{ label: 'Council district · dotted lichen', color: '#5a7343' }],
    electoral: { level: 'Municipal', kind: 'districts', expectedCount: 16, asset: 'halifax-council-districts.geojson' },
  },
] as const satisfies readonly (ContextLayerDescriptor & { electoral: ElectoralSource })[];
export type ElectoralLayerId = typeof electoralLayers[number]['id'];
export type ElectoralLayer = ContextLayerDescriptor & { id: ElectoralLayerId; electoral: ElectoralSource };
export const electoralLayerById = Object.fromEntries<ElectoralLayer>(electoralLayers.map(layer => [layer.id, layer])) as Record<ElectoralLayerId, ElectoralLayer>;
export function isElectoralLayerId(id: string): id is ElectoralLayerId { return Object.hasOwn(electoralLayerById, id); }
export const initialElectoralModes: Record<ElectoralLayerId, ElectoralMode> = Object.fromEntries(electoralLayers.map(l => [l.id, l.electoral.kind === 'results' ? 'winner' : 'boundaries'])) as Record<ElectoralLayerId, ElectoralMode>;

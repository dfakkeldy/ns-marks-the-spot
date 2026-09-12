import sourceReceipt from "../data/openLayerSources.json";
import { OPEN_GOVERNMENT_ATTRIBUTION, OPEN_GOVERNMENT_LICENCE_URL } from "../licensing/provinceLicense";

export type OpenDataPart = {
  dataset: string;
  fields: readonly string[];
  /** Catalogue-owned SoQL expression, never user input. */
  where?: string;
  color?: string;
  minZoom?: number;
};
export type OpenDataSource = {
  parts: readonly OpenDataPart[];
  color: string;
  fillOpacity?: number;
  labelField?: string;
  labelMinZoom?: number;
  roads?: boolean;
};
export const openDatasetUrl = (id: string) => `https://data.novascotia.ca/d/${id}`;
export const openDatasetApi = (id: string) => `https://data.novascotia.ca/resource/${id}.geojson`;
const part = (dataset: string, fields: readonly string[] = ["feat_code", "feat_desc"], where?: string): OpenDataPart => ({ dataset, fields, where });

/** Web replacements. The native service catalogue remains independently licensed. */
export const openProvinceSources: Readonly<Record<string, OpenDataSource>> = {
  "crown-lands": { parts: [part("3nka-59nz", ["dnr_id", "partialown", "symbol"])], color: "#268744", fillOpacity: 0.18 },
  "flood-risk": { parts: [part("569x-2wnq", ["river", "primary_co"]), part("ynkv-x6rx", ["sec_name", "sec_code"]), part("6htv-yzkm", ["sec_name", "tert_code"])], color: "#487f9b", fillOpacity: 0 },
  "waterfalls": { parts: [part("458x-dmz3", ["feat_code", "feat_desc"], "feat_desc = 'Falls -  On a single line river point'")], color: "#0078ff" },
  "water-features": { parts: [part("h8jb-hzrm"), part("fpca-jrmt"), { ...part("458x-dmz3"), minZoom: 14 }], color: "#267cad", fillOpacity: 0.2 },
  "roads": { parts: [part("484g-adjn", ["roadsegid", "feat_desc", "street", "rte_no", "roadc_desc"], "feat_desc <> 'WATER ACCESS'"), { ...part("62ap-bhwk"), minZoom: 15 }, { ...part("x8jw-yjc2"), minZoom: 16 }], color: "#654735", roads: true, labelField: "street", labelMinZoom: 14 },
  "main-roads": { parts: [part("484g-adjn", ["roadsegid", "feat_desc", "street", "roadc_desc"], "roadc_desc IN ('Highway','Trans Canada','Arterial','Collector','Local','Local Collector','Local Highway','Local Arterial') AND upper(feat_desc) NOT LIKE '%DRIVEWAY%'")], color: "#444444", roads: true, labelField: "street", labelMinZoom: 14 },
  "place-names": { parts: [part("xf3i-vxcb", ["cgndb_key", "geoname", "concise_ds", "status_ds"], "concise_ds IN ('Town','Village','Unincorporated area','Island','Cape','Bay','Lake','River')")], color: "#29332e", labelField: "geoname", labelMinZoom: 8 },
  "contours": { parts: [part("bhx9-mpui", ["feat_code", "feat_desc", "zvalue"], "feat_desc LIKE 'CONTOUR%'")], color: "#987849", fillOpacity: 0, labelField: "zvalue", labelMinZoom: 15 },
  "buildings": { parts: [part("t5xr-fjkr"), { ...part("n7be-bzwb"), minZoom: 15 }], color: "#795948", fillOpacity: 0.45 },
};

export function openDataSourceLinks(source: OpenDataSource) {
  return source.parts.map(({ dataset }) => ({ url: openDatasetUrl(dataset), name: sourceReceipt.datasets.find(({ id }) => id === dataset)?.name ?? dataset }));
}

export function openDataPrintCredit(source?: OpenDataSource): string {
  return source ? ` Project-rendered open data; display geometry simplified within 10 m. Sources: ${openDataSourceLinks(source).map(({ url }) => url).join(", ")}.` : "";
}

export function openSourceMetadata<T extends { id: string; sourceDate: string; scale: string; webCaveat: string }>(layer: T, source?: OpenDataSource): T & { openData?: OpenDataSource } {
  if (!source) return layer;
  return {
    ...layer,
    openData: source,
    ...(layer.id === "water-features" ? { minZoom: 11 } : {}),
    serviceUrl: openDatasetApi(source.parts[0].dataset),
    sourceUrl: openDatasetUrl(source.parts[0].dataset),
    licence: "province-open",
    licenceUrl: OPEN_GOVERNMENT_LICENCE_URL,
    attribution: OPEN_GOVERNMENT_ATTRIBUTION,
    sourceDate: "Open-government datasets · verified September 12, 2026 · observation dates vary",
    scale: layer.id === "contours" ? "NSTDB 1:10,000 contours · display geometry simplified within 10 m" : `${layer.scale.replace(" · publisher scale-dependent symbols", "")} · project-rendered open data; display geometry simplified within 10 m`,
    webCaveat: layer.id === "contours" ? "Terrain screening only · open NSTDB contour elevations in metres; interval and survey dates vary" : layer.id === "crown-lands" ? "Includes partial Crown interests · not proof of title or public access" : layer.id === "water-features" ? "Rivers, lakes, wetlands & more · open-data detail from zoom 11+" : layer.webCaveat,
  };
}

/** The open downloads use the same NSTDB feature classes as the image services. */
const infrastructureDatasets: Record<string, Record<number, string>> = {
  Utilities: { 1: "eiwy-kfrj", 2: "yjmz-hpnc", 3: "4ujs-gpyq" },
  Structures: { 1: "p4z4-pvgm", 2: "kfmd-m3ru", 3: "n23s-z3k7" },
  Designated_Areas: { 1: "ty4r-gcnk" },
  Water: { 3: "fpca-jrmt", 6: "h8jb-hzrm" },
};
export function openInfrastructureSource(theme: string, selections: readonly (readonly [number, readonly string[]])[]): OpenDataSource {
  return {
    color: theme === "Water" ? "#267cad" : theme === "Utilities" ? "#7e538d" : "#7e6842",
    fillOpacity: 0.25,
    parts: selections.map(([layer, descriptions]) => {
      const dataset = infrastructureDatasets[theme]?.[layer];
      if (!dataset) throw new Error(`Missing open NSTDB source: ${theme}/${layer}`);
      return part(dataset, ["feat_code", "feat_desc"], `feat_desc IN (${descriptions.map((d) => `'${d.replaceAll("'", "''")}'`).join(",")})`);
    }),
  };
}

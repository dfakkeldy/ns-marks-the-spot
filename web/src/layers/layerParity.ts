import {
  allResourceLayerCatalog,
  churchLayerCatalog,
  environmentalHealthLayerCatalog,
  fletcherLayerCatalog,
  floodHazardLayerCatalog,
  forestryLayerCatalog,
  hydroPilotLayerCatalog,
  initialEnvironmentalHealthLayerVisibility,
  initialFloodHazardLayerVisibility,
  initialForestryLayerVisibility,
  initialHydroPilotLayerVisibility,
  initialProvinceLayerVisibility,
  initialResourceLayerVisibility,
  initialWellLogLayerVisibility,
  initialZoningLayerVisibility,
  provinceLayerCatalog,
  topographyLayerCatalog,
  wellLogLayerCatalog,
  zoningLayerCatalog,
} from "./layerCatalog";

/**
 * The parity fixture the native iOS catalog is tested against.
 *
 * The iOS app keeps its own hand-written Swift catalog rather than decoding
 * this file at runtime: Swift is where the caveat prose and style closures
 * read best, and a runtime decode would trade that for a guarantee we can get
 * more cheaply. This projection is that cheaper guarantee — the Swift test
 * compares field-by-field against it, so the two catalogs cannot drift without
 * a red build on one side or the other.
 *
 * The projection is deliberately generic: it emits every key each descriptor
 * declares rather than a hand-picked subset. Picking fields here would make
 * this file its own second source of truth, and a field added on the web would
 * go unnoticed instead of failing the Swift key-set assertion.
 */
export const LAYER_PARITY_SCHEMA_VERSION = 1;

export type LayerParityGroupId =
  | "map-layers"
  | "topography"
  | "forestry"
  | "flood-hazard"
  | "environmental-health"
  | "zoning"
  | "groundwater"
  | "hydro-pilot"
  | "geology-resources"
  | "church"
  | "historical";

export type LayerParityEntry = Record<string, unknown> & {
  id: string;
  group: LayerParityGroupId;
  /**
   * Position in the single top-to-bottom order the layer panel presents. The
   * groups are collapsible sections, but the reading order across them is
   * flat, and that order is what the native list has to reproduce.
   */
  uiOrder: number;
  /** Whether the web turns this layer on for a first-time visitor. */
  webDefaultVisible: boolean;
};

export type LayerParityFixture = {
  schemaVersion: number;
  groupOrder: readonly LayerParityGroupId[];
  layers: readonly LayerParityEntry[];
};

/**
 * Group order as the panel renders it. `map-layers` is the flat run of rows
 * above the first collapsible section; `historical` is the Fletcher control,
 * which renders flat below the Church section rather than inside it.
 */
const GROUP_ORDER: readonly LayerParityGroupId[] = [
  "map-layers",
  "topography",
  "forestry",
  "flood-hazard",
  "environmental-health",
  "zoning",
  "groundwater",
  "hydro-pilot",
  "geology-resources",
  "church",
  "historical",
];

type Source = {
  group: LayerParityGroupId;
  layers: readonly { id: string }[];
  defaultVisible: (id: string) => boolean;
};

const visibilityFrom =
  (map: Record<string, boolean>) =>
  (id: string): boolean =>
    map[id] ?? false;

const SOURCES: readonly Source[] = [
  {
    group: "map-layers",
    // Contours ships in provinceLayerCatalog but renders in its own
    // Topography section, so the flat run excludes it.
    layers: provinceLayerCatalog.filter(({ id }) => id !== "contours"),
    defaultVisible: visibilityFrom(initialProvinceLayerVisibility),
  },
  {
    group: "topography",
    layers: topographyLayerCatalog,
    defaultVisible: visibilityFrom(initialProvinceLayerVisibility),
  },
  {
    group: "forestry",
    layers: forestryLayerCatalog,
    defaultVisible: visibilityFrom(initialForestryLayerVisibility),
  },
  {
    group: "flood-hazard",
    layers: floodHazardLayerCatalog,
    defaultVisible: visibilityFrom(initialFloodHazardLayerVisibility),
  },
  {
    group: "environmental-health",
    layers: environmentalHealthLayerCatalog,
    defaultVisible: visibilityFrom(initialEnvironmentalHealthLayerVisibility),
  },
  {
    group: "zoning",
    layers: zoningLayerCatalog,
    defaultVisible: visibilityFrom(initialZoningLayerVisibility),
  },
  {
    group: "groundwater",
    layers: wellLogLayerCatalog,
    defaultVisible: visibilityFrom(initialWellLogLayerVisibility),
  },
  {
    group: "hydro-pilot",
    layers: hydroPilotLayerCatalog,
    defaultVisible: visibilityFrom(initialHydroPilotLayerVisibility),
  },
  {
    group: "geology-resources",
    layers: allResourceLayerCatalog,
    defaultVisible: visibilityFrom(initialResourceLayerVisibility),
  },
  {
    group: "church",
    layers: churchLayerCatalog,
    // Rights are pending; nothing here is ever on at launch.
    defaultVisible: () => false,
  },
  {
    group: "historical",
    layers: [fletcherLayerCatalog],
    // The web renders Fletcher off and lets the user turn it on; the native
    // app honours nativeDefaultVisibility instead, which the entry carries.
    defaultVisible: () => false,
  },
];

/** Sorts object keys so the fixture is stable across regenerations. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}

export function buildLayerParityFixture(): LayerParityFixture {
  let uiOrder = 0;
  const layers: LayerParityEntry[] = [];

  for (const source of SOURCES) {
    for (const layer of source.layers) {
      layers.push(
        sortKeys({
          ...layer,
          group: source.group,
          uiOrder: uiOrder++,
          webDefaultVisible: source.defaultVisible(layer.id),
        }) as LayerParityEntry,
      );
    }
  }

  return {
    schemaVersion: LAYER_PARITY_SCHEMA_VERSION,
    groupOrder: GROUP_ORDER,
    layers,
  };
}

export function serializeLayerParityFixture(): string {
  return `${JSON.stringify(buildLayerParityFixture(), null, 2)}\n`;
}

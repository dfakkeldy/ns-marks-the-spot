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
import {
  FLETCHER_TILE_REVISION,
  type FletcherSheet,
  fletcherSheets,
} from "./fletcherLayer";
import {
  NSPRD_LAYER_URL,
  NSPRD_PID_BATCH_SIZE,
  buildPidQueryUrl,
  buildPointQueryUrl,
  normalizePid,
} from "../services/nsprd";
import {
  type LayerCategoryId,
  layerCategories,
  layerCategoryByLayerId,
} from "./layerCategories";

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
export const LAYER_PARITY_SCHEMA_VERSION = 3;

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
   * The panel section this layer is shown under.
   *
   * Separate from `group`, which is an artifact of how this codebase splits its
   * catalogs rather than anything a reader sees. The categories are what the
   * panel actually renders, so they are what the native panel has to reproduce.
   */
  category: LayerCategoryId;
  /**
   * Position in the single top-to-bottom order the layer panel presents. The
   * groups are collapsible sections, but the reading order across them is
   * flat, and that order is what the native list has to reproduce.
   */
  uiOrder: number;
  /** Whether the web turns this layer on for a first-time visitor. */
  webDefaultVisible: boolean;
};

export type LayerParityCategory = {
  id: LayerCategoryId;
  name: string;
  description: string;
};

export type LayerParityFixture = {
  schemaVersion: number;
  groupOrder: readonly LayerParityGroupId[];
  /**
   * The panel's sections, in the order the panel lists them, with the words it
   * puts under each heading.
   *
   * Two of them hold no catalogue layer at all — Tax Sale carries the tax-sale
   * controls, My Maps the user's own imports — and they are in here for that
   * reason: a native panel that reproduced only the sections with layers in
   * them would put those controls somewhere the browser does not.
   */
  categories: readonly LayerParityCategory[];
  layers: readonly LayerParityEntry[];
  /**
   * The Fletcher tile build, which the layer entry cannot carry.
   *
   * `fletcherLayerCatalog` describes one control in the panel, but the layer
   * behind it is 24 separately georeferenced sheets, each with its own bounds.
   * Those bounds are the georeferencing — a sheet drawn to the wrong extent is
   * a map pointing at the wrong ground — so they belong in the fixture for the
   * same reason the layer fields do: transcribing 96 numbers by hand into
   * Swift is exactly the operation that needs a witness.
   */
  fletcher: {
    /** Path segment identifying the tile build both surfaces expect. */
    tileRevision: string;
    sheets: readonly FletcherSheet[];
  };
  /**
   * The NSPRD parcel query, as this code actually spells it.
   *
   * Emitted rather than described because the native port has to reproduce two
   * things no prose captures reliably: `URLSearchParams`' encoding (`+` for
   * space, `%27` for an apostrophe, and every reserved character escaped) and
   * JavaScript's `\s`, which carries the byte-order mark and the Unicode space
   * separators that Foundation's whitespace sets leave out. Both were guessed
   * at once already. Running the real functions and recording the answer means
   * the Swift side is tested against what ships, not against a reading of it.
   */
  parcelQuery: {
    layerUrl: string;
    pidBatchSize: number;
    /** `normalizePid` over inputs chosen to sit on its edges. */
    normalization: readonly { input: string; pid: string | null }[];
    /** Whole query URLs, byte for byte. */
    samples: readonly { name: string; url: string }[];
  };
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

/**
 * Deliberately absent: `liveConditionsLayerCatalog`. The live overlays
 * (highway cameras, weather radar) are web-only moment-in-time context with
 * no native counterpart, so they sit outside the parity contract — adding
 * them here would demand a Swift catalog entry for layers the native app
 * does not ship.
 */
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

/**
 * Inputs that sit on the edges of `normalizePid`'s two regexes.
 *
 * The Unicode ones are not hypothetical: a PID pasted from a spreadsheet export
 * arrives wrapped in a byte-order mark, and one copied out of a PDF often
 * carries a non-breaking or figure space. Whatever this function does with
 * those, the native app has to do the same, or the same paste works on one
 * surface and fails on the other.
 */
const PID_NORMALIZATION_CASES: readonly string[] = [
  "12345678",
  "1234-5678",
  "12-34-56-78",
  "12 34 56 78",
  " 12345678 ",
  "\t12345678\n",
  "\r12345678",
  "\u000b12345678", // vertical tab
  "\u000c12345678", // form feed
  "\u00a012345678", // non-breaking space
  "\u2007123456\u200778", // figure space, mid-string
  "\u200a12345678", // hair space
  "\u2028\u202912345678", // line and paragraph separators
  "\u202f12345678", // narrow no-break space
  "\u205f12345678", // medium mathematical space
  "\u168012345678", // Ogham space mark, which is not blank on screen
  "\u300012345678", // ideographic space
  "\ufeff12345678", // byte-order mark, what a spreadsheet export prepends
  "\u200b12345678", // zero-width space: blank to a reader, not to \\s
  "\u00a0\u200912345678\u3000", // several at once
  "PID 12345678",
  "1234_5678",
  "1234.5678",
  "1234567",
  "123456789",
  "",
  "   ",
  "-",
  "--------",
  "\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668", // Arabic-Indic digits
  "\uff11\uff12\uff13\uff14\uff15\uff16\uff17\uff18", // fullwidth digits
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
          category: layerCategoryByLayerId[
            layer.id as keyof typeof layerCategoryByLayerId
          ],
          uiOrder: uiOrder++,
          webDefaultVisible: source.defaultVisible(layer.id),
        }) as LayerParityEntry,
      );
    }
  }

  return {
    schemaVersion: LAYER_PARITY_SCHEMA_VERSION,
    groupOrder: GROUP_ORDER,
    categories: layerCategories.map(({ id, name, description }) => ({
      id,
      name,
      description,
    })),
    layers,
    fletcher: {
      tileRevision: FLETCHER_TILE_REVISION,
      sheets: fletcherSheets,
    },
    parcelQuery: {
      layerUrl: NSPRD_LAYER_URL,
      pidBatchSize: NSPRD_PID_BATCH_SIZE,
      normalization: PID_NORMALIZATION_CASES.map((input) => ({
        input,
        pid: normalizePid(input),
      })),
      samples: [
        { name: "single-pid", url: buildPidQueryUrl(["40203483"]) },
        {
          // Duplicates and two spellings of one PID: the request has to carry
          // three entries in first-seen order, which is what pins both the
          // de-duplication and the ordering.
          name: "multi-pid-deduplicated",
          url: buildPidQueryUrl([
            "40203483",
            "4020-3483",
            "00123456",
            "40203483",
            "99887766",
          ]),
        },
        {
          name: "point-fractional",
          url: buildPointQueryUrl(44.651070408, -63.582687), // Halifax
        },
        {
          // Whole numbers, where JavaScript writes `-63` and Swift's default
          // interpolation writes `-63.0`. Off Nova Scotia, but the formatting
          // difference is the point.
          name: "point-whole-numbers",
          url: buildPointQueryUrl(45, -63),
        },
        {
          name: "point-negative-zero",
          url: buildPointQueryUrl(-0, 0),
        },
      ],
    },
  };
}

export function serializeLayerParityFixture(): string {
  return `${JSON.stringify(buildLayerParityFixture(), null, 2)}\n`;
}

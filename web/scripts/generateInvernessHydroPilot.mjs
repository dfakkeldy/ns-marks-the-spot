import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MUNICIPALITY_DATASET = "7bqh-hssn";
const WATERSHED_DATASET = "ynkv-x6rx";
const NSHN_SERVICE =
  "https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_NSHN_UT83/MapServer";
const NSHN_LAYERS = [9, 11];
const OUT_FIELDS = [
  "OBJECTID",
  "FEAT_DESC",
  "FLOWDIR",
  "LEVELPRIOR",
  "MINZ",
  "MAXZ",
  "PLANLENGTH",
  "RIVNAME_1",
].join(",");
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/invernessHydroPotential.json",
);

function socrataUrl(dataset, params) {
  const url = new URL(`https://data.novascotia.ca/resource/${dataset}.geojson`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  const result = await response.json();
  if (result.error) {
    throw new Error(
      `Source error ${result.error.code ?? "unknown"}: ${result.error.message ?? "unknown"}`,
    );
  }
  return result;
}

function ringAreaAndCentroid(ring) {
  let twiceArea = 0;
  let xTotal = 0;
  let yTotal = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    xTotal += (x1 + x2) * cross;
    yTotal += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < Number.EPSILON) {
    return { area: 0, point: ring[0] };
  }
  return {
    area: Math.abs(twiceArea / 2),
    point: [xTotal / (3 * twiceArea), yTotal / (3 * twiceArea)],
  };
}

function representativePoint(geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const candidates = polygons.map((polygon) => ringAreaAndCentroid(polygon[0]));
  candidates.sort((left, right) => right.area - left.area);
  return candidates[0].point;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const intersects =
      y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  return (
    pointInRing(point, polygon[0]) &&
    !polygon.slice(1).some((hole) => pointInRing(point, hole))
  );
}

function pointInGeometry(point, geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

function esriPolygon(geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return {
    rings: polygons.flat(),
    spatialReference: { wkid: 4326 },
  };
}

function queryParameters(geometry) {
  return {
    where: "LEVELPRIOR = 1 AND FLOWDIR = 1",
    geometry: JSON.stringify(esriPolygon(geometry)),
    geometryType: "esriGeometryPolygon",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
  };
}

async function fetchLayerFeatures(layerId, geometry) {
  const parameters = queryParameters(geometry);
  const idForm = new URLSearchParams({
    f: "json",
    ...parameters,
    returnIdsOnly: "true",
  });
  const idResult = await fetchJson(`${NSHN_SERVICE}/${layerId}/query`, {
    method: "POST",
    body: idForm,
  });
  const objectIds = idResult.objectIds ?? [];
  const batches = [];
  for (let offset = 0; offset < objectIds.length; offset += 800) {
    batches.push(objectIds.slice(offset, offset + 800));
  }
  const collections = await Promise.all(
    batches.map((ids) => {
      const featureForm = new URLSearchParams({
        f: "geojson",
        objectIds: ids.join(","),
        outFields: OUT_FIELDS,
        outSR: "4326",
        returnGeometry: "true",
        returnZ: "true",
      });
      return fetchJson(`${NSHN_SERVICE}/${layerId}/query`, {
        method: "POST",
        body: featureForm,
      });
    }),
  );
  return collections.flatMap((collection) =>
    collection.features.map((feature) => ({ ...feature, sourceLayer: layerId })),
  );
}

function lineParts(feature) {
  return feature.geometry.type === "LineString"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
}

function lineMidpoint(coordinates) {
  return coordinates[Math.floor(coordinates.length / 2)].slice(0, 2);
}

function endpointKey(coordinate) {
  return `${coordinate[0].toFixed(6)},${coordinate[1].toFixed(6)}`;
}

export function longestDirectedRoute(features, watershedGeometry) {
  const edges = features.flatMap((feature) => {
    const parts = lineParts(feature);
    return parts
      .filter(
        (coordinates) =>
          coordinates.length >= 2 &&
          pointInGeometry(lineMidpoint(coordinates), watershedGeometry),
      )
      .map((coordinates, partIndex) => ({
        id: `${feature.sourceLayer}:${feature.properties.OBJECTID}:${partIndex}`,
        coordinates,
        lengthMetres:
          Number(feature.properties.PLANLENGTH) / Math.max(1, parts.length),
        source: endpointKey(coordinates[0]),
        target: endpointKey(coordinates.at(-1)),
      }));
  });

  const outgoing = new Map();
  const indegree = new Map();
  const nodes = new Set();
  for (const edge of edges) {
    nodes.add(edge.source);
    nodes.add(edge.target);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    indegree.set(edge.source, indegree.get(edge.source) ?? 0);
  }

  const queue = [...nodes].filter((node) => (indegree.get(node) ?? 0) === 0);
  const best = new Map([...nodes].map((node) => [node, { length: 0, edges: [] }]));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const node = queue[cursor];
    const previous = best.get(node);
    for (const edge of outgoing.get(node) ?? []) {
      const candidate = {
        length: previous.length + edge.lengthMetres,
        edges: [...previous.edges, edge],
      };
      if (candidate.length > best.get(edge.target).length) {
        best.set(edge.target, candidate);
      }
      indegree.set(edge.target, indegree.get(edge.target) - 1);
      if (indegree.get(edge.target) === 0) {
        queue.push(edge.target);
      }
    }
  }

  return [...best.values()].reduce(
    (longest, candidate) =>
      candidate.length > longest.length ? candidate : longest,
    { length: 0, edges: [] },
  );
}

function terrainMetrics(areaKm2, dropMetres, lengthKm) {
  const averageFallMetresPerKm = dropMetres / lengthKm;
  return {
    averageFallMetresPerKm,
    screeningValue: Math.log1p(areaKm2) * averageFallMetresPerKm,
  };
}

function potentialClass(percentile) {
  if (percentile < 0.25) return "low";
  if (percentile < 0.5) return "moderate";
  if (percentile < 0.75) return "high";
  return "very-high";
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pointSegmentDistanceSquared(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const progress =
      ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (progress > 1) {
      x = end[0];
      y = end[1];
    } else if (progress > 0) {
      x += dx * progress;
      y += dy * progress;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyLine(coordinates, tolerance = 0.00002) {
  if (coordinates.length <= 2) return coordinates;
  const squareTolerance = tolerance * tolerance;
  const keep = new Uint8Array(coordinates.length);
  keep[0] = 1;
  keep[coordinates.length - 1] = 1;
  const stack = [[0, coordinates.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let furthestIndex = -1;
    let furthestDistance = squareTolerance;
    for (let index = start + 1; index < end; index += 1) {
      const distance = pointSegmentDistanceSquared(
        coordinates[index],
        coordinates[start],
        coordinates[end],
      );
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex >= 0) {
      keep[furthestIndex] = 1;
      stack.push([start, furthestIndex], [furthestIndex, end]);
    }
  }
  return coordinates.filter((_coordinate, index) => keep[index] === 1);
}

async function loadWatersheds() {
  const [municipality, watersheds] = await Promise.all([
    fetchJson(
      socrataUrl(MUNICIPALITY_DATASET, {
        $where: 'fullname="Municipality of the County of Inverness"',
        $limit: "10",
      }),
    ),
    fetchJson(
      socrataUrl(WATERSHED_DATASET, {
        $where: "within_box(the_geom,47.1,-61.65,45.75,-60.5)",
        $limit: "5000",
      }),
    ),
  ]);
  const municipalityGeometry = municipality.features[0]?.geometry;
  if (!municipalityGeometry) {
    throw new Error("The Inverness municipal boundary was not returned.");
  }
  return watersheds.features
    .filter(({ properties }) => {
      const name = String(properties.sec_name ?? "");
      return (
        name !== "WATER" &&
        !name.toLocaleLowerCase().includes("shore direct") &&
        !name.toLocaleLowerCase().includes("island")
      );
    })
    .filter(({ geometry }) =>
      pointInGeometry(representativePoint(geometry), municipalityGeometry),
    )
    .sort((left, right) =>
      String(left.properties.sec_code).localeCompare(
        String(right.properties.sec_code),
      ),
    );
}

async function buildFeature(watershed, index, total) {
  const name = watershed.properties.sec_name;
  process.stdout.write(`[${index + 1}/${total}] ${name}\n`);
  const sourceFeatures = (
    await Promise.all(
      NSHN_LAYERS.map((layerId) =>
        fetchLayerFeatures(layerId, watershed.geometry),
      ),
    )
  ).flat();
  const route = longestDirectedRoute(sourceFeatures, watershed.geometry);
  if (route.edges.length === 0 || route.length <= 0) {
    return null;
  }
  const elevations = route.edges.flatMap((edge) =>
    edge.coordinates
      .map((coordinate) => Number(coordinate[2]))
      .filter(Number.isFinite),
  );
  const elevationDropMetres = Math.max(...elevations) - Math.min(...elevations);
  const drainageAreaKm2 = Number(watershed.properties.hectares) / 100;
  const mainFlowLengthKm = route.length / 1000;
  if (elevationDropMetres <= 0 || drainageAreaKm2 <= 0) {
    return null;
  }
  const metrics = terrainMetrics(
    drainageAreaKm2,
    elevationDropMetres,
    mainFlowLengthKm,
  );

  return {
    type: "Feature",
    id: watershed.properties.sec_code,
    properties: {
      watershedCode: watershed.properties.sec_code,
      watershedName: name,
      drainageAreaKm2: round(drainageAreaKm2, 2),
      elevationDropMetres: round(elevationDropMetres, 1),
      mainFlowLengthKm: round(mainFlowLengthKm, 2),
      averageFallMetresPerKm: round(metrics.averageFallMetresPerKm, 1),
      screeningValue: round(metrics.screeningValue, 3),
      sourceSegmentCount: route.edges.length,
    },
    geometry: {
      type: "MultiLineString",
      coordinates: route.edges.map((edge) =>
        simplifyLine(
          edge.coordinates.map((coordinate) => [
            round(coordinate[0], 6),
            round(coordinate[1], 6),
          ]),
        ),
      ),
    },
  };
}

export async function generatePilot() {
  const watersheds = await loadWatersheds();
  const features = [];
  for (let index = 0; index < watersheds.length; index += 1) {
    const feature = await buildFeature(watersheds[index], index, watersheds.length);
    if (feature) features.push(feature);
  }
  const ranked = [...features].sort(
    (left, right) => left.properties.screeningValue - right.properties.screeningValue,
  );
  ranked.forEach((feature, index) => {
    const percentile = ranked.length === 1 ? 1 : index / (ranked.length - 1);
    feature.properties.pilotPercentile = round(percentile, 3);
    feature.properties.potentialClass = potentialClass(percentile);
  });
  features.sort((left, right) =>
    left.properties.watershedName.localeCompare(right.properties.watershedName),
  );
  const retrievedOn = new Date().toISOString().slice(0, 10);
  return {
    type: "FeatureCollection",
    metadata: {
      title: "Inverness hydro terrain-potential pilot",
      retrievedOn,
      municipalityDataset: MUNICIPALITY_DATASET,
      watershedDataset: WATERSHED_DATASET,
      nshnService: NSHN_SERVICE,
      nshnLayers: NSHN_LAYERS,
      method:
        "For each named secondary watershed centred in Inverness County, follow the longest connected route through directed NSHN primary-flow segments. Rank ln(1 + watershed area in km2) multiplied by mapped elevation drop divided by mapped route length. Classes are quartiles within this pilot only.",
      limitations:
        "Terrain screening only. Not measured flow, stream width, seasonal reliability, hydraulic head, power, buildability, access, water rights, fish-habitat review, or approval.",
    },
    features,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pilot = await generatePilot();
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(pilot)}\n`);
  process.stdout.write(`Wrote ${pilot.features.length} features to ${OUTPUT_PATH}\n`);
}

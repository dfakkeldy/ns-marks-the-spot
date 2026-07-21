import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MUNICIPALITY_DATASET = "7bqh-hssn";
const WATERSHED_DATASET = "ynkv-x6rx";
const TERTIARY_CATCHMENT_DATASET = "6htv-yzkm";
const SUB_TERTIARY_CATCHMENT_DATASET = "s4r5-2srh";
const MINIMUM_CATCHMENT_COVERAGE = 0.9;
const DROP_THRESHOLDS_METRES = [5, 10, 20, 30];
const MAX_DOWNSTREAM_DISTANCE_METRES = 3_000;
const NOMINAL_SPECIFIC_DISCHARGE_LPS_PER_KM2 = 8;
const NOMINAL_SYSTEM_EFFICIENCY = 0.6;
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
  const middle = (coordinates.length - 1) / 2;
  const before = coordinates[Math.floor(middle)];
  const after = coordinates[Math.ceil(middle)];
  return [
    (before[0] + after[0]) / 2,
    (before[1] + after[1]) / 2,
  ];
}

function coordinateDistanceMetres(left, right) {
  const radians = Math.PI / 180;
  const meanLatitude = ((left[1] + right[1]) / 2) * radians;
  const x = (right[0] - left[0]) * radians * Math.cos(meanLatitude);
  const y = (right[1] - left[1]) * radians;
  return Math.hypot(x, y) * 6_371_008.8;
}

function coordinateSegmentLengths(coordinates, lengthMetres) {
  const rawLengths = coordinates.slice(1).map((coordinate, index) =>
    coordinateDistanceMetres(coordinates[index], coordinate),
  );
  const rawTotal = rawLengths.reduce((total, length) => total + length, 0);
  if (rawTotal <= 0) {
    return rawLengths.map(() => 0);
  }
  return rawLengths.map((length) => (length / rawTotal) * lengthMetres);
}

export function findDownstreamDropCandidates(
  routeEdges,
  startEdgeIndex,
  {
    thresholdsMetres = [10, 25, 50],
    maxDistanceMetres = 10_000,
  } = {},
) {
  const startCoordinate = routeEdges[startEdgeIndex]?.coordinates[0];
  const startElevation = Number(startCoordinate?.[2]);
  if (!Number.isFinite(startElevation)) {
    return [];
  }

  const remainingThresholds = new Set(
    thresholdsMetres.filter((threshold) => threshold > 0),
  );
  const candidates = [];
  let travelledMetres = 0;

  for (
    let edgeIndex = startEdgeIndex;
    edgeIndex < routeEdges.length && remainingThresholds.size > 0;
    edgeIndex += 1
  ) {
    const edge = routeEdges[edgeIndex];
    const segmentLengths = coordinateSegmentLengths(
      edge.coordinates,
      edge.lengthMetres,
    );
    for (
      let coordinateIndex = 1;
      coordinateIndex < edge.coordinates.length && remainingThresholds.size > 0;
      coordinateIndex += 1
    ) {
      const previous = edge.coordinates[coordinateIndex - 1];
      const current = edge.coordinates[coordinateIndex];
      const segmentLength = segmentLengths[coordinateIndex - 1];
      const previousDrop = startElevation - Number(previous[2]);
      const currentDrop = startElevation - Number(current[2]);

      for (const threshold of [...remainingThresholds]) {
        if (
          Number.isFinite(previousDrop) &&
          Number.isFinite(currentDrop) &&
          previousDrop < threshold &&
          currentDrop >= threshold &&
          currentDrop > previousDrop
        ) {
          const progress =
            (threshold - previousDrop) / (currentDrop - previousDrop);
          const routeDistanceMetres = travelledMetres + segmentLength * progress;
          if (routeDistanceMetres <= maxDistanceMetres) {
            candidates.push({
              dropMetres: threshold,
              routeDistanceMetres,
              downstreamCoordinate: [
                previous[0] + (current[0] - previous[0]) * progress,
                previous[1] + (current[1] - previous[1]) * progress,
              ],
            });
          }
          remainingThresholds.delete(threshold);
        }
      }

      travelledMetres += segmentLength;
      if (travelledMetres >= maxDistanceMetres) {
        return candidates.sort((left, right) => left.dropMetres - right.dropMetres);
      }
    }
  }

  return candidates.sort((left, right) => left.dropMetres - right.dropMetres);
}

function edgeSource(edge) {
  return edge.source ?? endpointKey(edge.coordinates[0]);
}

function edgeTarget(edge) {
  return edge.target ?? endpointKey(edge.coordinates.at(-1));
}

function catchmentRouteJoinIndex(routeEdges, allEdges, geometry) {
  const routeIndexByNode = new Map(
    routeEdges.map((edge, edgeIndex) => [edgeSource(edge), edgeIndex]),
  );
  const outgoing = Map.groupBy(allEdges, (edge) => edgeSource(edge));
  const startingNodes = allEdges
    .filter((edge) => pointInGeometry(lineMidpoint(edge.coordinates), geometry))
    .map((edge) => edgeTarget(edge));
  let latestJoinIndex = -1;

  for (const startingNode of startingNodes) {
    const queue = [startingNode];
    const visited = new Set();
    while (queue.length > 0) {
      const node = queue.shift();
      if (visited.has(node)) continue;
      visited.add(node);
      const routeIndex = routeIndexByNode.get(node);
      if (routeIndex !== undefined) {
        latestJoinIndex = Math.max(latestJoinIndex, routeIndex);
        continue;
      }
      for (const edge of outgoing.get(node) ?? []) {
        queue.push(edgeTarget(edge));
      }
    }
  }
  return latestJoinIndex;
}

export function modelRouteReaches(
  routeEdges,
  catchments,
  dropOptions,
  allEdges = routeEdges,
) {
  const joinContributions = new Map();
  for (const catchment of catchments) {
    const joinEdgeIndex = catchmentRouteJoinIndex(
      routeEdges,
      allEdges,
      catchment.geometry,
    );
    if (joinEdgeIndex >= 0 && Number(catchment.areaKm2) > 0) {
      joinContributions.set(
        joinEdgeIndex,
        (joinContributions.get(joinEdgeIndex) ?? 0) + Number(catchment.areaKm2),
      );
    }
  }

  let upstreamAreaKm2 = 0;
  const reaches = [];
  routeEdges.forEach((edge, edgeIndex) => {
    upstreamAreaKm2 += joinContributions.get(edgeIndex) ?? 0;
    if (upstreamAreaKm2 <= 0) {
      return;
    }
    reaches.push({
      edgeIndex,
      edge,
      upstreamAreaKm2,
      dropCandidates: findDownstreamDropCandidates(
        routeEdges,
        edgeIndex,
        dropOptions,
      ),
    });
  });
  return reaches;
}

export function selectBestDropCandidate(upstreamAreaKm2, candidates) {
  if (!(upstreamAreaKm2 > 0) || candidates.length === 0) {
    return null;
  }
  return candidates
    .map((candidate) => {
      const routeLengthKm = candidate.routeDistanceMetres / 1_000;
      const averageFallMetresPerKm = candidate.dropMetres / routeLengthKm;
      return {
        ...candidate,
        routeLengthKm,
        averageFallMetresPerKm,
        screeningValue:
          Math.log1p(upstreamAreaKm2) * averageFallMetresPerKm,
      };
    })
    .sort(
      (left, right) =>
        right.screeningValue - left.screeningValue ||
        right.dropMetres - left.dropMetres,
    )[0];
}

export function microHydroClassForKw(indicativePowerKw) {
  if (indicativePowerKw < 1) return "below-1kw";
  if (indicativePowerKw < 5) return "kw-1-5";
  if (indicativePowerKw < 15) return "kw-5-15";
  if (indicativePowerKw < 30) return "kw-15-30";
  if (indicativePowerKw <= 50) return "kw-30-50";
  return "over-50kw";
}

export function selectMicroHydroCandidate(
  upstreamAreaKm2,
  candidates,
  {
    specificDischargeLitresPerSecondPerKm2 =
      NOMINAL_SPECIFIC_DISCHARGE_LPS_PER_KM2,
    efficiency = NOMINAL_SYSTEM_EFFICIENCY,
  } = {},
) {
  if (!(upstreamAreaKm2 > 0) || candidates.length === 0) {
    return null;
  }
  const nominalFlowLitresPerSecond =
    upstreamAreaKm2 * specificDischargeLitresPerSecondPerKm2;
  return candidates
    .map((candidate) => {
      const routeLengthKm = candidate.routeDistanceMetres / 1_000;
      const averageFallMetresPerKm = candidate.dropMetres / routeLengthKm;
      const indicativePowerKw =
        9.81 *
        (nominalFlowLitresPerSecond / 1_000) *
        candidate.dropMetres *
        efficiency;
      return {
        ...candidate,
        routeLengthKm,
        averageFallMetresPerKm,
        nominalFlowLitresPerSecond,
        indicativePowerKw,
        opportunityClass: microHydroClassForKw(indicativePowerKw),
        screeningValue: indicativePowerKw / routeLengthKm,
      };
    })
    .sort(
      (left, right) =>
        right.screeningValue - left.screeningValue ||
        right.indicativePowerKw - left.indicativePowerKw,
    )[0];
}

function endpointKey(coordinate) {
  return `${coordinate[0].toFixed(6)},${coordinate[1].toFixed(6)}`;
}

function longestUpstreamLength(edge, incoming, visiting = new Set()) {
  if (visiting.has(edge.id)) return 0;
  const nextVisiting = new Set(visiting).add(edge.id);
  const previousLength = Math.max(
    0,
    ...(incoming.get(edgeSource(edge)) ?? []).map((previous) =>
      longestUpstreamLength(previous, incoming, nextVisiting),
    ),
  );
  return edge.lengthMetres + previousLength;
}

function catchmentOutletEdge(allEdges, geometry) {
  const insideEdges = allEdges.filter((edge) =>
    pointInGeometry(lineMidpoint(edge.coordinates), geometry),
  );
  if (insideEdges.length === 0) return null;
  const insideIds = new Set(insideEdges.map((edge) => edge.id));
  const outgoing = Map.groupBy(allEdges, (edge) => edgeSource(edge));
  const incoming = Map.groupBy(insideEdges, (edge) => edgeTarget(edge));
  const candidates = insideEdges.filter((edge) =>
    (outgoing.get(edgeTarget(edge)) ?? []).every(
      (nextEdge) => !insideIds.has(nextEdge.id),
    ),
  );
  return (candidates.length > 0 ? candidates : insideEdges)
    .map((edge) => ({
      edge,
      upstreamLength: longestUpstreamLength(edge, incoming),
    }))
    .sort(
      (left, right) =>
        right.upstreamLength - left.upstreamLength ||
        left.edge.id.localeCompare(right.edge.id),
    )[0].edge;
}

function findDownstreamDropCandidatesInNetwork(
  allEdges,
  startEdge,
  {
    thresholdsMetres = DROP_THRESHOLDS_METRES,
    maxDistanceMetres = MAX_DOWNSTREAM_DISTANCE_METRES,
  } = {},
) {
  const startElevation = Number(startEdge.coordinates[0]?.[2]);
  if (!Number.isFinite(startElevation)) return [];
  const thresholds = [...new Set(thresholdsMetres)]
    .filter((threshold) => threshold > 0)
    .sort((left, right) => left - right);
  const outgoing = Map.groupBy(allEdges, (edge) => edgeSource(edge));
  const queue = [{ edge: startEdge, distanceBeforeMetres: 0 }];
  const bestArrival = new Map();
  const candidates = new Map();

  while (queue.length > 0) {
    queue.sort(
      (left, right) =>
        left.distanceBeforeMetres - right.distanceBeforeMetres,
    );
    const { edge, distanceBeforeMetres } = queue.shift();
    if (distanceBeforeMetres >= maxDistanceMetres) continue;
    if (
      distanceBeforeMetres >
      (bestArrival.get(edge.id) ?? Number.POSITIVE_INFINITY)
    ) {
      continue;
    }
    bestArrival.set(edge.id, distanceBeforeMetres);
    const segmentLengths = coordinateSegmentLengths(
      edge.coordinates,
      edge.lengthMetres,
    );
    let distanceAlongEdge = 0;
    for (let index = 1; index < edge.coordinates.length; index += 1) {
      const previous = edge.coordinates[index - 1];
      const current = edge.coordinates[index];
      const segmentLength = segmentLengths[index - 1];
      const previousDrop = startElevation - Number(previous[2]);
      const currentDrop = startElevation - Number(current[2]);
      for (const threshold of thresholds) {
        if (
          Number.isFinite(previousDrop) &&
          Number.isFinite(currentDrop) &&
          previousDrop < threshold &&
          currentDrop >= threshold &&
          currentDrop > previousDrop
        ) {
          const progress =
            (threshold - previousDrop) / (currentDrop - previousDrop);
          const routeDistanceMetres =
            distanceBeforeMetres + distanceAlongEdge + segmentLength * progress;
          const existing = candidates.get(threshold);
          if (
            routeDistanceMetres <= maxDistanceMetres &&
            (!existing || routeDistanceMetres < existing.routeDistanceMetres)
          ) {
            candidates.set(threshold, {
              dropMetres: threshold,
              routeDistanceMetres,
              downstreamCoordinate: [
                previous[0] + (current[0] - previous[0]) * progress,
                previous[1] + (current[1] - previous[1]) * progress,
              ],
            });
          }
        }
      }
      distanceAlongEdge += segmentLength;
    }
    const nextDistance = distanceBeforeMetres + edge.lengthMetres;
    if (nextDistance >= maxDistanceMetres) continue;
    for (const nextEdge of outgoing.get(edgeTarget(edge)) ?? []) {
      if (
        nextDistance <
        (bestArrival.get(nextEdge.id) ?? Number.POSITIVE_INFINITY)
      ) {
        queue.push({ edge: nextEdge, distanceBeforeMetres: nextDistance });
      }
    }
  }
  return [...candidates.values()].sort(
    (left, right) => left.dropMetres - right.dropMetres,
  );
}

export function modelNetworkReaches(allEdges, catchments, dropOptions) {
  const outgoing = Map.groupBy(allEdges, (edge) => edgeSource(edge));
  const catchmentAreas = new Map();
  const contributingCatchments = new Map();

  catchments.forEach((catchment, catchmentIndex) => {
    if (!(Number(catchment.areaKm2) > 0)) return;
    const catchmentId = String(catchment.code ?? catchmentIndex);
    const outletEdge = catchmentOutletEdge(allEdges, catchment.geometry);
    if (!outletEdge) return;
    catchmentAreas.set(catchmentId, Number(catchment.areaKm2));
    const queue = [outletEdge];
    const visited = new Set();
    while (queue.length > 0) {
      const edge = queue.shift();
      if (visited.has(edge.id)) continue;
      visited.add(edge.id);
      const contributors = contributingCatchments.get(edge.id) ?? new Set();
      contributors.add(catchmentId);
      contributingCatchments.set(edge.id, contributors);
      queue.push(...(outgoing.get(edgeTarget(edge)) ?? []));
    }
  });

  return allEdges.flatMap((edge) => {
    const contributors = contributingCatchments.get(edge.id);
    if (!contributors || contributors.size === 0) return [];
    const upstreamAreaKm2 = [...contributors].reduce(
      (total, catchmentId) => total + catchmentAreas.get(catchmentId),
      0,
    );
    return [{
      edge,
      upstreamAreaKm2,
      dropCandidates: findDownstreamDropCandidatesInNetwork(
        allEdges,
        edge,
        dropOptions,
      ),
    }];
  });
}

export function longestDirectedRoute(features, watershedGeometry) {
  const edges = directedEdges(features, watershedGeometry);

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

function directedEdges(features, watershedGeometry) {
  return features.flatMap((feature) => {
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
  const [municipality, watersheds, tertiaryCatchments, subTertiaryCatchments] =
    await Promise.all([
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
      fetchJson(
        socrataUrl(TERTIARY_CATCHMENT_DATASET, {
          $where: "within_box(the_geom,47.1,-61.65,45.75,-60.5)",
          $limit: "5000",
        }),
      ),
      fetchJson(
        socrataUrl(SUB_TERTIARY_CATCHMENT_DATASET, {
          $where: "within_box(the_geom,47.1,-61.65,45.75,-60.5)",
          $limit: "5000",
        }),
      ),
    ]);
  const municipalityGeometry = municipality.features[0]?.geometry;
  if (!municipalityGeometry) {
    throw new Error("The Inverness municipal boundary was not returned.");
  }
  const selectedWatersheds = watersheds.features
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
  const tertiaryByWatershed = Map.groupBy(
    tertiaryCatchments.features.filter(
      ({ properties }) => properties.sec_code !== "WATER",
    ),
    ({ properties }) => properties.sec_code,
  );
  const subTertiaryByWatershed = Map.groupBy(
    subTertiaryCatchments.features.filter(
      ({ properties }) => properties.sec_code !== "WATER",
    ),
    ({ properties }) => properties.sec_code,
  );
  return selectedWatersheds
    .map((watershed) => {
      const code = watershed.properties.sec_code;
      const tertiary = tertiaryByWatershed.get(code) ?? [];
      const subTertiary = subTertiaryByWatershed.get(code) ?? [];
      const subdividedTertiaryCodes = new Set(
        subTertiary.map(({ properties }) => properties.tert_code),
      );
      const catchmentPartition = [
        ...subTertiary,
        ...tertiary.filter(
          ({ properties }) =>
            !subdividedTertiaryCodes.has(properties.tert_code),
        ),
      ];
      const secondaryArea = Number(watershed.properties.shape_area);
      const partitionArea = catchmentPartition.reduce(
        (total, catchment) => total + Number(catchment.properties.shape_area),
        0,
      );
      return {
        ...watershed,
        catchments:
          partitionArea / secondaryArea >= MINIMUM_CATCHMENT_COVERAGE
            ? catchmentPartition
            : [],
        catchmentResolution:
          subTertiary.length > 0 ? "tertiary/sub-tertiary" : "tertiary",
      };
    })
    .filter(
      ({ catchments: watershedCatchments }) =>
        watershedCatchments.length >= 2,
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
  const allEdges = directedEdges(sourceFeatures, watershed.geometry);
  if (allEdges.length === 0) {
    return [];
  }
  const trunkEdgeIds = new Set(
    longestDirectedRoute(sourceFeatures, watershed.geometry).edges.map(
      (edge) => edge.id,
    ),
  );
  const catchmentModels = watershed.catchments.map((catchment) => ({
    code:
      catchment.properties.subtert_code ??
      catchment.properties.tert_code ??
      catchment.properties.OBJECTID,
    areaKm2: Number(catchment.properties.shape_area) / 1_000_000,
    geometry: catchment.geometry,
  }));
  const reaches = modelNetworkReaches(
    allEdges,
    catchmentModels,
    {
      thresholdsMetres: DROP_THRESHOLDS_METRES,
      maxDistanceMetres: MAX_DOWNSTREAM_DISTANCE_METRES,
    },
  );

  return reaches.map(({ edge, upstreamAreaKm2, dropCandidates }) => {
    const best = selectMicroHydroCandidate(upstreamAreaKm2, dropCandidates);
    return {
      type: "Feature",
      id: `${watershed.properties.sec_code}:${edge.id}`,
      properties: {
        watershedCode: watershed.properties.sec_code,
        watershedName: name,
        catchmentResolution: watershed.catchmentResolution,
        networkRole: trunkEdgeIds.has(edge.id) ? "trunk" : "tributary",
        upstreamAreaKm2: round(upstreamAreaKm2, 2),
        dropThresholdMetres: best ? best.dropMetres : null,
        downstreamRouteLengthKm: best ? round(best.routeLengthKm, 2) : null,
        averageMappedFallMetresPerKm: best
          ? round(best.averageFallMetresPerKm, 1)
          : null,
        nominalFlowLitresPerSecond: best
          ? round(best.nominalFlowLitresPerSecond, 1)
          : null,
        indicativePowerKw: best ? round(best.indicativePowerKw, 2) : null,
        screeningValue: best ? round(best.screeningValue, 3) : null,
        downstreamEndpoint: best
          ? best.downstreamCoordinate.map((coordinate) => round(coordinate, 6))
          : null,
        sourceSegmentId: edge.id,
        potentialClass: best ? best.opportunityClass : "not-qualified",
      },
      geometry: {
        type: "MultiLineString",
        coordinates: [
          simplifyLine(
            edge.coordinates.map((coordinate) => [
              round(coordinate[0], 6),
              round(coordinate[1], 6),
            ]),
          ),
        ],
      },
    };
  });
}

export async function generatePilot() {
  const watersheds = await loadWatersheds();
  const features = [];
  for (let index = 0; index < watersheds.length; index += 1) {
    features.push(
      ...(await buildFeature(watersheds[index], index, watersheds.length)),
    );
  }
  const qualifying = features.filter(
    (feature) => feature.properties.screeningValue !== null,
  );
  const targetBandClasses = new Set([
    "kw-1-5",
    "kw-5-15",
    "kw-15-30",
    "kw-30-50",
  ]);
  features.sort(
    (left, right) =>
      left.properties.watershedName.localeCompare(
        right.properties.watershedName,
      ) || String(left.id).localeCompare(String(right.id)),
  );
  const retrievalParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Halifax",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  const retrievedOn = `${retrievalParts.year}-${retrievalParts.month}-${retrievalParts.day}`;
  return {
    type: "FeatureCollection",
    metadata: {
      title: "Inverness micro-hydro screening pilot",
      retrievedOn,
      municipalityDataset: MUNICIPALITY_DATASET,
      secondaryWatershedDataset: WATERSHED_DATASET,
      catchmentDatasets: {
        tertiary: TERTIARY_CATCHMENT_DATASET,
        subTertiary: SUB_TERTIARY_CATCHMENT_DATASET,
      },
      minimumCatchmentCoverage: MINIMUM_CATCHMENT_COVERAGE,
      nshnService: NSHN_SERVICE,
      nshnLayers: NSHN_LAYERS,
      watershedCount: new Set(
        features.map((feature) => feature.properties.watershedCode),
      ).size,
      reachCount: features.length,
      tributaryReachCount: features.filter(
        (feature) => feature.properties.networkRole === "tributary",
      ).length,
      qualifyingReachCount: qualifying.length,
      targetBandReachCount: features.filter((feature) =>
        targetBandClasses.has(feature.properties.potentialClass),
      ).length,
      dropThresholdsMetres: DROP_THRESHOLDS_METRES,
      maxDownstreamDistanceKm: MAX_DOWNSTREAM_DISTANCE_METRES / 1_000,
      nominalSpecificDischargeLitresPerSecondPerKm2:
        NOMINAL_SPECIFIC_DISCHARGE_LPS_PER_KM2,
      nominalSystemEfficiency: NOMINAL_SYSTEM_EFFICIENCY,
      nominalPowerBandKw: [1, 50],
      hydrometricCalibration: {
        source:
          "https://wateroffice.ec.gc.ca/services/daily_data/csv/inline",
        period: "2021-07-21/2026-07-20",
        stations: [
          {
            id: "01FB001",
            name: "Northeast Margaree River at Margaree Valley",
            drainageAreaKm2: 368,
            tenthPercentileSpecificDischargeLitresPerSecondPerKm2: 10.82,
          },
          {
            id: "01FB003",
            name: "Southwest Margaree River near Upper Margaree",
            drainageAreaKm2: 362,
            tenthPercentileSpecificDischargeLitresPerSecondPerKm2: 7.51,
          },
        ],
      },
      method:
        "For named Inverness-centred secondary watersheds whose finest available official tertiary/sub-tertiary catchment partition covers at least 90 percent of the secondary watershed, retain the connected tributary network formed by routing every catchment outlet downstream through directed NSHN primary-flow segments. Union catchment contributions at confluences so area is not double-counted after a split and rejoin. From each reach, find the nearest connected point reaching 5, 10, 20, or 30 metres of mapped drop within 3 kilometres. Use an 8 L/s/km2 regional screening scenario and 60 percent nominal efficiency to calculate a 1 to 50 kW-scale opportunity band, then prefer more indicative power over a shorter mapped route.",
      limitations:
        "Tertiary/sub-tertiary-catchment-resolution screening only: upstream area changes in coarse steps at modeled catchment outlets and is not an exact arbitrary-point delineation. The 8 L/s/km2 flow and 60 percent efficiency values are fixed regional scenarios, not measured flow or net hydraulic head, and the result is not predicted production or seasonal reliability. Not a finding of buildability, access, water rights, fish-habitat review, or approval.",
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

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRef,
  PDFString,
} from "pdf-lib";
import { UserMapImportError } from "../errors";
import { resolveSourceRect } from "../sourceRect";
import { solveAffineFromGcps } from "../transform/affine";
import { buildGcpLatLngMesh } from "../transform/gcpMesh";
import { projectToLatLng, validateCrs } from "../transform/projection";
import type {
  Gcp,
  PdfManualReason,
  PdfRegistrationCandidate,
  PdfRegistrationFlavor,
  PixelRect,
} from "../types";

export type PdfViewportGeometry = {
  width: number;
  height: number;
  transform: [number, number, number, number, number, number];
  viewBox: [number, number, number, number];
};

export type GeoPdfPageStructure = {
  family: PdfRegistrationFlavor;
  structureId: string;
  completeLabels: string[];
  registrationCount: number;
};

export type GeoPdfMetadataExtraction = {
  producer: string | null;
  pageStructure: GeoPdfPageStructure | null;
  candidates: PdfRegistrationCandidate[];
  rejected: Array<{
    flavor: PdfRegistrationFlavor | null;
    reason: Exclude<PdfManualReason, "absent">;
  }>;
};

type RejectedReason = GeoPdfMetadataExtraction["rejected"][number]["reason"];
type Sibling = {
  flavor: PdfRegistrationFlavor;
  structureId: string | null;
  label: string | null;
};

class UnsupportedRegistrationError extends Error {}

const PDF_NUMBER_PATTERN =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?$/;

function key(name: string): PDFName {
  return PDFName.of(name);
}

function resolved(value: PDFObject | undefined): PDFObject | undefined {
  if (value instanceof PDFRef) {
    return undefined;
  }
  return value;
}

function lookup(
  dictionary: PDFDict,
  name: string,
): PDFObject | undefined {
  return resolved(dictionary.lookup(key(name)));
}

function nameValue(value: PDFObject | undefined): string | null {
  return value instanceof PDFName ? value.decodeText() : null;
}

function textValue(value: PDFObject | undefined): string | null {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.decodeText().trim();
  }
  return null;
}

function scalar(value: PDFObject | undefined): number | null {
  if (value instanceof PDFNumber) {
    const number = value.asNumber();
    return Number.isFinite(number) ? number : null;
  }
  if (value instanceof PDFString || value instanceof PDFHexString) {
    const text = value.decodeText().trim();
    if (!PDF_NUMBER_PATTERN.test(text)) {
      return null;
    }
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function numberArray(
  value: PDFObject | undefined,
): number[] | null {
  if (!(value instanceof PDFArray)) {
    return null;
  }
  const numbers: number[] = [];
  for (let index = 0; index < value.size(); index += 1) {
    const number = scalar(value.lookup(index));
    if (number === null) {
      return null;
    }
    numbers.push(number);
  }
  return numbers;
}

function objectIdentity(raw: PDFObject, index: number): string {
  return raw instanceof PDFRef
    ? `${raw.objectNumber}-${raw.generationNumber}`
    : `direct-${index}`;
}

export function applyPdfViewport(
  transform: PdfViewportGeometry["transform"],
  x: number,
  y: number,
): { x: number; y: number } {
  const [a, b, c, d, e, f] = transform;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

function rectFromPoints(
  points: Array<{ x: number; y: number }>,
  viewport: PdfViewportGeometry,
): PixelRect {
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  return resolveSourceRect(
    { width: viewport.width, height: viewport.height },
    {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
  );
}

function candidateId(
  flavor: PdfRegistrationFlavor,
  identity: string,
  rect: PixelRect,
): string {
  const stableRect = [rect.x, rect.y, rect.width, rect.height]
    .map((value) => Number(value.toFixed(7)))
    .join("-");
  return `${flavor}-${identity}-${stableRect}`;
}

function validLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function hasThreeDistinctPixels(gcps: Gcp[]): boolean {
  return new Set(
    gcps.map(({ pixel }) => `${pixel.x}\u001f${pixel.y}`),
  ).size >= 3;
}

/**
 * How far past the rendered raster a control point may sit, as a fraction of
 * the raster's own width or height.
 *
 * A control point names a spot on the page, so the check that it is one is
 * where it lands — not what the file's numbers looked like on the way there.
 * `Measure` builds its pixels from `LPTS`, which the spec defines as fractions
 * of the viewport BBox; a producer that writes page units there instead sends
 * every corner a hundred page-widths off the sheet, and nothing further down
 * notices. The affine those points solve is well conditioned, and the mesh only
 * asks whether the extrapolated corners are still valid latitudes and
 * longitudes, which they are — so the user is told the file placed itself, and
 * the sheet is drawn at a hundredth of its size on ground it does not cover.
 *
 * The tempting check — require `LPTS` inside the unit square — rejects real
 * files, and was written and reverted once on the iOS side for that reason. A
 * sheet whose map frame is rotated a degree or two inside its viewport has
 * corners outside the box on every side: the USGS quadrangle in this file's own
 * regression set runs from -0.02238 to 1.02238.
 *
 * So the line is drawn on the raster instead, where the two cases are nowhere
 * near each other. Measured across every fixture here, that rotated quadrangle
 * is the only one to leave the raster at all, and it leaves it by 1.6%; a
 * page-unit file overshoots by about 9,900%. Half a raster is thirty times the
 * worst real excursion and two hundred times short of the failure — a gap wide
 * enough that tightening it later could only cost real sheets.
 */
const CONTROL_POINT_RASTER_MARGIN = 0.5;

function onRenderedPage(
  { x, y }: { x: number; y: number },
  viewport: PdfViewportGeometry,
): boolean {
  const marginX = viewport.width * CONTROL_POINT_RASTER_MARGIN;
  const marginY = viewport.height * CONTROL_POINT_RASTER_MARGIN;
  return (
    x >= -marginX &&
    x <= viewport.width + marginX &&
    y >= -marginY &&
    y <= viewport.height + marginY
  );
}

function validateCandidate(
  candidate: PdfRegistrationCandidate,
  viewport: PdfViewportGeometry,
): void {
  if (
    candidate.gcps.length < 3 ||
    !hasThreeDistinctPixels(candidate.gcps) ||
    candidate.gcps.some(({ pixel, map }) =>
      !Number.isFinite(pixel.x) ||
      !Number.isFinite(pixel.y) ||
      !validLatLng(map.lat, map.lng)
    )
  ) {
    throw new Error("invalid control points");
  }
  if (candidate.gcps.some(({ pixel }) => !onRenderedPage(pixel, viewport))) {
    throw new Error("control points fall outside the rendered page");
  }
  const params = solveAffineFromGcps(candidate.gcps);
  if (!params) {
    throw new Error("registration does not solve");
  }
  const mesh = buildGcpLatLngMesh(
    params,
    {
      width: candidate.sourceRect.x + candidate.sourceRect.width,
      height: candidate.sourceRect.y + candidate.sourceRect.height,
    },
    1,
    candidate.sourceRect,
  );
  if (
    mesh.flat().some(({ lat, lng }) => !validLatLng(lat, lng))
  ) {
    throw new Error("registration mesh is invalid");
  }
}

function diagnosticReason(error: unknown): RejectedReason {
  if (
    error instanceof UserMapImportError &&
    error.code === "unsupported-crs"
  ) {
    return "unsupported-crs";
  }
  if (error instanceof UnsupportedRegistrationError) {
    return "unsupported";
  }
  return "invalid";
}

function gcsDefinition(dictionary: PDFDict): string {
  const epsg = scalar(lookup(dictionary, "EPSG"));
  const wkt = textValue(lookup(dictionary, "WKT"));
  const type = nameValue(lookup(dictionary, "Type"));
  if (type !== "GEOGCS" && type !== "PROJCS") {
    throw new UnsupportedRegistrationError("unsupported GCS type");
  }
  const definition = epsg !== null ? `EPSG:${epsg}` : wkt;
  if (!definition) {
    throw new Error("missing GCS definition");
  }
  validateCrs(definition);
  return definition;
}

function measureCandidate(
  viewportDictionary: PDFDict,
  identity: string,
  viewport: PdfViewportGeometry,
): PdfRegistrationCandidate {
  if (nameValue(lookup(viewportDictionary, "Type")) !== "Viewport") {
    throw new UnsupportedRegistrationError("unsupported viewport type");
  }
  const bbox = numberArray(lookup(viewportDictionary, "BBox"));
  const measure = lookup(viewportDictionary, "Measure");
  if (
    !bbox ||
    bbox.length !== 4 ||
    !(measure instanceof PDFDict) ||
    nameValue(lookup(measure, "Type")) !== "Measure" ||
    nameValue(lookup(measure, "Subtype")) !== "GEO"
  ) {
    throw new UnsupportedRegistrationError("unsupported Measure structure");
  }
  const gcs = lookup(measure, "GCS");
  if (!(gcs instanceof PDFDict)) {
    throw new Error("missing GCS");
  }
  void gcsDefinition(gcs);

  const local = numberArray(lookup(measure, "LPTS"));
  const ground = numberArray(lookup(measure, "GPTS"));
  if (
    !local ||
    !ground ||
    local.length !== ground.length ||
    local.length < 6 ||
    local.length % 2 !== 0
  ) {
    throw new Error("invalid Measure point arrays");
  }
  // No range check on the local points themselves: they are fractions of the
  // BBox, and real sheets leave the unit square whenever the map frame is
  // rotated inside its viewport. What a file that wrote page units here gets
  // wrong is where the resulting control points land, and that is checked
  // against the rendered raster in `validateCandidate`.
  const [left, bottom, right, top] = bbox;
  if (left === right || bottom === top) {
    throw new Error("empty Measure bounding box");
  }
  const gcps: Gcp[] = [];
  for (let offset = 0; offset < local.length; offset += 2) {
    const localX = local[offset];
    const localY = local[offset + 1];
    const pixel = applyPdfViewport(
      viewport.transform,
      left + (right - left) * localX,
      bottom + (top - bottom) * localY,
    );
    const lat = ground[offset];
    const lng = ground[offset + 1];
    if (!validLatLng(lat, lng)) {
      throw new Error("invalid Measure ground point");
    }
    gcps.push({
      id: `measure-${identity}-gcp-${offset / 2 + 1}`,
      pixel,
      map: { lat, lng },
    });
  }
  const sourceRect = rectFromPoints(
    [
      applyPdfViewport(viewport.transform, left, bottom),
      applyPdfViewport(viewport.transform, left, top),
      applyPdfViewport(viewport.transform, right, bottom),
      applyPdfViewport(viewport.transform, right, top),
    ],
    viewport,
  );
  const candidate: PdfRegistrationCandidate = {
    id: candidateId("measure", identity, sourceRect),
    flavor: "measure",
    embeddedLabel: textValue(lookup(viewportDictionary, "Name")),
    sourceRect,
    gcps,
  };
  validateCandidate(candidate, viewport);
  return candidate;
}

function applyCtm(
  [a, b, c, d, e, f]: readonly number[],
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

function terraGoNad83Definition(datum: PDFObject | undefined): string | null {
  if (!(datum instanceof PDFDict)) {
    return null;
  }
  const ellipsoid = lookup(datum, "Ellipsoid");
  const toWgs84 = lookup(datum, "ToWGS84");
  if (
    textValue(lookup(datum, "Description")) !==
      "North_American_Datum_1983" ||
    !(ellipsoid instanceof PDFDict) ||
    textValue(lookup(ellipsoid, "Description")) !== "GRS 1980" ||
    !(toWgs84 instanceof PDFDict) ||
    textValue(lookup(toWgs84, "Description")) !==
      "Custom To WGS84 Parameters"
  ) {
    return null;
  }
  const semiMajor = scalar(lookup(ellipsoid, "SemiMajorAxis"));
  const inverseFlattening = scalar(lookup(ellipsoid, "InvFlattening"));
  const dx = scalar(lookup(toWgs84, "dx"));
  const dy = scalar(lookup(toWgs84, "dy"));
  const dz = scalar(lookup(toWgs84, "dz"));
  if (
    semiMajor !== 6_378_137 ||
    inverseFlattening !== 298.257222101 ||
    dx === null ||
    dy === null ||
    dz === null
  ) {
    return null;
  }
  return `+a=${semiMajor} +rf=${inverseFlattening} +towgs84=${dx},${dy},${dz},0,0,0,0`;
}

function projectionDefinition(projection: PDFDict): string {
  if (nameValue(lookup(projection, "Type")) !== "Projection") {
    throw new UnsupportedRegistrationError("unsupported projection dictionary");
  }
  const wkt = textValue(lookup(projection, "WKT"));
  if (wkt) {
    validateCrs(wkt);
    return wkt;
  }
  const projectionType =
    textValue(lookup(projection, "ProjectionType")) ??
    nameValue(lookup(projection, "ProjectionType"));
  const datumObject = lookup(projection, "Datum");
  const datum =
    textValue(datumObject) ??
    nameValue(datumObject);
  const units =
    textValue(lookup(projection, "Units")) ??
    nameValue(lookup(projection, "Units"));
  if (projectionType === "GEOGRAPHIC" && datum === "WGE") {
    return "EPSG:4326";
  }
  if (projectionType === "UT" && datum === "NAR") {
    const zone = scalar(lookup(projection, "Zone"));
    const hemisphere =
      textValue(lookup(projection, "Hemisphere")) ??
      nameValue(lookup(projection, "Hemisphere"));
    if (zone === 20 && hemisphere === "N") {
      return "EPSG:26920";
    }
  }
  if (
    projectionType === "MC" &&
    datum === "WGE" &&
    units === "m" &&
    scalar(lookup(projection, "CentralMeridian")) === 0 &&
    scalar(lookup(projection, "OriginLatitude")) === 0 &&
    scalar(lookup(projection, "FalseEasting")) === 0 &&
    scalar(lookup(projection, "FalseNorthing")) === 0 &&
    scalar(lookup(projection, "ScaleFactor")) === 0
  ) {
    return "EPSG:3857";
  }
  const terraGoNad83 = terraGoNad83Definition(datumObject);
  if (terraGoNad83) {
    if (projectionType === "UT" && units === "m") {
      const zone = scalar(lookup(projection, "Zone"));
      const hemisphere =
        textValue(lookup(projection, "Hemisphere")) ??
        nameValue(lookup(projection, "Hemisphere"));
      if ((zone === 10 || zone === 19) && hemisphere === "N") {
        const definition =
          `+proj=utm +zone=${zone} ${terraGoNad83} +units=m +no_defs`;
        validateCrs(definition);
        return definition;
      }
    }
    if (projectionType === "GEOGRAPHIC" && units === "deg") {
      const definition = `+proj=longlat ${terraGoNad83} +no_defs`;
      validateCrs(definition);
      return definition;
    }
  }
  throw new UserMapImportError(
    "unsupported-crs",
    "This PDF registration uses an unsupported coordinate system.",
  );
}

const NEATLINE_AXIS_TOLERANCE = 1e-7;

function axisClusters(values: number[]): number[] {
  const clusters: number[] = [];
  for (const value of [...values].sort((left, right) => left - right)) {
    if (
      clusters.length === 0 ||
      Math.abs(value - clusters[clusters.length - 1]) >
        NEATLINE_AXIS_TOLERANCE
    ) {
      clusters.push(value);
    }
  }
  return clusters;
}

function axisClusterIndex(clusters: number[], value: number): number {
  return clusters.findIndex(
    (cluster) => Math.abs(value - cluster) <= NEATLINE_AXIS_TOLERANCE,
  );
}

function neatlineCorners(dictionary: PDFDict): Array<{ x: number; y: number }> {
  const values = numberArray(lookup(dictionary, "Neatline"));
  if (!values || values.length < 8 || values.length % 2 !== 0) {
    throw new Error("invalid LGIDict neatline");
  }
  const points = Array.from(
    { length: values.length / 2 },
    (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }),
  );
  if (
    points.length === 5 &&
    Math.abs(points[0].x - points[4].x) <= NEATLINE_AXIS_TOLERANCE &&
    Math.abs(points[0].y - points[4].y) <= NEATLINE_AXIS_TOLERANCE
  ) {
    points.pop();
  }
  if (points.length !== 4) {
    throw new UnsupportedRegistrationError("unsupported non-rectangular neatline");
  }
  const xs = axisClusters(points.map(({ x }) => x));
  const ys = axisClusters(points.map(({ y }) => y));
  if (
    xs.length !== 2 ||
    ys.length !== 2 ||
    new Set(
      points.map(
        ({ x, y }) =>
          `${axisClusterIndex(xs, x)}\u001f${axisClusterIndex(ys, y)}`,
      ),
    ).size !== 4
  ) {
    throw new UnsupportedRegistrationError("unsupported non-rectangular neatline");
  }
  return points;
}

function lgiCandidate(
  dictionary: PDFDict,
  identity: string,
  viewport: PdfViewportGeometry,
): PdfRegistrationCandidate {
  const version = textValue(lookup(dictionary, "Version"));
  if (
    nameValue(lookup(dictionary, "Type")) !== "LGIDict" ||
    (version !== "2.1" && version !== "2.3")
  ) {
    throw new UnsupportedRegistrationError("unsupported LGIDict structure");
  }
  const projection = lookup(dictionary, "Projection");
  const ctm = numberArray(lookup(dictionary, "CTM"));
  if (!(projection instanceof PDFDict) || !ctm || ctm.length !== 6) {
    throw new Error("unsupported LGIDict transform");
  }
  const crs = projectionDefinition(projection);
  const corners = neatlineCorners(dictionary);
  const gcps = corners.map(({ x, y }, index): Gcp => {
    const projected = applyCtm(ctm, x, y);
    return {
      id: `lgidict-${identity}-gcp-${index + 1}`,
      pixel: applyPdfViewport(viewport.transform, x, y),
      map: projectToLatLng(crs, projected.x, projected.y),
    };
  });
  const sourceRect = rectFromPoints(
    corners.map(({ x, y }) => applyPdfViewport(viewport.transform, x, y)),
    viewport,
  );
  const candidate: PdfRegistrationCandidate = {
    id: candidateId("lgidict", identity, sourceRect),
    flavor: "lgidict",
    embeddedLabel: textValue(lookup(dictionary, "Description")),
    sourceRect,
    gcps,
  };
  validateCandidate(candidate, viewport);
  return candidate;
}

function asEntries(
  raw: PDFObject,
  resolvedRoot: PDFObject | undefined,
): Array<{ raw: PDFObject; value: PDFObject | undefined; index: number }> {
  if (resolvedRoot instanceof PDFArray) {
    return Array.from({ length: resolvedRoot.size() }, (_, index) => ({
      raw: resolvedRoot.get(index),
      value: resolvedRoot.lookup(index),
      index,
    }));
  }
  return [{ raw, value: resolvedRoot, index: 0 }];
}

export async function extractGeoPdfMetadata(
  bytes: Uint8Array,
  viewport: PdfViewportGeometry,
): Promise<GeoPdfMetadataExtraction> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    return {
      producer: null,
      pageStructure: null,
      candidates: [],
      rejected: [{ flavor: null, reason: "unreadable" }],
    };
  }
  if (document.getPageCount() === 0) {
    return {
      producer: document.getProducer() ?? null,
      pageStructure: null,
      candidates: [],
      rejected: [{ flavor: null, reason: "unreadable" }],
    };
  }

  const page = document.getPage(0);
  const candidates: PdfRegistrationCandidate[] = [];
  const rejected: GeoPdfMetadataExtraction["rejected"] = [];
  const siblings: Sibling[] = [];

  const vpRaw = page.node.get(key("VP"));
  if (vpRaw) {
    const vpRoot = page.node.lookup(key("VP"));
    if (!(vpRoot instanceof PDFArray)) {
      rejected.push({ flavor: "measure", reason: "unsupported" });
      siblings.push({
        flavor: "measure",
        structureId: null,
        label: null,
      });
    } else {
      for (const entry of asEntries(vpRaw, vpRoot)) {
        const dictionary =
          entry.value instanceof PDFDict ? entry.value : null;
        const label = dictionary
          ? textValue(lookup(dictionary, "Name"))
          : null;
        const structurallyMeasure =
          dictionary &&
          nameValue(lookup(dictionary, "Type")) === "Viewport" &&
          lookup(dictionary, "Measure") instanceof PDFDict;
        siblings.push({
          flavor: "measure",
          structureId: structurallyMeasure ? "measure-vp-geo-v1" : null,
          label,
        });
        if (!dictionary || !structurallyMeasure) {
          rejected.push({ flavor: "measure", reason: "unsupported" });
          continue;
        }
        try {
          candidates.push(
            measureCandidate(
              dictionary,
              objectIdentity(entry.raw, entry.index),
              viewport,
            ),
          );
        } catch (error) {
          rejected.push({
            flavor: "measure",
            reason: diagnosticReason(error),
          });
        }
      }
    }
  }

  const lgiRaw = page.node.get(key("LGIDict"));
  if (lgiRaw) {
    const lgiRoot = page.node.lookup(key("LGIDict"));
    const structureId = lgiRoot instanceof PDFArray
      ? "lgidict-array-v1"
      : "lgidict-single-v1";
    for (const entry of asEntries(lgiRaw, lgiRoot)) {
      const dictionary =
        entry.value instanceof PDFDict ? entry.value : null;
      const label = dictionary
        ? textValue(lookup(dictionary, "Description"))
        : null;
      const structurallyLgi =
        dictionary &&
        nameValue(lookup(dictionary, "Type")) === "LGIDict";
      siblings.push({
        flavor: "lgidict",
        structureId: structurallyLgi ? structureId : null,
        label,
      });
      if (!dictionary || !structurallyLgi) {
        rejected.push({ flavor: "lgidict", reason: "unsupported" });
        continue;
      }
      try {
        candidates.push(
          lgiCandidate(
            dictionary,
            objectIdentity(entry.raw, entry.index),
            viewport,
          ),
        );
      } catch (error) {
        rejected.push({
          flavor: "lgidict",
          reason: diagnosticReason(error),
        });
      }
    }
  }

  const first = siblings[0];
  const pageStructure =
    first &&
    first.structureId &&
    siblings.every(
      (sibling) =>
        sibling.flavor === first.flavor &&
        sibling.structureId === first.structureId,
    )
      ? {
          family: first.flavor,
          structureId: first.structureId,
          completeLabels: siblings.map(({ label }) => label ?? ""),
          registrationCount: siblings.length,
        }
      : null;

  return {
    producer: document.getProducer() ?? null,
    pageStructure,
    candidates,
    rejected,
  };
}

import proj4 from "proj4";
import { UserMapImportError } from "../errors";

export type EmbeddedGeoref = {
  kind: "embedded";
  /** "EPSG:xxxx" or a raw proj4-parseable definition/WKT string (citation fallback). */
  crs: string;
  /** GDAL order: [originX, xRes, xRot, originY, yRot, yRes]. */
  geotransform: [number, number, number, number, number, number];
};

export type PixelSize = { width: number; height: number };
export type LatLngPoint = { lat: number; lng: number };

/**
 * The CRSs Nova Scotia rasters actually ship in (spec-locked list). This is
 * an allowlist, not a "can proj4 parse it" check: proj4 has built-in
 * definitions for a lot of common EPSG codes (e.g. WGS84 UTM zones) that we
 * do NOT want to accept just because proj4 happens to recognize them — only
 * the codes NS source data actually uses are allowed through.
 */
export const SUPPORTED_EPSG_CODES = [26920, 2961, 2962, 4617, 4326, 3857] as const;

const EPSG_PATTERN = /^EPSG:(\d+)$/i;

const PROJ_DEFS: Record<string, string> = {
  "EPSG:26920": "+proj=utm +zone=20 +datum=NAD83 +units=m +no_defs",
  "EPSG:2961":
    "+proj=utm +zone=20 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  "EPSG:2962":
    "+proj=utm +zone=21 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  "EPSG:4617": "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs",
};

let registered = false;

function ensureProjectionsRegistered(): void {
  if (registered) {
    return;
  }
  for (const [code, def] of Object.entries(PROJ_DEFS)) {
    proj4.defs(code, def);
  }
  registered = true;
}

function isSupportedEpsgCode(code: number): boolean {
  return (SUPPORTED_EPSG_CODES as readonly number[]).includes(code);
}

/**
 * True when proj4 can actually build a projection from a raw definition
 * string (proj4 params or WKT). This is how a GeoTIFF citation string
 * (Task 4's fallback when no EPSG code is embedded) gets validated: it never
 * matches the "EPSG:xxxx" form, so it has to be checked by construction.
 */
function isParseableDefinition(def: string): boolean {
  try {
    // Constructed only to see if it throws; the instance itself is unused.
    void new proj4.Proj(def);
    return true;
  } catch {
    return false;
  }
}

function unsupportedCrsError(crs: string): UserMapImportError {
  return new UserMapImportError(
    "unsupported-crs",
    `Unsupported coordinate system (${crs}). Reproject to UTM zone 20N ` +
      "(EPSG:26920) or WGS84 and re-import.",
  );
}

const converterCache = new Map<string, proj4.Converter>();

function converterFor(crs: string): proj4.Converter {
  const trimmed = crs.trim();
  const cached = converterCache.get(trimmed);
  if (cached) {
    return cached;
  }

  ensureProjectionsRegistered();

  const epsgMatch = EPSG_PATTERN.exec(trimmed);
  // The lookup key proj4 actually receives: for EPSG-form strings this is
  // the canonical uppercase form (proj4's definition registry is
  // case-sensitive, unlike our /i allowlist match), so "epsg:26920" and
  // "EPSG:26920" resolve identically. Raw proj4 definitions are passed
  // through verbatim, since they're case-sensitive in their own right
  // (e.g. "+proj=utm" must stay lowercase).
  let lookupKey = trimmed;
  if (epsgMatch) {
    // EPSG-form strings are checked against the locked allowlist rather than
    // proj4's own knowledge, since proj4 recognizes many EPSG codes (e.g.
    // WGS84 UTM zones) that NS source data never actually ships in.
    if (!isSupportedEpsgCode(Number(epsgMatch[1]))) {
      throw unsupportedCrsError(trimmed);
    }
    lookupKey = `EPSG:${epsgMatch[1]}`;
  } else if (!isParseableDefinition(trimmed)) {
    throw unsupportedCrsError(trimmed);
  }

  let converter: proj4.Converter;
  try {
    converter = proj4(lookupKey, "EPSG:4326");
  } catch {
    throw unsupportedCrsError(trimmed);
  }
  converterCache.set(trimmed, converter);
  return converter;
}

/** Import-time gate so a bad CRS fails the import, not the first render. */
export function validateCrs(crs: string): void {
  converterFor(crs);
}

export function pixelToLatLng(
  georef: EmbeddedGeoref,
  x: number,
  y: number,
): LatLngPoint {
  const [ox, xRes, xRot, oy, yRot, yRes] = georef.geotransform;
  const projX = ox + x * xRes + y * xRot;
  const projY = oy + x * yRot + y * yRes;
  return projectToLatLng(georef.crs, projX, projY);
}

export function projectToLatLng(
  crs: string,
  x: number,
  y: number,
): LatLngPoint {
  const [lng, lat] = converterFor(crs).forward([x, y]);
  // proj4 doesn't throw for a finite-but-out-of-domain input (e.g. a
  // tiepoint that lands nowhere near the declared UTM zone) — it returns
  // null/Infinity/NaN instead. Left unchecked, `new L.LatLng(...)` silently
  // coerces that to (0, 0), so the map draws triangles stretched across the
  // globe instead of failing. Catch it here so a bad CRS/tiepoint pairing is
  // an import-time error, not a render-time surprise.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new UserMapImportError(
      "invalid-georeferencing",
      "This file's georeferencing produced coordinates outside the " +
        "coordinate system's valid area. Check the file's CRS and re-export it.",
    );
  }
  return { lat, lng };
}

/**
 * A lattice of geographic positions over the raster. Drawing through a grid
 * rather than one rectangle absorbs the curvature that UTM→WebMercator
 * reprojection introduces across county-scale rasters, and is the same code
 * path the PR-3 thin-plate-spline warp will feed.
 */
export function buildLatLngMesh(
  georef: EmbeddedGeoref,
  pixelSize: PixelSize,
  gridSize = 8,
): LatLngPoint[][] {
  const mesh: LatLngPoint[][] = [];
  for (let row = 0; row <= gridSize; row += 1) {
    const line: LatLngPoint[] = [];
    const y = (pixelSize.height * row) / gridSize;
    for (let col = 0; col <= gridSize; col += 1) {
      const x = (pixelSize.width * col) / gridSize;
      line.push(pixelToLatLng(georef, x, y));
    }
    mesh.push(line);
  }
  return mesh;
}

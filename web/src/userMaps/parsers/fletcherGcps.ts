import type { Gcp } from "../types";
import type { PixelSize } from "../transform/projection";
import { UserMapImportError } from "../errors";

/**
 * The column header emitted by both `tools/fletcher/emit_gcps.py` and
 * `emit_physical_gcps.py`. Matched exactly rather than sniffed loosely: a file
 * with different columns is a different format, and importing it by position
 * would silently place pins at nonsense coordinates.
 */
export const FLETCHER_GCP_HEADER = "pixel_x,pixel_y,lon,lat,role,label";

const CONTROL_ROLE = "control";
const CHECK_ROLE = "check";

/** Fallback precision when emitting points that never came from a file. */
const DEFAULT_PIXEL_DP = 1;
const DEFAULT_LONLAT_DP = 8;

export type FletcherRole = typeof CONTROL_ROLE | typeof CHECK_ROLE;

export type FletcherPointRow = {
  id: string;
  pixel: { x: number; y: number };
  map: { lat: number; lng: number };
  role: FletcherRole;
  /**
   * The field text exactly as it appeared in the source file.
   *
   * Kept because the two Python emitters disagree on precision — the graticule
   * emitter writes lon/lat at 6 decimals and the feature-led one at 8 — so
   * re-formatting from the parsed float would round-trip one of them wrong.
   * Echoing the original text makes byte-identical output independent of which
   * emitter produced the file, and of any future precision change.
   */
  source: { pixelX: string; pixelY: string; lon: string; lat: string };
};

export type ParsedFletcherGcps = {
  /** Control points only, in the shape the georeferencer stores. */
  gcps: Gcp[];
  /**
   * Held-out check points. Deliberately NOT merged into `gcps`: the Python
   * pipeline fits on controls alone and scores against these, so promoting a
   * check to a control would make the accuracy figure circular.
   */
  checks: Gcp[];
  /** Every row in file order, carrying role and original field text. */
  rows: FletcherPointRow[];
  /** Leading `#` lines, preserved so a round trip keeps the provenance banner. */
  comments: string[];
};

function refuse(code: "unsupported-type" | "invalid-georeferencing", message: string): never {
  throw new UserMapImportError(code, message);
}

function parseNumber(text: string, field: string, line: number): number {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value)) {
    refuse(
      "invalid-georeferencing",
      `Line ${line}: ${field} is not a number ("${text}").`,
    );
  }
  return value;
}

export function parseFletcherGcps(
  text: string,
  options: { pixelSize?: PixelSize } = {},
): ParsedFletcherGcps {
  const lines = text.split(/\r?\n/);
  const comments: string[] = [];
  const rows: FletcherPointRow[] = [];
  let sawHeader = false;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === "") {
      return;
    }
    if (line.startsWith("#")) {
      // Only banner comments before the header are preserved; a stray comment
      // further down would change row order on re-emit.
      if (!sawHeader) {
        comments.push(line);
      }
      return;
    }
    if (!sawHeader) {
      if (line !== FLETCHER_GCP_HEADER) {
        refuse(
          "unsupported-type",
          `Not a Fletcher points file. Expected the header "${FLETCHER_GCP_HEADER}".`,
        );
      }
      sawHeader = true;
      return;
    }

    const lineNumber = index + 1;
    // Split on the first five commas only: labels contain no commas today, but
    // splitting the remainder keeps a future comma-bearing label intact rather
    // than truncating it.
    const parts = line.split(",");
    if (parts.length < 6) {
      refuse(
        "invalid-georeferencing",
        `Line ${lineNumber}: expected 6 columns, found ${parts.length}.`,
      );
    }
    const [pixelX, pixelY, lon, lat, role] = parts;
    const label = parts.slice(5).join(",");

    if (role !== CONTROL_ROLE && role !== CHECK_ROLE) {
      refuse(
        "invalid-georeferencing",
        `Line ${lineNumber}: role must be "${CONTROL_ROLE}" or "${CHECK_ROLE}", found "${role}".`,
      );
    }

    const x = parseNumber(pixelX, "pixel_x", lineNumber);
    const y = parseNumber(pixelY, "pixel_y", lineNumber);
    const lngValue = parseNumber(lon, "lon", lineNumber);
    const latValue = parseNumber(lat, "lat", lineNumber);

    if (lngValue < -180 || lngValue > 180 || latValue < -90 || latValue > 90) {
      refuse(
        "invalid-georeferencing",
        `Line ${lineNumber}: coordinate ${latValue}, ${lngValue} is outside WGS84 range.`,
      );
    }

    rows.push({
      id: label,
      pixel: { x, y },
      map: { lat: latValue, lng: lngValue },
      role,
      source: { pixelX, pixelY, lon, lat },
    });
  });

  if (!sawHeader) {
    refuse(
      "unsupported-type",
      `Not a Fletcher points file. Expected the header "${FLETCHER_GCP_HEADER}".`,
    );
  }

  if (options.pixelSize) {
    const { width, height } = options.pixelSize;
    const outside = rows.find(
      (row) =>
        row.pixel.x < 0 ||
        row.pixel.y < 0 ||
        row.pixel.x > width ||
        row.pixel.y > height,
    );
    if (outside) {
      // A points file emitted against a different scan of the same sheet will
      // parse cleanly and land pins in the wrong place, so the size check is
      // the only thing standing between a mismatched file and silent garbage.
      refuse(
        "invalid-georeferencing",
        `Point "${outside.id}" at ${outside.pixel.x}, ${outside.pixel.y} falls outside this image (${width} x ${height}). ` +
          `These points were measured against a different scan.`,
      );
    }
  }

  const toGcp = (row: FletcherPointRow): Gcp => ({
    id: row.id,
    pixel: row.pixel,
    map: row.map,
  });
  const gcps = rows.filter((row) => row.role === CONTROL_ROLE).map(toGcp);
  const checks = rows.filter((row) => row.role === CHECK_ROLE).map(toGcp);

  if (gcps.length === 0) {
    refuse(
      "invalid-georeferencing",
      "This file has no control points, so there is nothing to place.",
    );
  }

  return { gcps, checks, rows, comments };
}

function fieldText(
  source: string | undefined,
  value: number,
  decimals: number,
): string {
  return source ?? value.toFixed(decimals);
}

export function serializeFletcherGcps(
  parsed: Pick<ParsedFletcherGcps, "rows">,
  options: { comments?: string[] } = {},
): string {
  const lines = [...(options.comments ?? []), FLETCHER_GCP_HEADER];
  for (const row of parsed.rows) {
    lines.push(
      [
        fieldText(row.source?.pixelX, row.pixel.x, DEFAULT_PIXEL_DP),
        fieldText(row.source?.pixelY, row.pixel.y, DEFAULT_PIXEL_DP),
        fieldText(row.source?.lon, row.map.lng, DEFAULT_LONLAT_DP),
        fieldText(row.source?.lat, row.map.lat, DEFAULT_LONLAT_DP),
        row.role,
        row.id,
      ].join(","),
    );
  }
  // Trailing newline: the Python emitters end their files with one, and a
  // round trip has to reproduce it.
  return `${lines.join("\n")}\n`;
}

import type { Gcp } from "./types";
import {
  FLETCHER_GCP_HEADER,
  serializeFletcherGcps,
  type FletcherPointRow,
} from "./parsers/fletcherGcps";

/**
 * Point placement lives in IndexedDB, which no backup reaches and "clear site
 * data" empties without warning. Two sheets' worth of hand placement has
 * already had to be recovered out of it by hand; both times the work survived
 * because someone thought to ask, not because anything was watching.
 *
 * So a session that changed anything writes itself out on the way closed. A
 * download is the only place a page may put a file without being handed a
 * directory first, so that is where it goes — the copy is worth more in the
 * wrong folder than it is missing.
 */

/**
 * How often an OPEN session writes a checkpoint.
 *
 * Not a debounce, and deliberately three orders of magnitude longer than the
 * 400 ms IndexedDB one in `useGeoreferenceSession`. That write is cheap and
 * invisible; this one puts a file in the user's Downloads folder, so the
 * cadence is bounded by how much clutter an afternoon may produce rather than
 * by how much work a crash may cost. At five minutes a two-hour sheet leaves
 * about two dozen files, each a valid restore point; at the 15 s a debounce
 * would suggest it leaves four hundred, and the real one is unfindable among
 * them.
 */
export const AUTO_EXPORT_INTERVAL_MS = 5 * 60_000;

/** Filesystem-safe, and sorts chronologically inside a folder. */
export function exportTimestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  );
}

export function exportFileName(recordName: string, now: Date): string {
  const slug =
    recordName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "user-map";
  return `${slug}-${exportTimestamp(now)}.csv`;
}

/**
 * The same schema the importer reads, so an auto-saved file can be dragged
 * straight back in. Checks are written with their own role and stay out of any
 * fit on re-import, which is what makes the file a complete record of the
 * session rather than a lossy snapshot of half of it.
 */
export function buildExportCsv(
  recordName: string,
  gcps: Gcp[],
  checks: Gcp[],
  now: Date,
): string {
  // Full precision, not the emitters' 1 and 8 decimals. Those exist to keep
  // GENERATED pipeline files stable and diffable; this file is a snapshot whose
  // only job is to restore the session exactly. A dragged point carries a
  // sub-pixel position (800.25 rounds to 800.3), and a backup that quietly
  // moves every point on the way back in is not a backup.
  const exact = (gcp: Gcp, role: "control" | "check"): FletcherPointRow => ({
    ...gcp,
    role,
    source: {
      pixelX: String(gcp.pixel.x),
      pixelY: String(gcp.pixel.y),
      lon: String(gcp.map.lng),
      lat: String(gcp.map.lat),
    },
  });
  const rows: FletcherPointRow[] = [
    ...gcps.map((gcp) => exact(gcp, "control")),
    ...checks.map((gcp) => exact(gcp, "check")),
  ];
  const comments = [
    `# ${recordName} — auto-saved ${now.toISOString()}.`,
    `# ${gcps.length} control${gcps.length === 1 ? "" : "s"}` +
      (checks.length > 0 ? `, ${checks.length} held-out check${checks.length === 1 ? "" : "s"}` : "") +
      ". Re-import this file to restore the session.",
  ];
  return serializeFletcherGcps({ rows }, { comments });
}

/**
 * True when the point set differs from what the session opened with. Compared
 * by value rather than by reference: every drag replaces the array, so a
 * reference check would report a change for a drag that was undone back to
 * where it started.
 */
export function pointsChanged(before: Gcp[], after: Gcp[]): boolean {
  if (before.length !== after.length) {
    return true;
  }
  return before.some((gcp, index) => {
    const other = after[index];
    return (
      !other ||
      gcp.id !== other.id ||
      gcp.pixel.x !== other.pixel.x ||
      gcp.pixel.y !== other.pixel.y ||
      gcp.map.lat !== other.map.lat ||
      gcp.map.lng !== other.map.lng
    );
  });
}

export { FLETCHER_GCP_HEADER };

import { describe, expect, it } from "vitest";
import {
  buildExportCsv,
  exportFileName,
  exportTimestamp,
  pointsChanged,
} from "./autoExport";
import { parseFletcherGcps } from "./parsers/fletcherGcps";
import type { Gcp } from "./types";

const NOW = new Date(2026, 7, 1, 9, 5, 3); // local time, 2026-08-01T09:05:03

const GCPS: Gcp[] = [
  { id: "gcp-1", pixel: { x: 100.5, y: 200 }, map: { lat: 45.9, lng: -61.5 } },
  { id: "cand-7", pixel: { x: 900, y: 800.25 }, map: { lat: 45.8, lng: -61.4 } },
];
const CHECKS: Gcp[] = [
  { id: "k1", pixel: { x: 500, y: 500 }, map: { lat: 45.85, lng: -61.45 } },
];

describe("exportTimestamp", () => {
  it("is filesystem-safe and sorts chronologically", () => {
    expect(exportTimestamp(NOW)).toBe("2026-08-01T09-05-03");
    // No colons: they are illegal in filenames on Windows and awkward on macOS.
    expect(exportTimestamp(NOW)).not.toContain(":");
    const later = exportTimestamp(new Date(2026, 7, 1, 9, 5, 4));
    expect(later > exportTimestamp(NOW)).toBe(true);
  });
});

describe("exportFileName", () => {
  it("slugs the record name", () => {
    expect(exportFileName("Fletcher sheet 19 — Judique", NOW)).toBe(
      "fletcher-sheet-19-judique-2026-08-01T09-05-03.csv",
    );
  });

  it("falls back rather than producing a dotfile for an unslug-able name", () => {
    // "———.csv" would be a hidden file on macOS and unopenable by name.
    expect(exportFileName("———", NOW)).toBe("user-map-2026-08-01T09-05-03.csv");
  });
});

describe("buildExportCsv", () => {
  it("round-trips through the importer", () => {
    // The point of auto-saving is that the file can be dragged back in, so the
    // exporter has to write what the parser reads.
    const parsed = parseFletcherGcps(buildExportCsv("m", GCPS, CHECKS, NOW));
    expect(parsed.gcps).toEqual(GCPS);
    expect(parsed.checks).toEqual(CHECKS);
  });

  it("keeps checks out of the controls on the way back in", () => {
    const parsed = parseFletcherGcps(buildExportCsv("m", GCPS, CHECKS, NOW));
    expect(parsed.gcps.map((g) => g.id)).not.toContain("k1");
  });

  it("works with no checks at all", () => {
    const parsed = parseFletcherGcps(buildExportCsv("m", GCPS, [], NOW));
    expect(parsed.gcps).toHaveLength(2);
    expect(parsed.checks).toHaveLength(0);
  });

  it("records what it holds, in the file", () => {
    const csv = buildExportCsv("Sheet 16", GCPS, CHECKS, NOW);
    expect(csv).toContain("Sheet 16 — auto-saved");
    expect(csv).toContain("2 controls, 1 held-out check");
  });
});

describe("pointsChanged", () => {
  it("is false for the same points in a new array", () => {
    // Every drag replaces the array, so a reference check would call a drag
    // that was undone back to its start a change, and write a pointless file.
    expect(pointsChanged(GCPS, GCPS.map((g) => ({ ...g })))).toBe(false);
  });

  it("notices a moved pixel, a moved map point, a rename, and a count change", () => {
    const moved = [{ ...GCPS[0]!, pixel: { x: 101, y: 200 } }, GCPS[1]!];
    expect(pointsChanged(GCPS, moved)).toBe(true);

    const remapped = [{ ...GCPS[0]!, map: { lat: 45.91, lng: -61.5 } }, GCPS[1]!];
    expect(pointsChanged(GCPS, remapped)).toBe(true);

    const renamed = [{ ...GCPS[0]!, id: "other" }, GCPS[1]!];
    expect(pointsChanged(GCPS, renamed)).toBe(true);

    expect(pointsChanged(GCPS, [GCPS[0]!])).toBe(true);
  });
});

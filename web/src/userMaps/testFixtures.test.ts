import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { argmax, BENT, nudgeGcpEast } from "./testFixtures";
import { groundMetresBetween } from "./transform/webMercator";

type GeoPdfFixtureReceipt = {
  byteSize?: number;
  expected?: string;
  file: string;
  sha256: string;
};

type GeoPdfFixtureManifest = {
  fixtures: GeoPdfFixtureReceipt[];
  schemaVersion: number;
};

const geoPdfFixtureDirectory = join(
  process.cwd(),
  "src",
  "test",
  "fixtures",
  "geopdf",
);

describe("nudgeGcpEast", () => {
  it("moves the named point by the requested GROUND metres and nothing else", () => {
    // The helper's whole job is to hand a later test an externally known
    // distance. A conversion that forgot the cos(latitude) factor would still
    // "move the point east", but by 144 m when asked for 100 — and every
    // accuracy assertion built on it would be silently wrong by 44%.
    const moved = nudgeGcpEast(BENT, 2, 100);
    expect(groundMetresBetween(moved[2].map, BENT[2].map)).toBeCloseTo(100, 6);
    expect(moved[2].map.lat).toBe(BENT[2].map.lat);
    expect(moved[2].map.lng).toBeGreaterThan(BENT[2].map.lng);
  });

  it("leaves every other point exactly where it was", () => {
    // Translating the whole array would move the fit along with the points, so
    // the displaced point's leave-one-out error would no longer be the known
    // distance. That is the trap the index argument exists to avoid.
    const moved = nudgeGcpEast(BENT, 2, 100);
    expect(moved).not.toBe(BENT);
    expect(BENT[2].map.lng).toBe(-61.421238); // input untouched
    for (let i = 0; i < BENT.length; i += 1) {
      if (i !== 2) {
        expect(moved[i]).toEqual(BENT[i]);
      }
    }
  });
});

describe("argmax", () => {
  it("returns the FIRST index of the maximum, matching residualReport's scan", () => {
    expect(argmax([3, 9, 4])).toBe(1);
    expect(argmax([9, 1, 9])).toBe(0);
    expect(argmax([2])).toBe(0);
    expect(argmax([])).toBe(-1);
  });
});

describe("GeoPDF fixture manifest", () => {
  it("pins every tracked PDF to its reviewed bytes", async () => {
    const manifest = JSON.parse(
      await readFile(join(geoPdfFixtureDirectory, "manifest.json"), "utf8"),
    ) as GeoPdfFixtureManifest;

    expect(manifest.schemaVersion).toBe(1);
    for (const fixture of manifest.fixtures) {
      const bytes = await readFile(join(geoPdfFixtureDirectory, fixture.file));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        fixture.sha256,
      );
      if (fixture.byteSize !== undefined) {
        expect(bytes.byteLength).toBe(fixture.byteSize);
      }
    }
  });

  it("freezes a final result for both registration families", async () => {
    const manifest = JSON.parse(
      await readFile(join(geoPdfFixtureDirectory, "manifest.json"), "utf8"),
    ) as GeoPdfFixtureManifest;
    const fixtureByFile = new Map(
      manifest.fixtures.map((fixture) => [fixture.file, fixture]),
    );

    for (const file of ["test_iso32000.pdf", "test_ogc_bp.pdf"]) {
      expect(fixtureByFile.get(file)?.expected).toMatch(
        /^(automatic|manual-unsupported)$/,
      );
    }
  });
});

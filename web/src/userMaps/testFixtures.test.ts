import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { argmax, BENT, nudgeGcpEast } from "./testFixtures";
import { groundMetresBetween } from "./transform/webMercator";

type GeoPdfFixtureReceipt = {
  byteSize?: number;
  expected: string;
  file: string;
  gdalGeoTransform?: number[];
  gdalVersion?: string;
  generator?: string;
  pageCount?: number | null;
  registration: string;
  sha256: string;
  sourceInput?: string;
};

type GeoPdfFixtureManifest = {
  fixtures: GeoPdfFixtureReceipt[];
  schemaVersion: number;
  sourceLicence: string;
  sourceRepository: string;
};

const geoPdfFixtureDirectory = join(
  process.cwd(),
  "src",
  "test",
  "fixtures",
  "geopdf",
);
const upstreamGeoPdfFixtures = new Set([
  "adobe_style_geospatial.pdf",
  "byte_and_rgbsmall_2pages.pdf",
  "byte_enc.pdf",
  "test_iso32000.pdf",
  "test_ogc_bp.pdf",
]);

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
  it("pins the unique exact PDF set and every required receipt field", async () => {
    const manifest = JSON.parse(
      await readFile(join(geoPdfFixtureDirectory, "manifest.json"), "utf8"),
    ) as GeoPdfFixtureManifest;
    const manifestFiles = manifest.fixtures
      .map((fixture) => fixture.file)
      .sort();
    const directoryFiles = (await readdir(geoPdfFixtureDirectory))
      .filter((file) => /\.pdf$/i.test(file))
      .sort();

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sourceRepository).toBe("https://github.com/OSGeo/gdal");
    expect(manifest.sourceLicence).toBe("MIT");
    expect(new Set(manifestFiles).size).toBe(manifestFiles.length);
    expect(manifestFiles).toEqual(directoryFiles);

    for (const fixture of manifest.fixtures) {
      expect(fixture.file).toBe(basename(fixture.file));
      expect(fixture.file).toMatch(/^[a-zA-Z0-9._-]+\.pdf$/);
      expect(fixture.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(fixture.registration.length).toBeGreaterThan(0);
      expect(fixture.expected.length).toBeGreaterThan(0);

      if (upstreamGeoPdfFixtures.has(fixture.file)) {
        expect(Object.hasOwn(fixture, "pageCount")).toBe(true);
        expect(
          fixture.pageCount === null ||
            (Number.isInteger(fixture.pageCount) &&
              (fixture.pageCount ?? 0) > 0),
        ).toBe(true);
      } else {
        expect(Object.hasOwn(fixture, "byteSize")).toBe(true);
        expect(Number.isInteger(fixture.byteSize)).toBe(true);
        expect(fixture.byteSize).toBeGreaterThan(0);
        expect(fixture.sourceInput?.length).toBeGreaterThan(0);
        expect(fixture.generator?.length).toBeGreaterThan(0);
        expect(fixture.gdalVersion).toBe(
          "GDAL 3.9.0, released 2024/05/07 (debug build)",
        );
      }

      if (fixture.gdalGeoTransform !== undefined) {
        expect(fixture.gdalGeoTransform).toHaveLength(6);
        expect(fixture.gdalGeoTransform.every(Number.isFinite)).toBe(true);
      }

      const bytes = await readFile(join(geoPdfFixtureDirectory, fixture.file));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        fixture.sha256,
      );
      if (fixture.byteSize !== undefined) {
        expect(bytes.byteLength).toBe(fixture.byteSize);
      }
    }
  });

  it("pins both failed registration families to manual-unsupported", async () => {
    const manifest = JSON.parse(
      await readFile(join(geoPdfFixtureDirectory, "manifest.json"), "utf8"),
    ) as GeoPdfFixtureManifest;
    const fixtureByFile = new Map(
      manifest.fixtures.map((fixture) => [fixture.file, fixture]),
    );

    expect(fixtureByFile.get("test_iso32000.pdf")).toMatchObject({
      expected: "manual-unsupported",
      gdalGeoTransform: [2, 0.05, 0, 49, 0, -0.05],
      pageCount: 1,
      registration: "measure",
    });
    expect(fixtureByFile.get("test_ogc_bp.pdf")).toMatchObject({
      expected: "manual-unsupported",
      gdalGeoTransform: [2, 0.05, 0, 49, 0, -0.05],
      pageCount: 1,
      registration: "lgidict",
    });
  });
});

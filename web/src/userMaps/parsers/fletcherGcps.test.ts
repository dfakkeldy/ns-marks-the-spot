import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFletcherGcps,
  serializeFletcherGcps,
  FLETCHER_GCP_HEADER,
} from "./fletcherGcps";
import { UserMapImportError } from "../errors";

/**
 * Resolved from this file rather than `process.cwd()` — vitest's worker cwd is
 * not the package directory, and a cwd-relative path silently found a
 * different, shorter directory listing.
 */
const EMITTED_GCP_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tools/fletcher/gcps",
);

/** Two controls and one check, matching the emitted tools/fletcher/gcps schema. */
const SAMPLE = [
  "# sheet-19 Fletcher graticule points.",
  "# GENERATED - edit the observation JSON and re-emit; do not hand-edit.",
  FLETCHER_GCP_HEADER,
  "1652.0,1326.0,-61.583333,45.916667,control,61d35mW 45d55mN",
  "1652.0,3950.0,-61.583333,45.833333,check,61d35mW 45d50mN",
  "3472.0,1326.0,-61.500000,45.916667,control,61d30mW 45d55mN",
  "",
].join("\n");

describe("parseFletcherGcps", () => {
  it("maps control rows onto Gcp pixel/map shape", () => {
    const parsed = parseFletcherGcps(SAMPLE);
    expect(parsed.gcps).toEqual([
      {
        id: "61d35mW 45d55mN",
        pixel: { x: 1652, y: 1326 },
        map: { lat: 45.916667, lng: -61.583333 },
      },
      {
        id: "61d30mW 45d55mN",
        pixel: { x: 3472, y: 1326 },
        map: { lat: 45.916667, lng: -61.5 },
      },
    ]);
  });

  it("excludes check rows from the GCPs but retains them", () => {
    const parsed = parseFletcherGcps(SAMPLE);
    // Feeding checks to the solver would make the accuracy measurement
    // circular — the Python side drops them the same way.
    expect(parsed.gcps.map((g) => g.id)).not.toContain("61d35mW 45d50mN");
    expect(parsed.checks).toHaveLength(1);
    expect(parsed.checks[0]?.id).toBe("61d35mW 45d50mN");
  });

  it("ignores comment lines and blank lines", () => {
    const parsed = parseFletcherGcps(SAMPLE);
    expect(parsed.gcps).toHaveLength(2);
    expect(parsed.checks).toHaveLength(1);
  });

  it("refuses a file whose header is not the Fletcher schema", () => {
    const wrong = "x,y,lon,lat\n1,2,3,4\n";
    expect(() => parseFletcherGcps(wrong)).toThrow(UserMapImportError);
    try {
      parseFletcherGcps(wrong);
    } catch (error) {
      expect((error as UserMapImportError).code).toBe("unsupported-type");
    }
  });

  it("refuses a row with a non-numeric coordinate rather than importing NaN", () => {
    const bad = [FLETCHER_GCP_HEADER, "1652.0,nope,-61.58,45.91,control,a"].join(
      "\n",
    );
    expect(() => parseFletcherGcps(bad)).toThrow(UserMapImportError);
  });

  it("refuses an out-of-range coordinate", () => {
    const bad = [FLETCHER_GCP_HEADER, "1.0,2.0,-361.0,45.91,control,a"].join(
      "\n",
    );
    expect(() => parseFletcherGcps(bad)).toThrow(UserMapImportError);
  });

  it("refuses a file with no control rows — nothing to place", () => {
    const onlyChecks = [
      FLETCHER_GCP_HEADER,
      "1652.0,3950.0,-61.583333,45.833333,check,c1",
    ].join("\n");
    expect(() => parseFletcherGcps(onlyChecks)).toThrow(UserMapImportError);
  });

  it("refuses pixel coordinates outside the image when a size is supplied", () => {
    expect(() =>
      parseFletcherGcps(SAMPLE, { pixelSize: { width: 2000, height: 2000 } }),
    ).toThrow(UserMapImportError);
    // Same points inside a large enough image are fine.
    expect(
      parseFletcherGcps(SAMPLE, { pixelSize: { width: 10000, height: 8000 } })
        .gcps,
    ).toHaveLength(2);
  });
});

describe("serializeFletcherGcps", () => {
  it("round-trips a parsed file byte-identically", () => {
    const parsed = parseFletcherGcps(SAMPLE);
    const emitted = serializeFletcherGcps(parsed, { comments: parsed.comments });
    expect(emitted).toBe(SAMPLE);
    // And parsing the emission yields the same points again.
    expect(parseFletcherGcps(emitted).gcps).toEqual(parsed.gcps);
  });

  it("preserves the control/check split across a round trip", () => {
    const parsed = parseFletcherGcps(SAMPLE);
    const again = parseFletcherGcps(
      serializeFletcherGcps(parsed, { comments: parsed.comments }),
    );
    expect(again.gcps).toEqual(parsed.gcps);
    expect(again.checks).toEqual(parsed.checks);
  });
});

/**
 * The parser and the two Python emitters are separate implementations of one
 * format, so the only test that catches drift between them reads what the
 * emitters actually produced. Skipped rather than failed if the tools tree is
 * absent, so a standalone `web/` checkout still passes.
 */
describe("round trip against the emitted Fletcher files", () => {
  const files = existsSync(EMITTED_GCP_DIR)
    ? readdirSync(EMITTED_GCP_DIR)
        .filter((name) => name.endsWith(".csv"))
        .sort()
    : [];

  it("finds the emitted sheets", () => {
    expect(files.length).toBeGreaterThanOrEqual(24);
  });

  it.skipIf(files.length === 0).each(files)(
    "round-trips %s byte-identically",
    (name) => {
      const text = readFileSync(join(EMITTED_GCP_DIR, name), "utf8");
      const parsed = parseFletcherGcps(text);
      expect(serializeFletcherGcps(parsed, { comments: parsed.comments })).toBe(
        text,
      );
    },
  );
});

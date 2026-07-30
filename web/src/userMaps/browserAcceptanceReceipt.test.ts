import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REQUIRED_ARRAYS = [
  "topologies",
  "browsers",
  "files",
  "performance",
  "cleanup",
  "networkPrivacy",
] as const;

type Receipt = {
  schemaVersion: number;
  headSha: string;
  decision: string;
} & Record<(typeof REQUIRED_ARRAYS)[number], unknown[]>;

function validateReceipt(value: unknown): asserts value is Receipt {
  if (!value || typeof value !== "object") {
    throw new Error("receipt must be an object");
  }
  const receipt = value as Partial<Receipt>;
  if (receipt.schemaVersion !== 1) {
    throw new Error("unsupported schema version");
  }
  if (!receipt.headSha || !/^[0-9a-f]{40}$/.test(receipt.headSha)) {
    throw new Error("headSha must be a full Git SHA");
  }
  if (receipt.decision !== "pass" && receipt.decision !== "blocked") {
    throw new Error("decision must be pass or blocked");
  }
  for (const key of REQUIRED_ARRAYS) {
    if (!Array.isArray(receipt[key]) || receipt[key].length === 0) {
      throw new Error(`${key} must be a non-empty array`);
    }
  }
}

const receiptPath = join(
  __dirname,
  "../../../docs/research/2026-07-28-geopdf-browser-acceptance.json",
);
const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as unknown;

describe("GeoPDF browser acceptance receipt", () => {
  it("has the required stable schema and a full tested SHA", () => {
    expect(() => validateReceipt(receipt)).not.toThrow();
  });

  it("rejects an empty required evidence array", () => {
    validateReceipt(receipt);
    for (const key of REQUIRED_ARRAYS) {
      expect(() => validateReceipt({ ...receipt, [key]: [] })).toThrow(
        `${key} must be a non-empty array`,
      );
    }
  });

  it("rejects unknown decisions and abbreviated SHAs", () => {
    validateReceipt(receipt);
    expect(() =>
      validateReceipt({ ...receipt, decision: "partial" }),
    ).toThrow("decision must be pass or blocked");
    expect(() =>
      validateReceipt({ ...receipt, headSha: "c9ceb4d78" }),
    ).toThrow("headSha must be a full Git SHA");
  });

  it("contains no local absolute path or personal device name", () => {
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toMatch(/\/(?:Users|private\/tmp)\//);
    expect(serialized).not.toContain("Dan’s");
  });

  it("keeps the durable screenshot count synchronized with the repository", () => {
    validateReceipt(receipt);
    const screenshots = (receipt as Receipt & { screenshots?: unknown[] })
      .screenshots;
    expect(Array.isArray(screenshots)).toBe(true);
    const screenshotEntry = screenshots?.[0] as {
      directory?: unknown;
      count?: unknown;
    };
    expect(screenshotEntry.directory).toBe(
      "docs/research/geopdf-browser-evidence",
    );
    expect(screenshotEntry.count).toBe(57);

    const evidenceDirectory = join(
      __dirname,
      "../../../docs/research/geopdf-browser-evidence",
    );
    expect(existsSync(evidenceDirectory)).toBe(true);
    const evidenceFiles = readdirSync(evidenceDirectory);
    expect(evidenceFiles).toHaveLength(57);
    expect(evidenceFiles.every((name) => /\.jpe?g$/i.test(name))).toBe(true);
    for (const name of evidenceFiles) {
      expect(
        readFileSync(join(evidenceDirectory, name)).subarray(0, 3),
      ).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    }
  });
});

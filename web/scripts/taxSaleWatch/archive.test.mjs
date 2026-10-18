import { describe, expect, it } from "vitest";
import {
  findHashableCapture,
  parseCdxTimestamps,
  parseSaveTimestamp,
  sha256,
  waybackIdUrl,
} from "./archive.mjs";

const PAGE = "https://www.cumberlandcounty.ns.ca/tax-sales.html";
const hasTable = (text) => text.includes("TAX SALE RESULTS");

describe("wayback url helpers", () => {
  it("builds an id_ replay url that serves original bytes", () => {
    expect(waybackIdUrl("20260415155709", PAGE)).toBe(
      `https://web.archive.org/web/20260415155709id_/${PAGE}`,
    );
  });

  it("reads the capture timestamp out of a save redirect", () => {
    expect(
      parseSaveTimestamp(`https://web.archive.org/web/20260724022617/${PAGE}`),
    ).toBe("20260724022617");
    expect(parseSaveTimestamp("https://web.archive.org/save/")).toBeNull();
  });

  it("returns cdx timestamps newest first", () => {
    const body = JSON.stringify([
      ["timestamp", "original"],
      ["20251113031043", PAGE],
      ["20260415155709", PAGE],
    ]);
    expect(parseCdxTimestamps(body)).toEqual([
      "20260415155709",
      "20251113031043",
    ]);
  });

  it("tolerates an empty cdx response", () => {
    expect(parseCdxTimestamps("")).toEqual([]);
    expect(parseCdxTimestamps("[]")).toEqual([]);
  });
});

describe("findHashableCapture", () => {
  it("skips a capture whose raw bytes are an interstitial", async () => {
    const bodies = {
      "20260724022617": "One moment, please... being verified",
      "20260415155709": "<table>MARCH 3, 2026 TAX SALE RESULTS</table>",
    };
    const fetchImpl = async (url) => {
      const timestamp = url.match(/\/web\/(\d{14})id_\//u)[1];
      return { ok: true, text: async () => bodies[timestamp] };
    };

    const capture = await findHashableCapture(PAGE, {
      fetchImpl,
      verify: hasTable,
      timestamps: ["20260724022617", "20260415155709"],
    });

    expect(capture.timestamp).toBe("20260415155709");
    expect(capture.sha256).toBe(sha256(bodies["20260415155709"]));
    expect(capture.url).toBe(waybackIdUrl("20260415155709", PAGE));
  });

  it("returns null when no capture carries the table", async () => {
    const fetchImpl = async () => ({
      ok: true,
      text: async () => "One moment, please...",
    });
    await expect(
      findHashableCapture(PAGE, {
        fetchImpl,
        verify: hasTable,
        timestamps: ["20260724022617"],
      }),
    ).resolves.toBeNull();
  });

  it("ignores a capture that fails to fetch and keeps looking", async () => {
    const fetchImpl = async (url) =>
      url.includes("20260724022617")
        ? { ok: false, status: 503, statusText: "Service Unavailable" }
        : { ok: true, text: async () => "TAX SALE RESULTS" };

    const capture = await findHashableCapture(PAGE, {
      fetchImpl,
      verify: hasTable,
      timestamps: ["20260724022617", "20260415155709"],
    });
    expect(capture.timestamp).toBe("20260415155709");
  });
});

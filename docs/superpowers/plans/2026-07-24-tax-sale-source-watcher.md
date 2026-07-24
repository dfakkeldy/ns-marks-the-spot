# Tax-sale source watcher — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive Cumberland's overwrite-prone tax-sale page before each sale destroys the last one, and ingest a newly published sale into the historical dataset as a reviewable pull request.

**Architecture:** Four small ES modules under `web/scripts/`. Source-specific parsing lives in `taxSaleWatch/cumberland.mjs`; Wayback submission and capture verification in `taxSaleWatch/archive.mjs`; dataset/ledger construction and byte-exact re-serialization in `taxSaleWatch/dataset.mjs`; `watchTaxSaleSources.mjs` holds the source config array and orchestrates. Network functions take an injected `fetchImpl` so orchestration is testable offline.

**Tech Stack:** Node 20 ESM (`.mjs`), vitest, GitHub Actions. No new dependencies.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-24-tax-sale-source-watcher-design.md`.
- No new npm dependencies. Node built-ins only (`node:crypto`, `node:fs/promises`, global `fetch`).
- Money parses to integer cents by string manipulation. **Never `parseFloat`.**
- The `NAME` (assessed owner) column is discarded during parsing, before any record object is built.
- Every guard failure throws with a specific, quotable message. `main()` catches, prints, and sets `process.exitCode = 1`. No partial writes.
- Tests never touch the network. Pure functions get inline fixture strings; orchestration gets an injected fake `fetchImpl`.
- Data files are LF-only and end with a trailing newline.
- Conventional Commits.
- Existing user-facing dataset invariants in `web/src/data/historicalTaxSales.ts` are unchanged — the watcher produces records that satisfy `validateHistoricalTaxSaleDataset` as-is.

---

### Task 1: Cumberland parser and outcome classifier

**Files:**
- Create: `web/scripts/taxSaleWatch/cumberland.mjs`
- Test: `web/scripts/taxSaleWatch/cumberland.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `moneyToCents(text: string): number | null`
  - `classifyOutcome(raw: string): { outcome: string, winningBidCents: number | null, resultNote?: string }` — throws on anything unrecognized
  - `parseResults(html: string): { saleDate: string, heading: string, listingIdentifierLabel: string, rows: Row[] }`
  - `Row = { listingIdentifier, pid, description, redemptionLabel, advertisedAmountCents, winningRaw }`
  - `containsResultsTable(html: string): boolean`
  - `CUMBERLAND_SOURCE` config object

- [ ] **Step 1: Write failing tests for `moneyToCents` and `classifyOutcome`**

```js
import { describe, expect, it } from "vitest";
import { classifyOutcome, moneyToCents } from "./cumberland.mjs";

describe("moneyToCents", () => {
  it("parses printed dollar amounts to integer cents", () => {
    expect(moneyToCents("$36,000.00")).toBe(3_600_000);
    expect(moneyToCents("$2,728.33")).toBe(272_833);
    expect(moneyToCents("$684.32")).toBe(68_432);
    expect(moneyToCents("$1,300")).toBe(130_000);
  });

  it("returns null for non-money cells", () => {
    expect(moneyToCents("ADJORNED")).toBeNull();
    expect(moneyToCents("")).toBeNull();
  });
});

describe("classifyOutcome", () => {
  it("maps a printed bid to a sold outcome", () => {
    expect(classifyOutcome("$36,000.00")).toEqual({
      outcome: "sold",
      winningBidCents: 3_600_000,
    });
  });

  it("maps the municipality's ADJORNED spelling to withdrawn with no bid", () => {
    const result = classifyOutcome("ADJORNED");
    expect(result.outcome).toBe("withdrawn");
    expect(result.winningBidCents).toBeNull();
    expect(result.resultNote).toMatch(/ADJORNED/u);
  });

  it("keeps NOT COMPLETED fail-closed as outcome unknown", () => {
    const result = classifyOutcome("NOT COMPLETED");
    expect(result.outcome).toBe("unknown");
    expect(result.winningBidCents).toBeNull();
    expect(result.resultNote).toMatch(/NOT COMPLETED/u);
  });

  it("refuses to guess at an unfamiliar status word", () => {
    expect(() => classifyOutcome("POSTPONED")).toThrow(
      /Unrecognized winning-bid value "POSTPONED"/u,
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run scripts/taxSaleWatch/cumberland.test.mjs`
Expected: FAIL — cannot resolve `./cumberland.mjs`.

- [ ] **Step 3: Implement `moneyToCents` and `classifyOutcome`**

```js
export function moneyToCents(text) {
  const cleaned = String(text).replace(/[^\d.]/gu, "");
  if (!cleaned || !/\d/u.test(cleaned)) {
    return null;
  }
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
}

export function classifyOutcome(raw) {
  const value = String(raw).trim();
  const cents = moneyToCents(value);
  if (cents !== null) {
    return { outcome: "sold", winningBidCents: cents };
  }
  if (value.toUpperCase() === "ADJORNED") {
    // The municipality's own spelling of "adjourned". The parcel was taken off
    // this sale, so no transfer and no published bid.
    return {
      outcome: "withdrawn",
      winningBidCents: null,
      resultNote:
        'Official result column reads "ADJORNED" (adjourned) as printed by the municipality; the parcel was taken off this sale and no winning bid was published.',
    };
  }
  if (value.toUpperCase() === "NOT COMPLETED") {
    // Ambiguous: could mean no sale, or a high bid that fell through. Fail closed.
    return {
      outcome: "unknown",
      winningBidCents: null,
      resultNote:
        'Official result column reads "NOT COMPLETED" with no published amount; the source does not say whether a bid was received, so no outcome or winning bid is inferred.',
    };
  }
  throw new Error(
    `Unrecognized winning-bid value "${value}". Classify it by hand before ingesting this sale.`,
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd web && npx vitest run scripts/taxSaleWatch/cumberland.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write failing tests for `parseResults`**

Use this inline fixture (a trimmed copy of the real page structure — heading row, header row, two data rows):

```js
const FIXTURE = `
<div><table>
<tr><td></td><td></td><td></td><td>MARCH 3, 2026 TAX SALE RESULTS</td><td></td><td></td><td></td></tr>
<tr><td>AAN</td><td>PID</td><td>NAME</td><td>DESCRIPTION</td><td>REDEMPTION EXPIRY</td><td>MIN BID</td><td>WINNING BID</td></tr>
<tr><td>7463308</td><td>25369646</td><td>DALE ALLAN CHAPMAN</td><td>4115 HIGHWAY 366 LOT 98-1 TIDNISH CROSS ROADS BUILDING GARAGE</td><td>6 MONTH</td><td>$2,728.33</td><td>$36,000.00</td></tr>
<tr><td>3849805</td><td>25147562</td><td>FLORENCE L PYE EST</td><td>9613 HIGHWAY 6 PUGWASH LAND</td><td>IMMEDIATE</td><td>$17,377.89</td><td>ADJORNED</td></tr>
</table></div>`;
```

```js
describe("parseResults", () => {
  it("reads the sale date, identifier label, and owner-free rows", () => {
    const parsed = parseResults(FIXTURE);
    expect(parsed.saleDate).toBe("2026-03-03");
    expect(parsed.listingIdentifierLabel).toBe("AAN");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({
      listingIdentifier: "7463308",
      pid: "25369646",
      description:
        "4115 HIGHWAY 366 LOT 98-1 TIDNISH CROSS ROADS BUILDING GARAGE",
      redemptionLabel: "Redemption expiry - 6 month",
      advertisedAmountCents: 272_833,
      winningRaw: "$36,000.00",
    });
    expect(parsed.rows[1].redemptionLabel).toBe(
      "Redemption expiry - Immediate",
    );
  });

  it("discards the owner NAME column entirely", () => {
    expect(JSON.stringify(parseResults(FIXTURE)).toUpperCase()).not.toContain(
      "CHAPMAN",
    );
  });

  it("reads the October heading and ASSESSMENT identifier label", () => {
    const october = FIXTURE.replace(
      "MARCH 3, 2026 TAX SALE RESULTS",
      "OCTOBER 21, 2025 TAX SALE RESULTS",
    ).replace("<td>AAN</td>", "<td>ASSESSMENT</td>");
    const parsed = parseResults(october);
    expect(parsed.saleDate).toBe("2025-10-21");
    expect(parsed.listingIdentifierLabel).toBe("Assessment");
  });

  it("fails closed on a malformed PID", () => {
    expect(() => parseResults(FIXTURE.replace("25369646", "2536"))).toThrow(
      /invalid PID "2536"/u,
    );
  });

  it("fails closed when the sale heading is missing", () => {
    expect(() =>
      parseResults(FIXTURE.replace("MARCH 3, 2026 TAX SALE RESULTS", "RESULTS")),
    ).toThrow(/Could not find a dated tax-sale results heading/u);
  });

  it("fails closed when the page has no table", () => {
    expect(() => parseResults("<div>no results yet</div>")).toThrow(
      /Expected exactly one results table, found 0/u,
    );
  });

  it("fails closed on a non-positive minimum bid", () => {
    expect(() => parseResults(FIXTURE.replace("$2,728.33", "$0.00"))).toThrow(
      /non-positive minimum bid/u,
    );
  });
});

describe("containsResultsTable", () => {
  it("accepts a captured page carrying the table", () => {
    expect(containsResultsTable(FIXTURE)).toBe(true);
  });

  it("rejects a bot-verification interstitial", () => {
    expect(
      containsResultsTable(
        "<html><body>One moment, please... your request is being verified</body></html>",
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd web && npx vitest run scripts/taxSaleWatch/cumberland.test.mjs`
Expected: FAIL — `parseResults is not a function`.

- [ ] **Step 7: Implement `parseResults`, `containsResultsTable`, and `CUMBERLAND_SOURCE`**

```js
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const HEADING_PATTERN =
  /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+TAX\s+SALE\s+RESULTS/iu;

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)));
}

function cellsOf(row) {
  return Array.from(
    row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/giu),
    ([, cell]) =>
      decodeEntities(cell.replace(/<[^>]+>/gu, ""))
        .replace(/\s+/gu, " ")
        .trim(),
  );
}

export function containsResultsTable(html) {
  return HEADING_PATTERN.test(html.replace(/<[^>]+>/gu, " "));
}

function redemptionLabel(raw) {
  const value = raw.trim().toUpperCase();
  if (value === "6 MONTH") return "Redemption expiry - 6 month";
  if (value === "IMMEDIATE") return "Redemption expiry - Immediate";
  throw new Error(`Unrecognized redemption expiry "${raw}".`);
}

export function parseResults(html) {
  const tables = html.match(/<table[\s\S]*?<\/table>/giu) ?? [];
  if (tables.length !== 1) {
    throw new Error(
      `Expected exactly one results table, found ${tables.length}.`,
    );
  }

  const heading = tables[0].replace(/<[^>]+>/gu, " ").match(HEADING_PATTERN);
  if (!heading) {
    throw new Error(
      "Could not find a dated tax-sale results heading on the page.",
    );
  }
  const monthIndex = MONTHS.indexOf(heading[1].toLowerCase());
  if (monthIndex < 0) {
    throw new Error(`Unrecognized month "${heading[1]}" in the sale heading.`);
  }
  const saleDate = `${heading[3]}-${String(monthIndex + 1).padStart(2, "0")}-${String(
    Number(heading[2]),
  ).padStart(2, "0")}`;

  const rowMarkup = tables[0].match(/<tr[\s\S]*?<\/tr>/giu) ?? [];
  const headerCells = rowMarkup
    .map(cellsOf)
    .find((cells) => cells.some((cell) => cell.toUpperCase() === "PID"));
  if (!headerCells) {
    throw new Error("Could not find the results table header row.");
  }
  const rawLabel = headerCells[0].toUpperCase();
  if (rawLabel !== "AAN" && rawLabel !== "ASSESSMENT") {
    throw new Error(
      `Unrecognized listing-identifier column "${headerCells[0]}".`,
    );
  }
  const listingIdentifierLabel = rawLabel === "AAN" ? "AAN" : "Assessment";

  const rows = [];
  for (const markup of rowMarkup) {
    const cells = cellsOf(markup);
    // Column order: identifier, PID, NAME, DESCRIPTION, REDEMPTION, MIN BID, WINNING BID.
    // Index 2 is the assessed-owner name and is never read.
    if (cells.length < 7 || !/^\d+$/u.test(cells[0])) {
      continue;
    }
    if (!/^\d{8}$/u.test(cells[1])) {
      throw new Error(
        `Row ${cells[0]} has an invalid PID "${cells[1]}"; expected eight digits.`,
      );
    }
    const advertisedAmountCents = moneyToCents(cells[5]);
    if (advertisedAmountCents === null || advertisedAmountCents <= 0) {
      throw new Error(
        `Row ${cells[0]} has a non-positive minimum bid "${cells[5]}".`,
      );
    }
    rows.push({
      listingIdentifier: cells[0],
      pid: cells[1],
      description: cells[3],
      redemptionLabel: redemptionLabel(cells[4]),
      advertisedAmountCents,
      winningRaw: cells[6],
    });
  }

  if (rows.length === 0) {
    throw new Error("The results table contained no parsable rows.");
  }
  return { saleDate, heading: heading[0], listingIdentifierLabel, rows };
}

export const CUMBERLAND_SOURCE = {
  id: "cumberland",
  municipalityId: "cumberland",
  municipality: "Municipality of the County of Cumberland",
  shortMunicipality: "Cumberland",
  landingPageUrl: "https://www.cumberlandcounty.ns.ca/tax-sales.html",
  saleMethod: "public-auction",
  advertisedAmountLabel: "Min bid",
  snapshotPath: "cumberlandTaxSale.snapshot.json",
  parseResults,
  classifyOutcome,
  containsResultsTable,
};
```

- [ ] **Step 8: Run to verify pass**

Run: `cd web && npx vitest run scripts/taxSaleWatch/cumberland.test.mjs`
Expected: PASS, 15 tests.

- [ ] **Step 9: Verify the parser against the real archived page**

Run:
```bash
cd web && node -e '
const { parseResults } = await import("./scripts/taxSaleWatch/cumberland.mjs");
const html = await (await fetch("https://web.archive.org/web/20260415155709id_/https://www.cumberlandcounty.ns.ca/tax-sales.html")).text();
const parsed = parseResults(html);
console.log(parsed.saleDate, parsed.listingIdentifierLabel, parsed.rows.length);
' --input-type=module
```
Expected: `2026-03-03 AAN 14`. This confirms the parser reproduces the hand-verified ingest.

- [ ] **Step 10: Commit**

```bash
git add web/scripts/taxSaleWatch/cumberland.mjs web/scripts/taxSaleWatch/cumberland.test.mjs
git commit -m "feat(web): add the Cumberland tax-sale results parser"
```

---

### Task 2: Wayback archive client

**Files:**
- Create: `web/scripts/taxSaleWatch/archive.mjs`
- Test: `web/scripts/taxSaleWatch/archive.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sha256(input: string | Buffer): string`
  - `waybackIdUrl(timestamp: string, url: string): string`
  - `parseSaveTimestamp(finalUrl: string): string | null`
  - `parseCdxTimestamps(body: string): string[]` — newest first
  - `submitToWayback(url, { fetchImpl }): Promise<string | null>`
  - `findHashableCapture(url, { fetchImpl, verify, timestamps }): Promise<{ timestamp, url, sha256 } | null>`

The `verify` callback receives captured text and returns a boolean — Task 1's `containsResultsTable` is passed in, keeping this module source-agnostic.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run scripts/taxSaleWatch/archive.test.mjs`
Expected: FAIL — cannot resolve `./archive.mjs`.

- [ ] **Step 3: Implement the module**

```js
import { createHash } from "node:crypto";

const USER_AGENT = "NS-Marks-tax-sale-monitor/1.0";

export function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

// The id_ suffix replays the original archived bytes with no toolbar injection,
// which is what keeps a recorded SHA-256 independently reproducible.
export function waybackIdUrl(timestamp, url) {
  return `https://web.archive.org/web/${timestamp}id_/${url}`;
}

export function parseSaveTimestamp(finalUrl) {
  return finalUrl.match(/\/web\/(\d{14})/u)?.[1] ?? null;
}

export function parseCdxTimestamps(body) {
  if (!body.trim()) {
    return [];
  }
  let rows;
  try {
    rows = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const [header, ...data] = rows;
  const column = header.indexOf("timestamp");
  return data
    .map((row) => row[column])
    .filter((value) => /^\d{14}$/u.test(value))
    .sort((left, right) => right.localeCompare(left));
}

export async function submitToWayback(url, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(
    `https://web.archive.org/save/${url}`,
    { headers: { "User-Agent": USER_AGENT }, redirect: "follow" },
  );
  if (!response.ok) {
    return null;
  }
  return parseSaveTimestamp(response.url ?? "");
}

export async function listCaptures(url, { fetchImpl = fetch } = {}) {
  const query = new URLSearchParams({
    url,
    matchType: "exact",
    output: "json",
    fl: "timestamp,original",
    collapse: "digest",
    limit: "40",
  });
  const response = await fetchImpl(
    `https://web.archive.org/cdx/search/cdx?${query}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!response.ok) {
    return [];
  }
  return parseCdxTimestamps(await response.text());
}

export async function findHashableCapture(
  url,
  { fetchImpl = fetch, verify, timestamps },
) {
  const candidates =
    timestamps ?? (await listCaptures(url, { fetchImpl }));

  for (const timestamp of candidates) {
    const captureUrl = waybackIdUrl(timestamp, url);
    let body;
    try {
      const response = await fetchImpl(captureUrl, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!response.ok) {
        continue;
      }
      body = await response.text();
    } catch {
      continue;
    }
    // Save Page Now can store a bot-verification interstitial whose replay still
    // renders correctly. Only bytes that actually carry the table are hashable.
    if (verify(body)) {
      return { timestamp, url: captureUrl, sha256: sha256(body) };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd web && npx vitest run scripts/taxSaleWatch/archive.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add web/scripts/taxSaleWatch/archive.mjs web/scripts/taxSaleWatch/archive.test.mjs
git commit -m "feat(web): add a Wayback archive client that verifies capture bytes"
```

---

### Task 3: Byte-exact dataset and ledger serializers

This task's deliverable is the guarantee that automation can rewrite the two data
files without reflowing them. The round-trip tests are the whole point: they read
the real committed files and assert the formatter reproduces them byte for byte.

**Files:**
- Create: `web/scripts/taxSaleWatch/dataset.mjs`
- Test: `web/scripts/taxSaleWatch/dataset.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatDataset(dataset: object): string`
  - `formatLedger(ledger: object): string`
  - `eventIdFor(sourceId: string, saleDate: string): string`
  - `buildEvent({ source, sale, capture, retrievedOn }): object`
  - `buildRecords({ source, sale, eventId }): object[]`
  - `buildLedgerEntry({ source, sale, capture, retrievedOn, livePageSha256 }): object`

- [ ] **Step 1: Write the failing round-trip tests**

```js
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDataset, formatLedger } from "./dataset.mjs";

const DATA_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/data",
);

describe("byte-exact serializers", () => {
  it("round-trips the committed historical dataset unchanged", async () => {
    const source = await readFile(
      resolve(DATA_DIR, "historicalTaxSales.json"),
      "utf8",
    );
    expect(formatDataset(JSON.parse(source))).toBe(source);
  });

  it("round-trips the committed source ledger unchanged", async () => {
    const source = await readFile(
      resolve(DATA_DIR, "historicalSourceLedger.json"),
      "utf8",
    );
    expect(formatLedger(JSON.parse(source))).toBe(source);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run scripts/taxSaleWatch/dataset.test.mjs`
Expected: FAIL — cannot resolve `./dataset.mjs`.

- [ ] **Step 3: Implement the serializers**

Formatting rules observed in the committed files: two-space indent; each record is
one compact line; a blank line separates records belonging to different events; in
the ledger `fieldsAvailable` is always inline while `officialUrls` and
`documentSha256` are inline only when they hold one item or fewer; both files end
with a single trailing newline.

```js
const RECORD_KEYS = [
  "eventId", "recordId", "listingIdentifier", "pids", "civicDescription",
  "advertisedAmountCents", "winningBidCents", "outcome", "resultNote",
  "redemptionLabel", "nspMatchStatus", "nspMatchMethod", "reviewState",
];

function value(input) {
  return JSON.stringify(input);
}

function objectBlock(entry, indent, inlineArrays) {
  const pad = " ".repeat(indent);
  const inner = " ".repeat(indent + 2);
  const entries = Object.entries(entry);
  const lines = entries.map(([key, item], index) => {
    const comma = index < entries.length - 1 ? "," : "";
    if (Array.isArray(item) && !inlineArrays.has(key) && item.length > 1) {
      const items = item
        .map((element, position) =>
          `${inner}  ${value(element)}${position < item.length - 1 ? "," : ""}`,
        )
        .join("\n");
      return `${inner}${value(key)}: [\n${items}\n${inner}]${comma}`;
    }
    return `${inner}${value(key)}: ${value(item)}${comma}`;
  });
  return `${pad}{\n${lines.join("\n")}\n${pad}}`;
}

export function formatDataset(dataset) {
  const events = dataset.events
    .map((event) => objectBlock(event, 4, new Set(Object.keys(event))))
    .join(",\n");

  const recordLines = [];
  let previousEventId = null;
  for (const record of dataset.records) {
    if (previousEventId !== null && record.eventId !== previousEventId) {
      recordLines.push("");
    }
    previousEventId = record.eventId;
    const pairs = RECORD_KEYS.filter((key) => key in record).map(
      (key) => `${value(key)}: ${value(record[key])}`,
    );
    recordLines.push(`    { ${pairs.join(", ")} }`);
  }
  const records = recordLines
    .map((line, index) => {
      const next = recordLines[index + 1];
      const needsComma = line !== "" && next !== undefined;
      return needsComma ? `${line},` : line;
    })
    .join("\n");

  return `{\n  ${value("schemaVersion")}: ${value(dataset.schemaVersion)},\n  ${value(
    "events",
  )}: [\n${events}\n  ],\n  ${value("records")}: [\n${records}\n  ]\n}\n`;
}

export function formatLedger(ledger) {
  const inline = new Set(["fieldsAvailable"]);
  const coverage = ledger.coverage
    .map((entry) => objectBlock(entry, 4, inline))
    .join(",\n");
  return `{\n  ${value("schemaVersion")}: ${value(ledger.schemaVersion)},\n  ${value(
    "retrievedOn",
  )}: ${value(ledger.retrievedOn)},\n  ${value(
    "coverage",
  )}: [\n${coverage}\n  ]\n}\n`;
}
```

- [ ] **Step 4: Run the round-trip tests and fix formatting until byte-identical**

Run: `cd web && npx vitest run scripts/taxSaleWatch/dataset.test.mjs`
Expected: PASS. If a diff appears, the assertion prints it — adjust `objectBlock`
or the record-line rules until both files reproduce exactly. Do not modify the
committed data files to make the test pass.

- [ ] **Step 5: Write failing tests for the builders**

```js
import { buildEvent, buildLedgerEntry, buildRecords, eventIdFor } from "./dataset.mjs";
import { CUMBERLAND_SOURCE } from "./cumberland.mjs";

const SALE = {
  saleDate: "2026-10-20",
  heading: "OCTOBER 20, 2026 TAX SALE RESULTS",
  listingIdentifierLabel: "AAN",
  rows: [
    {
      listingIdentifier: "1234567",
      pid: "25000001",
      description: "MAIN ST SPRINGHILL LAND",
      redemptionLabel: "Redemption expiry - 6 month",
      advertisedAmountCents: 100_000,
      winningRaw: "$5,000.00",
    },
    {
      listingIdentifier: "7654321",
      pid: "25000002",
      description: "SHORE RD JOGGINS LAND",
      redemptionLabel: "Redemption expiry - Immediate",
      advertisedAmountCents: 250_000,
      winningRaw: "ADJORNED",
    },
  ],
};
const CAPTURE = {
  timestamp: "20261101120000",
  url: "https://web.archive.org/web/20261101120000id_/https://www.cumberlandcounty.ns.ca/tax-sales.html",
  sha256: "a".repeat(64),
};

describe("dataset builders", () => {
  it("derives a stable event id from the sale date", () => {
    expect(eventIdFor("cumberland", "2026-10-20")).toBe("cumberland-2026-10-20");
  });

  it("cites the archive capture as both notice and result receipt", () => {
    const event = buildEvent({
      source: CUMBERLAND_SOURCE,
      sale: SALE,
      capture: CAPTURE,
      retrievedOn: "2026-11-01",
    });
    expect(event).toMatchObject({
      id: "cumberland-2026-10-20",
      municipalityId: "cumberland",
      saleDate: "2026-10-20",
      resultStatus: "verified",
      noticeUrl: CAPTURE.url,
      resultUrl: CAPTURE.url,
      noticeSha256: CAPTURE.sha256,
      resultSha256: CAPTURE.sha256,
      landingPageUrl: CUMBERLAND_SOURCE.landingPageUrl,
      retrievedOn: "2026-11-01",
      noticeSnapshotDate: "2026-11-01",
    });
    expect(event.sourceNotes).toMatch(/overwritten each sale/u);
  });

  it("builds owner-free records with classified outcomes", () => {
    const records = buildRecords({
      source: CUMBERLAND_SOURCE,
      sale: SALE,
      eventId: "cumberland-2026-10-20",
    });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      recordId: "cumberland-2026-10-20-aan-1234567",
      pids: ["25000001"],
      advertisedAmountCents: 100_000,
      winningBidCents: 500_000,
      outcome: "sold",
      nspMatchStatus: "matched",
      nspMatchMethod: "exact-official-pid",
      reviewState: "visually-verified",
    });
    expect(records[1]).toMatchObject({
      outcome: "withdrawn",
      winningBidCents: null,
    });
    expect(records[1].resultNote).toMatch(/ADJORNED/u);
  });

  it("records the live retrieval hash alongside the capture in the ledger", () => {
    const entry = buildLedgerEntry({
      source: CUMBERLAND_SOURCE,
      sale: SALE,
      capture: CAPTURE,
      retrievedOn: "2026-11-01",
      livePageSha256: "b".repeat(64),
    });
    expect(entry.status).toBe("included");
    expect(entry.officialWinningBidsFound).toBe(true);
    expect(entry.officialUrls).toContain(CUMBERLAND_SOURCE.landingPageUrl);
    expect(entry.officialUrls).toContain(CAPTURE.url);
    expect(entry.documentSha256).toEqual([CAPTURE.sha256, "b".repeat(64)]);
    expect(entry.notes).toMatch(/assessed-name column was discarded/u);
  });
});
```

- [ ] **Step 6: Run to verify failure, implement the builders, run to verify pass**

Implement `eventIdFor`, `buildEvent`, `buildRecords`, and `buildLedgerEntry` so the
assertions above hold. `buildRecords` calls `source.classifyOutcome(row.winningRaw)`
and spreads `resultNote` only when the classifier returned one, matching the key
order in `RECORD_KEYS`. `buildEvent` composes `sourceNotes` from the row tallies
plus the standing Cumberland caveat about the overwritten page, the verbatim
assessment numbers, and the omitted owner column.

Run: `cd web && npx vitest run scripts/taxSaleWatch/dataset.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add web/scripts/taxSaleWatch/dataset.mjs web/scripts/taxSaleWatch/dataset.test.mjs
git commit -m "feat(web): add byte-exact tax-sale dataset serializers and builders"
```

---

### Task 4: Watcher orchestration

**Files:**
- Create: `web/scripts/watchTaxSaleSources.mjs`
- Create: `web/src/data/cumberlandTaxSale.snapshot.json`
- Test: `web/scripts/watchTaxSaleSources.test.mjs`
- Modify: `web/package.json` (add the `watch:tax-sales` script)

**Interfaces:**
- Consumes: everything produced by Tasks 1–3.
- Produces: `runWatch(source, { fetchImpl, now, snapshot, dataset, ledger }): Promise<Report>` where
  `Report = { status: "unchanged" | "pending-capture" | "ingested", snapshot, dataset?, ledger?, summary }`.

`runWatch` is pure with respect to the filesystem — it takes current file contents
and returns new ones. `main()` does the reading and writing. This is what makes the
three-outcome behaviour testable without a network or a temp directory.

- [ ] **Step 1: Seed the snapshot file**

Create `web/src/data/cumberlandTaxSale.snapshot.json` describing the sale already in
the dataset, so the watcher's first real run has a baseline and reports "unchanged":

```json
{
  "schemaVersion": 1,
  "sourceId": "cumberland",
  "landingPage": "https://www.cumberlandcounty.ns.ca/tax-sales.html",
  "retrievedDate": "2026-07-24",
  "observedSale": {
    "saleDate": "2026-03-03",
    "heading": "MARCH 3, 2026 TAX SALE RESULTS",
    "rowCount": 14
  },
  "livePageSha256": "b2ff90287447e9ca822af653a42af0348767cae767d45f954326b39608668d92",
  "archive": {
    "captureTimestamp": "20260415155709",
    "captureUrl": "https://web.archive.org/web/20260415155709id_/https://www.cumberlandcounty.ns.ca/tax-sales.html",
    "captureSha256": "8aad467e955cba418f800bcfcb76096099558cbfe6e9530291a190a0fe58de56"
  },
  "pendingCapture": false,
  "ingestedEventId": "cumberland-2026-03-03",
  "status": "Cumberland overwrites this page each sale. The watcher archives a changed page before ingesting it, and only cites capture bytes that carry the results table."
}
```

- [ ] **Step 2: Write the failing orchestration tests**

Cover the three outcomes plus the duplicate guard. Build a fake `fetchImpl` that
serves a live page fixture, a save redirect, a CDX response, and capture bytes.

```js
describe("runWatch", () => {
  it("reports unchanged when the live page still shows the ingested sale", async () => {
    const report = await runWatch(CUMBERLAND_SOURCE, buildDeps({ live: MARCH_FIXTURE }));
    expect(report.status).toBe("unchanged");
    expect(report.dataset).toBeUndefined();
  });

  it("defers ingest when no capture carries the results table", async () => {
    const report = await runWatch(
      CUMBERLAND_SOURCE,
      buildDeps({ live: OCTOBER_FIXTURE, captures: { "20261101120000": "One moment, please..." } }),
    );
    expect(report.status).toBe("pending-capture");
    expect(report.snapshot.pendingCapture).toBe(true);
    expect(report.snapshot.observedSale.saleDate).toBe("2026-10-20");
    expect(report.dataset).toBeUndefined();
  });

  it("ingests the new sale once a hashable capture exists", async () => {
    const report = await runWatch(
      CUMBERLAND_SOURCE,
      buildDeps({ live: OCTOBER_FIXTURE, captures: { "20261101120000": OCTOBER_FIXTURE } }),
    );
    expect(report.status).toBe("ingested");
    expect(report.snapshot.pendingCapture).toBe(false);
    expect(report.snapshot.ingestedEventId).toBe("cumberland-2026-10-20");
    const dataset = JSON.parse(report.dataset);
    expect(dataset.events.at(-1).id).toBe("cumberland-2026-10-20");
    expect(dataset.records.filter((r) => r.eventId === "cumberland-2026-10-20")).toHaveLength(2);
    expect(JSON.parse(report.ledger).coverage.at(-1).municipality).toMatch(/Cumberland/u);
  });

  it("refuses to ingest a sale already present in the dataset", async () => {
    const deps = buildDeps({ live: MARCH_FIXTURE, captures: { "20261101120000": MARCH_FIXTURE } });
    deps.snapshot = { ...deps.snapshot, ingestedEventId: null, observedSale: null };
    await expect(runWatch(CUMBERLAND_SOURCE, deps)).rejects.toThrow(
      /cumberland-2026-03-03 is already in the dataset/u,
    );
  });

  it("propagates a parser guard failure instead of writing anything", async () => {
    const broken = OCTOBER_FIXTURE.replace("ADJORNED", "POSTPONED");
    await expect(
      runWatch(CUMBERLAND_SOURCE, buildDeps({ live: broken, captures: { "20261101120000": broken } })),
    ).rejects.toThrow(/Unrecognized winning-bid value "POSTPONED"/u);
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement `runWatch` and `main`**

`runWatch` sequence:
1. Fetch the landing page; throw on a non-2xx response.
2. `source.parseResults(html)`; compute `livePageSha256`.
3. If the parsed `saleDate` matches `snapshot.ingestedEventId`'s date **and** the
   live hash is unchanged, return `{ status: "unchanged" }`.
4. `assertEventAbsent` — throw if the parsed sale's event id is already in the
   dataset while the snapshot does not record it as ingested.
5. `submitToWayback`, then `findHashableCapture` over the save timestamp followed
   by CDX timestamps, verifying with `source.containsResultsTable`.
6. No hashable capture: return `{ status: "pending-capture", snapshot }` with
   `pendingCapture: true` and the live hash recorded.
7. Hashable capture: build the event, records, and ledger entry; append; return
   serialized `dataset` and `ledger` alongside the updated snapshot.

`main()` reads the four files, calls `runWatch`, writes whatever the report
returns, recomputes `HISTORICAL_DATASET_SHA256` in `web/src/data/historicalTaxSales.ts`
when the dataset changed (Task 5 adds that constant), prints a one-line summary,
and exits non-zero on any thrown guard.

Run: `cd web && npx vitest run scripts/watchTaxSaleSources.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 4: Add the npm script**

In `web/package.json`, after `"refresh:inverness-tax-sale"`:

```json
    "watch:tax-sales": "node scripts/watchTaxSaleSources.mjs",
```

- [ ] **Step 5: Run the watcher against the live source**

Run: `cd web && npm run watch:tax-sales`
Expected: exit 0 and a summary line reporting `unchanged` for Cumberland, because
the March 3, 2026 sale is already ingested and the page has not changed. Confirm
`git status --short` shows no modified data files.

- [ ] **Step 6: Commit**

```bash
git add web/scripts/watchTaxSaleSources.mjs web/scripts/watchTaxSaleSources.test.mjs web/src/data/cumberlandTaxSale.snapshot.json web/package.json
git commit -m "feat(web): add the tax-sale source watcher"
```

---

### Task 5: Replace brittle dataset totals with a pinned hash

Automation cannot update hand-maintained magic numbers without doing regex surgery
on test source. This task moves byte-level protection to the repo's existing
pinned-hash idiom and keeps every assertion that encodes real knowledge.

**Files:**
- Modify: `web/src/data/historicalTaxSales.ts` (export `HISTORICAL_DATASET_SHA256`)
- Modify: `web/src/data/taxSaleCatalog.test.ts` (pin the raw dataset bytes)
- Modify: `web/src/data/historicalTaxSales.test.ts` (derive totals)
- Modify: `web/src/App.test.tsx` (derive the rendered count)

- [ ] **Step 1: Add the exported constant**

In `web/src/data/historicalTaxSales.ts`, beside the existing exports:

```ts
// Pinned so the JSON and the app cannot drift silently. The watcher recomputes
// this whenever it ingests a sale; regenerate with:
//   node -e 'import("node:crypto").then(async ({createHash})=>console.log(createHash("sha256").update(await (await import("node:fs/promises")).readFile("src/data/historicalTaxSales.json")).digest("hex")))'
export const HISTORICAL_DATASET_SHA256 =
  "<compute from the committed file>";
```

- [ ] **Step 2: Pin it in `taxSaleCatalog.test.ts`**

Add beside the existing Inverness and Annapolis pins:

```ts
import { HISTORICAL_DATASET_SHA256 } from "./historicalTaxSales";
import historicalDatasetSource from "./historicalTaxSales.json?raw";

  it("pins the byte-for-byte historical tax-sale dataset", async () => {
    expect(await sha256Hex(historicalDatasetSource)).toBe(
      HISTORICAL_DATASET_SHA256,
    );
  });
```

- [ ] **Step 3: Run to confirm the pin is correct**

Run: `cd web && npx vitest run src/data/taxSaleCatalog.test.ts`
Expected: PASS. A failure here means the constant in Step 1 is wrong — copy the
actual hash from the failure output.

- [ ] **Step 4: Replace the magic totals in `historicalTaxSales.test.ts`**

Delete the hardcoded `toHaveLength(13)`, `toHaveLength(207)`, `toHaveLength(213)`,
the per-outcome tallies, the per-event `records`/`pids` table, and
`expect(historicalSourceLedger.coverage).toHaveLength(16)`. Replace with structural
invariants that stay true as sales are added:

```ts
  it("keeps every event and record structurally sound as sources are added", () => {
    expect(historicalTaxSaleEvents.length).toBeGreaterThan(0);
    const eventIds = new Set(historicalTaxSaleEvents.map(({ id }) => id));
    expect(eventIds.size).toBe(historicalTaxSaleEvents.length);

    for (const event of historicalTaxSaleEvents) {
      const records = historicalTaxSaleRecords.filter(
        ({ eventId }) => eventId === event.id,
      );
      expect(records.length, `event ${event.id} has no records`).toBeGreaterThan(0);
      for (const record of records) {
        expect(record.pids.length).toBeGreaterThan(0);
        expect(new Set(record.pids).size).toBe(record.pids.length);
      }
    }

    // Every ledger entry marked included must have a matching event.
    const municipalities = new Set(
      historicalTaxSaleEvents.map(({ municipality }) => municipality),
    );
    for (const entry of historicalSourceLedger.coverage) {
      if (entry.status === "included") {
        expect(municipalities).toContain(entry.municipality);
      }
    }
  });
```

Keep unchanged: the CBRM outcome-pending test, the Victoria blank-status and
REMOVED-with-bid tests, the two-PID East Dover test, the September 2024 PENDING
test, the Cumberland archive-capture test, both owner-privacy tests, the
validation-rejection tests, and the outcome-label test.

- [ ] **Step 5: Derive the rendered count in `App.test.tsx`**

Replace the hardcoded string with one derived from the data:

```tsx
import { matchedHistoricalPids } from "./data/historicalTaxSales";
...
    await waitFor(() =>
      expect(
        screen.getByText(
          `${matchedHistoricalPids().length} historical PIDs matched in NSPRD.`,
        ),
      ).toBeInTheDocument(),
    );
```

- [ ] **Step 6: Run the full suite**

Run: `cd web && npx vitest run && npx tsc -b && npx eslint .`
Expected: all pass.

- [ ] **Step 7: Prove the tripwire still works**

Run:
```bash
cd web && python3 -c "
import json,io
p='src/data/historicalTaxSales.json'
t=open(p).read(); open(p,'w').write(t.replace('\"schemaVersion\": 1','\"schemaVersion\": 1 '))
" && npx vitest run src/data/taxSaleCatalog.test.ts; git checkout src/data/historicalTaxSales.json
```
Expected: the run FAILS on the pinned hash, then the file is restored. This
confirms an unaccompanied data edit still goes red.

- [ ] **Step 8: Commit**

```bash
git add web/src/data/historicalTaxSales.ts web/src/data/taxSaleCatalog.test.ts web/src/data/historicalTaxSales.test.ts web/src/App.test.tsx
git commit -m "test(web): pin the historical dataset by hash instead of magic totals"
```

---

### Task 6: Scheduled workflow

**Files:**
- Create: `.github/workflows/tax-sale-watch.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Tax-sale source watch

on:
  schedule:
    # Tuesdays 08:00 UTC. Nothing here is time-of-day sensitive, so this needs
    # none of the Halifax-local DST resolution the release trains require.
    - cron: "0 8 * * 2"
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: tax-sale-watch
  cancel-in-progress: false

jobs:
  watch:
    name: Watch overwrite-prone tax-sale sources
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: ${{ github.token }}
      UPDATE_BRANCH: automation/tax-sale-watch-${{ github.run_id }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: nightly
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: web/package-lock.json

      - name: Install dependencies
        working-directory: web
        run: npm ci

      - name: Test the watcher before trusting it
        working-directory: web
        run: npx vitest run scripts/

      - name: Watch sources
        working-directory: web
        run: npm run watch:tax-sales

      - name: Detect changes
        id: diff
        run: |
          if git diff --quiet -- web/src/data; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            echo "No tax-sale source changes detected."
          else
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Verify the dataset still passes its own tests
        if: steps.diff.outputs.changed == 'true'
        working-directory: web
        run: npx vitest run && npx tsc -b

      - name: Open a pull request
        if: steps.diff.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git switch -c "$UPDATE_BRANCH"
          git add web/src/data
          git commit -m "feat(web): ingest a newly published tax-sale result"
          git push origin "$UPDATE_BRANCH"
          gh pr create \
            --base nightly \
            --head "$UPDATE_BRANCH" \
            --title "feat(web): ingest a newly published tax-sale result" \
            --body "The tax-sale watcher detected a change on an overwrite-prone source, archived the page to the Wayback Machine, and ingested the published results.

Review before merging:
- the archive capture cited as the notice and result receipt carries the results table in its raw \`id_\` bytes
- every outcome maps to a status word the source actually printed
- no assessed-owner name reached the dataset

Generated by \`.github/workflows/tax-sale-watch.yml\`."
```

- [ ] **Step 2: Validate the workflow parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/tax-sale-watch.yml')); print('valid')"`
Expected: `valid`.

- [ ] **Step 3: Confirm the promotion guard accepts the base**

The `ci.yml` promotion guard permits `nightly:*`, so an `automation/*` head
targeting `nightly` is allowed. Re-read `.github/workflows/ci.yml:47-59` and
confirm before committing.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/tax-sale-watch.yml
git commit -m "ci: schedule the tax-sale source watcher"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/historical-tax-sale-source-coverage.md` (replace the "Cumberland refresh watch" prose with the implemented behaviour)
- Modify: `web/README.md` (document `npm run watch:tax-sales` beside the Inverness refresher)
- Modify: `plan.md` (check off the watcher under the importer roadmap item)

- [ ] **Step 1: Rewrite the "Cumberland refresh watch" section**

It currently says a watcher *should* exist. Replace with what now runs: the weekly
workflow, the archive-then-ingest sequence, the deferred-ingest behaviour when no
hashable capture exists, and the fail-closed status-word guard. Keep the Save Page
Now interstitial warning — it is the reason the verification step exists.

- [ ] **Step 2: Document the command in `web/README.md`**

Beside the existing `refresh:inverness-tax-sale` paragraph, describe
`npm run watch:tax-sales`: what it does on no change, on a new sale without a
capture, and on a new sale with one; and that it fails rather than guessing at an
unfamiliar status word.

- [ ] **Step 3: Run the full suite one final time**

Run: `cd web && npx vitest run && npx tsc -b && npx eslint . && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit and open the pull request**

```bash
git add docs/historical-tax-sale-source-coverage.md web/README.md plan.md
git commit -m "docs: describe the tax-sale source watcher"
git push -u origin claude/tax-sale-source-watcher
gh pr create --base nightly --title "feat(web): watch and auto-ingest overwrite-prone tax-sale sources" --body-file <(...)
```

The pull request body must state that the workflow stays dormant until
`nightly → weekly → main` promotes it, because scheduled workflows only fire from
the default branch, and that `workflow_dispatch` is available immediately.

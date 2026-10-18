# Tax-Sale Geometry Exceptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the Victoria and Halifax September 2026 notices while retaining two Halifax source rows as explicit, non-rendered NSPRD geometry exceptions.

**Architecture:** Dedicated refreshers normalize and hash owner-free official evidence into municipality snapshots. The Halifax model partitions all 31 snapshot rows into 29 renderable listings and two declared geometry exceptions; catalog helpers and UI expose those two states without sending unmatched PIDs to the map.

**Tech Stack:** Node.js refresh scripts, Poppler `pdftotext`, React 19, TypeScript, Vite, Vitest, Testing Library, live ArcGIS GeoJSON queries.

## Global Constraints

- Never persist assessed-owner names or owner-bearing source bytes.
- Municipal documents own notice facts; NSPRD owns rendered geometry only.
- Never infer replacement PIDs or silently omit official rows.
- Store money as integer cents and identifiers as exact eight-digit strings.
- Any source count, identifier, flag, document-link, or exception mismatch fails closed.
- Add no third-party dependencies.

---

### Task 1: Victoria owner-free notice source

**Files:**
- Create: `web/scripts/refreshVictoriaTaxSale.mjs`
- Create: `web/scripts/refreshVictoriaTaxSale.test.mjs`
- Create: `web/src/data/victoriaTaxSale.snapshot.json`
- Create: `web/src/data/victoriaTaxSale.ts`
- Create: `web/src/data/victoriaTaxSale.test.ts`
- Modify: `web/package.json`

**Interfaces:**
- Produces: `parseVictoriaNotice(html)`, `buildSnapshot(current, parsed, archiveReceipt, now)`, `victoriaTaxSaleEvent`, and `VICTORIA_TAX_SALE_DATASET_SHA256`.
- Consumes: existing Wayback helpers in `web/scripts/taxSaleWatch/archive.mjs` and `TaxSaleEvent`.

- [ ] **Step 1: Write parser tests that name the failures**

Add fixtures with an owner placeholder, one wholly removed row, two complete
rows, a partial removal, malformed PID, and duplicate PID. Assert the parsed
object contains only owner-free fields and that changed facts require an archive
receipt.

- [ ] **Step 2: Run the parser test and confirm the missing module is the only failure**

Run: `npx vitest run scripts/refreshVictoriaTaxSale.test.mjs`

Expected: FAIL because `refreshVictoriaTaxSale.mjs` does not exist.

- [ ] **Step 3: Implement the minimal Victoria parser and snapshot writer**

Parse the single exact table header, accept a removed row only when every
owner-free cell says `REMOVED`, validate dates/amounts/identifiers/duplicates,
archive changed HTML before writing, omit assessed names and land-registration
flags from the public snapshot, and update the model's dataset hash.

- [ ] **Step 4: Run parser tests and create the official snapshot**

Run:

```sh
npx vitest run scripts/refreshVictoriaTaxSale.test.mjs
node scripts/refreshVictoriaTaxSale.mjs
```

Expected: parser tests PASS; snapshot reports 9 source rows, 1 opaque removed
row, 8 listings, and 8 PIDs.

- [ ] **Step 5: Write and run the model tests**

Assert the byte hash, September 14 noon deadline, exact eight PID sequence,
amounts, redemption categories, external archive receipt, and absence of owner
fields.

Run: `npx vitest run src/data/victoriaTaxSale.test.ts`

Expected: PASS after `victoriaTaxSale.ts` maps the snapshot into an upcoming
sealed-tender event.

### Task 2: Halifax owner-free notice and declared exceptions

**Files:**
- Create: `web/scripts/refreshHalifaxTaxSale.mjs`
- Create: `web/scripts/refreshHalifaxTaxSale.test.mjs`
- Create: `web/src/data/halifaxTaxSale.snapshot.json`
- Create: `web/src/data/halifaxTaxSale.ts`
- Create: `web/src/data/halifaxTaxSale.test.ts`
- Modify: `web/package.json`

**Interfaces:**
- Produces: `parseLandingPage(html)`, `parseTenderText(text, tenderNumber)`, `parseScheduleText(text)`, `buildSnapshot(...)`, `halifaxTaxSaleEvent`, and `HALIFAX_TAX_SALE_DATASET_SHA256`.
- Consumes: `TaxSaleEvent` and `TaxSaleGeometryException` from `taxSaleTypes.ts`.

- [ ] **Step 1: Write source parser tests before the refresher exists**

Use fixed-column lines containing owner placeholders. Assert exact URL
resolution, deadline/venue parsing, multi-PID handling, integer cents, HST and
redeemability flags, layout-shift rejection, duplicate rejection, and that no
owner text reaches parsed or snapshot output.

- [ ] **Step 2: Run the source test and observe the missing-module failure**

Run: `npx vitest run scripts/refreshHalifaxTaxSale.test.mjs`

Expected: FAIL because `refreshHalifaxTaxSale.mjs` does not exist.

- [ ] **Step 3: Implement the minimal landing/tender/Schedule A refresher**

Resolve exactly one current tender and schedule, use `pdftotext -layout`, parse
only AAN/description/PID/opening-bid/HST/redeemable columns, validate 31 rows and
32 PIDs, hash both PDFs, and write all owner-free rows. Preserve these declared
exceptions exactly:

```json
[
  {"aan":"09417036","pid":"41051889","reason":"no-nsprd-geometry","checkedOn":"2026-08-15"},
  {"aan":"09417044","pid":"41051897","reason":"no-nsprd-geometry","checkedOn":"2026-08-15"}
]
```

- [ ] **Step 4: Run parser tests and create the official snapshot**

Run:

```sh
npx vitest run scripts/refreshHalifaxTaxSale.test.mjs
node scripts/refreshHalifaxTaxSale.mjs
```

Expected: PASS; snapshot reports 31 source rows, 32 PIDs, 29 mapped rows, 30
mapped PIDs, and 2 declared geometry exceptions.

- [ ] **Step 5: Write and run model partition tests**

Assert the byte hash, September 15 deadline, 31 retained source rows, 29 mapped
event listings, 30 mapped unique PIDs, exact two exception records, opening-bid
semantics, and absence of HST/owner fields from public listing objects.

Run: `npx vitest run src/data/halifaxTaxSale.test.ts`

Expected: PASS after the model partitions snapshot rows by the exact exception
PID set.

### Task 3: Catalog contract and rendered exception disclosure

**Files:**
- Modify: `web/src/data/taxSaleTypes.ts`
- Modify: `web/src/data/taxSaleCatalog.ts`
- Modify: `web/src/data/taxSaleCatalog.test.ts`
- Modify: `web/src/services/nsprd.live.test.ts`
- Modify: `web/src/components/TaxSalePropertyList.tsx`
- Modify: `web/src/components/TaxSalePropertyList.test.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

**Interfaces:**
- Produces: `TaxSaleGeometryException`, optional `TaxSaleEvent.geometryExceptions`, and `geometryExceptionPidsForEvents(events)`.
- Consumes: `halifaxTaxSaleEvent` and `victoriaTaxSaleEvent`.

- [ ] **Step 1: Write catalog tests for mapped and exception partitions**

Assert five upcoming events, 86 mapped listings, 89 mapped unique PIDs, 69
advertised mapped PIDs, exact Halifax exception PIDs, and exact PID lookup for
one Halifax and one Victoria mapped parcel. Assert neither exception PID is
returned by `pidsForEvents` or `listingContextForPid`.

- [ ] **Step 2: Run the catalog test and observe missing events/helper failures**

Run: `npx vitest run src/data/taxSaleCatalog.test.ts`

Expected: FAIL because the events and exception helper are absent.

- [ ] **Step 3: Add the minimal event exception type, helper, and catalog imports**

Add the approved exception shape, import both new events, and flatten only
`event.geometryExceptions[].pids` in the new helper. Do not change existing PID
helpers, which remain map-only.

- [ ] **Step 4: Run catalog and live reconciliation tests**

Run:

```sh
npx vitest run src/data/taxSaleCatalog.test.ts
VITE_RUN_LIVE_NSPRD=1 npx vitest run src/services/nsprd.live.test.ts
```

Expected: all mapped PIDs resolve; exactly the two declared exception PIDs
return no features.

- [ ] **Step 5: Write UI tests for visible non-interactive exceptions**

Assert the property-list summary says `30 parcels mapped · 2 unavailable`, the
two exceptions render AAN/PID/reason text without buttons, and the event summary
says `31 advertised · 29 mapped · 2 unavailable in NSPRD`.

- [ ] **Step 6: Run the UI tests and observe missing disclosure failures**

Run:

```sh
npx vitest run src/components/TaxSalePropertyList.test.tsx src/App.test.tsx
```

Expected: FAIL because the exception prop and event summary wording are absent.

- [ ] **Step 7: Implement the minimal property-list and event-summary disclosure**

Pass `event.geometryExceptions ?? []` into `TaxSalePropertyList`; render mapped
buttons unchanged and append a labelled non-interactive exception list. Use the
standard advertised/withdrawn summary for events without exceptions.

- [ ] **Step 8: Re-run the focused UI tests**

Run:

```sh
npx vitest run src/components/TaxSalePropertyList.test.tsx src/App.test.tsx
```

Expected: PASS with no warnings.

### Task 4: Documentation, determinism, and publication gates

**Files:**
- Modify: `web/README.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Consumes: final snapshot hashes/counts and approved evidence wording.
- Produces: source receipts and the documented mapped/unmapped authority split.

- [ ] **Step 1: Update source receipts and architecture wording**

Document official URLs, retrieval dates, hashes, row/PID/status counts, owner
exclusion, Victoria archive receipt, Halifax exception identifiers, and the UI
meaning of unavailable geometry.

- [ ] **Step 2: Run two complete refreshes and compare generated bytes**

Run `npm run refresh:tax-sales` twice and hash the tracked generated JSON files
after each run. Expected: identical hashes and no second-run diff.

- [ ] **Step 3: Run complete local verification**

Run:

```sh
npm test
npm run lint
npm run build
find src/data -name '*.json' -print0 | xargs -0 -n1 node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))'
git diff --check
```

Also inspect the complete diff for forbidden identity keys, provenance, stale
counts, and unsupported claims. Expected: every gate passes.

- [ ] **Step 4: Publish and deploy the exact accepted build**

Commit coherent task files with Conventional Commits, push the automation
branch, open one ready PR to `nightly`, wait for exact-head required checks, and
merge only while mergeable. Trigger KinNoKi's existing promotion workflow from
`main`, verify exact pin parity in Tools/Resources/Output, wait for preview
checks, merge its deployment PR, wait for Cloudflare production, then verify the
cache-busted source receipt and desktop/mobile rendered acceptance with clean
consoles.

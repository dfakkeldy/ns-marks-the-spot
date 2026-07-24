# Tax-sale source watcher — design

Some municipalities publish tax-sale results to a single page they overwrite with
each new sale. Cumberland is the acute case: it holds sales in October and March
and republishes `https://www.cumberlandcounty.ns.ca/tax-sales.html` each time, so
the previous sale's results are destroyed. The March 3, 2026 results are in the
dataset today only because Wayback Machine crawlers happened to capture the page
twice. That is luck, not a pipeline.

This watcher removes the luck.

## Goals

1. Capture each sale's results to the Wayback Machine while that sale is still
   live, so no future overwrite can destroy evidence.
2. Ingest a newly published sale into the historical dataset automatically, as a
   reviewable pull request, without inventing outcomes.
3. Fail loudly and change nothing when the source presents something unfamiliar.

## Non-goals

- Watching sources that publish durable dated PDFs (Halifax, Victoria, CBRM).
  Their evidence does not decay, so polling them buys nothing.
- Merging its own pull requests. A human reviews every dataset change.
- Backfilling sales whose results were destroyed before any capture existed.

## Architecture

Two jobs that fail independently, in priority order.

### Job 1 — preserve

Runs every time. Fetch the live page, parse the published sale, compare a
SHA-256 of the response bytes against the committed snapshot. When the content
has changed, submit the page to Save Page Now.

Weekly polling is sufficient *because archiving happens while a sale is live*.
Cumberland's October sale overwrites March's results roughly seven months after
March's results were published, and the watcher will have archived them within a
week of publication. The exposure window is one week from publication, not seven
months.

### Job 2 — ingest

Runs only when Job 1 has produced evidence strong enough to cite.

After archiving, fetch the `id_` bytes of the resulting capture and verify they
contain a results table. This check exists because of an observed failure: on
2026-07-23 a Save Page Now submission produced a capture whose *replay* rendered
the results table correctly while its *raw archived payload* was a Cloudflare
bot-verification interstitial. A capture that replays correctly is a usable
citation but not a reproducible hash, and the dataset's receipts must be
reproducible.

When a hashable capture exists, the watcher writes the new event and records into
`historicalTaxSales.json`, appends a ledger entry, updates the snapshot, and
opens a pull request into `nightly`.

When no hashable capture exists yet — expected for a brand-new sale before
crawlers land — it opens a pull request updating **only** the snapshot, recording
that a new sale was detected, its live SHA-256, and the submitted archive URL,
with `pendingCapture: true`. The following run completes the ingest. The watcher
never cites a weak receipt in order to look finished.

## Fail-closed guards

The source is a hand-maintained HTML table, so it will eventually present
something unanticipated. Every guard below aborts the run with `::error::` and
opens no pull request.

| Guard | Rationale |
| --- | --- |
| `classifyOutcome` accepts only a money amount, `ADJORNED`, or `NOT COMPLETED` | Two sales have already produced two distinct non-obvious status words. A third is likely, and mapping it to an outcome is a judgement call a human should make. |
| PID must match `/^\d{8}$/` | Matches the dataset invariant; a malformed PID would poison parcel matching. |
| Minimum bid must parse to a positive integer cent value | The dataset schema requires it, and a zero or unparsed amount signals a layout change. |
| Event id must not already exist in the dataset | Prevents a re-run from duplicating an ingested sale. |
| Live page must yield exactly one results table with a recognizable sale heading | A layout change should stop the pipeline, not be silently parsed. |
| Archive capture bytes must contain the results table | Guards the interstitial failure described above. |

Money is parsed to integer cents by string manipulation, never through
`parseFloat`, matching the existing dataset convention.

## Owner privacy

The `NAME` column is discarded during parsing, before any record object is
constructed, so owner names never reach a written file. A test asserts that
surnames appearing in the official table are absent from the parsed output.

## Components

| File | Purpose |
| --- | --- |
| `web/scripts/watchTaxSaleSources.mjs` | Watcher. A `SOURCES` config array (one entry today) plus pure exported functions and a `main()` behind an `import.meta.url` entry guard. |
| `web/scripts/watchTaxSaleSources.test.mjs` | Tests the pure exports against inline fixture strings. No network, matching `refreshInvernessTaxSale.test.mjs`. |
| `web/src/data/cumberlandTaxSale.snapshot.json` | Committed watcher state and evidence: landing page, last observed sale, live SHA-256, archive URL and capture SHA-256, `retrievedDate`, `pendingCapture`. |
| `.github/workflows/tax-sale-watch.yml` | Weekly cron plus `workflow_dispatch`. Runs the watcher's own tests before the watcher, then branches and opens a pull request. |

The config entry carries the source's identity, landing page, and a parser
function, so adding CBRM or MODL later is a config entry plus a parser rather
than a second workflow.

## Test-suite change

`historicalTaxSales.test.ts` currently hardcodes total counts (events, records,
matched PIDs, per-outcome tallies) and `App.test.tsx` hardcodes the rendered
string `"213 historical PIDs matched in NSPRD."`. Any automated ingest fails CI
on these, and having automation rewrite test source with regexes would be worse
than the problem.

Instead, the brittle totals become derived assertions, and byte-level protection
moves to a pinned `HISTORICAL_DATASET_SHA256` constant checked in
`taxSaleCatalog.test.ts` with the existing `?raw` + WebCrypto helper — the same
tripwire `INVERNESS_BOOK_DATASET_SHA256` and `ANNAPOLIS_TENDER_DATASET_SHA256`
already provide.

The safety property is preserved: a hand edit to the dataset without
regenerating the hash still fails the build. What changes is that automation
updates one machine-owned value instead of hand-maintained magic numbers. The
assertions that encode real knowledge — the per-event record/PID table, the
fail-closed outcome rules, the Cumberland archive-URL shape, the owner-privacy
checks — are all kept.

## Workflow behaviour

- Trigger: weekly cron, plus `workflow_dispatch` for manual runs.
- Permissions: `contents: write`, `pull-requests: write`.
- Runs `npm test` for the watcher's own tests before running the watcher, matching
  the `devlog-update.yml` convention.
- No change detected: exits 0 having done nothing.
- Change detected: commits to `automation/tax-sale-watch-<run_id>` and opens a
  pull request into `nightly`. The promotion guard in `ci.yml` permits `nightly:*`,
  so the ladder stays intact and a human still reviews.
- Guard tripped: `::error::` and a failed run. No branch, no pull request.

A single UTC cron is used. The DST-resolution dance in `devlog-update.yml` and
`release-trains.yml` exists because those jobs must fire at a specific
Halifax-local hour; nothing here is time-of-day sensitive.

**Scheduled workflows only run from the default branch.** This lands on
`nightly`, so the cron stays dormant until `nightly → weekly → main` promotes it.
`workflow_dispatch` works as soon as the workflow reaches a branch, so the
watcher is exercisable before then.

## Risks

| Risk | Mitigation |
| --- | --- |
| Cumberland changes its page layout | Parser fails closed; the run errors and a human is alerted by the failed workflow. |
| Save Page Now is rate-limited or blocked | Archiving is attempted on change; failure to obtain a hashable capture defers ingest rather than fabricating a receipt. The snapshot records the pending state so the next run retries. |
| The sale is overwritten between two runs | Accepted. Weekly polling bounds exposure to one week from publication, and the prior sale was archived months earlier. |
| Automation mis-maps a novel status word | Prevented by `classifyOutcome`, which throws rather than guessing. |

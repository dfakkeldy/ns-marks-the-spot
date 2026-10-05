# Tax-sale refresh implementation plan

> Execute directly in this existing isolated worktree; the user authorized Codex implementation and delivery.

**Goal:** Ingest Halifax's official September 15 results and report transient network failures and blocked source pages accurately.

**Architecture:** Keep notice receipts unchanged. Reconcile the dated results PDF with retained notice rows using AAN, PID, amount, description and redemption. Append historical records, keeping missing result rows unknown. Share bounded official-source fetch handling across the affected refresh scripts.

**Constraints:** Official sources only; owner-free output; no inferred dispositions; Fletcher/Church frozen; PR to nightly; squash only after required CI; existing deployment path remains responsible for the site.

- [ ] Add failing Halifax tests for official link discovery, numeric sold rows, NO BIDS, mismatched and duplicate IDs, missing rows and unchanged re-ingestion.
- [ ] Implement `scripts/halifaxTaxSaleResults.mjs` and connect it to `refreshHalifaxTaxSale.mjs`; add pinned owner-free results and historical records after reconciliation.
- [ ] Add failing fetch tests for connection reset recovery, bounded attempts, ordinary HTTP errors and HTTP 307 JavaScript verification; use the helper in Victoria, Halifax and the watcher.
- [ ] Check the complete refresh, preserve explicit Cumberland failure, verify deterministic Halifax re-ingestion, shared data, full web tests/lint/build and browser behavior.
- [ ] Commit and publish a conventional ready PR, inspect hosted checks, fix caused failures and squash-merge only when green. Verify the existing deployment handoff or report its exact blocker.

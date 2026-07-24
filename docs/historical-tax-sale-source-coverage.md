# Historical tax-sale source coverage

Retrieved and reviewed July 19, 2026; CBRM result availability re-checked July
21, 2026 after the auction; Victoria County, Cumberland, and the CBRM July 22,
2025 result sources were retrieved and reviewed July 23, 2026. Only official
municipal primary sources were used. Text extraction supported reconciliation;
PIDs and financial values in the fourteen result-backed Halifax notice/result
PDFs, the three Victoria County result PDFs, every row of the CBRM July 22, 2025
result, and both Cumberland result tables were also checked against rendered
pages. Tender terms independently confirmed the sale method for six Halifax
events and the August 2025 Victoria County event. Public data and screenshots
omit assessed-owner and bidder names.

Cumberland is the first source that publishes results as an HTML table on a
single page it overwrites each sale, rather than as a dated PDF. Its receipts
are therefore Wayback Machine captures of that page, cited with the `id_` suffix
that replays the original archived bytes so each SHA-256 stays independently
reproducible:

```bash
curl -sSL "https://web.archive.org/web/20260415155709id_/https://www.cumberlandcounty.ns.ca/tax-sales.html" | shasum -a 256
```

## Result-backed events

| Municipality / event | Official notice | Official result | Records / PIDs | Published result fields | SHA-256 receipts |
| --- | --- | --- | ---: | --- | --- |
| Halifax Regional Municipality — March 8, 2022 | [Schedule A notice](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/MAR8.22website.newspaper%20%233.pdf) | [Tax-sale results](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/Tax%20Sale%20Results%20for%20Website%20March%208_0_0.pdf) | 11 / 11 | Assessment #, PID, location, `Opening Bid`, `Selling Price`, `Redeemable` | Notice `da1948056b94af75cdd261cbcbb0cdb19dd25f98c997e5e0336a54b2b73fc4f9`; result `b76f4f6840ddc0160f289e4e17cf54f4f11939d8ff35f19dab931a069b5543b8` |
| Halifax Regional Municipality — September 12, 2023 | [Final Schedule A notice](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/sept12.23website.newspaper-draft-edit-sept-11-3.pdf) and [tender terms](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/revised-tender-doc-new-process-sept-12_0.pdf) | [Tax-sale results](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/tax-sale-results-sept-12-2023-tax-sale-for-website_0.pdf) | 10 / 10 | Assessment #, PID, location, `Opening Bid`, `Selling Price`, `Redeemable` | Notice `388108c2e9463c591d6a58a04135cf3505f9fc3bc4da5460d39bc84471135aed`; terms `29b6919b5462afae4a58c9a7b55235dbb4e01495a2992e3d8247d714e8782204`; result `c8afab0e563dd1065016e2d1fbf841cd898a2c26388c73413ace52d6b58d1c17` |
| Halifax Regional Municipality — January 16, 2024 | [Schedule A notice](https://cdn.halifax.ca/media/84741) and [tender terms](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/revised-tender-doc-new-process-jan16.24.pdf) | [Tax-sale results](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/tax-sale-results-january-16-2024-tax-sale-for-website.pdf) | 8 / 9 | Assessment #, PID, location, `Opening Bid`, `Selling Price`, `Redeemable` | Notice `28f76c08fa18d6f37ca2b75faa3c7c1eda9bd4e682190ac30aef19bfd20704de`; terms `7bd54363ac92540b598f4706909789c8f6efbf587963a15a20b1356959c28e96`; result `b879d8837b6bde9fde1d66ae8f777418cf72a33f43639df89788c1e8bb57e496` |
| Halifax Regional Municipality — May 14, 2024 | [Schedule A notice](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/may142024websiteuploadapril12.pdf) and [tender terms](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/revised-tender-doc-new-process-may14.24.pdf) | [Tax-sale results](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/tax-sale-results-may-14-2024-tax-sale-for-website.pdf) | 7 / 8 | Assessment #, PID, location, `Opening Bid`, `Selling Price`, `Redeemable` | Notice `ff44e872edb97c0fd0d4c72819d2f4d5eafedda9fbd8b8577085c908c15ed2c5`; terms `b250b7d9c0bf74b81d19cc6f464442ee60aef401741bc8cc02a2b8ec83e184ad`; result `5d48c810e95f1655be7fe49dacebf9813febd5751eda4981bf736344b7d8c1d4` |
| Halifax Regional Municipality — September 24, 2024 | [Schedule A notice](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/sept24.2024newspaper.website-draft-update-sept9.pdf) and [tender terms](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/revised-tender-doc-new-process-sept24.24.pdf) | [Tax-sale results](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/tax-sale-results-sept-24-2024-tax-sale-for-website.pdf) | 9 / 10 | Assessment #, PID, location, `Opening Bid`, `Selling Price` or `PENDING`, `Redeemable` | Notice `17fffcc047209cca4787b42bdc594b1872f1ad1be5c64ebfc50f2370c3798f6f`; terms `10ad87054f1dd6622bb93c8cf6cb0f24f05d88e9f704e0f28c6fa0497a270e88`; result `0de2181e3911f6767027c3dc5c0258d635ff09abdec0f5f20d63e8ba0b16472e` |
| Halifax Regional Municipality — March 25, 2025 | [Final Schedule A notice](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/mar25.2025newspaper.website-updatedmar21.2025.pdf) and [tender terms](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/revised-tender-doc-new-process-mar25.25.pdf) | [Tax-sale results](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/tax-sale-results-mar-25-2025-tax-sale-for-website.pdf) | 5 / 7 | Assessment #, PID, location, `Opening Bid`, `Selling Price`, `Redeemable` | Notice `b0a7a6295ce0021b172ecee8a6b87551e3e6c59469ad6c3c2766e9f51f1581b4`; terms `44cefb06ad8650d137fa9166210efab0650f6ea222febd08a8acf74a0c434bed`; result `dc2bb61ee87103b1ef9ab3140c32e861abedd9669870fd87d6cc6a6ab22fd335` |
| Halifax Regional Municipality — September 16, 2025 | [Final Schedule A notice](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/sept16.2025newspaper.website-sept15-2.25.pdf) and [tender terms](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/revised-tender-doc-new-process-sept16.25.pdf) | [Tax-sale results](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/tax-sale-website-results-sept-16.pdf) | 37 / 38 | Assessment #, PID, location, `Opening Bid`, `Selling Price`, `Redeemable` | Notice `b653a1ad975f6e72ee66a2ddedd76c2a415a1dc1cc70ee743ce8ead9535c5ad0`; terms `f1e362a74880c0236c2e7bef1c8d254ea1555b3d981b90c26cd9e7444b56e033`; result `298eb52e49c734b418bea2e7b73747adfc3b3848cccbaa0aeb56fb578c270768` |

The Halifax slice has 87 owner-free records and 93 exact PIDs: 82 sold
outcomes, four official `NO BIDS` outcomes, and one official `PENDING` row
represented as outcome unknown. All 93 PIDs were returned by the live NSPRD
query during review. Multi-PID records retain amounts at listing level.

## Result-backed Victoria County events (pre-sale listings decayed)

Victoria County publishes self-contained `TAX SALE RESULTS` tables carrying
AAN, PID, location, `Total Owing`, HST, status, redeemability, and `Successful
Bid` in a single official document. Its pre-sale property listings are removed
from the municipal site after each sale and have no Wayback capture, so
notice-to-result reconciliation is impossible; the retained notice receipts are
the official sale announcements plus the tender or auction terms that pin each
sale method, date, and venue.

| Municipality / event | Official notice receipts | Official result | Records / PIDs | Row disposition | SHA-256 receipts |
| --- | --- | --- | ---: | --- | --- |
| Victoria County — August 26, 2025 (by tender) | [Announcement notice](https://victoriacounty.com/wp-content/uploads/2025/07/Tax-Sale-Notice-1-Website-Post.jpeg) and [tender terms](https://victoriacounty.com/wp-content/uploads/2025/07/TERMS-FOR-TENDER-BIDS-FOR-TAX-SALE-aug-26-2025.pdf) | [Tax-sale results](https://victoriacounty.com/wp-content/uploads/2025/09/Tax-Sale-Results-August-26-2025.pdf) | 12 / 13 | All twelve rows included: two `SOLD/PAID` with bids, one `NOT SOLD`, and nine rows publishing amounts but no status held as outcome unknown | Notice `cc201189d850b05a419b876c32cb23f75ff3487034d0b1e433246cf0bbd94dcd`; terms `69b3db9491611816fd09a4ddbda0c9f43300feb2fb972d6acd158f8bcbcdce52`; result `2d85a27e119a597dd5f61e18bd0df8a3c33c5046c2c1dd45a98deedc7a796cb1` |
| Victoria County — November 25, 2025 (public auction) | [Announcement notice](https://victoriacounty.com/wp-content/uploads/2025/10/Tax-Sale-Notice-2-Website-Post.jpeg) | [Tax-sale results](https://victoriacounty.com/wp-content/uploads/2025/12/Tax-Sale-Results-for-November-25-2025.pdf) | 2 / 2 | One `SOLD` (its AAN officially printed with seven digits) and one `NOT SOLD` included; one `DEFERRED` and three `PAID` rows publish no `Total Owing` and are excluded | Notice `cb54268759745bb68475e0f1e3233558b879dbfda66c3df55cf8eb010fbd06aa`; result `592396e7d8c39320407b1f512aeddd1bbb25c8c59a1774ac45aa523a589f56db` |
| Victoria County — March 24, 2026 (public auction) | [Announcement page snapshot](https://victoriacounty.com/upcoming-tax-sale-by-public-auction-3/) and [housekeeping rules](https://victoriacounty.com/wp-content/uploads/2026/02/Tax-Sale-Housekeeping-Rules.pdf) | [Tax-sale results](https://victoriacounty.com/wp-content/uploads/2026/03/Tax-Sale-Results-March-24-2026.pdf) | 5 / 5 | Three `SOLD` and one `NOT SOLD` included; one `REMOVED` row printed beside a $17,500.00 bid kept fail-closed as withdrawn with no winning bid; ten `REMOVED` rows publish no `Total Owing` and are excluded, one printing a malformed seven-digit PID | Notice snapshot `a1220caa96989654dd34c468e5f10e59a97fe232ae3bf1efdc73fa7fbb2d1f7f`; terms `3a603c74648e04f11cb525c9d0040156f1c42c0822dd5bc1f276e2686ccc5897`; result `78a4bc0e6bf5d0348fef186d25bb57569b25a3122859d217c46b64ec5b5f9f89` |

The Victoria County slice has 19 owner-free records and 19 exact PIDs: six
sold outcomes, three official `NOT SOLD` outcomes, one fail-closed withdrawn
outcome, and nine outcome-unknown rows. All 19 PIDs were returned by the live
NSPRD query on July 23, 2026 (PID `85008126` returns four polygon parts for
one PID). PID `85142388` appears in two events — `NOT SOLD` in August 2025 and
`REMOVED` beside a printed bid in March 2026 — and both records are retained
separately.

## Result-backed CBRM event (pre-sale notice decayed)

CBRM's July 22, 2025 result is a single self-contained `JULY 22, 2025 TAX SALE`
table carrying lien, AAN, PID, address, location, minimum bid, redemption, and a
`WINNING BID` column that prints either a dollar amount or one of `PAID AT
SALE`, `WALKED AWAY`, and `REDEEMED`. The municipality's pre-sale notice PDFs
were dropped when the site moved to WordPress and were never archived, so the
notice receipt is the official CBRM tax-sales page as captured on July 14, 2025,
eight days before the sale. That page pins the method, date, time, and venue —
"TAX SALE WILL BE HELD ON JULY 22, 2025 @ 11:00am, CENTRE 200, 481 GEORGE ST,
SYDNEY, MAIN CONCOURSE", with day-of-sale registration and an in-person tax-sale
FAQ — and links maps and descriptions for liens 25-97 to 25-217, the exact lien
range the result table covers.

The table fills outcome-bearing rows in yellow. That fill was measured on the
rendered pages row by row rather than trusted by eye: for each of the 74 row
bands the mean red-minus-blue channel difference separates cleanly into filled
rows (0.79 to 0.92) and plain rows (0.00 to 0.12), and the split agrees with
whether the `WINNING BID` cell prints anything on all 74 rows, with no
exceptions. The highlighting is therefore decoration that restates the printed
column, and no disposition depends on it — which is what distinguishes this
document from the March 10, 2026 result that remains held.

| Municipality / event | Official notice receipt | Official result | Records / PIDs | Row disposition | SHA-256 receipts |
| --- | --- | --- | ---: | --- | --- |
| Cape Breton Regional Municipality — July 22, 2025 (public auction) | [Tax-sales page captured 2025-07-14](https://web.archive.org/web/20250714162415id_/http://www.cbrm.ns.ca/tax-sales.html) | [List of sold properties](https://cbrm.ns.ca/wp-content/uploads/2025/11/CBRM-List-of-Sold-Properties-Tax-Sale-July-22-2025.pdf) | 73 / 75 | 50 rows publish a winning bid and one prints `REDEEMED`; five `PAID AT SALE`, four `WALKED AWAY`, and thirteen rows with an empty bid cell stay outcome unknown; one row excluded for an unmatched PID | Notice `57a1c33af8a5056416ffc6eb6e4c80b9edea80eebe5fc3993c72304e84e266fe`; result `b6a549fc8c0c49482246946b24eb4f8182694c23bf8e9342565bba8263da44f3` |

The CBRM July 22, 2025 slice has 73 owner-free records and 75 exact PIDs, two of
them two-PID listings that keep amounts at listing level. `PAID AT SALE` is not
read as a completed sale: the official wording does not distinguish a winning
bidder paying at the sale from the account being paid to stop it, so those rows
stay outcome unknown with the phrase preserved. `WALKED AWAY` likewise publishes
no bid and claims no sale, and is not recorded as unsold because a bid clearly
existed. Lien 25-178 (AAN 2210363, PID 15440050, printed beside a $7,000.00
winning bid) is excluded because the live NSPRD service returns no parcel for
that PID in either a batched or a single query, and it is itemized in
`historicalMatchExceptions.json`. Ten parcels appear in both this event and the
July 21, 2026 CBRM notice event; each event keeps its own record.

## Result-backed Cumberland events (single overwritten page)

Cumberland publishes each sale's `TAX SALE RESULTS` table as HTML on one page it
overwrites when the next sale is posted, so only the newest sale is ever live and
no pre-sale property listing survives. An archive capture of that address is
therefore both the notice and the result receipt for each event. Each event was
parsed from two independent captures — and March 2026 also from a live retrieval
on July 23, 2026 — with all copies agreeing row-for-row.

| Municipality / event | Official notice receipts | Official result | Records / PIDs | Row disposition | SHA-256 receipts |
| --- | --- | --- | ---: | --- | --- |
| Cumberland — October 21, 2025 (public auction) | None survives; the [archived results page](https://web.archive.org/web/20251113031043id_/https://www.cumberlandcounty.ns.ca/tax-sales.html) stands in | Same archived page | 20 / 20 | All twenty rows included: nineteen publish a `WINNING BID`; one `NOT COMPLETED` row held as outcome unknown | Capture `e7e47cbcc9ac6b227877cedc74914a8051ca2f18d47befc01c376b2b3ff61cc2`; corroborating January 22, 2026 capture `b1692feee7aa13339e7b87f4151b6eac75c19d43f1c7cc1c1fb2cac31f9931f2` |
| Cumberland — March 3, 2026 (public auction) | None survives; the [archived results page](https://web.archive.org/web/20260415155709id_/https://www.cumberlandcounty.ns.ca/tax-sales.html) stands in | Same archived page | 14 / 14 | All fourteen rows included: eight publish a `WINNING BID`; six `ADJORNED` rows recorded as withdrawn with no bid | Capture `8aad467e955cba418f800bcfcb76096099558cbfe6e9530291a190a0fe58de56`; corroborating May 9, 2026 capture `40e1e24039f26c369d07b8990a7071da841b0408337a08f93f895ffd69d2c324`; live retrieval July 23, 2026 `b2ff90287447e9ca822af653a42af0348767cae767d45f954326b39608668d92` |

Both tables publish AAN or `ASSESSMENT`, PID, description, `REDEMPTION EXPIRY`,
`MIN BID`, and `WINNING BID`. The Cumberland slice has 34 owner-free records
across 33 distinct PIDs: 27 sold
outcomes, six rows printed `ADJORNED` — the municipality's own spelling of
adjourned — recorded as withdrawn with no bid, and one `NOT COMPLETED` row held
outcome-unknown because the source does not say whether a bid was received. PID
`25049271` appears in both events: `NOT COMPLETED` in October 2025, then sold
for $16,000.00 in March 2026.

Cumberland's assessment numbers and location descriptions are reproduced exactly
as printed. That leaves seven-digit assessment values without their leading zero
and keeps descriptions in the municipality's upper case; case was not normalized
because doing so would corrupt names such as `MCGEE` and `MCDOUGAL`. PVSC
independently lists the March 2026 example parcel as AAN `07463308` against
Cumberland's printed `7463308`, confirming the dropped leading zero.

### Cumberland refresh watch

Cumberland holds tax sales in **October and March each year** and overwrites this
single page with each new sale, so the next overwrite will destroy the live
results. A scheduled watcher now closes that gap.

`.github/workflows/tax-sale-watch.yml` runs `npm run watch:tax-sales` weekly. On
each run the watcher fetches the live page and compares the published sale against
`web/src/data/cumberlandTaxSale.snapshot.json`:

- **No new sale** — the run exits having changed nothing.
- **A new sale, no hashable capture yet** — the watcher submits the page to the
  Wayback Machine and records the sale as pending in the snapshot. It cites nothing
  hashable and retries on the next run. This is the deferred state, and it exists
  because Save Page Now can return a bot-verification interstitial whose replay
  renders the results table while its raw archived payload does not carry it. The
  watcher fetches the `id_` bytes of each candidate capture and only accepts one
  whose payload actually contains the table.
- **A new sale with a verified capture** — the watcher ingests the event and
  records, appends a ledger entry, updates the snapshot, and opens a pull request
  into `nightly` for human review. Because it archives *before* it ingests,
  evidence is preserved even when ingestion is deferred to a later run.

The watcher refuses to guess. Any winning-bid cell that is neither a money amount,
`ADJORNED`, nor `NOT COMPLETED` — and any layout change that breaks parsing — fails
the run loudly rather than producing a record, so a novel status word reaches a
human instead of being mapped wrong.

**Scheduled workflows run only from the default branch**, so the watcher is dormant
until this change is promoted `nightly → weekly → main`. `workflow_dispatch` runs it
on demand before then.

## Result-backed Municipality of the District of Lunenburg events (derived PIDs)

Retrieved and reviewed July 23–24, 2026. Lunenburg publishes a different source
shape from the others: an official tender package (plus addenda) advertises each
sale, and the winning bid for each awarded property is published in its own
per-property "award" document rather than a consolidated result table. The
minimum opening bid and the advertised property list come from the tender
package; the winning bid is read from the award document. Award documents for
2024–2026 are typed scans and 2021–2023 are handwritten; every award figure was
transcribed by visual review of the 300-DPI page image, not by trusting OCR.

Lunenburg publishes assessment account numbers but no PIDs. Each PID here was
derived deterministically — the account's PVSC open-data coordinate
(`bt58-qu28`) was matched against the NSPRD parcel layer — and recorded with
match method `deterministic-reconciliation`. All 125 distinct accounts resolved
to exactly one PID each; none were ambiguous or unmatched.

The municipality's "Tax Sale Surplus History" was used only as an independent
cross-check, never as a price source: for sold properties, `winning bid −
opening bid` reproduces the reported surplus, exactly for most rows and within a
few dollars for others because the surplus is struck against amounts owed at
settlement while the opening bid is struck at advertisement. Selling prices were
therefore never reconstructed from surplus. Where an award document and the
surplus record point to different sale outcomes, the listing is held outcome
unknown rather than guessed.

| Sale (tender) | Listings | Sold | No bids | Withdrawn | Unknown | Award docs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| March 1, 2021 (2020-01-009) | 27 | 16 | 2 | 7 | 2 | 20 |
| March 7, 2022 (2021-01-001) | 39 | 16 | 8 | 15 | 0 | 24 |
| March 6, 2023 (2022-01-003) | 13 | 7 | 1 | 4 | 1 | 8 |
| March 6, 2024 (2023-01-002) | 25 | 11 | 4 | 0 | 10 | 15 |
| March 3, 2025 (2024-01-001) | 18 | 11 | 2 | 0 | 5 | 13 |
| March 2, 2026 (2025-01-004) | 23 | 8 | 4 | 11 | 0 | 12 |
| **Total** | **145** | **69** | **21** | **37** | **18** | **92** |

Withdrawn counts are properties advertised in the tender package but absent from
the final addendum (2021–2023) or explicitly marked "REMOVED FROM TAX SALE" on
the awards page (2026); 2024 and 2025 published no addendum, so their advertised
listings without an award document stay outcome unknown rather than being
inferred as withdrawn or no-bid. Every per-property award document, tender
package, addendum, and the surplus history is receipted with a SHA-256 in
`historicalSourceLedger.json`. The 2022 tender package is no longer served by
`modl.ca` and was recovered from the Internet Archive snapshot of the
municipality's own file link, which is the URL carried as the event notice.

Known defects in Lunenburg's own source documents, recorded but not published as
data: the award documents for 2021 item 60, 2024 item 104, and 2026 item 65 each
print an assessment account number that does not exist in PVSC and is a
transposition of the notice value (which does); the notice value was used in
every case. For 2021 item 229 the award document and the surplus record disagree
on the final sale, and for 2021 item 31 the sale was awarded and then withdrawn
by both marked bidders; both are held outcome unknown with no winning bid.

## Notice-only event awaiting official results

| Municipality / event | Official notice | Official results page | Records / PIDs | Published result fields | Receipt |
| --- | --- | --- | ---: | --- | --- |
| Cape Breton Regional Municipality — July 21, 2026 | [Second advertisement](https://cbrm.ns.ca/wp-content/uploads/2026/06/JULY-21-2026-2nd-Ad.pdf) | [CBRM tax-sales page](https://cbrm.ns.ca/business/property-sales-management/tax-sales/) | 67 / 68 | None linked when checked after the auction on July 21 | Notice `5435e9b89df5ac15f63097c0935661b5616e7b6bdc8b04fd4e8811ba6d457566` |

These owner-free notice records now render in historical-record mode because
the event date has passed. All outcomes and winning bids remain unknown. The
municipal page says results will be posted after payment is confirmed, so the
archive links back there and makes no sold, unsold, withdrawn, paid-at-sale,
redeemed, or walked-away claim.

## Researched but not included

| Municipality / event | Official sources | Fields found | Why held fail-closed |
| --- | --- | --- | --- |
| Cape Breton Regional Municipality — March 10, 2026 | [Official sold-properties result](https://cbrm.ns.ca/wp-content/uploads/2026/03/Sold-Properties-March-10-2026-Tax-Sale.pdf) and [current tax-sales page](https://cbrm.ns.ca/business/property-sales-management/tax-sales/) | Lien, AAN, PID, location, minimum bid, redemption, some winning bids | Result rows mix published bids, blank bid cells, and visual outcome highlighting. A separate row-level rendered reconciliation is required. Result SHA-256: `ed0dbc1dcc09a7fb9a063b716784cb1b3ba18306f9984013791e4b250f667dc4`. |
| Municipality of the County of Cumberland — January 14, 2025 and March 18, 2025 | Archived pre-sale notices: [January 14 sale](https://web.archive.org/web/20250124093558id_/https://www.cumberlandcounty.ns.ca/tax-sales.html) (2 properties) and [March 18 sale](https://web.archive.org/web/20250215042907id_/https://cumberlandcounty.ns.ca/tax-sales.html) (32 properties) | AAN, PID, district, assessed owner and location, balance due, redeemable | Notice tables survive but no capture of either result table exists, because Cumberland overwrites its single tax-sale page and no crawl landed between those sales and the next overwrite. Notice-only rows stay out of the published dataset. Several March 18, 2025 parcels reappear with published results in the included October 21, 2025 and March 3, 2026 events. |

No third-party auction claims or inferred outcomes fill these gaps. A completed
event's verified notice records may render with outcomes explicitly pending;
specific outcome or winning-bid fields enter the layer only from an official
document that is deterministic, owner-free, and NSPRD-matched by exact PID.
That normally means the notice/result pair reconciles row by row. When a
municipality removes its pre-sale listing (the Victoria County pattern), a
result table may stand alone only if it is self-contained — identifiers,
amounts, statuses, and bids in one official document — and an official notice
receipt still pins the sale method and date; rows whose status or amount is
not published stay outcome-unknown or are excluded and itemized in the source
ledger. Under this refined rule the CBRM July 22, 2025 result was ingested on
July 23, 2026: its row-level visual reconciliation showed the yellow fill merely
restates the printed `WINNING BID` column on all 74 rows, and an archived
official tax-sales page recovered the notice receipt that pins the auction
method and date. The CBRM March 10, 2026 result stays held because its outcome
highlighting has not been shown to be similarly redundant; the same rendered
row-fill measurement must be run against it before any of its rows publish.

Recovering a decayed notice is itself part of the rule rather than a courtesy
step. For CBRM the pre-sale PDFs were dropped in a site migration and never
archived, but the WordPress REST media and posts endpoints
(`/wp-json/wp/v2/media?search=`, `/wp-json/wp/v2/posts?search=`) enumerated what
the live library still holds, and a Wayback CDX sweep of the legacy
`/images/stories/TAX SALES/` directory and `tax-sales.html` surfaced a capture
of the official page taken eight days before the sale. A notice receipt may be
an official municipal page snapshot rather than the advertisement PDF, as it
already is for the Victoria County March 24, 2026 event, provided it pins the
sale method and date.

## QA evidence

- [Desktop historical infocard](screenshots/historical-infocard-desktop.jpg)
- [390×844 historical infocard](screenshots/historical-infocard-mobile-390x844.jpg)

The live QA record was PID `00542589`: Halifax's March 8, 2022 result shows an
opening bid of $1,899.05 and selling price of $12,500.00. NSPRD returned 2.58
mapped acres. The road-context query returned three features labelled
“Adjacent within 20 m”; the UI explicitly says this is not proof of legal access
or frontage. The browser console had no warning or error entries.

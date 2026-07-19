# Historical tax-sale source coverage

Retrieved and reviewed July 19, 2026. Only official municipal primary sources
were used. Text extraction supported reconciliation; PIDs and financial values
in the four included notice/result PDFs were also checked against rendered
pages. Public data and screenshots omit assessed-owner and bidder names.

## Included events

| Municipality / event | Official notice | Official result | Records / PIDs | Published result fields | SHA-256 receipts |
| --- | --- | --- | ---: | --- | --- |
| Halifax Regional Municipality — March 8, 2022 | [Schedule A notice](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/MAR8.22website.newspaper%20%233.pdf) | [Tax-sale results](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/Tax%20Sale%20Results%20for%20Website%20March%208_0_0.pdf) | 11 / 11 | Assessment #, PID, location, `Opening Bid`, `Selling Price`, `Redeemable` | Notice `da1948056b94af75cdd261cbcbb0cdb19dd25f98c997e5e0336a54b2b73fc4f9`; result `b76f4f6840ddc0160f289e4e17cf54f4f11939d8ff35f19dab931a069b5543b8` |
| Halifax Regional Municipality — September 16, 2025 | [Final Schedule A notice](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/sept16.2025newspaper.website-sept15-2.25.pdf) and [tender terms](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/revised-tender-doc-new-process-sept16.25.pdf) | [Tax-sale results](https://cdn.halifax.ca/sites/default/files/documents/home-property/property-taxes/tax-sale-website-results-sept-16.pdf) | 37 / 38 | Assessment #, PID, location, `Opening Bid`, `Selling Price`, `Redeemable` | Notice `b653a1ad975f6e72ee66a2ddedd76c2a415a1dc1cc70ee743ce8ead9535c5ad0`; terms `f1e362a74880c0236c2e7bef1c8d254ea1555b3d981b90c26cd9e7444b56e033`; result `298eb52e49c734b418bea2e7b73747adfc3b3848cccbaa0aeb56fb578c270768` |

The included dataset has 48 owner-free records and 49 exact PIDs: 46 sold
outcomes and two official `NO BIDS` outcomes. All 49 PIDs were returned by the
live NSPRD query during review. One 2025 record contains two PIDs; its amounts
remain listing-level.

## Researched but not included

| Municipality / event | Official sources | Fields found | Why held fail-closed |
| --- | --- | --- | --- |
| Cape Breton Regional Municipality — March 10, 2026 | [Official sold-properties result](https://cbrm.ns.ca/wp-content/uploads/2026/03/Sold-Properties-March-10-2026-Tax-Sale.pdf) and [current tax-sales page](https://cbrm.ns.ca/business/property-sales-management/tax-sales/) | Lien, AAN, PID, location, minimum bid, redemption, some winning bids | Result rows mix published bids, blank bid cells, and visual outcome highlighting. A separate row-level rendered reconciliation is required. Result SHA-256: `ed0dbc1dcc09a7fb9a063b716784cb1b3ba18306f9984013791e4b250f667dc4`. |
| Cape Breton Regional Municipality — July 22, 2025 | [Official sold-properties result](https://cbrm.ns.ca/wp-content/uploads/2025/11/CBRM-List-of-Sold-Properties-Tax-Sale-July-22-2025.pdf) and [current tax-sales page](https://cbrm.ns.ca/business/property-sales-management/tax-sales/) | Lien, AAN, PID, location, minimum bid, redemption, winning bid, paid/redeemed/walked-away states | The current public page no longer links the original sale notice, so the notice/result pair cannot yet be reconciled. Result SHA-256: `b6a549fc8c0c49482246946b24eb4f8182694c23bf8e9342565bba8263da44f3`. |

No third-party auction claims or inferred outcomes fill these gaps. Records can
enter the rendered layer only after the notice/result pair supports a
deterministic, owner-free normalization and an exact or otherwise unambiguous
NSPRD match.

## QA evidence

- [Desktop historical infocard](screenshots/historical-infocard-desktop.jpg)
- [390×844 historical infocard](screenshots/historical-infocard-mobile-390x844.jpg)

The live QA record was PID `00542589`: Halifax's March 8, 2022 result shows an
opening bid of $1,899.05 and selling price of $12,500.00. NSPRD returned 2.58
mapped acres. The road-context query returned three features labelled
“Adjacent within 20 m”; the UI explicitly says this is not proof of legal access
or frontage. The browser console had no warning or error entries.

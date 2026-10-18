# Tax-Sale Geometry Exceptions Design

## Purpose

Publish the September 14, 2026 Victoria County tender and September 15, 2026
Halifax Regional Municipality tender without inventing parcel geometry or
hiding official notice rows. Victoria has eight active listings whose exact
PIDs all resolve in NSPRD. Halifax has 31 advertised rows and 32 exact official
PIDs; two parking-space PIDs return valid empty NSPRD collections.

## Evidence authority

Municipal notices remain authoritative for event details, AANs, PIDs,
descriptions, amounts, redemption flags, and advertised/removed status. NSPRD
remains authoritative only for rendered parcel geometry. An empty NSPRD result
does not invalidate an official notice PID and does not authorize a substitute
parcel.

Assessed-owner fields from both sources are discarded during parsing and never
enter repository snapshots, generated map data, logs, tests, PR text, or
production. Victoria's overwrite-prone HTML is archived before ingestion.
Halifax's dated tender and Schedule A PDFs are pinned by byte SHA-256 without
committing their owner-bearing bytes.

## Data model

Each source snapshot retains every owner-free official row. The public
`TaxSaleEvent` separates renderable listings from explicit geometry exceptions:

```ts
type TaxSaleGeometryException = {
  recordId: string;
  aan?: string;
  pids: string[];
  location: string;
  reason: "no-nsprd-geometry";
  checkedOn: string;
};

type TaxSaleEvent = {
  // existing fields
  listings: TaxSaleListing[];
  geometryExceptions?: TaxSaleGeometryException[];
};
```

For Halifax, `listings` contains 29 mapped source rows representing 30 unique
PIDs. `geometryExceptions` contains the two source rows for PIDs `41051889`
and `41051897`, checked August 15, 2026. The snapshot continues to contain all
31 rows and 32 PIDs, with counts for source rows, mapped rows/PIDs, and geometry
exceptions. Victoria has no geometry exceptions.

The normal catalog PID helpers consume only `listings`, so unavailable PIDs are
never sent to the map layer or presented as mapped parcels. A separate helper
returns exception PIDs for validation and disclosure.

## User interface

Every event summary continues to show advertised and withdrawn source status.
When exceptions exist it also shows mapped and unavailable counts, using the
Halifax wording:

> 31 advertised · 29 mapped · 2 unavailable in NSPRD

The expanded property browser lists mapped parcels as selectable buttons. It
also lists each unavailable row as non-interactive official notice evidence,
including its description, AAN/PID, and the statement that no exact NSPRD
geometry was returned on the recorded check date. The UI must not call those
rows withdrawn, unavailable for sale, invalid, or absent parcels.

## Refresh and fail-closed behavior

The Victoria refresher rejects partial removals, malformed or duplicate
identifiers, unfamiliar yes/no values, row-count regressions, and changed facts
that cannot first be matched to a verified Wayback capture.

The Halifax refresher resolves exactly one tender number, tender PDF, and
Schedule A PDF from the official landing page. It parses the fixed owner-free
columns, rejects layout shifts, duplicates, unfamiliar HST/redemption values,
or any count other than 31 rows and 32 PIDs, and pins both PDF hashes. The two
geometry exceptions are accepted only when their AAN/PID pairs still match the
same official rows. Any added, removed, or changed exception fails closed.

The live NSPRD gate validates both halves of the contract: every mapped
upcoming PID must return geometry, while the two declared exception PIDs must
still return none. If an exception begins resolving, the gate fails so the row
can be promoted to the mapped catalog rather than remain stale.

## Verification and publication

Tests cover source parsing, privacy, hashes, exact counts, catalog partitioning,
exception disclosure, and live NSPRD reconciliation. Two unchanged-source
refreshes must produce identical bytes. Final gates are the complete test
suite, lint, production build, JSON parsing, forbidden identity-key scan, and
`git diff --check`.

After the NS Marks PR merges to `nightly`, KinNoKi must promote that exact merge
through its existing workflow. Tools, Resources, and Output receipts must all
pin the same NS Marks SHA. Cloudflare preview and production checks, the
cache-busted public source receipt, desktop/mobile rendering, source counts,
official links, exception wording, historical examples, and clean browser
consoles are separate acceptance gates.

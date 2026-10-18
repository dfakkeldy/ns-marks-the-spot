# Electoral implementation status

## Phase 1 — Elections & Districts

Adds eight default-off electoral layers, government-level groups, and the
Electoral Districts theme. Each election/boundary source retains its geometry.
The 2024 inspector reports elected MLA, party-labelled valid-vote shares,
margin, listed-elector turnout, source links and the 2026 boundary caveat.
Current MP names/current caucus use a dated Commons XML snapshot; provincial
boundary selections consult the separate dated seats source. The seats source
fails closed when its reviewed attribute fingerprint changes.

The runtime accepts no point or viewport input for source requests. Open data
is downloaded as a complete pinned NS extract; provincial requests page the
complete source with a fixed 0.00003-degree display simplification (at most
3.4 m), only after the licence gate. Navigation filters geometry locally.
Polling divisions request/render at zoom 12+, with identifying labels and
counts suppressed for institutional polls.

Federal conversion preserves multipart placemarks and holes. There are 2,269
NS poll placemarks but 2,260 distinct poll IDs: multipart IDs occur in ridings
12002, 12003, 12008, 12009 and 12010. Acadie—Annapolis retains 203 unique IDs.
Municipal district codes repeat in the source, so Socrata row IDs are retained
rather than inventing a unique municipality/district key. Municipal regulations
vary in date; no current councillor is inferred from these boundary records.

Shared URLs and browser print retain display modes and source credits. The
existing generated-PDF compositor omits the eight feature overlays and lists
those omissions explicitly. This is a source implementation, not deployment
or KinNoKi publication.

## Licence evidence checked September 12–13, 2026

- The [federal boundary catalogue](https://open.canada.ca/data/en/dataset/97a2a33c-54cc-4f2e-82c1-047ad8212f05)
  explicitly attaches OGL-Canada to the 2025 boundary package, including polling
  divisions. Read in the Browser pane; the HTTP/API fetch returned a challenge.
- The [Halifax licence](https://data-hrm.hub.arcgis.com/pages/open-data-licence)
  was read after its page rendered. Its exact default credit is retained,
  including “licenced” and the em dash before Halifax.
- Socrata `gcep-xeci` declares `OGL_NOVA_SCOTIA`. The newer empty-attribute
  view is not used.
- Provincial BND layer metadata provides no redistribution terms. No provincial
  geometry or result extract is committed. The only stored seats audit is a
  source URL, checked date, field names and SHA-256 digest.
- The external Claude Artifact reader is unavailable in this environment.
  The checked-in canvas manifest and Python generators supplied the design
  tokens, party palette, classification breaks, groups and inspector copy.

## Phase 2 gate — redistribution remains unresolved

Do not generate a publishable provincial poll-results extract until written
terms cover the Elections Nova Scotia 2024 workbook. A source being publicly
fetchable, and the app's Province service gate, do not establish redistribution
permission. The handoff itself records this unresolved licence question.

The [Elections Canada general terms](https://www.elections.ca/content.aspx?document=index&lang=e&section=pri)
permit conditional non-commercial reproduction and require prior permission
for commercial redistribution unless otherwise specified. The verified OGL
boundary catalogue does not itself cover the separate 2025 result CSVs. A
specific open licence or applicable written permission for those results still
needs to be attached to their receipt.

Phases 2–4 remain unimplemented. The requested sequence stops at the Phase 2
licence question; census and the full representatives directory have not been
silently substituted or started out of order.

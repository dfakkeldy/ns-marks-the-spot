# Shared GIS source expansion

User-approved outcome: enable as many usable sources from the Rhodena source research as practicable in both the main map and Rhodena. Existing layers are reused; new overlays start off and can be selected/shared. This extends the current catalogue, without replacing map architecture.

## Implementation

- [x] Verify source delivery, schemas, publisher terms and local coverage; record receipts and exclusions.
- [x] Add source-preserving biodiversity/habitat layers and a public provincial core-habitat snapshot where licensing permits.
- [x] Add usable hydrography and ecological context using current delivery paths. The imagery-date source returned null geometry and stays deferred.
- [x] Extend the existing vector layer for bounded Socrata point, OGC and static GeoJSON delivery; preserve source IDs, cancellation, size limits and distinct states. CABD is deferred because its live licence is noncommercial and conflicts with its overview documentation.
- [x] Register shared controls, categories, share URLs and print attribution; expose relevant existing full-map integrations in Rhodena.
- [x] Rebase onto latest origin/nightly, 3b3ec0ec4, as requested; no conflicts.
- [x] Verify adapter failure cases, catalogue/route integration, all web checks and desktop/phone browser interaction with real sources.
- [x] Independently review the completed change and resolve the coverage finding.

Delivery follows the standing GitHub workflow: commit, push, ready nightly PR,
hosted CI and merge under normal branch protection. Hosted status is recorded
on the PR rather than in this source document. Rebased local verification:
2,462 Vitest tests passed (one existing skip), 30 script checks passed, lint
and production build passed, and 11 targeted Playwright cases passed.

## Evidence and verification constraints

Public habitat geometry remains at publisher generalization. No private species records, inferred PIDs, precise protected sites, guessed field boundaries or legal-impact conclusions. Every new layer has a date, source, licence, coverage and useful legend. PDF-only geometry is deferred unless geographic fit and source terms can be established. Existing primary/secondary/tertiary Watersheds are already integrated under the legacy `flood-risk` id; do not duplicate them.

Queries run only for selected layers at a suitable zoom, remain bounded and cancel on pan/unmount. A failed or truncated response never becomes a successful empty result. Public source fields render as text, and URLs are restricted to safe protocols. Shared layers must appear in both route menus, roundtrip through share state and retain source credit in printing.

The KinNoKi hosting pin is a separate deployment; repository delivery does not establish live publication.

Independent review checked endpoint fields, bounded queries, source identities and CORS. Its one P2 finding—known sub-tertiary outside coverage appearing as an empty success—is fixed with conservative polygon envelopes and verified service/component/browser cases. Eleven targeted browser tests cover both routes at 390 and 1440 px; real-source preview also loaded core/federal habitat, CNWI imagery, public structures, NSHN and the WSC station inventory. The public core-habitat asset reproduces to SHA-256 b3bfdde302054122e2a3de6ab715a4435aed15370d026f140b600a2bf4c93d61.

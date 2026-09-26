# Crown Grant publication preflight — 26 September 2026

**Blocked before public imagery upload.** The deployment request covers all 138
assessed official sheets, retaining their individual limitations. It supersedes
the earlier assessment-only task scope; it does not establish a source licence.

## Prepared inputs

The active assessment is pinned to nightly commit
`91db91b8723e5c4d5c891821364c56b31178e1eb`, including the second-round review
merged in [PR #564](https://github.com/dfakkeldy/ns-marks-the-spot/pull/564).
The private deployment inventory preserves all 138 source PDF/JPEG pairs and
157 active raster components, exact component bounds, hashes, masks, fit records,
source links and per-sheet limitations. See [verification.json](verification.json)
for the fresh integrity check. The inventory and imagery stay in durable storage,
outside Git and disposable worktrees.

The original sheet 005 fit remains active. Its rejected second-round candidate
is excluded. Sheet 002's unsupported inset and the separate island/inset
components remain explicitly identified; no component has been silently cropped
away or promoted into geographic acceptance.

Of the main maps, 102 meet the 100 m RMS ceiling, 36 exceed it, and 82 meet all four
numerical limits. These counts are assessment findings, not production eligibility
or a guarantee about unmeasured regions. The eventual UI must expose the
individual results and qualifications. An unsupported component cannot silently
enter the normal accepted overlay.

## Specific publication blocker

The [official sheet index](https://novascotia.ca/natr/land/grantmap.asp) provides
the source PDFs. The current [Province copyright terms](https://www.novascotia.ca/copyright)
permit qualifying non-commercial reproduction subject to conditions including
unmodified material and accurate reproduction. The proposed imagery has been
georeferenced, masked, repositioned where insets require it, and resampled into
map coordinates. Those general terms do not establish permission for this
modified-scan distribution.

The [Open Government Licence – Nova Scotia](https://support.novascotia.ca/services/open-data-portal-licence)
allows adaptation of information offered under that licence, but its applicability
to the complete scans and underlying base mapping has not been established.
The permission review and supporting correspondence are retained privately;
private messages and personal details are not included in this public report.

Required evidence: permission covering public hosting of georeferenced/derived
tiles from the complete Crown Grant scans, including underlying base mapping,
or an authoritative statement placing those complete scans under an applicable
licence permitting this use. A repository licence and a user's deployment
authorization are separate from source redistribution rights.

## Verified publication route and remaining work

1. Resolve the specific source-permission scope and record attribution and
   reproduction conditions.
2. Use the existing raster/XYZ approach to generate versioned deployment assets
   in durable storage, retaining component provenance, full mapped frames,
   source-union coverage, and individual limitations. Verify tile inventory,
   imagery and coverage before upload. Do not substitute the rejected 005 fit.
3. Integrate the Crown Grant collection into the existing React/Leaflet map:
   default-off selection, opacity, source links, per-sheet/component limitations,
   and the printed graphic-index warning. Keep unsupported/rejected geographic
   placements distinguishable and fail-closed under the existing evidence rules.
   Attribution and limitations must also follow any supported print/export path.
4. Verify focused tests, lint/build, desktop/mobile rendering, selection, opacity,
   loading failures, geographic coverage and the console. No native build is
   required for this web work.
5. Upload only cleared derived assets to a new immutable revision on the
   existing tile host, verify uploaded objects and the public tile receipt, then
   merge the source PR into nightly after required CI.
6. Update KinNoKi's exact source pin using its established transactional sync
   and generated-output workflow. Merge its separately verified publication PR
   and confirm hosting completion. Verify generated-artifact parity, the public
   map source receipt, intended source SHA, and live custom-domain rendering.

Both repositories currently have auto-merge disabled and squash merge enabled.
Normal verified-head merges after green required checks remain the established
route; no settings change or bypass is needed.

The public map source receipt currently identifies
`d2783ce8753d8921e3f1175aa7bb2538b3abfab3`. This is baseline evidence only:
**no Crown Grant integration, public tile generation/upload, source pin change,
hosting deployment or live Crown Grant acceptance is claimed.**

## Durable handoff

Local folder: `~/Documents/NS Marks The Spot/Crown Grant/deployment-preflight-20260926/`.

- `deployment-inputs.private.json`: exact source/raster inventory and assessment records.
- `verification.json`: fresh integrity checks and current live source receipt.
- `permission-review.private.json`: separately preserved permission evidence.
- `prepare_inputs.py`: repeatable local inventory verification.
- `live-map-source.json`: retrieved baseline public receipt.

The existing private collection reviewer remains at
`http://127.0.0.1:8842/`. Port 8843 is the rejected sheet 005 comparison.
Neither is a production deployment.


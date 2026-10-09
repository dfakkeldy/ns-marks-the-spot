# Publication of the Fletcher seam repair

The user approved publishing `fletcher-seams-20261009.2` and activating it on the
live map on 9 October 2026. The previous September 13 revision is retained for
rollback. The raster and tile checks are in the parent report.

The `cf` CLI uploads each object with its correct content type. Since its R2
object command does not expose Cache-Control metadata, the two recorded zone
rules apply only to the new immutable prefix on `tiles.kinnokilabs.com`. Successful
responses receive the same one-year immutable cache header as the old objects;
4xx/5xx responses are not cached. Existing bucket CORS and public access remain
unchanged. Created rule IDs and a public header/CORS check are retained here.

This change activates the revision in both shared client catalogues and updates
their caveat to identify the aesthetic adjustment. Geographic fits and original
scans remain unchanged. Site publication uses KinNoKi's existing exact-source
promotion workflow and its generated `source.json` receipt.

Rollback is a client pin change back to `fletcher-full-sheets-20260913.1` and a
KinNoKi rebuild from the prior accepted source. No tile deletion is required.
The scoped cache rules have no effect on the old revision or other map families.

## R2 result

Publication is complete. [Verification](verification.json) records 44,340 PNG
objects plus both manifests, all matching the local file sizes and MD5 values.
Forty-two public responses matched SHA-256, content type, immutable caching and
CORS. The exact public manifest is retained as [source.json](source.json).

The cf-only route uploaded the complete version. Of the PNGs, 5,572 differ from
September 13 and 38,768 are byte-identical. The CLI currently has no server-side
copy command; its REST API rate limit required paced uploads. No additional
credentials were created, and no old tile objects were removed.

Client activation is PR #584. KinNoKi publication and live-site acceptance are
separate from this R2 transport receipt.

## 2D to terrain cache compatibility

Live acceptance exposed a browser-cache failure when terrain fetched a tile
previously cached by a non-CORS 2D image. The tile bytes were correct, but the
cached response lacked the headers required for a readable cross-origin fetch.
The scoped response rule now adds `Vary: Origin` to successful responses,
including requests without an Origin header. The updated rule and API receipt
are retained in `cache-header-rule-vary*.json`; bucket permissions are unchanged.

The terrain reader also reloads tiles from non-CORS image layers, so previously
cached responses cannot keep the failure alive. CORS-enabled layers retain
normal caching. A real-HTTP Playwright regression reproduced the failure before
the fix and passes afterward, alongside a test proving CORS cache reuse. Both
browser tests passed; the web suite passed 2,489 tests with one skipped, and lint
and production build passed. The fixture is excluded from production builds.

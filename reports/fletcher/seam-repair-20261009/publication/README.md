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

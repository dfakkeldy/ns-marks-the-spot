# Handoff — web GeoPDF LGIDict fix

## 2026-08-15 — LGIDict Projection made GDAL-readable

Done: Fixed three defects in `web/src/print/pdf/geoRegistration.ts` ported from
the native app (`GeoPdfRegistration.swift`, branch `claude/ios-web-map-parity-2de228`):
`ProjectionType`/`Units` now `PDFString` not PDF names, `ScaleFactor` 0 → 1, and
`Datum: "WGE"` replaced by a spelled-out spherical datum with an `Ellipsoid`
sub-dictionary. Widened `geoPdfMetadata.ts` to accept both the new and the
already-in-the-wild old shape. Verified with GDAL 3.9: `gdalinfo` clean (no
ERROR/Warning, metres + lat/lon), and the frame's corner pixels round-trip
through `gdaltransform -t_srs EPSG:4326` onto the bounds to ~1e-11°.
`npm test` (1378 pass), `tsc -b`, `eslint` all green.

Next: open PR to `nightly`; nothing else outstanding.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/web-geopdf-lgidict-fix
on branch claude/web-geopdf-lgidict-fix. Check the PR to nightly is green and merge it.
```

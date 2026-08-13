# Phase 0 spikes — GeoTIFF tags and GeoPDF registration

Throwaway spike code for the iOS web-map parity port. **Not shipped.** The
written results are committed on the port branch as
`docs/spikes/ios-port-spike-1-geotiff-tags.md` and
`docs/spikes/ios-port-spike-4-geopdf-cgpdf.md`.

```bash
swift test                                     # 15 tag-reader tests
swift run geotiff-probe Fixtures/*.tif         # reader vs ImageIO, per file
swift run geopdf-probe ../../web/src/test/fixtures/geopdf   # CGPDF walk as JSON
```

`Fixtures/make-fixtures.sh` regenerates the GeoTIFF fixtures with GDAL 3.9.
`../../web/src/userMaps/parsers/spikeDumpGeoPdf.test.ts` dumps the shipping web
parser's output for the same GeoPDFs so the two can be diffed:

```bash
cd ../../web && SPIKE_DUMP_PATH=/tmp/web.json npx vitest run src/userMaps/parsers/spikeDumpGeoPdf.test.ts
```

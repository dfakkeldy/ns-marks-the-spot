# GeoPDF Frame-Selection Evidence Gate

## Result

No automatic USGS main-map selector is approved. The five files recorded on
2026-07-27 remain discovery evidence only. This run could not acquire the six
new untouched holdouts required to validate the three observed exact
signatures because the authoritative USGS host did not resolve from the
implementation environment and the disposable prior corpus no longer existed.

This is not a GeoPDF product blocker. A page with one valid registration can
still use that registration automatically. A page with multiple valid
registrations remains supported through the frame chooser, which applies the
chosen frame's embedded coordinates without asking for control points.

## Environment and method

- Probe date: 2026-07-28, America/Halifax
- Node.js: v22.23.1
- npm: 10.9.8
- GDAL: 3.9.0
- Evidence threshold: two distinct untouched passing holdouts per exact
  signature, zero false selections
- Spatial thresholds when holdouts become available: at most one canonical
  source pixel and at most five projected ground metres at five fixed sample
  points

The deterministic gate lives in `web/scripts/probeGeoPdfFrames.mjs`. It builds
GDAL registration commands with the exact `NEATLINE` label, keys a rule by
producer, registration family, page structure, and the full sorted label
multiset, and refuses a signature with fewer than two distinct holdout
file/product pairs or any false selection.

## Discovery signatures

| Producer and structure | Discovery files | New passing holdouts | Decision |
| --- | ---: | ---: | --- |
| `Esri ArcSOC 10.8.1.14362`, `/Measure`, three registered frames | 3 | 0 | rejected |
| `ESRI ArcSOC 10.0.2.3200`, `/LGIDict`, three registered frames | 1 | 0 | rejected |
| `ESRI ArcSOC 10.0.2.3200`, `/LGIDict`, four registered frames | 1 | 0 | rejected |

The complete discovery URLs, hashes, byte sizes, page dictionaries, candidate
rectangles, embedded coordinate values, and whole-document GDAL results remain
frozen in `2026-07-27-geopdf-external-corpus.json`. They are not recounted as
holdouts here.

Neither array order nor rectangle area is an acceptance signal. Both correlate
with the main map in the discovery set, but neither independently establishes
producer intent. The embedded label `Map Layers` is only a hypothesis until
each exact signature passes untouched files through the independent GDAL
oracle.

## Shipping boundary

The generated approved-rule set must remain empty from this receipt. All
multi-frame files, including ordinary USGS GeoPDFs, use the frame chooser.
Manual control points are reserved for missing, malformed, unreadable,
unsupported-CRS, or otherwise unsupported registration.

Browser and worker topology is a separate unresolved gate. This evidence result
does not claim browser rendering, responsiveness, worker isolation, CI, merge,
deployment, or production acceptance.

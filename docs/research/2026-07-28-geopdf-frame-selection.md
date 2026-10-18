# GeoPDF Frame-Selection Evidence Gate

## Result

No automatic USGS main-map selector is approved.

Twelve authoritative USGS PDFs with distinct SHA-256 hashes were retained
locally as untouched holdouts. They cover six distinct quadrangles and at least
two files in each observed legacy-three, legacy-four, and current-Measure
family. The frozen spatial oracle passes only the two Cape San Martin legacy
files. Every other spatially readable holdout exceeds at least one frozen
limit, and the two Alstead legacy files are rejected for unsupported CRS.

The proposed metadata key also cannot match: ArcSOC is stored in PDF `Creator`,
while the application and frozen signatures read PDF `Producer`, which is
null/undefined for all five discovery files and all twelve holdouts.

This result does not block the existing user flow. A sole valid registration
still places automatically. Every multi-registration file continues through
the explicit frame chooser and uses only the frame selected by the user.

## Frozen method

- Probe date and timezone: 2026-07-28, America/Glace_Bay
- Exact application source: `4c46ca276982ac9e4da593ee79b5a88503818511`
- Node.js: v22.23.1
- npm: 10.9.8
- GDAL: 3.9.0
- Required evidence: at least two distinct untouched passing holdouts per exact
  selector signature and zero false selections
- Frozen spatial gate: at most one canonical source pixel **and** at most five
  projected ground metres at all five sample points
- Samples: `(0.1, 0.1)`, `(0.9, 0.1)`, `(0.5, 0.5)`, `(0.1, 0.9)`,
  `(0.9, 0.9)`

The independent side of the oracle opened GDAL's named `Map Layers` neatline
and transformed it to WGS84:

```text
gdal_translate -of VRT -oo NEATLINE=Map Layers <pdf> <vrt>
gdaltransform -t_srs EPSG:4326 <vrt>
```

Application source pixels were scaled to the independent GDAL raster before
comparison. The producer/signature hypothesis and thresholds were frozen
before these outcomes were examined. No result was used to tune the rule.

## Holdout outcomes

| Family | Quadrangle / edition | Maximum source px | Maximum ground m | Result |
| --- | --- | ---: | ---: | --- |
| legacy four LGIDict | Bear Harbor 2012 | 0.927453 | 5.215381 | fail ground gate |
| legacy three LGIDict | Bear Harbor 2015 | 0.927453 | 5.215381 | fail ground gate |
| legacy four LGIDict | Cape San Martin 2012 | 0.865970 | 4.611864 | spatial pass only |
| legacy three LGIDict | Cape San Martin 2015 | 0.865970 | 4.611864 | spatial pass only |
| legacy four LGIDict | Alstead 2012 | — | — | unsupported CRS |
| legacy three LGIDict | Alstead 2015 | — | — | unsupported CRS |
| current Measure | Alstead 2024 | 1.613533 | 9.535159 | fail both gates |
| legacy four LGIDict | Alton 2012 | 0.981273 | 5.824024 | fail ground gate |
| legacy three LGIDict | Alton 2015 | 0.981273 | 5.824024 | fail ground gate |
| current Measure | Alton 2024 | 1.559349 | 9.255644 | fail both gates |
| current Measure | Berlin 2024 | 1.591572 | 9.605778 | fail both gates |
| current Measure | Bristol 2024 | 1.576224 | 9.371488 | fail both gates |

The machine-readable corpus records each exact filename, authoritative source
URL, publisher, retrieval date, byte size, hash, page count, family, metadata,
and outcome.

## Metadata finding

| PDF metadata field | Legacy files | Current files |
| --- | --- | --- |
| `Producer` / `pdf-lib getProducer()` | null/undefined | null/undefined |
| `Creator` / `pdf-lib getCreator()` | `ESRI ArcSOC 10.0.2.3200` | `Esri ArcSOC 10.8.1.14362` |

`extractGeoPdfMetadata` reads `document.getProducer()`. Silently changing the
key to `Creator` would define a different selector and would require a newly
frozen, independent validation set. No such selector is approved here.

## Provenance, rights, and storage

All twelve PDFs came from the authoritative USGS The National Map
staged-products HTTPS host. USGS-authored material is generally public domain,
but individual maps may include identified third-party copyrighted material;
the receipt therefore does not claim unrestricted rights for every map
element. The files remain in local ignored task storage and are not committed
or redistributed.

## Shipping boundary

The approved-rule set remains empty. Neither array order, rectangle area, nor
the `Map Layers` label is an acceptance signal. Multi-frame files continue to
require explicit human selection. Manual points remain reserved for missing,
malformed, unreadable, unsupported-CRS, or otherwise unsupported registration.

Browser acceptance is a separate gate and remains blocked. This holdout result
does not claim deployment or promotion.

# Planned wind turbines: source prep

`public/wind/planned-turbines.geojson` is built from the extracts in `raw/`:

- `raw/strait-and-everwind.geojson`: projects within about 45 km of Point Tupper
  and EverWind's four named farms (372 points, including 7 alternate or unclear
  sites).
- `raw/province.geojson`: other Nova Scotia projects with published coordinate
  tables (151 points).
- `raw/harbour-hills.geojson`: Harbour Hills, under EA review (107 points).

Each extract keeps every field read from the filings, including the published
coordinates (`coords_as_published`), the source document, table and page, and
fields the public file drops (distance from Point Tupper, published ground
elevations, layout notes).

`merge_planned.py` drops alternate and unclear sites, writes one plain status
line per project, keeps a fixed property set, validates positions, ids and
sources, and sorts by project and turbine. From `web/`:

```sh
python3 -I scripts/wind/merge_planned.py public/wind/planned-turbines.geojson \
  scripts/wind/raw/strait-and-everwind.geojson scripts/wind/raw/province.geojson scripts/wind/raw/harbour-hills.geojson
```

The output is byte-identical to the committed file. `conversion-check-*.txt`
record how each extract was converted from UTM or degrees-minutes-seconds and
the checks run (local working paths are shown as `<scratch>`). An independent
re-conversion of every UTM point agreed within about 1 m. What each source
supports is in [the receipt](../../../docs/planned-wind-turbines-sources.md).

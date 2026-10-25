# Wind turbines from EA filings: source prep

`public/wind/planned-turbines.geojson` and
`public/wind/installed-since-2018.geojson` are built from the extracts in
`raw/`:

- `raw/strait-and-everwind.geojson`: projects within about 45 km of Point Tupper
  and EverWind's four named farms (372 points, including 7 alternate or unclear
  sites).
- `raw/province.geojson`: other Nova Scotia projects with published coordinate
  tables (151 points, including 2 dropped Wedgeport sites).
- `raw/harbour-hills.geojson`: Harbour Hills, under EA review (107 points).
- `raw/built-since-2018.geojson`: Higgins Mountain, built since NRCan's
  inventory stops (17 points).

Each extract keeps every field read from the filings, including the published
coordinates (`coords_as_published`), the source document, table and page, and
fields the public files drop (distance from Point Tupper, published ground
elevations, layout notes). Positions checked against imagery also carry
`build_status` (`operating`, `under construction` or `site work`),
`site_check` (what the Sentinel-2 check found there) and `site_check_scene`.

`merge_planned.py` sends `operating` positions to the installed file and the
rest to the planned file, drops alternate, unclear and dropped sites, writes one
plain status line per project (or per build state), keeps a fixed property set,
validates positions, ids and sources, and sorts by project and turbine. From
`web/`:

```sh
python3 -I scripts/wind/merge_planned.py public/wind/planned-turbines.geojson public/wind/installed-since-2018.geojson \
  scripts/wind/raw/strait-and-everwind.geojson scripts/wind/raw/province.geojson scripts/wind/raw/harbour-hills.geojson \
  scripts/wind/raw/built-since-2018.geojson
```

The output is byte-identical to the committed files, and the merge reads
nothing but these extracts. `conversion-check-*.txt` record how each extract
was converted from UTM or degrees-minutes-seconds and the checks run (local
working paths are shown as `<scratch>`). An independent re-conversion of every
UTM point agreed within about 1 m. What each source supports is in
[the receipt](../../../docs/planned-wind-turbines-sources.md).

## Build status from Sentinel-2

`pad_check.py` looks for a cleared turbine pad at every tabulated position in
Sentinel-2 L2A imagery (10 m, read over HTTP from the Earth Search public
archive; needs GDAL's Python bindings):

```sh
python3 -I scripts/wind/pad_check.py 2026-07-01/2026-10-24 2022-06-01/2022-09-30 \
  scripts/wind/raw/*.geojson > scripts/wind/pad-check.txt
```

For each position it takes the latest scene in the first window that is clear
(scene classification) within 60 m, counts bare pixels (NDVI below 0.25)
within 30 m, compares a 2022 baseline, and reports the distance to the nearest
bare 30 m disk within 300 m; a fall in mean NDVI flags smaller earthworks,
forestry, or thin cloud the scene classification missed, so flags are checked
by eye. New scenes arrive every few days, so a rerun picks
newer scenes than the committed `pad-check.txt`, which names every scene it
used. The committed run also covers two approvals kept off the map (Ellershouse
3 and Clydesdale Ridge, 30 positions extracted for the check only), so a rerun
over `raw/` alone has 30 fewer rows. `site-review.txt` records what was checked by eye and how the results
were written into the extracts. The imagery decides build status only: no
position comes from it.

# Property Context Data Candidates

Research snapshot: 2026-07-19

## Product direction

Do not make every dataset another always-visible switch. For a selected PID,
show a compact **Property context** summary with source date and coverage, then
offer the corresponding map overlay for users who want to inspect the wider
area. A missing database record must be reported as “no record found,” never as
proof that the condition is absent.

Every result is screening information, not a survey, environmental assessment,
water test, engineering opinion, title opinion, or confirmation that land is
buildable.

## Recommended order

### 1. Karst and sinkholes

Ship two independently controlled, off-by-default layers:

- **Karst risk** — high, medium, and low regional susceptibility polygons.
- **Known karst occurrences** — recorded sinkholes, karst topography, and other
  observed features.

The Province's 2019 DP ME 494 product is openly licensed and has queryable
ArcGIS feature services. It was developed from soluble-bedrock geology, known
occurrences, lidar interpretation, and hydrogeology. The occurrence inventory
is evidence of recorded features, not a complete field inventory.

- [Official dataset and metadata](https://novascotia.ca/natr/meb/download/dp494.asp)
- [Official sinkhole guidance](https://novascotia.ca/natr/meb/hazard-assessment/sinkholes.asp)
- [Karst risk FeatureServer](https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/geol_hz_KarstRisk_z494nskp_sp25_FT_UT83/FeatureServer/0)
- [Known occurrences FeatureServer](https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/geol_hz_KarstRiskOccs_z494ns_FT_UT83/FeatureServer/0)

Validation spot check: representative civic points in Bucklaw resolve to the
published **High Risk** polygon. The occurrence layer also contains a Bucklaw
record (`z494ns-952`) classified as karst topography. That record should not be
assumed to be the same physical feature as a user's observation without an
exact coordinate.

### 2. Coastal hazards

For coastal parcels, summarize potential flooding for the current period, 2050,
and 2100, and link to the Province's free parcel-specific Coastal Hazard
Assessment Report. Keep erosion distinct from inundation: the public map helps
screen for both, but neither is a surveyed setback or a prediction of exactly
where a future shoreline will be.

- [Province Coastal Hazard Map and guidance](https://novascotia.ca/coastal-climate-change/)
- [Coastal Hazard Map](https://nsgi.novascotia.ca/chm)
- [Free Coastal Hazard Assessment Report](https://novascotia.ca/coastal-climate-change/request-coastal-hazard-assessment-report/)

The existing **Flood Risk Areas** layer is not province-wide current flood
mapping. Its source service describes federal Flood Damage Reduction Program
work from about 1976–1995 for Antigonish, Truro, Pictou, and
Bedford/Lower Sackville. Rename or explain it as legacy mapped coverage when a
new coastal layer is added.

- [Legacy Flood Damage Reduction MapServer](https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_FloodDamageReduction_UT83/MapServer)

### 3. Private-well and groundwater context

Bundle these in one **Well and groundwater** group rather than separate top-level
controls:

- relative arsenic risk in bedrock wells;
- relative uranium risk in bedrock wells;
- manganese risk in bedrock and surficial aquifers;
- radon potential;
- relative seawater-intrusion vulnerability for unserviced coastal areas; and
- nearby well logs, with their original construction dates and coordinate
  precision clearly shown.

Risk classes must always say that only testing the home's air or water can
determine actual conditions. Nearby well yield or chemistry is context, not a
prediction for a new well on the selected parcel.

- [Arsenic risk guidance and map](https://novascotia.ca/natr/meb/geoscience-online/ArsenicRiskWells_about.asp)
- [Uranium risk dataset](https://data.novascotia.ca/d/w8ax-dtd5)
- [Manganese risk report](https://novascotia.ca/natr/meb/data/ofr/ofr_me_2021-002.pdf)
- [Radon potential dataset](https://data.novascotia.ca/d/tk49-rtq2)
- [Seawater-intrusion vulnerability dataset](https://data.novascotia.ca/d/4azn-g8mi)
- [Nova Scotia Well Logs Database](https://data.novascotia.ca/d/eqej-ag64)
- [Groundwater chemistry maps](https://novascotia.ca/natr/meb/water-resources/groundwater-chemistry-atlas.asp)

### 4. Abandoned mines and historical workings

Show openings as points with the Province's degree-of-hazard classification and
offer an optional distance-to-nearest summary. Add tailings and coal workings
only as separate sublayers so an opening is not confused with the full extent
of underground workings or contaminated land.

The Province describes coordinates as approximate and the database as an
inventory of published openings. No nearby point is not proof that no historical
working exists.

- [Official Abandoned Mine Openings database](https://novascotia.ca/natr/meb/download/dp010.asp)
- [Degree-of-hazard FeatureServer](https://services.arcgis.com/TS1HHBYLM10d1SZH/arcgis/rest/services/Abandoned_Mine_Openings_Degree_of_Hazard_d010ns_ut83/FeatureServer/0)
- [Abandoned-mine safety program](https://novascotia.ca/natr/meb/hazard-assessment/abandoned-mines.asp)

### 5. Wet ground, drainage, and wetlands

Wet Areas Mapping is a useful terrain-screening overlay because it predicts
where water may naturally flow or accumulate from elevation and mapped water
features. It is not a measured water table, does not include all soil effects or
human drainage changes, and dates from 2005–2007 source work. Pair it with the
Province wetland inventory when a stable web service and display terms are
confirmed.

- [Wet Areas Mapping description and downloads](https://novascotia.ca/natr/forestry/gis/wamdownload.asp)
- [Wet Areas Mapping MapServer](https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_WetAreasMapping_WM84/MapServer)
- [Province wetland guidance](https://novascotia.ca/nse/wetland/)

### 6. Planning and conservation context

Protected areas, old-growth policy polygons, Crown harvest plans, forest cover,
and soil type can explain surrounding land use and terrain. They belong in an
optional **Land and ecology** group; they should not be presented as a complete
municipal zoning or development-permission answer.

- [Protected Areas System](https://data.novascotia.ca/d/ticv-5du5)
- [Old Growth Forest Policy Layer](https://data.novascotia.ca/d/wanf-acts)
- [Province forest maps and datasets](https://novascotia.ca/natr/forestry/maps-and-forest-info.asp)

## Lower-priority context

- **Road traffic and bridges/culverts:** useful for access context, noise, and
  nearby infrastructure, but not proof of legal access or structural condition.
- **Topographic utilities:** useful for orientation; mapped infrastructure must
  not be described as service availability, capacity, or a right to connect.
- **Acid rock drainage:** valuable where excavation or blasting is contemplated,
  but the current published risk product covers southwestern Nova Scotia rather
  than the entire province.
- **Lidar hillshade and contours:** excellent visual evidence for steep slopes,
  depressions, and drainage patterns, but derived terrain does not classify the
  cause or safety of a feature.

- [Provincial highway traffic volumes](https://data.novascotia.ca/d/8524-ec3n)
- [Public Works structures](https://data.novascotia.ca/d/gs26-c3fm)
- [Topographic utilities](https://data.novascotia.ca/d/yjmz-hpnc)
- [Acid rock drainage potential](https://data.novascotia.ca/d/vman-ze64)
- [Province elevation services](https://nsgiwa.novascotia.ca/arcgis/rest/services/ELEV)

## Suggested first implementation slice

1. Add a collapsed **Geology and hazards** layer group.
2. Add Karst Risk and Known Karst Occurrences, both off by default.
3. On parcel selection, query the risk polygon and occurrences within a labelled
   radius; show source year, result wording, and limitations in the parcel sheet.
4. Add Coastal Hazards next, then the grouped private-well risk summary.
5. Keep all hazard calls independent so one unavailable service does not hide
   the parcel, civic address, road, or water results.

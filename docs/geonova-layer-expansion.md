# GeoNova web-map expansion: source inventory

Source checks: **2026-09-07** for remaining MapServer, FeatureServer and radon
receipts; **2026-09-12** for OGL-NS open-data replacements
([`openLayerSources.json`](../web/src/data/openLayerSources.json)) and the EOX
Sentinel-2 2016 edition ([`sentinel2.ts`](../web/src/layers/sentinel2.ts)).
This inventory covers the 38 default-off, web-only controls in
[`contextLayerCatalog`](../web/src/layers/contextLayerCatalog.ts): 15 NSTDB
infrastructure/place overlays from identified OGL-NS datasets, the retained
restricted topographic MapServer background, 21 land, water, forest and geology
entries, and the default-off Sentinel-2 mosaic. It does not change the
native/offline catalogue. The descriptors carry source dates, coverage, scale,
licence links, legends and screening caveats; the check date is not a claim
that every feature was observed that day.

## Licence key

- **R — acknowledged provincial service.** The app retains the existing
  [restricted map-service agreement](https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf)
  gate for the complete provincial topographic cartography, NovaROC water,
  municipal wellhead, aggregate and coal sources without an explicit open
  grant. Public REST access is not an open licence, and an open download
  licence is not silently applied to another delivery service. The required
  Province attribution remains visible.
- **O — [Open Government Licence – Nova Scotia](https://novascotia.ca/opendata/licence.asp).**
  Dataset-specific licence metadata was checked for the 15 NSTDB
  infrastructure/place replacements (`openLayerSources.json`, 12 September
  2026; live queries use the
  [open-data portal licence](https://support.novascotia.ca/services/open-data-portal-licence)),
  plus protected areas, forest inventory, Crown harvest plans, bedrock,
  surficial geology, karst, seawater vulnerability and radon. These entries
  carry the OGL attribution. Known karst occurrences retain their DP494
  product provenance.
- **F — [forestry digital-data terms](https://novascotia.ca/natr/forestry/gis/licence.asp).**
  WAM and forest treatments retain acknowledgement and Natural Resources
  attribution; they are not relabelled as OGL datasets.
- **U — [Unrestricted Map Services licence](https://nsgiwa.novascotia.ca/documents/licenses/unrestricted/unrestrictedLicense.pdf).**
  Lidar hillshade carries that licence's three required notices, distinct from
  OGL, while retaining the app's acknowledgement gate. The descriptor's gate
  flag does not change the licence named by its link.
- **C — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** Sentinel-2
  uses EOX's 2016 cloudless mosaic (`s2cloudless_3857`). Newer EOX editions
  have additional restrictions and must not be substituted by changing the
  year.

These distinctions do not grant new redistribution or deployment clearance.
Source verification, repository licensing and publication approval remain
separate.

## Inventory

Open-data “Filtered” means exact `feat_desc IN (...)` classes, recorded in
[`infrastructureLayers.ts`](../web/src/layers/infrastructureLayers.ts) and
bound to datasets in
[`openDataSources.ts`](../web/src/layers/openDataSources.ts). Those original
MapServer layer IDs remain the class-selection reference; live rendering uses
the open GeoJSON endpoints, not the image services. Other source IDs, classes
and colours are recorded in
[`landContextLayers.ts`](../web/src/layers/landContextLayers.ts). A numeric
selection on a remaining MapServer row is the publisher's layer ID.

### Background Maps

| Layer (control ID) | Official source and delivery | Selection | Terms |
| --- | --- | --- | --- |
| Sentinel-2 satellite · 2016–2017 (`sentinel-2`) | [EOX Cloudless](https://cloudless.eox.at/pricing) · [WMTS](https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml) · tiles `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg` | `s2cloudless_3857` through native zoom 14 | C |
| Nova Scotia topographic map (`ns-topographic`) | [Source](https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_NSTDB_10k_Colour_UT83/MapServer) | Publisher basemap | R |

### Land & Property

| Layer (control ID) | Official source and delivery | Selection | Terms |
| --- | --- | --- | --- |
| Protected and conservation areas (`protected-conservation-areas`) | [Source](https://data.novascotia.ca/d/ticv-5du5) · [Service](https://nsgiwa.novascotia.ca/arcgis/rest/services/ENV/ENV_NS_Prot_Area_Sys_UT83/MapServer) | 0 | O |

### Roads & Places

| Layer (control ID) | Official source and delivery | Selection | Terms |
| --- | --- | --- | --- |
| Electrical transmission lines (`transmission-lines`) | [NSTDB Utilities (Line)](https://data.novascotia.ca/d/yjmz-hpnc) | Filtered `TRANSMISSION LINE (electrical) line` | O |
| Electrical substations (`substations`) | [NSTDB Utilities (Poly)](https://data.novascotia.ca/d/4ujs-gpyq) · [NSTDB Utilities (Point)](https://data.novascotia.ca/d/eiwy-kfrj) | Filtered `SUBSTATION (transformer) polygon`, `SUBSTATION (transformer) point` | O |
| Cross-country pipelines (`pipelines`) | [NSTDB Utilities (Line)](https://data.novascotia.ca/d/yjmz-hpnc) | Filtered `PIPELINE (cross country) line`, `PIPELINE (cross country) overhead line`, `PIPELINE (cross country) underground line` | O |
| Mapped tanks (`tanks`) | [NSTDB Utilities (Poly)](https://data.novascotia.ca/d/4ujs-gpyq) · [NSTDB Utilities (Point)](https://data.novascotia.ca/d/eiwy-kfrj) | Filtered `TANK (over 15m diameter) polygon`, `TANK (6-15m diameter) point`, `TANK indefinite/approximate point` | O |
| Mapped towers (`towers`) | [NSTDB Utilities (Point)](https://data.novascotia.ca/d/eiwy-kfrj) | Filtered `TOWER (all except transmission line towers) point`, `TOWER (all except transmission line towers) indefinite/approximate point` | O |
| Mapped gates (`mapped-gates`) | [NSTDB Structures (Line)](https://data.novascotia.ca/d/kfmd-m3ru) · [NSTDB Structures (Point)](https://data.novascotia.ca/d/p4z4-pvgm) | Filtered `GATE (non-NSRN gates along fences or other linear features) line`, `GATE (non-NSRN gates) point`, `GATE indefinite/approximate point` | O |
| Mapped campgrounds (`campgrounds`) | [NSTDB Designated Areas](https://data.novascotia.ca/d/ty4r-gcnk) | Filtered `CAMPGROUND polygon` | O |
| Mapped cemeteries (`cemeteries`) | [NSTDB Designated Areas](https://data.novascotia.ca/d/ty4r-gcnk) | Filtered `CEMETERY polygon` | O |
| Scenic lookouts and rest areas (`lookouts-rest-areas`) | [NSTDB Designated Areas](https://data.novascotia.ca/d/ty4r-gcnk) | Filtered paved/unpaved `SCENIC LOOKOUT` and `REST AREA` highway polygons | O |
| Mapped shooting ranges (`shooting-ranges`) | [NSTDB Designated Areas](https://data.novascotia.ca/d/ty4r-gcnk) | Filtered `SHOOTING RANGE polygon` | O |

### Water & Terrain

| Layer (control ID) | Official source and delivery | Selection | Terms |
| --- | --- | --- | --- |
| Wharves and coastal structures (`wharves-coastal-structures`) | [NSTDB Water (Poly)](https://data.novascotia.ca/d/h8jb-hzrm) · [NSTDB Water (Line)](https://data.novascotia.ca/d/fpca-jrmt) | Filtered Breakwater/Dry Dock/Slipway/Wharf polygons including ruin and under-construction classes; Breakwater line and Wharf - Single Line | O |
| WAM relative wetness (`wam-relative-wetness`) | [Source](https://novascotia.ca/natr/forestry/gis/wamdownload.asp) · [Service](https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_WetAreasMapping_UT83/MapServer) | 1 | F |
| WAM predicted flow (`wam-predicted-flow`) | [Source](https://novascotia.ca/natr/forestry/gis/wamdownload.asp) · [Service](https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_WetAreasMapping_UT83/MapServer) | 0 | F |
| Lidar hillshade (`lidar-hillshade`) | [Source](https://nsgi.novascotia.ca/datalocator/elevation/) · [Service](https://nsgiwa.novascotia.ca/arcgis/rest/services/ELEV/ELEV_LIDAR_Projects_Hillshade_UT83/MapServer) | 0,1,2,3,4,5 | U |
| Designated water supply areas (`designated-water-supply-areas`) | [Source](https://novaroc.novascotia.ca/) · [Service](https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer) | 38 | R |
| Municipal surface water supply areas (`municipal-surface-water-supply-areas`) | [Source](https://novaroc.novascotia.ca/) · [Service](https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer) | 39 | R |
| Source-water and well-field protection (`source-water-well-field-protection`) | [Source](https://novaroc.novascotia.ca/) · [Service](https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer) | 47 | R |
| Municipal water supply wellheads (`municipal-water-wellheads`) | [Source](https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_MunicipalWaterSupplyWellheads_UT83/MapServer/0) · [Service](https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_MunicipalWaterSupplyWellheads_UT83/MapServer) | 0 | R |

### Environment & Hazards

| Layer (control ID) | Official source and delivery | Selection | Terms |
| --- | --- | --- | --- |
| Sewage settling ponds (`sewage-settling-ponds`) | [NSTDB Utilities (Poly)](https://data.novascotia.ca/d/4ujs-gpyq) · [NSTDB Utilities (Point)](https://data.novascotia.ca/d/eiwy-kfrj) | Filtered `SEWAGE SETTLING POND  (over 15m diameter) polygon` and `SEWAGE SETTLING POND  (6-15m diameter) point` (source values keep the double spaces) | O |
| Sewage treatment plants (`sewage-treatment-plants`) | [NSTDB Designated Areas](https://data.novascotia.ca/d/ty4r-gcnk) | Filtered `SEWAGE TREATMENT PLANT polygon` | O |
| Dumps, sanitary landfills and salvage yards (`waste-salvage-sites`) | [NSTDB Designated Areas](https://data.novascotia.ca/d/ty4r-gcnk) | Filtered `DUMP / SANITARY LANDFILL polygon`, `AUTO SALVAGE YARD polygon` | O |
| Karst risk (`karst-risk`) | [Source](https://data.novascotia.ca/d/wyyw-is9b) · [Service](https://services.arcgis.com/TS1HHBYLM10d1SZH/ArcGIS/rest/services/geol_hz_KarstRisk_z494nskp_sp25_FT_UT83/FeatureServer/0) | FeatureServer query | O |
| Known karst occurrences (`karst-occurrences`) | [Source](https://novascotia.ca/natr/meb/download/dp494.asp) · [Service](https://services.arcgis.com/TS1HHBYLM10d1SZH/ArcGIS/rest/services/geol_hz_KarstRiskOccs_z494ns_FT_UT83/FeatureServer/0) | FeatureServer query | O |
| Seawater intrusion vulnerability (`seawater-intrusion-vulnerability`) | [Source](https://data.novascotia.ca/d/4azn-g8mi) · [Service](https://services.arcgis.com/TS1HHBYLM10d1SZH/ArcGIS/rest/services/hg_seawater_intrusion_vulnerability_h483ns_UT83/FeatureServer/0) | FeatureServer query | O |
| Radon potential (`radon-potential`) | [Source](https://data.novascotia.ca/d/tk49-rtq2) · [local image](../web/public/data/radon-potential.png) | Source-derived raster | O |

### Forestry & Ecology

| Layer (control ID) | Official source and delivery | Selection | Terms |
| --- | --- | --- | --- |
| Leading forest species (`forest-leading-species`) | [Source](https://data.novascotia.ca/d/c8ai-fjbt) · [Service](https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_ProvLandscapeViewer_UT83/MapServer) | 5 | O |
| Forest stand height (`forest-height`) | [Source](https://data.novascotia.ca/d/c8ai-fjbt) · [Service](https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_ProvLandscapeViewer_UT83/MapServer) | 7 | O |
| Recorded forest treatments (`forest-treatments`) | [Source](https://nsgi.novascotia.ca/plv/help/help.htm) · [Service](https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_ProvLandscapeViewer_UT83/MapServer) | 2,3 | F |
| Crown harvest plans (`crown-harvest-plans`) | [Source](https://data.novascotia.ca/d/ag3d-ztdm) · [Service](https://nsgiwa.novascotia.ca/arcgis/rest/services/PLAN/PLAN_CrownHarvestPlans_UT83/MapServer) | 0 | O |

### Geology & Resources

| Layer (control ID) | Official source and delivery | Selection | Terms |
| --- | --- | --- | --- |
| Pits, quarries and surface workings (`pits-quarries-surface-workings`) | [NSTDB Designated Areas](https://data.novascotia.ca/d/ty4r-gcnk) | Filtered pit, quarry, mine/open-pit (including ruin/inactive/abandoned), peat cutting and mine disposal-pile polygons | O |
| Bedrock geology (`bedrock-geology`) | [Source](https://data.novascotia.ca/d/4i5u-vdmd) · [Service](https://fletcher.novascotia.ca/arcgis/rest/services/geoscience/bedrockgeologyprovscale_new/MapServer) | 11 | O |
| Surficial geology (`surficial-geology`) | [Source](https://data.novascotia.ca/d/iphz-pgr7) · [Service](https://fletcher.novascotia.ca/arcgis/rest/services/surficial/Surficial_Geology_Units/MapServer) | 16 | O |
| Mapped aggregate deposits (`aggregate-deposits`) | [Source](https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/all_aggregate/MapServer) | 10,11,12 | R |
| Recorded aggregate pits and quarries (`aggregate-pits-quarries`) | [Source](https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/all_aggregate/MapServer) | 2,3,4,6,7,8 | R |

### Historical Maps

| Layer (control ID) | Official source and delivery | Selection | Terms |
| --- | --- | --- | --- |
| Historical coal workings (`historical-coal-workings`) | [Source](https://novascotia.ca/natr/meb/hazard-assessment/historic-coal-mine-workings.asp) · [Service](https://services.arcgis.com/TS1HHBYLM10d1SZH/ArcGIS/rest/services/Coal_Workings_n120ns_ut83/FeatureServer/0) | FeatureServer query | R |

## Source distinctions and verification

The 15 NSTDB infrastructure/place controls query identified OGL-NS GeoJSON
endpoints for the current viewport (`services/openDataOverlay.ts`). Constituent
dataset IDs, licence metadata and schemas are recorded in
`openLayerSources.json` (checked 12 September 2026). Display geometry may be
simplified within half a pixel, capped at 10 metres; this path does not supply
parcel intersection, proximity, access or title evidence. Requests fail closed
on missing geometry, repeated rows, failed constituents or size limits.

The remaining 17 MapServer image entries (topographic cartography plus 16
land/environment services) keep ArcGIS export. Sparse or scale-dependent
overlays were checked around real source features rather than accepting a blank
province-wide view. Additional topographic and coastal-structure exports
remained nonblank at zooms 19 and 20; the NSTDB topographic display
conservatively magnifies zoom-19 imagery at closer zooms. Magnification adds no
survey accuracy. Sentinel-2 WMTS tiles use `{z}/{y}/{x}` order through native
zoom 14; closer zoom enlarges pixels. The live capabilities identify
`s2cloudless_3857` as the CC BY 2016 edition.

NSTDB observation age varies by sheet. Its live
[capture index](https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/BASE_Index_NSTDB_10k_WM84/MapServer)
identifies aerial-photo years. Utility points and polygons remain separate
source representations; approximate positions are retained. Sewage-pond source
values contain significant double spaces, preserved in the filters. Waste and
salvage exclude `LANDFILL SITE (land reclamation)`. Surface workings retain
inactive/abandoned pits, quarries and open-pit mines, plus peat cutting and mine
disposal piles. Coastal structures use Water polygon/line classes only,
excluding duplicate Structures wharves/slipways and preserving inactive/construction classes.
Mapped gates, campgrounds and other places establish neither current status nor
access permission.

The four FeatureServers returned actual geometry and requested fields using
`f=geojson`: karst risk and seawater vulnerability are multipolygons, karst
occurrences are points, and historical coal workings are polygons. Queries use
only the viewport, page by `OBJECTID`, cancel stale requests and stop at a
bounded safety limit. The two karst services advertise 1,000-record pages;
seawater and coal advertise 2,000. Successful empty, source error and below-zoom
states remain distinct. Unknown seawater classes are **Not Evaluated**, never
Low; other unexpected classes retain neutral styling. These thematic geometries
are excluded from snapping and editing user material.

Forest treatment layers 2/3 retain the publisher's overview/detail scale switch.
Crown harvest uses layer 0 and excludes archived layer 1. Aggregate deposits and
recorded pit/quarry points remain separate from NSTDB surface workings and from
mineral tenure. None establishes reserves, ownership, current activity or access.

## Radon reproduction

The Fletcher radon cache failed usable image export and geometry queries, so
its failure is not represented as an empty potential map. The separate online
community-sampling product is not substituted. The radon layer instead uses the
OGL [DP486 product](https://novascotia.ca/natr/meb/download/dp486.asp) and its
[official source archive](https://novascotia.ca/natr/meb/data/exe/dp486v1sh.ZIP).
The self-extracting file inside the ZIP was read as an archive, never executed.

[`generateRadonPotential.py`](../web/scripts/generateRadonPotential.py) pins the
archive hash, derives the exact raster-score-to-class mapping from the source
polygons, and reprojects categorical cells to EPSG:3857 with nearest-neighbour
sampling. The original 250 m raster becomes a 2281 × 1716 display image at
350 projected metres per pixel. High, Medium and Low retain publisher colours;
original **Water Feature/No Data** is grey and outside coverage is transparent.
A regional potential class cannot determine indoor conditions; only testing can.

The durable [source receipt](../web/public/data/radon-potential.source.json)
records source and output hashes, bounds, transforms, class mapping, licence
metadata and limitations. Regeneration reproduced the image and receipt;
13,534 independently inverse-transformed output pixel centres had zero class
mismatches. The [display image](../web/public/data/radon-potential.png) is derived
material, not a newly surveyed or finer-resolution hazard dataset.

## Print and publication boundary

All 38 controls are supported by the browser **Print / Save PDF** map, subject
to the captured selection, acknowledgement, fitted zoom and source readiness.
The separate **Export map (PDF)** compositor supports the **33 MapServer,
open-data and tile entries**. Its **four feature-query entries and the one
static radon image are omitted and named as not included**; it does not
silently claim to reproduce those five layers. Attribution follows the material
included in each output.

These checks establish source delivery and the local catalogue's evidence
contract. They are not hosted CI, merge or production acceptance. NS Marks source
changes do not update the separately pinned KinNoKi publication; deployment
requires its own artifact parity, public source receipt and rendered checks.

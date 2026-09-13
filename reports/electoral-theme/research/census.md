# Statistics Canada 2021 Census for a Nova Scotia map theme — verified research

Research date: 2026-09-12. Everything below was fetched live with curl (browser UA) and python3 stdlib
(+ GDAL `ogrinfo`/`ogr2ogr` from /opt/local/bin for the one shapefile). Items marked **UNVERIFIED** were
not exercised. No values were invented; nulls in the data files mean "not published", never zero.

Deliverables (all under the session scratchpad):

| File | Size | Content |
|---|---|---|
| `scratchpad/geo/census_da_annapolis.geojson` | 179 KB | 88 DA polygons intersecting bbox -65.75,44.55,-64.95,45.05 (WGS84, server-simplified), props DAUID, DGUID, landarea (km²), PRUID |
| `scratchpad/geo/census_da_values.json` | 111 KB | `_meta` + DAUID → Census Profile values for those 88 DAs (nulls + per-characteristic flags) |
| `scratchpad/geo/census_csd_ns.geojson` | 1.16 MB | all 95 NS census subdivisions (WGS84, simplified) with CSDUID, DGUID, name, CSDTYPE, landarea, pop_2021, pop_2016, pop_change_pct, dwellings_total, dwellings_usual, pop_density_per_km2, flags |
| `scratchpad/research/census.md` | this file |  |

Intermediate downloads (2021 boundary GeoJSON pulls, SDMX CSVs, the 190 MB Atlantic profile zip, the
Elections Canada shapefile) were kept in a temporary `scratchpad/work/` directory during research and
deleted afterwards so that only the two permitted directories carry files.

---

## 1. Boundary geometries

### 1.1 StatCan ArcGIS REST service (recommended for live use)

Root: `https://geo.statcan.gc.ca/geo_wa/rest/services?f=json` → ArcGIS Server **11.5**, folders
`2019, 2020, 2021, 2022, 2023, 2024, 2025, NRN-RRN, Utilities`.

`https://geo.statcan.gc.ca/geo_wa/rest/services/2021?f=json` lists 10 MapServers:
`2021/Cartographic_boundary_files`, `2021/Digital_boundary_files`, `2021/Road_Network_File`,
`2021/Population_ecumene_boundary_files`, `2021/Agricultural_ecumene_boundary_files` and their French twins.
(The `2023`, `2024`, `2025` folders only contain CSD (`lcsd000a2Xs_e`), road-network and dissolved-CSD
services — **no 2023-Representation-Order FED layer exists on this server**.)

Service metadata (`.../2021/Cartographic_boundary_files/MapServer?f=json`):

* `serviceDescription`: "2021 Cartographic boundary files (CBF) … Date: 2022-09-21 (Publication) …
  **Use Limitation: Open Government Licence - Canada (http://open.canada.ca/en/open-government-licence-canada)**
  … Reference System Information: ESPG:3347 NAD83 / Statistics Canada Lambert … Distribution format: ESRI REST 10.8.1; WMS 1.3.0".
* `copyrightText`: "Government of Canada; Statistics Canada; Statistical Geomatics Centre".
* `spatialReference`: wkid **3347**; `maxRecordCount` **6000**; `supportedQueryFormats` **JSON, geoJSON, PBF**;
  `capabilities` Map,Query,Data; every layer reports `advancedQueryCapabilities.supportsPagination: true`.
* Layer ids are identical in `Cartographic_boundary_files` (CBF, file code `…b21…`) and
  `Digital_boundary_files` (DBF, `…a21…`):

| id | layer | key fields (all esriFieldTypeString unless noted) | minScale |
|---|---|---|---|
| 0 | PR - lpr_000b21s_e | | 103,358,192 |
| 3 | FED - lfed000b21s_e (**2013 Representation Order**) | FEDUID, DGUID, FEDNAME, FEDENAME, FEDFNAME, LANDAREA (double), PRUID | 103,358,192 |
| 4 | CD - lcd_000b21s_e | | |
| 6 | CMA - lcma000b21s_e | CMAUID, CMANAME, CMATYPE, CMAPUID | |
| 9 | CSD - lcsd000b21s_e | CSDUID, DGUID, CSDNAME, CSDTYPE, LANDAREA (double), PRUID | 103,358,192 |
| 10 | ADA - lada000b21s_e | ADAUID, DGUID, LANDAREA, PRUID | 103,358,192 |
| 11 | CT - lct_000b21s_e | CTUID, DGUID, CTNAME, LANDAREA, PRUID | 103,358,192 |
| 12 | DA - lda_000b21s_e | DAUID, DGUID, LANDAREA, PRUID | **1,614,972** |
| 13 | DB - ldb_000b21s_e | | 807,486 |
| 14 | FSA - lfsa000b21s_e | | |

(also 1 CAR, 2 ER, 5 CCS, 7 PC, 8 DPL). `minScale` only affects the `export` map image; `query` works at any scale.

**Verified query** (DA layer, small bbox around Annapolis Royal/Bridgetown, GeoJSON in WGS84):

```
https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/12/query
  ?geometry=-65.6,44.65,-65.2,44.85&geometryType=esriGeometryEnvelope&inSR=4326
  &spatialRel=esriSpatialRelIntersects&outFields=DAUID,DGUID,LANDAREA,PRUID
  &returnGeometry=true&outSR=4326&f=geojson
```
→ HTTP 200, `FeatureCollection` with **23 features**, 1,086,856 bytes unsimplified, 0.72 s. First feature:
`{"DAUID":"12050060","DGUID":"2021S051212050060","LANDAREA":59.5657,"PRUID":"12"}`, Polygon, first vertex
`[-65.07924, 44.86099]`. Adding `maxAllowableOffset=0.0002&geometryPrecision=5` (degrees, since outSR=4326)
cut the wider 0.8°×0.5° pull (88 DAs) to 177 KB in 0.59 s.

NS counts via `where=PRUID='12'&returnCountOnly=true`: **CSD 95, DA 1,670, CT 108, ADA 152, FED(2013 RO) 11**.

CT caveat: all 108 NS census tracts have CTUID prefix `205` (Halifax CMA). `CTUID LIKE '225%'` (Cape Breton CA) returns
**0** — the 2021 CBF has **no census tracts for Cape Breton**. NS CMA/CA list from layer 6: 205 Halifax (CMATYPE B = CMA),
210 Kentville, 215 Truro, 220 New Glasgow, 225 Cape Breton (CMATYPE D = CA).

CORS: the service answers `Access-Control-Allow-Origin: <request Origin>` + `Access-Control-Allow-Credentials: true`
(tested with `Origin: https://example.com`), so a Leaflet app can query it directly from the browser.

WMS also exists: `https://geo.statcan.gc.ca/geo_wa/services/2021/Cartographic_boundary_files/MapServer/WMSServer?request=GetCapabilities&service=WMS`
(200, 36 KB; layer names like `DA_-_lda_000b21s_e2811`, `CSD_-_lcsd000b21s_e45084`).

### 1.2 StatCan downloadable boundary files (2021)

Index: `https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm?year=21`
(`?year=23` serves the same 2021 form). It is a POST form (`type=b` CBF / `a` DBF; `bound=da_|csd|ct_|ada|fed|…`;
`format=a` shapefile / `g` GML / `f` file-GDB / `r` REST / `w` WMS). The POST redirects to an interstitial
`alternative_alternatif.cfm` page whose only text is the file name and size (no licence text), then to the zip:

| File (English, shapefile) | URL | Bytes | Last-Modified |
|---|---|---|---|
| DA, CBF | https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lda_000b21a_e.zip | 197,042,003 | 2022-01-05 |
| DA, DBF | …/files-fichiers/lda_000a21a_e.zip | 97,683,595 | 2021-10-21 |
| CSD, CBF | …/files-fichiers/lcsd000b21a_e.zip | 155,981,521 | 2022-01-05 |
| CSD, DBF | …/files-fichiers/lcsd000a21a_e.zip | 40,389,252 | 2021-10-21 |
| CT, CBF | …/files-fichiers/lct_000b21a_e.zip | 13,403,271 | 2022-01-05 |
| ADA, CBF | …/files-fichiers/lada000b21a_e.zip | 154,789,922 | 2022-01-05 |
| FED 2013 RO, CBF | …/files-fichiers/lfed000b21a_e.zip | 139,449,505 | 2022-01-05 |
| FED 2013 RO, DBF | …/files-fichiers/lfed000a21a_e.zip | (10,656 KB per interstitial page) | |

All are national files (HEAD verified, HTTP 200). File-name convention observed: `l<geo>000<a=DBF|b=CBF>21<a=shp>_e`.
GML (`…21g_e`) and file-GDB (`…21f_e`) variants: **UNVERIFIED** (not requested). `lfed000a23a_e.zip`,
`lfed000b23a_e.zip`, `lfed000a23s_e.zip` all 302-redirect to a not-found page: **StatCan does not publish a
2023-RO FED boundary file on the 2021 boundary page**; the form's only FED option is "Federal electoral districts
(2013 Representation Order)".

Licence for these downloads: the Statistics Canada Open Licence (section 5). The REST service metadata instead cites
Open Government Licence – Canada; both are attribution licences, and the StatCan licence's acknowledgment wording is the
stricter one to print.

### 1.3 Federal electoral districts, 2023 Representation Order

Source: **Elections Canada**, via open.canada.ca dataset `18bf3ea7-1940-46ec-af52-9ba3f77ed708`
("Federal Electoral Districts - Canada 2023", org `elections`, `license_id: ca-ogl-lgo` = Open Government Licence – Canada):
`https://open.canada.ca/data/api/action/package_search?q=%222023+Representation+Order%22`.

Directory listing `https://ftp.maps.canada.ca/pub/elections_elections/Electoral-districts_Circonscription-electorale/federal_electoral_districts_boundaries_2023/`
offers `FED_CA_2023_EN-SHP.zip` (**9,388,965 bytes**, Last-Modified 2024-12-17), `FED_CA_2023_EN-GDB.zip`, `FED_CA_2023_EN-KMZ.zip`,
French `CF_CA_2023_FR-*.zip`, and `Data Dictionary.pdf`. Downloaded and opened the shapefile:
`FED_CA_2023_EN` — **343 features**, Polygon, NAD83 Lambert Conformal Conic (lat0 63.390675, lon0 -91.8667, SP 49/77,
FE 6,200,000, FN 3,000,000 — the Statistics Canada Lambert parameters of EPSG:3347, but written as an unnamed PCS),
fields `FED_NUM` (Integer), `ED_NAMEE`, `ED_NAMEF` (String 100), `REP_ORDER` (String 4), `SHAPE_AREA`, `SHAPE_LEN`.
Nova Scotia rows (REP_ORDER "2023"):

12001 Acadie—Annapolis · 12002 Cape Breton—Canso—Antigonish · 12003 Central Nova · 12004 Cumberland—Colchester ·
12005 Dartmouth—Cole Harbour · 12006 Halifax · 12007 Halifax West · 12008 Kings—Hants · 12009 Sackville—Bedford—Preston ·
12010 South Shore—St. Margarets · 12011 Sydney—Glace Bay.

The 2013-RO names from the StatCan layer are different (Cape Breton--Canso, Central Nova, Cumberland--Colchester,
Dartmouth--Cole Harbour, Halifax, Halifax West, Kings--Hants, Sackville--Preston--Chezzetcook, South Shore--St. Margarets,
Sydney--Victoria, West Nova; DGUIDs `2013A000412001`…`12011`). ftp.maps.canada.ca sends no CORS headers → pre-convert, do not
fetch from the browser. The 2023 FED census profile DGUID pattern is `2023A0004` + FED_NUM (see 2.4).

### 1.4 Nova Scotia sources (checked, nothing usable for 2021)

* data.novascotia.ca — Socrata discovery search `https://api.us.socrata.com/api/catalog/v1?domains=data.novascotia.ca&q=census&limit=100`
  → 155 hits. Every "Census …" dataset is tagged **[ARCHIVED] Community Counts** (updated 2020-01-06, e.g. `s6f2-3jrq`
  "Census Population Density": columns `_1991 … _2011`, county/community geography; `jyag-bngr` Census Language, `qtxk-xxni`
  Housing Dwelling Characteristics, `iy5d-qtce` Aboriginal Identity, etc.). `4qqi-i6zp` "Community Clusters Census Population"
  covers 2011/2016 health-zone clusters only. Also `p3ve-n8ge` / `agxn-dwx7` Self-contained Labour Areas boundary files (2021/2016)
  and `jk9s-dhfu` Functional Economic Regions (2021). All under Nova Scotia Open Government Licence. **No 2021 DA/CSD/CT product.**
* GeoNOVA `https://nsgiwa.novascotia.ca/arcgis/rest/services/SOC?f=json` and `…/ECON?f=json` → `{"folders":[],"services":[]}` (empty).
  `…/BND?f=json` → 10 MapServers (`BND_DistributionOfSeats_UT83`, `BND_Electoral_District_Profiles_UT83`, `BND_ElectoralBoundaries_UT83`,
  `BND_GeneralElectionResults_UT83`, `BND_Housing_Authority_Boundaries_UT83`, `BND_Municipal_Village_Boundaries_UT83`,
  `BND_NS_Community_Bndys_UT83`, `BND_NS_Community_Bndys_WM84`, `BND_OpportunitiesSocialDevelopment_Admin_Bndys_UT83`,
  `BND_SelfcontainedLabourAreas_2021_UT83`). Only the last is census-derived (SLAs built from census commuting flows;
  copyright "Office of Priorities and Planning"). None serves DA/CSD/CT/ADA boundaries or profile values.

---

## 2. Census Profile 2021 — Web Data Service (SDMX REST)

User guide: `https://www12.statcan.gc.ca/wds-sdw/2021profile-profil2021-eng.cfm` (200; "Release date: February 9, 2022,
Updated on: November 15, 2023"). Index of census web data services: `https://www12.statcan.gc.ca/wds-sdw/index-eng.cfm`.
(`cpr2021-eng.cfm` and `cr2021geo-eng.cfm` are 404.)

Entry point: `https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/`

### 2.1 Structure

`…/dataflow/all?detail=allstubs` → dataflows `DF_ADA, DF_CD, DF_CMACA, DF_CSD, DF_CT, DF_DA, DF_DCSD, DF_DPL, DF_ER, DF_FED,
DF_FSA, DF_HR, DF_POPCNTR, DF_PR` (+ `DF_RURAL_12100138*`). Current versions seen in data: `DF_DA(1.3)`, `DF_CSD(1.3)`,
`DF_FED(1.3)` = 2013 RO and `DF_FED(2.0)` = 2023 RO.

`…/dataflow/STC_CP/DF_DA?references=all&detail=full` (44.6 MB XML) → DSD `DSD_DA`:

* key dimensions, in order: `FREQ` (CL_FREQ; census = **A5**) · `REF_AREA` (CL_GEO_DA = **DGUID**, 57,936 DAs nationally,
  1,670 with prefix `2021S051212`) · `GENDER` (1 Total, 2 Men+, 3 Women+) · `CHARACTERISTIC` (CL_CHARACTERISTIC, **2,631 codes**)
  · `STATISTIC` (**1 Counts, 4 Rates**). `TIME_PERIOD` = 2021.
* attributes returned per observation: `DECIMALS, FLAG, TOPIC, NOTE, RELEASE_DATE, GEO_LEVEL, ALT_GEO_CODE, GEO_DESC, PROV_TERR,
  DATA_QUALITY_FLAG, TNR_LF, TNR_SF, CI_LOW, CI_HIGH`.
* `CL_FLAG`: 1 `..` not available for a specific reference period · 2 `...` not applicable · 3 `E` use with caution ·
  4 `F` too unreliable to be published · 5 `r` revised · 6 **`x` suppressed to meet the confidentiality requirements of the Statistics Act** · 7 `rE` · O missing.
* `CL_GEO_LEVEL`: 4 CSD, 10 CD, 11 FED (2013 RO), 12 CT, 13 DA, 21 ADA … (51 observed for FED 2023 RO).
* `CL_TOPIC`: 1 Population and dwelling counts, 2 Age, 5 Families/households, 7 Income, 8 Language, 9 Indigenous peoples, 10 Housing, 17 Commuting …

DGUID patterns: DA `2021S0512` + DAUID (e.g. `2021S051212050060`); CSD `2021A0005` + CSDUID (`2021A00051205008`);
CT `2021S0507` + CTUID (`2021S05072050001.00`); FED 2013 RO `2013A0004` + FEDUID; FED 2023 RO `2023A0004` + FED_NUM;
province `2021A000212`; Canada `2021A000011124`. The boundary layers' `DGUID` field carries exactly these strings.

### 2.2 Request shape

```
GET https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_DA/A5.<DGUID>.1.<CHAR>.1?format=csv
     key = FREQ . REF_AREA . GENDER . CHARACTERISTIC . STATISTIC
     "+" = OR inside a dimension, empty = wildcard; format=csv | jsondata (default SDMX-ML XML); detail=full|dataonly|serieskeysonly|nodata
```

Verified examples (all HTTP 200):

* `…/data/STC_CP,DF_DA/A5.2021S051212050060.1.1+2+3+4+5+6+7+40+229+1389+1401+1402+1427+383+385+51+56.1?format=csv`
  → 17 rows; e.g. `CHARACTERISTIC 1 OBS_VALUE 349` (Population 2021, DA 12050060), `7 = 59.57` km², `1389 = 0`.
* `…/data/STC_CP,DF_DA/A5.2021S051212050060.1.1.1?format=jsondata` → SDMX-JSON 2.0 (`observations {"0": ["349", …]}`).
* `…/data/STC_CP,DF_CSD/A5.2021A00051205008.1.1+2+3+6.1?format=csv` (Annapolis Royal, T) →
  Population 2021 **530**, 2016 **491**, change **7.9 %**, density **268.3**/km².
* `…/data/STC_CP,DF_FED,1.3/A5.2013A000412001.1.1+2.1?format=csv` → 71,380 / 71,913 (Cape Breton--Canso, 2013 RO).
* Batch: 88 DGUIDs joined with `+` (key 1,583 characters) × 38 characteristics × both statistics:
  `…/data/STC_CP,DF_DA/A5.<88 DGUIDs>.1.<38 ids>.?format=csv` → 843 KB, **6,688 rows in 9.0 s**.
* 95 CSD DGUIDs × characteristics 1–7 → 665 rows in 1.8 s.

CSV columns: `DATAFLOW,FREQ,TIME_PERIOD,REF_AREA,GENDER,CHARACTERISTIC,STATISTIC,OBS_VALUE,DECIMALS,FLAG,TOPIC,NOTE,RELEASE_DATE,GEO_LEVEL,ALT_GEO_CODE,GEO_DESC,PROV_TERR,DATA_QUALITY_FLAG,TNR_LF,TNR_SF,CI_LOW,CI_HIGH`
(`ALT_GEO_CODE` = bare DAUID/CSDUID). Suppressed cells come back as an empty `OBS_VALUE` with `FLAG=6`.

CORS: `access-control-allow-origin: <Origin>`, `access-control-allow-credentials: true`, `access-control-allow-methods: GET`
on both GET and OPTIONS preflight; `cache-control: no-store,no-cache`. Browser calls are possible; the guide asks users not to
bulk-download a whole dataflow (use the CSV files instead).

### 2.3 Characteristic ids (CL_CHARACTERISTIC, verified labels)

| id | label (English) | parent / note |
|---|---|---|
| 1 | Population, 2021 | topic 1, note 1 (random rounding) |
| 2 | Population, 2016 | `...` where the DA did not exist in 2016 |
| 3 | Population percentage change, 2016 to 2021 | |
| 4 | Total private dwellings | |
| 5 | Private dwellings occupied by usual residents | |
| 6 | Population density per square kilometre | |
| 7 | Land area in square kilometres | |
| 40 | Median age of the population | |
| 50 | Total - Private households by household size - 100% data | |
| 51 | 1 person | parent 50 |
| 56 | Average household size | |
| 228 | Total - Income statistics for private households - 100% data | |
| 229 | Median total income of household in 2020 ($) | parent 228 |
| 379 | Total - Mother tongue for the total population excluding institutional residents - 100% data | |
| 380/381 | Single responses / Official languages | |
| 383 | French (mother tongue, single response) | parent 381 |
| 384 | Non-official languages | parent 380 |
| 385 | Indigenous languages (mother tongue) | parent 384; 474/475 n.i.e./n.o.s. Mi'kmaq is not a separate Census-Profile row — only the "Indigenous languages" aggregate exists at DA level |
| 1388 | Total - Indigenous identity for the population in private households - 25% sample data | |
| 1389 | Indigenous identity | parent 1388 (1396 Non-Indigenous identity) |
| 1400 | Total - Private households by tenure - 25% sample data | |
| 1401 / 1402 | Owner / Renter | parent 1400 |
| 1426 | Total - Occupied private dwellings by period of construction - 25% sample data | |
| 1427–1434 | 1960 or before · 1961 to 1980 · 1981 to 1990 · 1991 to 2000 · 2001 to 2005 · 2006 to 2010 · 2011 to 2015 · 2016 to 2021 | parent 1426 |
| 2603 | Total - Main mode of commuting for the employed labour force aged 15 years and over with a usual place of work or no fixed workplace address - 25% sample data | |
| 2604 | Car, truck or van (2605 as driver, 2606 as passenger) | parent 2603 |
| 2607 / 2608 / 2609 / 2610 | Public transit / Walked / Bicycle / Other method | parent 2603 |

Other language rows with "French"/"Indigenous languages" at 705–727 and 1047–1069 are "language spoken most often at home"
and "knowledge of languages" blocks, not mother tongue. Rates (`STATISTIC=4`) are StatCan's own percentages for count rows
(e.g. `1401` rate = owner share); the values file computes shares from counts instead so the arithmetic is transparent.

### 2.4 FED 2023 Representation Order profile (partial)

`…/data/STC_CP,DF_FED,2.0/A5.2023A000412005.1..1?format=csv&detail=dataonly` (Halifax, all characteristics) → 2,631 rows,
**2,622 with values** (e.g. median age 42.4, median household income 79,000) — but characteristics **1–7 (population 2021/2016,
change, dwellings, density, land area) are empty with FLAG 1 `..`** for 12001, 12005 and the guide's own example 10001.
The dataflow carries the annotation `NonProductionDataflow = true`. Treat 2023-RO population counts as **not available from this API**.

### 2.5 Downloadable Census Profile CSV (alternative to the API)

Page: `https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger.cfm?Lang=E`.
Atlantic file (Canada, provinces, territories, CDs, CSDs and **DAs** for NL/PE/NS/NB):
`https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger/comp/GetFile.cfm?Lang=E&FILETYPE=CSV&GEONO=006_Atlantic_Atlantique`
→ `98-401-X2021006_Atlantic_Atlantique_eng_CSV.zip`, **189,830,329 bytes** (no Content-Length/Range on HEAD; full GET took 44 s).
Contents: `98-401-X2021006_English_CSV_data_Atlantic.csv` **2,289,341,657 bytes**, `98-401-X2021006_English_meta.txt` (240 KB:
symbols, DATA_QUALITY_FLAG legend, definitions, footnotes), `98-401-X2021006_Geo_starting_row_Atlantic.CSV` (DGUID → first line
number, e.g. `"2021S051212050080","12050080",5401445`), `README_meta.txt`. Catalogue 98-401-X2021006, release date 2022-12-15.
Columns: `CENSUS_YEAR,DGUID,ALT_GEO_CODE,GEO_LEVEL,GEO_NAME,TNR_SF,TNR_LF,DATA_QUALITY_FLAG,CHARACTERISTIC_ID,CHARACTERISTIC_NAME,
CHARACTERISTIC_NOTE,C1_COUNT_TOTAL,SYMBOL,C2_COUNT_MEN+,SYMBOL,C3_COUNT_WOMEN+,SYMBOL,C10_RATE_TOTAL,SYMBOL,C11_RATE_MEN+,SYMBOL,C12_RATE_WOMEN+,SYMBOL`
(CHARACTERISTIC_ID matches the SDMX code). Sample row: `2021,"2021S051212050060","12050060","Dissemination area","12050060",1.3,2.6,"00000",1,"Population, 2021",1,349,"",…`.
Suppressed cells are empty with SYMBOL `x`; `...` = not applicable. The file is latin-1 encoded (needs `iconv -f latin1`).
Citation printed in the meta file: "Statistics Canada. 2022. Census Profile. 2021 Census. Statistics Canada Catalogue no. 98-316-X2021001. Ottawa. Released December 15, 2022."

---

## 3. Suppression, rounding and quality flags (what the UI must say)

Source: Guide to the Census of Population, 2021 (98-304-X), Chapter 10 "Dissemination — Protecting privacy",
`https://www12.statcan.gc.ca/census-recensement/2021/ref/98-304/2021001/chap10-eng.cfm#a6`:

* **Area suppression**: "no characteristics or tabulated data are released if the total population of the area is less than 40"
  (threshold 100 for postal-code/block-based areas).
* **Income**: "Estimates of income data are suppressed for areas where the population in private households is less than 250 or
  where the number of private households is less than 40."
* **Random rounding**: "All counts in census tabulations undergo random rounding" (to a multiple of 5, hence values like 5, 10, 15
  and totals that do not add up). CL_NOTE 1: DA population counts are adjusted so that they are "always within 5 of the actual values";
  no impact on CDs and large CSDs.
* Long-form (25 % sample) topics — income, tenure, period of construction, Indigenous identity, commuting — additionally depend on the
  long-form non-response rate; `DATA_QUALITY_FLAG` is a five-digit string: digit 1 incomplete enumeration (1 = incompletely enumerated
  reserve, suppressed; 2 = excludes one or more such reserves), digit 2 short-form quality (0 = TNR < 10 % … 5 = ≥ 50 % use with caution,
  9 = suppressed), digit 3 short-form income suppression (9), digit 4 long-form quality (0–5, 9), digit 5 long-form income suppression (9).
  `TNR_SF` / `TNR_LF` are the total non-response rates in percent. Halifax FED 12005 shows `00000`, TNR_SF 3.0, TNR_LF 2.3.

Observed in the 88 Annapolis-area DAs: 186 of 6,688 cells flagged `x`. DAs 12050080 and 12050090 (population 0) and 12050076
(population 15) have every characteristic suppressed; DA 12030082 (population 141, 55 households) is published except
median household income (`229` = `x`) — consistent with the 250/40 income rule. 12050060 has `...` for Population 2016 and the
percentage change (DA boundary new in 2021). Among the 95 CSDs, 8 have a revised (`r`) 2016 population (Medway River 11, Queens,
West Hants, Cumberland Subd. A, Inverness Subd. C, Malagawatch 4, Richmond Subd. B, Cape Breton) and three reserves
(Bear River (Part) 6, New Ross 20, Merigomish Harbour 31) have `...` for the percentage change.

Census dictionary Table 1.5 (`https://www12.statcan.gc.ca/census-recensement/2021/ref/dict/tab/index-eng.cfm?ID=t1_5`) gives the NS
CSD types: IRI Indian reserve 27, MD Municipal district 11, RGM Regional municipality 3, RM Rural municipality 1, SC Subdivision of
county municipality 28, T Town 25 = 95.

---

## 4. Licence text

Statistics Canada Open Licence — `https://www.statcan.gc.ca/en/reference/licence` (redirects to
`https://www.statcan.gc.ca/en/terms-conditions/open-licence`). Grants a "worldwide, royalty-free, non-exclusive licence to: use,
reproduce, publish, freely distribute, or sell the Information … [and] Value-added Products". Conditions: reproduce accurately, do not
imply endorsement, do not misrepresent the source, do not merge or link "for the purpose of attempting to identify an individual person,
business or organization", no StatCan logos/wordmark. Required notices:

* reproduced data: `Source: Statistics Canada, name of product, reference date. Reproduced and distributed on an "as is" basis with the permission of Statistics Canada.`
* value-added product (a map theme is one): `Adapted from Statistics Canada, name of product, reference date. This does not constitute an endorsement by Statistics Canada of this product.`

For the theme: "Adapted from Statistics Canada, Census Profile, 2021 Census of Population (98-316-X2021001) and 2021 Census
Cartographic Boundary Files (92-160-X), 2021. This does not constitute an endorsement by Statistics Canada of this product."
The geo REST service and the Elections Canada FED file are under Open Government Licence – Canada
(`http://open.canada.ca/en/open-government-licence-canada`), which requires "Contains information licensed under the Open
Government Licence – Canada." — text of that licence page **not re-fetched here**.

---

## 5. Recommended path for the map

1. Geometry: query `geo.statcan.gc.ca …/Cartographic_boundary_files/MapServer/12` (DA) and `/9` (CSD) live with the map bbox,
   `outSR=4326&f=geojson&maxAllowableOffset=<~1 px in degrees>&geometryPrecision=5`, or pre-cut NS (PRUID='12', 1,670 DAs / 95 CSDs /
   108 CTs / 152 ADAs, `resultOffset` paging at 6,000) into static GeoJSON or vector tiles. CBF (`b`) polygons are the ones to draw;
   DBF (`a`) extend into water (standard StatCan definition; not re-verified in this session).
2. Values: SDMX `DF_DA` / `DF_CSD` batched by `+`-joined DGUIDs (≈100 DGUIDs × ≈40 characteristics in < 10 s), cached; or a one-off
   extract from the 2.3 GB Atlantic CSV using `Geo_starting_row` offsets. Keep `FLAG`/`SYMBOL` per cell and render `x` / `...` / `..`
   distinctly from 0.
3. FED 2023 RO: geometry from Elections Canada (convert once; no CORS), attributes from `DF_FED,2.0` except population counts (absent).
4. Cape Breton has no census tracts; use ADAs or DAs there.

## 6. Every URL touched

* https://geo.statcan.gc.ca/geo_wa/rest/services?f=json
* https://geo.statcan.gc.ca/geo_wa/rest/services/2021?f=json (and /2023, /2024, /2025)
* https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer?f=json (+ /3, /9, /10, /11, /12 layer metadata; /3, /6, /9, /10, /11, /12 `query`)
* https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Digital_boundary_files/MapServer?f=json
* https://geo.statcan.gc.ca/geo_wa/services/2021/Cartographic_boundary_files/MapServer/WMSServer?request=GetCapabilities&service=WMS
* https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm?year=21 (and ?year=23; POST with bound=da_/fed)
* https://www12.statcan.gc.ca/census-recensement/alternative_alternatif.cfm?l=eng&dispext=zip&teng=lda_000b21a_e.zip&k=+++192424&loc=//www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lda_000b21a_e.zip
* https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/{lda_000b21a_e,lcsd000b21a_e,lct_000b21a_e,lada000b21a_e,lfed000b21a_e,lda_000a21a_e,lcsd000a21a_e,lfed000a23a_e,lfed000b23a_e,lfed000a23s_e}.zip (HEAD)
* https://open.canada.ca/data/api/action/package_search?q=federal+electoral+districts+2023+representation+order&rows=10
* https://open.canada.ca/data/api/action/package_search?q=%222023+Representation+Order%22&rows=10
* https://ftp.maps.canada.ca/pub/elections_elections/Electoral-districts_Circonscription-electorale/ (+ federal_electoral_districts_boundaries_2023/ and FED_CA_2023_EN-SHP.zip)
* https://api.us.socrata.com/api/catalog/v1?domains=data.novascotia.ca&q=census&limit=100
* https://data.novascotia.ca/api/views/s6f2-3jrq.json ; https://data.novascotia.ca/api/views/4qqi-i6zp.json
* https://nsgiwa.novascotia.ca/arcgis/rest/services/{SOC,ECON,BND}?f=json ; …/BND/{BND_SelfcontainedLabourAreas_2021_UT83,BND_NS_Community_Bndys_WM84,BND_ElectoralBoundaries_UT83}/MapServer?f=json
* https://www12.statcan.gc.ca/wds-sdw/cpr2021-eng.cfm (404) ; https://www12.statcan.gc.ca/wds-sdw/index-eng.cfm ; https://www12.statcan.gc.ca/wds-sdw/cr2021geo-eng.cfm (404) ; https://www12.statcan.gc.ca/wds-sdw/2021profile-profil2021-eng.cfm
* https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/dataflow/all?detail=allstubs
* https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/dataflow/STC_CP/DF_DA?references=all&detail=full
* https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/dataflow/STC_CP/DF_FED/all?detail=allstubs ; …/DF_FED/2.0?detail=full
* https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_DA/A5.2021S051212050060.1.1+2+3+4+5+6+7+40+229+1389+1401+1402+1427+383+385+51+56.1?format=csv
* https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_DA/A5.2021S051212050060.1.1.1?format=jsondata
* https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_DA/A5.<88 DGUIDs>.1.1+2+3+4+5+6+7+40+50+51+56+228+229+379+381+383+384+385+1388+1389+1400+1401+1402+1426+1427+1428+1429+1430+1431+1432+1433+1434+2603+2604+2607+2608+2609+2610.?format=csv
* https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_CSD/A5.2021A00051205008.1.1+2+3+6.1?format=csv ; …/DF_CSD/A5.<95 DGUIDs>.1.1+2+3+4+5+6+7.1?format=csv
* https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_FED,1.3/A5.2013A000412001.1.1+2.1?format=csv
* https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data/STC_CP,DF_FED,2.0/A5.2023A000412001.1.1+2.1?format=csv ; …/A5.2023A000410001+2023A000412005+2023A000412001.1.1+2+6.1?format=csv ; …/A5.2023A000412005.1..1?format=csv&detail=dataonly
* https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger.cfm?Lang=E
* https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger/comp/GetFile.cfm?Lang=E&FILETYPE=CSV&GEONO=006_Atlantic_Atlantique
* https://www.statcan.gc.ca/en/reference/licence → https://www.statcan.gc.ca/en/terms-conditions/open-licence
* https://www12.statcan.gc.ca/census-recensement/2021/ref/98-304/index-eng.cfm ; …/98-304/2021001/chap10-eng.cfm
* https://www12.statcan.gc.ca/census-recensement/2021/ref/dict/az/index-eng.cfm ; …/dict/az/definition-eng.cfm?ID=geo043 ; …/dict/tab/index-eng.cfm?ID=t1_5 ; ?ID=t1_4
* 404s tried: …/98-304/2021003/chap10-eng.cfm, …/2021003/chap11-eng.cfm, …/dp-pd/prof/help-aide/index-eng.cfm, …/dp-pd/prof/details/notes-eng.cfm

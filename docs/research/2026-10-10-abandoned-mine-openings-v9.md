# Abandoned mine openings: version 9 source check (2026-10-10)

The `abandoned-mines` layer moves from the ArcGIS Online copy of DP ME 10 to the
Province's own copy on `dawson.novascotia.ca`. Both answered on 2026-10-10
(checked from a Linux box, about 21:00 AT).

| | Old (ArcGIS Online) | New (Province) |
|---|---|---|
| Service | `services.arcgis.com/TS1HHBYLM10d1SZH/.../Abandoned_Mine_Openings_Degree_of_Hazard_d010ns_ut83/FeatureServer/0` | `dawson.novascotia.ca/arcgis/rest/services/Hosted/Abandoned_Mine_Openings_Degree_of_Hazard_d010ns_ut83/FeatureServer/4` |
| `versn` (distinct) | 8 | 9 |
| `extrct_dt` (distinct) | `2020_04APR_09_1110` | `2024_06JUN_11_1430` |
| `returnCountOnly` | 8,443 | 8,564 |
| Geometry | `esriGeometryPoint` | `esriGeometryPoint` |
| Spatial reference | wkid 2038 (latest 2961) | wkid 2038 (latest 2961) |
| `maxRecordCount` | 2000 | 2000 |
| Capabilities | Query; pagination, orderBy, distinct | Query; pagination, orderBy, distinct |
| Formats | JSON, geoJSON, PBF | JSON, geoJSON, PBF |
| Object ID | `geo_id` | `geo_id` |
| Copyright text | Nova Scotia Department of Energy and Mines | Nova Scotia Department of Energy and Mines |
| CORS, `Origin: https://kinnokilabs.com` | `Access-Control-Allow-Origin: *` | `Access-Control-Allow-Origin: https://kinnokilabs.com` (GET and preflight) |

## Field names

The version 9 service publishes the same fields in lower case (`shaftid`,
`name`, `opening_ty`, `degree_haz`, `protection`; `geo_id` is unchanged). It
rejects mixed-case names: asking for `ShaftID` returns
`The submitted field 'ShaftID' is not available in the layer '4'`, and a
GeoJSON request with mixed-case `outFields` returns an HTML error page. The web
catalog, parcel resource query, map tooltip, the native catalog, intersection
query and point overlay now all use the lower-case names. `geo_id` values differ
between the two copies (the same Old Gardiner Main Shaft, `GBA-1-060`, is 1168
in version 8 and 1178 in version 9), so nothing should persist `geo_id` across
the switch. A Glace Bay viewport (-60.05, 46.15, -59.9, 46.25) returns 231
openings from each copy.

## Licence and attribution

The DP ME 10 download page (https://novascotia.ca/natr/meb/download/dp010.asp)
names the product "DP ME 10, Version 9, 2024. Nova Scotia Abandoned Mine
Openings Database" and states: "This data is made available under the Nova
Scotia Open Government Licence." The open data portal lists the same database
under the Nova Scotia Open Government Licence
(https://data.novascotia.ca/Mines-and-Minerals/Nova-Scotia-Abandoned-Mines-Openings-Database/adp2-jhvu).
The layer stays `province-open`, and print evidence keeps the standard
attribution: "Contains information licensed under the Open Government Licence –
Nova Scotia."

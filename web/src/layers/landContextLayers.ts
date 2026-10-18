import type { ContextLayerDescriptor } from "./contextLayerTypes";

// Publisher layer IDs, classes and colours verified 7 September 2026.
// Open-data grants are dataset-specific; other sources retain the licence gate.
export const landContextLayers = [
  {
    "id": "protected-conservation-areas",
    "name": "Protected and conservation areas",
    "category": "land-property",
    "serviceUrl": "https://nsgiwa.novascotia.ca/arcgis/rest/services/ENV/ENV_NS_Prot_Area_Sys_UT83/MapServer",
    "sourceUrl": "https://data.novascotia.ca/d/ticv-5du5",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "licence": "province-open",
    "sourceDate": "Publisher-managed live service; checked 7 September 2026. Individual feature dates vary.",
    "scale": "Mapped boundaries; not a legal survey.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "Protection types include parks, reserves, wilderness areas and private conservation lands. A polygon does not establish public access or permission.",
    "minZoom": 7,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 180,
    "exportOptions": {
      "transparent": true,
      "layers": "show:0"
    },
    "legend": [
      {
        "label": "National Park",
        "color": "#ffff00"
      },
      {
        "label": "National Wildlife Area",
        "color": "#f57a7a"
      },
      {
        "label": "Nature Reserve",
        "color": "#ffd37f"
      },
      {
        "label": "Nature Reserve and Wilderness Area",
        "color": "#73ffdf"
      },
      {
        "label": "Wilderness Area",
        "color": "#73ffdf"
      },
      {
        "label": "Land Trust or Conservation Easement",
        "color": "#7a8ef5"
      },
      {
        "label": "Provincial Park",
        "color": "#ff73df"
      }
    ]
  },
  {
    "id": "wam-relative-wetness",
    "name": "WAM relative wetness",
    "category": "water-terrain",
    "serviceUrl": "https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_WetAreasMapping_UT83/MapServer",
    "sourceUrl": "https://novascotia.ca/natr/forestry/gis/wamdownload.asp",
    "licenceUrl": "https://novascotia.ca/natr/forestry/gis/licence.asp",
    "licence": "province-restricted",
    "sourceDate": "WAM research model, 2005–2007; checked 7 September 2026.",
    "scale": "Terrain-derived relative wetness index; magnification adds no survey precision.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "Index values describe relative wetness, not depth to groundwater or a water table. This is not a wetland delineation, flood forecast, or current soil observation.",
    "minZoom": 12,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 170,
    "exportOptions": {
      "transparent": true,
      "layers": "show:1"
    },
    "legend": [
      {
        "label": "Poor to Very-poor (or water)"
      },
      {
        "label": "Imperfect to Poor"
      },
      {
        "label": "Moderately-well to Imperfect"
      },
      {
        "label": "Well to Moderately-well"
      },
      {
        "label": "Rapid to Well"
      }
    ],
    "attribution": "Source: Nova Scotia Department of Natural Resources. Digital data provided as is, without warranties; source dates and reporting completeness vary."
  },
  {
    "id": "wam-predicted-flow",
    "name": "WAM predicted flow",
    "category": "water-terrain",
    "serviceUrl": "https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_WetAreasMapping_UT83/MapServer",
    "sourceUrl": "https://novascotia.ca/natr/forestry/gis/wamdownload.asp",
    "licenceUrl": "https://novascotia.ca/natr/forestry/gis/licence.asp",
    "licence": "province-restricted",
    "sourceDate": "WAM research model, 2005–2007; checked 7 September 2026.",
    "scale": "Publisher displays at 1:50,000 and closer; four-hectare drainage threshold.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "Modelled drainage includes unmapped and ephemeral channels. Lines do not confirm a present stream, measured flow, navigability or available power.",
    "minZoom": 14,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 195,
    "exportOptions": {
      "transparent": true,
      "layers": "show:0"
    },
    "legend": [
      {
        "label": "WAM Predicted Flow",
        "color": "#73dfff"
      }
    ],
    "attribution": "Source: Nova Scotia Department of Natural Resources. Digital data provided as is, without warranties; source dates and reporting completeness vary."
  },
  {
    "id": "lidar-hillshade",
    "name": "Lidar hillshade",
    "category": "water-terrain",
    "serviceUrl": "https://nsgiwa.novascotia.ca/arcgis/rest/services/ELEV/ELEV_LIDAR_Projects_Hillshade_UT83/MapServer",
    "sourceUrl": "https://nsgi.novascotia.ca/datalocator/elevation/",
    "licenceUrl": "https://nsgiwa.novascotia.ca/documents/licenses/unrestricted/unrestrictedLicense.pdf",
    "licence": "province-restricted",
    "sourceDate": "Publisher project layers 201602, 201701, 201801, 201901, 201902 and 202001; checked 7 September 2026.",
    "scale": "Shaded elevation imagery; source resolution and acquisition vary by project.",
    "coverage": "Published lidar project footprints only. Transparent gaps may be outside coverage.",
    "webCaveat": "Shading helps read terrain. Brightness is not elevation, slope stability, a feature identification, or a current site inspection.",
    "minZoom": 10,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 165,
    "exportOptions": {
      "transparent": true,
      "layers": "show:0,1,2,3,4,5"
    },
    "legend": [
      {
        "label": "Shaded terrain (light and shadow)"
      }
    ],
    "attribution": "Reproduced and distributed with the permission of the Department of Service Nova Scotia. This product has been produced by KinNoKi Labs and includes data provided by the Department of Service Nova Scotia. The incorporation of that data shall not be construed as constituting an endorsement by the Department of Service Nova Scotia of this product. Service Nova Scotia makes no representation and gives no warranty of any kind respecting the data's accuracy, usefulness, novelty, validity, scope, completeness, or currency."
  },
  {
    "id": "designated-water-supply-areas",
    "name": "Designated water supply areas",
    "category": "water-terrain",
    "serviceUrl": "https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer",
    "sourceUrl": "https://novaroc.novascotia.ca/",
    "licenceUrl": "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf",
    "licence": "province-restricted",
    "sourceDate": "Publisher-managed live service; checked 7 September 2026. Individual feature dates vary.",
    "scale": "Publisher displays at 1:250,000 and closer.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "Water-source or protection boundaries do not establish water or sewer service availability, a right to connect, water quality, or capacity. Confirm designation and restrictions with the responsible authority.",
    "minZoom": 12,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 185,
    "exportOptions": {
      "transparent": true,
      "layers": "show:38"
    },
    "legend": [
      {
        "label": "Designated Water Supply Areas",
        "color": "#005ce6"
      }
    ]
  },
  {
    "id": "municipal-surface-water-supply-areas",
    "name": "Municipal surface water supply areas",
    "category": "water-terrain",
    "serviceUrl": "https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer",
    "sourceUrl": "https://novaroc.novascotia.ca/",
    "licenceUrl": "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf",
    "licence": "province-restricted",
    "sourceDate": "Publisher-managed live service; checked 7 September 2026. Individual feature dates vary.",
    "scale": "Publisher displays at 1:250,000 and closer.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "Water-source or protection boundaries do not establish water or sewer service availability, a right to connect, water quality, or capacity. Confirm designation and restrictions with the responsible authority.",
    "minZoom": 12,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 185,
    "exportOptions": {
      "transparent": true,
      "layers": "show:39"
    },
    "legend": [
      {
        "label": "Municipal Natural Surface Water Supply Areas",
        "color": "#9ebbd7"
      }
    ]
  },
  {
    "id": "source-water-well-field-protection",
    "name": "Source-water and well-field protection",
    "category": "water-terrain",
    "serviceUrl": "https://novarocmaps.novascotia.ca/arcgis/rest/services/NovaRoc/MapServer",
    "sourceUrl": "https://novaroc.novascotia.ca/",
    "licenceUrl": "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf",
    "licence": "province-restricted",
    "sourceDate": "Publisher-managed live service; checked 7 September 2026. Individual feature dates vary.",
    "scale": "Publisher displays at 1:250,000 and closer.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "Water-source or protection boundaries do not establish water or sewer service availability, a right to connect, water quality, or capacity. Confirm designation and restrictions with the responsible authority.",
    "minZoom": 12,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 185,
    "exportOptions": {
      "transparent": true,
      "layers": "show:47"
    },
    "legend": [
      {
        "label": "Source-water and Well-field Protection Areas",
        "color": "#2663b3"
      }
    ]
  },
  {
    "id": "municipal-water-wellheads",
    "name": "Municipal water supply wellheads",
    "category": "water-terrain",
    "serviceUrl": "https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_MunicipalWaterSupplyWellheads_UT83/MapServer",
    "sourceUrl": "https://nsgiwa.novascotia.ca/arcgis/rest/services/WTR/WTR_MunicipalWaterSupplyWellheads_UT83/MapServer/0",
    "licenceUrl": "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf",
    "licence": "province-restricted",
    "sourceDate": "Publisher-managed live service; checked 7 September 2026. Individual feature dates vary.",
    "scale": "Publisher displays at 1:150,002 and closer; mapped points are approximate.",
    "coverage": "Mapped municipal water supply wellheads in Nova Scotia; not all private or public wells.",
    "webCaveat": "A wellhead location does not establish service availability, source protection extent, tested water quality, capacity or current operating status.",
    "minZoom": 13,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 245,
    "exportOptions": {
      "transparent": true,
      "layers": "show:0"
    },
    "legend": [
      {
        "label": "Municipal Water Supply Wellheads"
      }
    ]
  },
  {
    "id": "forest-leading-species",
    "name": "Leading forest species",
    "category": "forestry-ecology",
    "serviceUrl": "https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_ProvLandscapeViewer_UT83/MapServer",
    "sourceUrl": "https://data.novascotia.ca/d/c8ai-fjbt",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "licence": "province-open",
    "sourceDate": "Forest inventory interpretation dates vary by region; see the source availability map. Service checked 7 September 2026.",
    "scale": "Publisher displays at 1:250,000 and closer; photo-interpreted stands.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "Leading species describes the interpreted dominant stand species, not every tree or current timber value. Harvests and disturbance may postdate the source imagery.",
    "minZoom": 12,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 175,
    "exportOptions": {
      "transparent": true,
      "layers": "show:5"
    },
    "legend": [
      {
        "label": "Exotic Species",
        "color": "#ff70ff"
      },
      {
        "label": "Jack Pine",
        "color": "#a8a800"
      },
      {
        "label": "Red Pine",
        "color": "#a88500"
      },
      {
        "label": "White Pine",
        "color": "#a8a86d"
      },
      {
        "label": "Balsam Fir",
        "color": "#02e600"
      },
      {
        "label": "Black Spruce",
        "color": "#128655"
      },
      {
        "label": "Red Spruce",
        "color": "#50a000"
      },
      {
        "label": "White Spruce",
        "color": "#12be00"
      },
      {
        "label": "Red & Black Spruce",
        "color": "#128685"
      },
      {
        "label": "Eastern Hemlock",
        "color": "#546800"
      },
      {
        "label": "Eastern Larch",
        "color": "#c8ffca"
      },
      {
        "label": "Other Softwood",
        "color": "#7ca698"
      },
      {
        "label": "Aspen Species",
        "color": "#dcaf96"
      },
      {
        "label": "Ash",
        "color": "#b070b8"
      },
      {
        "label": "Beech",
        "color": "#ffaa00"
      },
      {
        "label": "Yellow Birch",
        "color": "#e6e600"
      },
      {
        "label": "White Birch",
        "color": "#e6c8c8"
      },
      {
        "label": "Red Oak",
        "color": "#895a44"
      },
      {
        "label": "Red Maple",
        "color": "#ff6e5a"
      },
      {
        "label": "Sugar Maple",
        "color": "#ffebaf"
      },
      {
        "label": "Tolerant Hardwood",
        "color": "#ffd489"
      },
      {
        "label": "Intolerant Hardwood",
        "color": "#fefa9e"
      },
      {
        "label": "Other Hardwood",
        "color": "#9b9cdb"
      },
      {
        "label": "Unclassified Hardwood",
        "color": "#e6dcdc"
      },
      {
        "label": "Unclassified Species",
        "color": "#c8c8c8"
      },
      {
        "label": "Unclassified Softwood",
        "color": "#d2e6d2"
      }
    ]
  },
  {
    "id": "forest-height",
    "name": "Forest stand height",
    "category": "forestry-ecology",
    "serviceUrl": "https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_ProvLandscapeViewer_UT83/MapServer",
    "sourceUrl": "https://data.novascotia.ca/d/c8ai-fjbt",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "licence": "province-open",
    "sourceDate": "Forest inventory interpretation dates vary by region; see the source availability map. Service checked 7 September 2026.",
    "scale": "Publisher displays at 1:250,000 and closer; photo-interpreted stands.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "Stand-level photo interpretation is not a current tree census, timber valuation, harvest permission or parcel survey. Height classes are average stand height in metres.",
    "minZoom": 12,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 175,
    "exportOptions": {
      "transparent": true,
      "layers": "show:7"
    },
    "legend": [
      {
        "label": "Average Stand Height (m)"
      },
      {
        "label": "1 - 5",
        "color": "#d7f0af"
      },
      {
        "label": "6 - 8",
        "color": "#c1d696"
      },
      {
        "label": "9 - 11",
        "color": "#acbf7e"
      },
      {
        "label": "12 - 14",
        "color": "#98a867"
      },
      {
        "label": "15 - 17",
        "color": "#829151"
      },
      {
        "label": "18 - 20",
        "color": "#707d3e"
      },
      {
        "label": "21 +",
        "color": "#606b2d"
      }
    ]
  },
  {
    "id": "forest-treatments",
    "name": "Recorded forest treatments",
    "category": "forestry-ecology",
    "serviceUrl": "https://nsgiwa.novascotia.ca/arcgis/rest/services/FOR/FOR_ProvLandscapeViewer_UT83/MapServer",
    "sourceUrl": "https://nsgi.novascotia.ca/plv/help/help.htm",
    "licenceUrl": "https://novascotia.ca/natr/forestry/gis/licence.asp",
    "licence": "province-restricted",
    "sourceDate": "Publisher-managed live service; checked 7 September 2026. Individual feature dates vary.",
    "scale": "Overview from 1:250,000 to 1:20,000; details at 1:20,000 and closer.",
    "coverage": "Recorded silviculture treatments; the publisher notes incomplete private-land reporting.",
    "webCaveat": "GPS, aerial-photo and historical plan records vary in accuracy and date. Missing treatment records do not mean no treatment; mapped treatment does not authorize a future harvest.",
    "minZoom": 12,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 190,
    "exportOptions": {
      "transparent": true,
      "layers": "show:2,3"
    },
    "legend": [
      {
        "label": "Thinning",
        "color": "#a8a800"
      },
      {
        "label": "Other Treatments",
        "color": "#ffd37f"
      },
      {
        "label": "Planting",
        "color": "#d9c9b8"
      },
      {
        "label": "Pruning",
        "color": "#594299"
      },
      {
        "label": "Crop Tree Release",
        "color": "#ebc7f2"
      },
      {
        "label": "Selection Management",
        "color": "#e7f5c9"
      },
      {
        "label": "Commercial Thinning",
        "color": "#f7f6c3"
      },
      {
        "label": "PCT Plantation",
        "color": "#ff0000"
      },
      {
        "label": "PCT Natural",
        "color": "#000000"
      },
      {
        "label": "Early Competition Control",
        "color": "#00e6a9"
      },
      {
        "label": "Natural Regeneration",
        "color": "#c5d2fa"
      },
      {
        "label": "Intensive Plantation",
        "color": "#e69800"
      },
      {
        "label": "Plantation",
        "color": "#d9c9b8"
      }
    ],
    "attribution": "Source: Nova Scotia Department of Natural Resources. Digital data provided as is, without warranties; source dates and reporting completeness vary."
  },
  {
    "id": "crown-harvest-plans",
    "name": "Crown harvest plans",
    "category": "forestry-ecology",
    "serviceUrl": "https://nsgiwa.novascotia.ca/arcgis/rest/services/PLAN/PLAN_CrownHarvestPlans_UT83/MapServer",
    "sourceUrl": "https://data.novascotia.ca/d/ag3d-ztdm",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "licence": "province-open",
    "sourceDate": "Publisher-managed live service; checked 7 September 2026. Individual feature dates vary.",
    "scale": "Planning polygons; not surveyed operational boundaries.",
    "coverage": "Published Crown land harvest plans; archived layer is excluded.",
    "webCaveat": "Proposed harvest methods and locations are planning records, not proof a harvest is approved, underway or completed. Confirm current status with the Province.",
    "minZoom": 11,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 190,
    "exportOptions": {
      "transparent": true,
      "layers": "show:0"
    },
    "legend": [
      {
        "label": "High Retention Irregular Shelterwood",
        "color": "#ff7f7f"
      },
      {
        "label": "Medium Retention Irregular Shelterwood",
        "color": "#f5a27a"
      },
      {
        "label": "Commercial Thinning",
        "color": "#cccccc"
      },
      {
        "label": "Shelterwood",
        "color": "#c29ed7"
      },
      {
        "label": "Single Tree Selection",
        "color": "#38a800"
      },
      {
        "label": "Salvage with Retention",
        "color": "#e6e600"
      },
      {
        "label": "Group Selection",
        "color": "#4ce600"
      },
      {
        "label": "Partial Overstory Removal",
        "color": "#ffd37f"
      },
      {
        "label": "Research Trial",
        "color": "#ff0000"
      },
      {
        "label": "Final Felling",
        "color": "#a80084"
      },
      {
        "label": "Crop Tree Release",
        "color": "#7ab6f5"
      },
      {
        "label": "Variable Retention",
        "color": "#ccb88f"
      },
      {
        "label": "Early Tending",
        "color": "#0070ff"
      }
    ]
  },
  {
    "id": "bedrock-geology",
    "name": "Bedrock geology",
    "category": "geology-resources",
    "serviceUrl": "https://fletcher.novascotia.ca/arcgis/rest/services/geoscience/bedrockgeologyprovscale_new/MapServer",
    "sourceUrl": "https://data.novascotia.ca/d/4i5u-vdmd",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "licence": "province-open",
    "sourceDate": "Keppie, 2000; provincial Geological Map ME 2000-01. Service checked 7 September 2026.",
    "scale": "1:500,000 regional geology; zooming in does not improve geological boundary accuracy.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "Published geological units provide regional research context, not a site investigation, mineral value, groundwater quality or permission to extract.",
    "minZoom": 8,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 170,
    "exportOptions": {
      "transparent": true,
      "layers": "show:11"
    },
    "legend": [
      {
        "label": "Early Cretaceous units",
        "color": "#c2fc65"
      },
      {
        "label": "Fundy Group",
        "color": "#d7bc7e"
      },
      {
        "label": "Scots Bay Formation",
        "color": "#4c9787"
      },
      {
        "label": "McCoy Brook Formation",
        "color": "#4c9787"
      },
      {
        "label": "North Mountain Formation: southern mainland",
        "color": "#bdfdc6"
      },
      {
        "label": "North Mountain Formation: northern mainland",
        "color": "#bdfdc6"
      },
      {
        "label": "Blomidon Formation: southern mainland",
        "color": "#d7bc7e"
      },
      {
        "label": "Blomidon Formation: northern mainland",
        "color": "#d7bc7e"
      },
      {
        "label": "Wolfville Formation: southern mainland",
        "color": "#cfa483"
      },
      {
        "label": "Wolfville Formation: northern mainland",
        "color": "#cfa483"
      },
      {
        "label": "Pictou Group",
        "color": "#a16c65"
      },
      {
        "label": "Cape John Formation",
        "color": "#cdb0ac"
      },
      {
        "label": "Tatamagouche Formation",
        "color": "#c09a96"
      },
      {
        "label": "Balfron Formation",
        "color": "#b1827e"
      },
      {
        "label": "Broad Cove Formation",
        "color": "#b1827e"
      },
      {
        "label": "Morien Group",
        "color": "#bd8526"
      },
      {
        "label": "Sydney Mines Formation",
        "color": "#f0e6d1"
      },
      {
        "label": "Glengarry Valley Formation",
        "color": "#d8b97d"
      },
      {
        "label": "Big Barren Formation",
        "color": "#caa351"
      },
      {
        "label": "Waddens Cove Formation",
        "color": "#e9d9b7"
      },
      {
        "label": "South Bar Formation",
        "color": "#e1ca9b"
      },
      {
        "label": "Cumberland Group",
        "color": "#d7b77a"
      },
      {
        "label": "Inverness Formation",
        "color": "#eed298"
      },
      {
        "label": "Scotch Village Formation",
        "color": "#caa351"
      },
      {
        "label": "Stellarton Formation",
        "color": "#f0e6d1"
      },
      {
        "label": "New Glasgow Conglomerate",
        "color": "#f0e6d1"
      },
      {
        "label": "Malagash Formation",
        "color": "#e9d9b7"
      },
      {
        "label": "Middle River Formation",
        "color": "#fdecc8"
      },
      {
        "label": "Ragged Reef Formation",
        "color": "#e9d9b7"
      },
      {
        "label": "Malagash and Ragged Reef Formations",
        "color": "#e9d9b7"
      },
      {
        "label": "Springhill Mines Formation",
        "color": "#e1ca9b"
      },
      {
        "label": "Joggins Formation",
        "color": "#e1ca9b"
      },
      {
        "label": "Polly Brook Formation",
        "color": "#bd8526"
      },
      {
        "label": "Boss Point Formation",
        "color": "#bd8526"
      },
      {
        "label": "Parrsboro Formation",
        "color": "#bd8526"
      },
      {
        "label": "Port Hood Formation: northern mainland",
        "color": "#caa351"
      },
      {
        "label": "Port Hood Formation: Cape Breton Island",
        "color": "#caa351"
      },
      {
        "label": "Silver Mine Formation",
        "color": "#eed298"
      },
      {
        "label": "Claremont and Millsville Formations",
        "color": "#c8a252"
      },
      {
        "label": "Boss Point and Claremont Formations",
        "color": "#bd8526"
      },
      {
        "label": "Mabou Group",
        "color": "#b2b2b2"
      },
      {
        "label": "Watering Brook Formation",
        "color": "#cbcbcb"
      },
      {
        "label": "Middleborough and Shepody Formations",
        "color": "#727272"
      },
      {
        "label": "Pomquet Formation",
        "color": "#cbcbcb"
      },
      {
        "label": "Hastings Formation",
        "color": "#a0a0a0"
      },
      {
        "label": "Pomquet and Point Edward Formations",
        "color": "#cbcbcb"
      },
      {
        "label": "Hastings, Cape Dauphin and MacKeigan Road Formations",
        "color": "#8b8b8b"
      },
      {
        "label": "Windsor Group: southern mainland",
        "color": "#a5fdfc"
      },
      {
        "label": "Windsor Group: northern mainland",
        "color": "#a5fdfc"
      },
      {
        "label": "Windsor Group: Cape Breton Island",
        "color": "#a5fdfc"
      },
      {
        "label": "Murphy Road, Pesaquid and Green Oaks Formations",
        "color": "#7efdfc"
      },
      {
        "label": "Lime-Kiln Brook, Churchville and Hood Island Formations",
        "color": "#7efdfc"
      },
      {
        "label": "Hood Island, Woodbine Road and Uist Formations",
        "color": "#7efdfc"
      },
      {
        "label": "Wentworth Station, Miller Creek, MacDonald Road and Elderbank Formations",
        "color": "#cafdfd"
      },
      {
        "label": "Pugwash Mine, Forbes Lake, Addington, Wallace Brook and Lakevale Formations",
        "color": "#cafdfd"
      },
      {
        "label": "Loch Lomond, Enon and Meadows Road Formations",
        "color": "#cafdfd"
      },
      {
        "label": "Lower and Middle Windsor Groups undivided: northern mainland",
        "color": "#58fdfc"
      },
      {
        "label": "Lower and Middle Windsor Groups undivided: Cape Breton Island",
        "color": "#58fdfc"
      },
      {
        "label": "White Quarry, Stewiacke, Carrolls Corner, Macumber and Gays River Formations",
        "color": "#58fdfc"
      },
      {
        "label": "Bridgeville, Holmes Brook, Hartshorn, Gays River and Macumber Formations",
        "color": "#58fdfc"
      },
      {
        "label": "Kempt Head, Sydney River, Gays River, MacBeth Brook and Macumber Formations",
        "color": "#58fdfc"
      },
      {
        "label": "Horton Group: southern mainland",
        "color": "#fdfa54"
      },
      {
        "label": "Coldstream Formation",
        "color": "#fdfcd2"
      },
      {
        "label": "Cheverie Formation",
        "color": "#fdfba5"
      },
      {
        "label": "Horton Bluff Formation",
        "color": "#fdfa65"
      },
      {
        "label": "Horton Group: northern mainland",
        "color": "#fdfa54"
      },
      {
        "label": "Wilkie Brook Formation",
        "color": "#fefa33"
      },
      {
        "label": "Falls Formation",
        "color": "#fefb66"
      },
      {
        "label": "Nuttby Formation",
        "color": "#fefc98"
      },
      {
        "label": "Greville River Formation",
        "color": "#fdfcd2"
      },
      {
        "label": "Rapid Brook Formation",
        "color": "#fdfcd2"
      },
      {
        "label": "Horton Group: Cape Breton Island",
        "color": "#fdfa54"
      },
      {
        "label": "Ainslie and Strathlorne Formations",
        "color": "#fdfba5"
      },
      {
        "label": "Judique Formation",
        "color": "#fdfa65"
      },
      {
        "label": "Creignish Formation",
        "color": "#fdfba5"
      },
      {
        "label": "Grantmire Formation",
        "color": "#fdfcd2"
      },
      {
        "label": "Fountain Lake Group",
        "color": "#492d17"
      },
      {
        "label": "Diamond Brook Formation",
        "color": "#5f4832"
      },
      {
        "label": "Byers Brook Formation",
        "color": "#766350"
      },
      {
        "label": "Clam Harbour River Formation",
        "color": "#a4978b"
      },
      {
        "label": "Glenkeen Formation",
        "color": "#c0b6ac"
      },
      {
        "label": "Sunnyville Formation",
        "color": "#cfc9c3"
      },
      {
        "label": "unnamed Devonian conglomerate unit",
        "color": "#d7c285"
      },
      {
        "label": "unnamed Devonian volcanic unit",
        "color": "#5a8569"
      },
      {
        "label": "McAras Brook Formation",
        "color": "#887767"
      },
      {
        "label": "Murphy Brook Formation",
        "color": "#624f46"
      },
      {
        "label": "Fisset Brook Formation",
        "color": "#675948"
      },
      {
        "label": "Liscomb Complex: Paragneiss",
        "color": "#fdd4fc"
      },
      {
        "label": "Liscomb Complex: Orthogneiss",
        "color": "#fdb8fb"
      },
      {
        "label": "McAdam Lake Formation",
        "color": "#887767"
      },
      {
        "label": "Portapique River Formation",
        "color": "#a9966e"
      },
      {
        "label": "Torbrook Formation",
        "color": "#6a5241"
      },
      {
        "label": "Knoydart Formation",
        "color": "#785918"
      },
      {
        "label": "Knoydart and Stonehouse Formations",
        "color": "#775918"
      },
      {
        "label": "Beechhill Cove, Ross Brook, French River, McAdam, Moydart and Stonehouse Formations",
        "color": "#798d89"
      },
      {
        "label": "Bears Brook Formation",
        "color": "#65a98e"
      },
      {
        "label": "Clyburn Brook Formation",
        "color": "#c2dfd3"
      },
      {
        "label": "Wilson Brook Formation",
        "color": "#c1cdca"
      },
      {
        "label": "Earltown Formation",
        "color": "#9ca9a9"
      },
      {
        "label": "Unnamed unit",
        "color": "#65a98e"
      },
      {
        "label": "New Canaan Formation",
        "color": "#75d272"
      },
      {
        "label": "Kentville Formation",
        "color": "#52796e"
      },
      {
        "label": "White Rock Formation, primarily nearshore marine",
        "color": "#fdd433"
      },
      {
        "label": "White Rock Formation, lavas and volcaniclastic rocks",
        "color": "#93b6aa"
      },
      {
        "label": "Sarach Brook Metamorphic Suite",
        "color": "#82bda5"
      },
      {
        "label": "Jumping Brook Metamorphic Suite, undivided",
        "color": "#61ab8d"
      },
      {
        "label": "Jumping Brook Metamorphic Suite, metamorphosed siltstone, minor rhyolite",
        "color": "#61ab8d"
      },
      {
        "label": "Jumping Brook Metamorphic Suite, metamorphosed basalt",
        "color": "#61ab8d"
      },
      {
        "label": "Money Point Group, undivided",
        "color": "#429a77"
      },
      {
        "label": "Money Point Group, metavolcanic rocks",
        "color": "#429a77"
      },
      {
        "label": "Money Point Group, metasedimentary rocks",
        "color": "#429a77"
      },
      {
        "label": "Cheticamp Lake Gneiss",
        "color": "#a1cdba"
      },
      {
        "label": "Mabou Highlands Metamorphic Suite",
        "color": "#fcd7fd"
      },
      {
        "label": "Middle River Metamorphic Complex",
        "color": "#fcb0fd"
      },
      {
        "label": "Cape North Group",
        "color": "#fc8bfd"
      },
      {
        "label": "unnamed Proterozic - Devonian metamorphic unit",
        "color": "#fb65fd"
      },
      {
        "label": "McLeod Brook Formation",
        "color": "#788695"
      },
      {
        "label": "Halifax Formation",
        "color": "#669787"
      },
      {
        "label": "Green Bay Formation",
        "color": "#fdc998"
      },
      {
        "label": "Goldenville Formation",
        "color": "#fdac65"
      },
      {
        "label": "Black John, Little Hollow and Ferrona Formations",
        "color": "#f0a352"
      },
      {
        "label": "Gregwa, Dugald and Eskasoni Formations",
        "color": "#7e6060"
      },
      {
        "label": "MacNeil Formation",
        "color": "#adadad"
      },
      {
        "label": "MacMullin Formation",
        "color": "#5a4545"
      },
      {
        "label": "MacLean Brook Formation",
        "color": "#9aae65"
      },
      {
        "label": "Trout Brook Formation",
        "color": "#d4e39e"
      },
      {
        "label": "Malignant Cove and Arbuckle Brook Formations",
        "color": "#66a7e1"
      },
      {
        "label": "MacCodrum and Canoe Brook Formations",
        "color": "#7e6f62"
      },
      {
        "label": "Morrison River, Sgadan and Bengal Road Formations",
        "color": "#fba137"
      },
      {
        "label": "Kelvin Glen Formation",
        "color": "#4899e1"
      },
      {
        "label": "Main-A-Dieu Group",
        "color": "#7bb1e1"
      },
      {
        "label": "Price Point Formation",
        "color": "#d8fdb0"
      },
      {
        "label": "Fourchu Group",
        "color": "#a8fd4c"
      },
      {
        "label": "Great Village River Gneiss",
        "color": "#c9eec7"
      },
      {
        "label": "Gamble Brook Formation",
        "color": "#5bca57"
      },
      {
        "label": "Folly River Formation",
        "color": "#92dc8f"
      },
      {
        "label": "Cranberry Lake, Humming Brook and Gilbert Hills Formations",
        "color": "#92dc8f"
      },
      {
        "label": "Dalhousie Mountain Volcanics",
        "color": "#92dc8f"
      },
      {
        "label": "Warwick Mountain Formation",
        "color": "#92dc8f"
      },
      {
        "label": "Georgeville Group",
        "color": "#619a28"
      },
      {
        "label": "South Rights Formation",
        "color": "#6c973c"
      },
      {
        "label": "Clydesdale Formation",
        "color": "#b4fd65"
      },
      {
        "label": "James River Formation",
        "color": "#d1fda5"
      },
      {
        "label": "Maple Ridge Formation",
        "color": "#b4fd65"
      },
      {
        "label": "Keppock Formation",
        "color": "#487912"
      },
      {
        "label": "Livingstone Cove Formation",
        "color": "#b4fd65"
      },
      {
        "label": "Morar Brook Formation",
        "color": "#d1fda2"
      },
      {
        "label": "Chisholm Brook Formation",
        "color": "#b4fd65"
      },
      {
        "label": "Pringle Mountain Group",
        "color": "#c9eec7"
      },
      {
        "label": "East Bay Hills Group",
        "color": "#92dc8f"
      },
      {
        "label": "Coxheath Hills Group",
        "color": "#5bca57"
      },
      {
        "label": "George River Metamorphic Suite: undivided",
        "color": "#75ac73"
      },
      {
        "label": "George River Metamorphic Suite: low-medium metamorphic grad schists",
        "color": "#75ac73"
      },
      {
        "label": "George River Metamorphic Suite: metaconglomerate, quartzite",
        "color": "#75ac73"
      },
      {
        "label": "George River Metamorphic Suite: calcsilicate rock, moarble",
        "color": "#537e54"
      },
      {
        "label": "George River Metamorphic Suite: flows and tuff",
        "color": "#75ac73"
      },
      {
        "label": "McMillan Flowage Formation: low - med. metamorphic grade schists",
        "color": "#75ac73"
      },
      {
        "label": "McMillan Flowage Formation: intercalated with marble",
        "color": "#537e54"
      },
      {
        "label": "Kellys Mountain Gneiss, Lime Hill Gneissic Complex and Skye Mountain Metamorphic Suite",
        "color": "#abcdaa"
      },
      {
        "label": "Stirling Group",
        "color": "#fdc900"
      },
      {
        "label": "Mount Thom Complex",
        "color": "#d5b0fd"
      },
      {
        "label": "Blair River Complex",
        "color": "#e4cffd"
      },
      {
        "label": "Carboniferous granite",
        "color": "#fd6a6a"
      },
      {
        "label": "Carboniferous gabbro",
        "color": "#fde3e3"
      },
      {
        "label": "Late Carboniferous monzogranite",
        "color": "#fd9afb"
      },
      {
        "label": "Devonian - Carboniferous granite: Cape Breton Island",
        "color": "#fd6565"
      },
      {
        "label": "Devonian - Carboniferous diorite - gabbro",
        "color": "#fc8888"
      },
      {
        "label": "Devonian - Carboniferous gabbro: northern mainland",
        "color": "#fce2e2"
      },
      {
        "label": "Devonian - Carboniferous granite: northern mainland",
        "color": "#fd6565"
      },
      {
        "label": "Devonian - Carboniferous diorite",
        "color": "#fca6a6"
      },
      {
        "label": "Devonian - Carboniferous gabbro: Cape Breton Island",
        "color": "#fce2e2"
      },
      {
        "label": "Late Devonian granite",
        "color": "#fc6a6a"
      },
      {
        "label": "Devonian - Early Carboniferous granite",
        "color": "#fd6565"
      },
      {
        "label": "Devonian - Early Carboniferous diorite",
        "color": "#fca6a6"
      },
      {
        "label": "Middle - Late Devonian granite",
        "color": "#fc6a6a"
      },
      {
        "label": "Middle - Late Devonian diorite - gabbro",
        "color": "#fc9f9f"
      },
      {
        "label": "Middle - Late Devonian diorite",
        "color": "#fd8383"
      },
      {
        "label": "Middle - Late Devonian tonalite",
        "color": "#f96b6b"
      },
      {
        "label": "Middle - Late Devonian granodiorite",
        "color": "#fd5959"
      },
      {
        "label": "Middle - Late Devonian monzogranite",
        "color": "#fcbfbf"
      },
      {
        "label": "Middle - Late Devonian biotite monzogranite",
        "color": "#fca1a1"
      },
      {
        "label": "Middle - Late Devonian muscovite biotite monzogranite",
        "color": "#fc8282"
      },
      {
        "label": "Middle - Late Devonian leucomonzogranite",
        "color": "#fcd8d8"
      },
      {
        "label": "Middle - Late Devonian fine grained leucomonzogranite",
        "color": "#cea0fd"
      },
      {
        "label": "Middle - Late Devonian muscovite leucomonzogranite",
        "color": "#fdc0c0"
      },
      {
        "label": "Middle - Late Devonian granitoid",
        "color": "#fca1a1"
      },
      {
        "label": "Middle Devonian granite",
        "color": "#fc6a6a"
      },
      {
        "label": "Early Devonian orthogneiss",
        "color": "#fc4b4b"
      },
      {
        "label": "Early Devonian granite",
        "color": "#fc6a6a"
      },
      {
        "label": "Early Devonian granodiorite",
        "color": "#fb8888"
      },
      {
        "label": "Late Silurian granite",
        "color": "#fc6a6a"
      },
      {
        "label": "Silurian - Devonian orthogneiss",
        "color": "#fb4b4b"
      },
      {
        "label": "Silurian - Devonian granite",
        "color": "#fc6a6a"
      },
      {
        "label": "Silurian - Devonian diorite",
        "color": "#fba5a5"
      },
      {
        "label": "Silurian - Devonian gabbro",
        "color": "#fce2e2"
      },
      {
        "label": "Ordovician - Silurian orthogneiss",
        "color": "#fc4b4b"
      },
      {
        "label": "Ordovician - Silurian diorite",
        "color": "#fca6a6"
      },
      {
        "label": "Ordovician - Silurian granite",
        "color": "#fc6565"
      },
      {
        "label": "Proterozoic - Devonian amphibolite",
        "color": "#fcb0b0"
      },
      {
        "label": "Middle Ordovician granite",
        "color": "#fd77fa"
      },
      {
        "label": "Proterozoic - Devonian orthogneiss",
        "color": "#fc4b4b"
      },
      {
        "label": "Proterozoic - Devonian granite",
        "color": "#fc6a6a"
      },
      {
        "label": "Proterozoic - Devonian granodiorite",
        "color": "#fc8888"
      },
      {
        "label": "Proterozoic - Devonian tonalite",
        "color": "#fcc4c4"
      },
      {
        "label": "Proterozoic - Devonian gabbro",
        "color": "#fce2e2"
      },
      {
        "label": "Early Ordovician granite",
        "color": "#fc6a6a"
      },
      {
        "label": "Cambrian - Ordovician granite",
        "color": "#fc6a6a"
      },
      {
        "label": "Cambrian - Ordovician diorite",
        "color": "#fca6a6"
      },
      {
        "label": "Neoproterozoic - Cambrian granitoid",
        "color": "#fcc4c4"
      },
      {
        "label": "Neoproterozoic granitoid",
        "color": "#fcc4c4"
      },
      {
        "label": "Neoproterozoic granite",
        "color": "#fc6565"
      },
      {
        "label": "Neoproterozoic granodiorite",
        "color": "#fc8a8a"
      },
      {
        "label": "Neoproterozoic diorite: Cape Breton Island",
        "color": "#fca6a6"
      },
      {
        "label": "Neoproterozoic tonalite",
        "color": "#fcc4c4"
      },
      {
        "label": "Neoproterozoic diorite: northern mainland",
        "color": "#fca6a6"
      },
      {
        "label": "Neoproterozoic diorite - gabbro",
        "color": "#fc8a8a"
      },
      {
        "label": "Economy River Gneiss",
        "color": "#fdd94c"
      },
      {
        "label": "Neoproterozoic diorite - gabbro",
        "color": "#c593fd"
      },
      {
        "label": "Mesoproterozoic anorthosite",
        "color": "#b67cfd"
      },
      {
        "label": "Mesoproterozoic syenite",
        "color": "#d5b0fd"
      }
    ]
  },
  {
    "id": "surficial-geology",
    "name": "Surficial geology",
    "category": "geology-resources",
    "serviceUrl": "https://fletcher.novascotia.ca/arcgis/rest/services/surficial/Surficial_Geology_Units/MapServer",
    "sourceUrl": "https://data.novascotia.ca/d/iphz-pgr7",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "licence": "province-open",
    "sourceDate": "Stea, Conley and Brown, 1992; digital version 2, 2006. Service checked 7 September 2026.",
    "scale": "1:500,000 regional mapping; displayed boundaries are not geotechnical measurements.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "Surface deposits and geological units do not determine foundation suitability, soil depth, a wetland boundary or groundwater yield.",
    "minZoom": 8,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 172,
    "exportOptions": {
      "transparent": true,
      "layers": "show:16"
    },
    "legend": [
      {
        "label": "Organi Deposits",
        "color": "#9c9c9c"
      },
      {
        "label": "Colluvial Deposits",
        "color": "#a06332"
      },
      {
        "label": "Alluvial Deposits",
        "color": "#fef8c2"
      },
      {
        "label": "Marine Deposits",
        "color": "#c2fbfe"
      },
      {
        "label": "Glaciolacustrine Deposits",
        "color": "#c7c2fe"
      },
      {
        "label": "Glaciomarine Deposits",
        "color": "#00dafe"
      },
      {
        "label": "Glaciofluvial Deposits (Outwash Fans)",
        "color": "#fec6ad"
      },
      {
        "label": "Glaciofluvial Deposits (Kames and Eskers)",
        "color": "#fea700"
      },
      {
        "label": "Hummocky Ground Morraine",
        "color": "#b4fe00"
      },
      {
        "label": "Stony Till Plain (Ground Moraine)",
        "color": "#a7fea4"
      },
      {
        "label": "Stony Drumlin (Drumlin Facies)",
        "color": "#91ad2f"
      },
      {
        "label": "Silty Till  Plain (Ground Moraine)",
        "color": "#03fe00"
      },
      {
        "label": "Silty Drumlin (Drumlin Facies)",
        "color": "#016300"
      },
      {
        "label": "Residuum",
        "color": "#fec2c2"
      },
      {
        "label": "Bedrock",
        "color": "#fb00fe"
      },
      {
        "label": "Lakes",
        "color": "#ffffff"
      }
    ]
  },
  {
    "id": "aggregate-deposits",
    "name": "Mapped aggregate deposits",
    "category": "geology-resources",
    "serviceUrl": "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/all_aggregate/MapServer",
    "sourceUrl": "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/all_aggregate/MapServer",
    "licenceUrl": "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf",
    "licence": "province-restricted",
    "sourceDate": "Publisher-managed live service; checked 7 September 2026. Individual feature dates vary.",
    "scale": "Publisher displays at 1:500,000 and closer; regional compilation.",
    "coverage": "Mapped sand and gravel deposits from d145cb, d189 and d146ml source products.",
    "webCaveat": "Recorded deposits are not resource estimates, reserves, market valuations, extraction permits or evidence of ownership. Source surveys differ in date and coverage.",
    "minZoom": 11,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 180,
    "exportOptions": {
      "transparent": true,
      "layers": "show:10,11,12"
    },
    "legend": [
      {
        "label": "Deposits (d145cbdp)"
      },
      {
        "label": "Deposits (d189dp)"
      },
      {
        "label": "Deposits (d146mldp)"
      }
    ]
  },
  {
    "id": "aggregate-pits-quarries",
    "name": "Recorded aggregate pits and quarries",
    "category": "geology-resources",
    "serviceUrl": "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/all_aggregate/MapServer",
    "sourceUrl": "https://fletcher.novascotia.ca/arcgis/rest/services/mrlu/all_aggregate/MapServer",
    "licenceUrl": "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf",
    "licence": "province-restricted",
    "sourceDate": "Publisher-managed live service; checked 7 September 2026. Individual feature dates vary.",
    "scale": "Publisher displays at 1:500,000 and closer; locations are approximate.",
    "coverage": "Recorded pits and quarries from d145cb, d189 and d146ml source products.",
    "webCaveat": "A mapped pit or quarry is a dated inventory record, not proof of current operation, accessibility, licensing or available material.",
    "minZoom": 11,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 245,
    "exportOptions": {
      "transparent": true,
      "layers": "show:2,3,4,6,7,8"
    },
    "legend": [
      {
        "label": "Quarries (d145cbqu)"
      },
      {
        "label": "Quarries (d189qu)"
      },
      {
        "label": "Quarries (d146mlqu)"
      },
      {
        "label": "Pits (d145cbpt)"
      },
      {
        "label": "Pits (d189pt)"
      },
      {
        "label": "Pits (d146mlpt)"
      }
    ]
  },
  {
    "id": "karst-risk",
    "name": "Karst risk",
    "category": "environment-hazards",
    "serviceUrl": "https://services.arcgis.com/TS1HHBYLM10d1SZH/ArcGIS/rest/services/geol_hz_KarstRisk_z494nskp_sp25_FT_UT83/FeatureServer/0",
    "sourceUrl": "https://data.novascotia.ca/d/wyyw-is9b",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "licence": "province-open",
    "sourceDate": "DP ME 494, version 1, 2019; checked 7 September 2026.",
    "scale": "Regional susceptibility zones derived from geological maps, known occurrences and lidar.",
    "coverage": "Nova Scotia within the publisher’s mapped coverage; blank areas are not proof of absence.",
    "webCaveat": "High, medium and low are relative susceptibility classes, not a collapse probability or a site safety assessment. Sinkholes can occur in low-risk areas.",
    "minZoom": 10,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 180,
    "exportOptions": {
      "transparent": true
    },
    "legend": [
      {
        "label": "High Risk",
        "color": "#799bba"
      },
      {
        "label": "Medium Risk",
        "color": "#b0ceeb"
      },
      {
        "label": "Low Risk",
        "color": "#ebffff"
      }
    ],
    "delivery": "feature-query",
    "idField": "OBJECTID",
    "outFields": [
      "OBJECTID",
      "rank_1"
    ],
    "featureRenderer": {
      "styles": {
        "High Risk": {
          "color": "#799bba",
          "fillColor": "#799bba",
          "fillOpacity": 0.5,
          "weight": 0,
          "radius": 5
        },
        "Medium Risk": {
          "color": "#b0ceeb",
          "fillColor": "#b0ceeb",
          "fillOpacity": 0.5,
          "weight": 0,
          "radius": 5
        },
        "Low Risk": {
          "color": "#ebffff",
          "fillColor": "#ebffff",
          "fillOpacity": 0.5,
          "weight": 0,
          "radius": 5
        }
      },
      "defaultStyle": {
        "color": "#737373",
        "fillColor": "#737373",
        "fillOpacity": 0.35,
        "weight": 1,
        "radius": 5
      },
      "field": "rank_1"
    }
  },
  {
    "id": "karst-occurrences",
    "name": "Known karst occurrences",
    "category": "environment-hazards",
    "serviceUrl": "https://services.arcgis.com/TS1HHBYLM10d1SZH/ArcGIS/rest/services/geol_hz_KarstRiskOccs_z494ns_FT_UT83/FeatureServer/0",
    "sourceUrl": "https://novascotia.ca/natr/meb/download/dp494.asp",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "licence": "province-open",
    "sourceDate": "DP ME 494 occurrence inventory, 2019; service checked 7 September 2026.",
    "scale": "Recorded feature locations; source precision varies.",
    "coverage": "Reported sinkholes, karst topography and springs; incomplete occurrence inventory.",
    "webCaveat": "A record is not a complete field inventory. Publisher class “Recent Sinkholes - Within 10 years” is a source-era label, not a rolling calculation from today. Point symbols are simplified for this map.",
    "minZoom": 12,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 245,
    "exportOptions": {
      "transparent": true
    },
    "legend": [
      {
        "label": "Sinkhole Occurrence",
        "color": "#242424"
      },
      {
        "label": "Recent Sinkholes - Within 10 years",
        "color": "#bd2828"
      }
    ],
    "delivery": "feature-query",
    "idField": "OBJECTID",
    "outFields": [
      "OBJECTID",
      "plot_code",
      "gcode_desc",
      "stati_id"
    ],
    "featureRenderer": {
      "styles": {
        "KARST": {
          "color": "#242424",
          "fillColor": "#242424",
          "fillOpacity": 0.5,
          "weight": 1,
          "radius": 5
        },
        "KARST_RECENT": {
          "color": "#bd2828",
          "fillColor": "#bd2828",
          "fillOpacity": 0.5,
          "weight": 1,
          "radius": 5
        }
      },
      "defaultStyle": {
        "color": "#737373",
        "fillColor": "#737373",
        "fillOpacity": 0.35,
        "weight": 1,
        "radius": 5
      },
      "field": "plot_code"
    }
  },
  {
    "id": "seawater-intrusion-vulnerability",
    "name": "Seawater intrusion vulnerability",
    "category": "environment-hazards",
    "serviceUrl": "https://services.arcgis.com/TS1HHBYLM10d1SZH/ArcGIS/rest/services/hg_seawater_intrusion_vulnerability_h483ns_UT83/FeatureServer/0",
    "sourceUrl": "https://data.novascotia.ca/d/4azn-g8mi",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "licence": "province-open",
    "sourceDate": "DP ME 483, version 1, 2013; checked 7 September 2026.",
    "scale": "Broad regional GIS evaluation.",
    "coverage": "Unserviced coastal bedrock aquifers evaluated by the 2013 model; other areas may be not evaluated.",
    "webCaveat": "Relative vulnerability is not measured salinity or a prediction for a particular well. Only testing can establish actual water quality. “Not Evaluated” is distinct from Low and missing coverage.",
    "minZoom": 10,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 180,
    "exportOptions": {
      "transparent": true
    },
    "legend": [
      {
        "label": "High",
        "color": "#730000"
      },
      {
        "label": "Medium",
        "color": "#ffaa00"
      },
      {
        "label": "Low",
        "color": "#ffff73"
      },
      {
        "label": "Not Evaluated",
        "color": "#cccccc"
      }
    ],
    "delivery": "feature-query",
    "idField": "OBJECTID",
    "outFields": [
      "OBJECTID",
      "swi_eval"
    ],
    "featureRenderer": {
      "styles": {
        "High": {
          "color": "#730000",
          "fillColor": "#730000",
          "fillOpacity": 0.5,
          "weight": 1,
          "radius": 5
        },
        "Medium": {
          "color": "#ffaa00",
          "fillColor": "#ffaa00",
          "fillOpacity": 0.5,
          "weight": 1,
          "radius": 5
        },
        "Low": {
          "color": "#ffff73",
          "fillColor": "#ffff73",
          "fillOpacity": 0.5,
          "weight": 1,
          "radius": 5
        },
        "unknown": {
          "color": "#cccccc",
          "fillColor": "#cccccc",
          "fillOpacity": 0.5,
          "weight": 1,
          "radius": 5
        }
      },
      "defaultStyle": {
        "color": "#737373",
        "fillColor": "#737373",
        "fillOpacity": 0.35,
        "weight": 1,
        "radius": 5
      },
      "field": "swi_eval"
    }
  },
  {
    "id": "historical-coal-workings",
    "name": "Historical coal workings",
    "category": "historical-maps",
    "serviceUrl": "https://services.arcgis.com/TS1HHBYLM10d1SZH/ArcGIS/rest/services/Coal_Workings_n120ns_ut83/FeatureServer/0",
    "sourceUrl": "https://novascotia.ca/natr/meb/hazard-assessment/historic-coal-mine-workings.asp",
    "licenceUrl": "https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf",
    "licence": "province-restricted",
    "sourceDate": "Historical mine plans, n120ns compilation; individual record dates vary. Service checked 7 September 2026.",
    "scale": "Vertical projections of mapped underground workings onto the surface; plan accuracy varies.",
    "coverage": "Documented historic coal-producing areas only; undocumented workings may be absent.",
    "webCaveat": "Surface projections do not show depth, seam levels, opening size or current ground condition. Undocumented workings may exist. This display simplifies the source hatch to a translucent fill; consult original plans for detailed assessment.",
    "minZoom": 11,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 190,
    "exportOptions": {
      "transparent": true
    },
    "legend": [
      {
        "label": "Historic underground coal workings (surface projection)",
        "color": "#686868"
      }
    ],
    "delivery": "feature-query",
    "idField": "OBJECTID",
    "outFields": [
      "OBJECTID",
      "Name",
      "Coal_Area",
      "County",
      "VERSION"
    ],
    "featureRenderer": {
      "styles": {},
      "defaultStyle": {
        "color": "#828282",
        "fillColor": "#686868",
        "fillOpacity": 0.35,
        "weight": 2
      }
    }
  },
  {
    "id": "radon-potential",
    "name": "Radon potential",
    "category": "environment-hazards",
    "serviceUrl": `${import.meta.env.BASE_URL}data/radon-potential.png`,
    "sourceUrl": "https://data.novascotia.ca/d/tk49-rtq2",
    "licenceUrl": "https://novascotia.ca/opendata/licence.asp",
    "licence": "province-open",
    "sourceDate": "DP ME 486, version 1, 2013; official source archive verified 7 September 2026.",
    "scale": "Regional 250-metre source raster. Reprojected with nearest-neighbour sampling; magnification adds no precision.",
    "coverage": "Published Nova Scotia source raster; water/no-data cells are grey and outside-coverage cells transparent.",
    "webCaveat": "Relative potential for radon in indoor air is not a reading for a home. Only a radon test can determine actual indoor conditions. Display is a project-derived reprojection of the official 2013 source; original source classes are preserved.",
    "minZoom": 7,
    "maxZoom": 23,
    "opacity": 0.5,
    "zIndex": 180,
    "exportOptions": {
      "transparent": true
    },
    "delivery": "static-image",
    "imageBounds": [
      [
        43.324810556275615,
        -66.65938281080358
      ],
      [
        47.12280911317586,
        -59.48768274003538
      ]
    ],
    "legend": [
      {
        "label": "High",
        "color": "#6b0601"
      },
      {
        "label": "Medium",
        "color": "#c46d1b"
      },
      {
        "label": "Low",
        "color": "#f7c348"
      },
      {
        "label": "Water Feature/No Data",
        "color": "#cccccc"
      }
    ]
  }
] as const satisfies readonly ContextLayerDescriptor[];

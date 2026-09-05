# Judique inland extension and source-symbol review

This second batch adds **41 printed annotations**, bringing the two batches to **70**. Counts include repeated names and a tentative separation of nearby Quartz Mill / Falls lettering. These are research transcriptions, not 70 independently established sites.

The new core region is **[5600, 1000, 3100, 2700]** in original 10815 × 7549 pixels, adjoining the Judique village pilot and extending east toward the River Denys Road lettering. Three extra context windows finish edge labels; they do not constitute a complete inventory of those windows.

[Inventory](judique-inland.json) · [Source-symbol associations](judique-source-associations.json) · [Native source receipt](sheet-19-native-source-2026-09-05.json)

## Source quality and the related work

The separate **Georeference Fletcher map sheet** task produced a native mosaic from 40 regional IIIF JPEGs after finding that a whole-sheet request could return enlarged, soft imagery at the expected dimensions. This batch uses that unwarped mosaic. Every decoded regional JPEG was checked against its PNG region, with no overlaps or uncovered pixels. The receipt records the mosaic and component hashes and equivalent regional source URLs. The parts were verified locally, not independently downloaded again.

This adopts the source-quality finding, not the experimental matcher’s geographic placements. Our labels and source-symbol associations are not georeferencing controls, withheld evaluation evidence, or a validation of that task’s colour/structure extraction. Do not feed this inventory into its fixed evaluation windows and continue describing that evaluation as independent.

The first batch keeps its own regional JPEG provenance. The native mosaic is a separately identified source artifact; its checksum does not replace or retroactively verify the older scan checksum. Raw imagery and generated review crops remain outside Git.

## Eight source-symbol reviews

Four labels now have a supported **visual association with a printed symbol**. Four remain unresolved. The selected pixel is an approximate mark centre, not a footprint or modern coordinate. No geographic location has been assigned.

| Existing ID / label | Source review | Original pixel / candidate area | Basis |
| --- | --- | --- | --- |
| [F19-JUD-004 — School](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3910,1232,325,240/325,240/0/default.jpg) | supported-source-association | [4022, 1338] | The single compact black building mark immediately above-left of School, below the road. |
| [F19-JUD-005 — Forge](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3890,1435,295,243/295,243/0/default.jpg) | supported-source-association | [3986, 1567] | The isolated building mark directly left of Forge, south of the stream; other buildings lie north of that stream. |
| [F19-JUD-006 — Sh. Mill](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4115,1427,340,247/340,247/0/default.jpg) | unresolved | [[4387, 1537, 30, 38], [4316, 1588, 37, 19]] (xywh) | Several nearby building marks lie on opposite sides of the curved road/stream. No unique Sh. Mill mark selected. |
| [F19-JUD-008 — Stage / Stables](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3665,1727,313,250/313,250/0/default.jpg) | supported-source-association | [3873, 1854] | The isolated building mark immediately right of Stage Stables, west of the main road. This is a symbol association, not a footprint. |
| [F19-JUD-009 — Shop](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3795,1740,288,234/288,234/0/default.jpg) | unresolved | [[3890, 1870, 26, 38]] (xywh) | Three closely spaced building marks beside Shop and P.O.; proximity alone does not establish which label belongs to which mark. |
| [F19-JUD-010 — P.O.](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3795,1769,280,234/280,234/0/default.jpg) | unresolved | [[3890, 1870, 26, 38]] (xywh) | Shares the same candidate group as Shop. No assertion of shared or separate premises. |
| [F19-JUD-015 — R.C. Church](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3590,2370,370,249/370,249/0/default.jpg) | supported-source-association | [3701, 2537] | Distinct cross-like church symbol below the R.C. Church lettering beside the stream and coastal road. |
| [F19-JUD-021 — Mill](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4233,2683,283,239/283,239/0/default.jpg) | unresolved | [[4430, 2790, 25, 26]] (xywh) | Small group of building marks between road and brook, just right of Mill. No individual mark selected. |

## New transcriptions

Original wording is kept separate from search typography. Generic names stay separate, and abbreviations are not expanded. Every entry is unlocated; modern naming and geometry have not yet been checked for this batch.

| ID | Wording | Type | Reading / interpretation |
| --- | --- | --- | --- |
| [F19-JUD-030](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6270,1130,365,225/full/0/default.jpg) | A. MᶜIsaac | person-label | clear: Name beside several buildings on the northern road; no person or property identity inferred. |
| [F19-JUD-031](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/5815,1265,475,810/full/0/default.jpg) | Barrens | landscape-annotation | clear: Spaced lettering beside a road. This is a landscape annotation, not an established road name or mapped land-cover boundary. |
| [F19-JUD-032](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7070,1273,435,223/full/0/default.jpg) | Don. MᶜEachern | person-label | clear: Abbreviated given name retained; beside a short side road. |
| [F19-JUD-033](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7340,1765,475,227/full/0/default.jpg) | Squire MᶜDonald | person-label | clear: Title and surname beside a cluster east of the road. |
| [F19-JUD-034](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8248,1183,287,220/full/0/default.jpg) | Fall 30 | waterfall-annotation | tentative: No trailing unit mark confidently resolved. Preserve the numerals without supplying a unit or modern measured height. |
| [F19-JUD-035](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8350,1276,275,223/full/0/default.jpg) | Falls | waterfall-annotation | clear: Northern tributary, south of the Fall 30 annotation. |
| [F19-JUD-036](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7668,1720,285,224/full/0/default.jpg) | Falls | waterfall-annotation | clear: Stream east of Squire MᶜDonald; separate from the other Falls annotations. |
| [F19-JUD-037](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6143,2276,590,489/full/0/default.jpg) | River Inhabitants Road | road-name | clear: Three-part lettering follows the curved north-south road; not a river-name annotation. |
| [F19-JUD-038](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/5884,2405,526,630/full/0/default.jpg) | Southwest Mabou River | watercourse | clear: Western instance of this river name. Separate annotation from F19-JUD-039; connection and modern identity need tracing. |
| [F19-JUD-039](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6681,1860,542,925/full/0/default.jpg) | Southwest Mabou River | watercourse | clear: Eastern instance, partly along a vertical graticule. Do not infer two independent rivers from two printed names. |
| [F19-JUD-040](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7304,2470,422,249/full/0/default.jpg) | Brook runs / underground | hydrology-annotation | clear: Printed observation beside a brook/road crossing; no present-day underground flow or site condition inferred. |
| [F19-JUD-041](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8048,1914,271,216/full/0/default.jpg) | Falls | waterfall-annotation | clear: Upper of three fall annotations on the north-south stream above Iron Ore. |
| [F19-JUD-042](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8080,1975,262,218/full/0/default.jpg) | Fall | waterfall-annotation | clear: Middle of the three north-south stream annotations. |
| [F19-JUD-043](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8207,2015,276,218/full/0/default.jpg) | Falls | waterfall-annotation | clear: Lower of the three north-south stream annotations. |
| [F19-JUD-044](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7911,2114,259,217/full/0/default.jpg) | Fall | waterfall-annotation | clear: West of the Iron Ore annotation, near a geological hatch crossing. |
| [F19-JUD-045](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8170,2120,306,226/full/0/default.jpg) | Iron Ore | mineral-annotation | clear: Mineral wording only; does not establish a mine, deposit extent, grade or current resource. |
| [F19-JUD-046](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8344,2102,490,226/full/0/default.jpg) | Colin Chisholm's Mill | mill | clear: Label extends east of the core review region; context inspected through x=9120. No mill type or modern site established. |
| [F19-JUD-047](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7745,2224,449,429/full/0/default.jpg) | Diogenes Brook | watercourse | clear: Diagonal upstream lettering. Same printed name occurs farther east as F19-JUD-064; geometry continuity not yet traced. |
| [F19-JUD-048](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7570,2661,243,214/full/0/default.jpg) | P.O. | post-office | clear: Post-office abbreviation north of the River Denys Road place lettering; nearby multiple building marks remain unresolved. |
| [F19-JUD-049](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/5755,3160,510,244/full/0/default.jpg) | Dennistown | settlement | clear: Large place lettering below the road near a school. Modern name identity not yet investigated. |
| [F19-JUD-050](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/5846,3100,271,216/full/0/default.jpg) | School | school | clear: School above Dennistown lettering, close to a small stream crossing. |
| [F19-JUD-051](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/5934,3366,267,218/full/0/default.jpg) | Falls | waterfall-annotation | clear: On the western stream south of Dennistown; no height printed. |
| [F19-JUD-052](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6360,2863,529,289/full/0/default.jpg) | River Denys Road | road-name | clear: Another printed instance of the name in F19-JUD-022, west of the large place lettering. Not a second proven route. |
| [F19-JUD-053](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/5719,3282,634,503/full/0/default.jpg) | Old River Denys Road | road-name | clear: Curved multipart name south of Dennistown; preserve Old separately from the nearby River Denys Road. |
| [F19-JUD-054](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6256,3200,512,550/full/0/default.jpg) | Graham River | watercourse | clear: Inland printed instance of F19-JUD-025; not a new river identity established by transcription. |
| [F19-JUD-055](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7053,2696,349,274/full/0/default.jpg) | Old Road | road-name | clear: Generic historical route annotation on the upper branch near the river crossing. |
| [F19-JUD-056](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7452,2558,260,410/full/0/default.jpg) | West Branch | watercourse | clear: Branch descriptor beside the road and stream north of the church. Parent watercourse identity unresolved. |
| [F19-JUD-057](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7450,2814,271,216/full/0/default.jpg) | School | school | clear: School west of the main north-south road, near Church. |
| [F19-JUD-058](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7546,2787,295,219/full/0/default.jpg) | Church | church | clear: Church beside a cross-like map symbol at the road junction; denomination not printed here. |
| [F19-JUD-059](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7373,2852,733,256/full/0/default.jpg) | River Denys Road | named-place | tentative: Large upright place-style lettering, unlike the smaller italic road lettering. Classification as a named place is provisional; it does not establish a settlement boundary. |
| [F19-JUD-060](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7932,2829,272,215/full/0/default.jpg) | Forge | forge | clear: Forge on a short road spur east of the large place label. |
| [F19-JUD-061](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8222,2751,344,221/full/0/default.jpg) | Gold Mine | mine-annotation | clear: Explicit historical mine label. No claim of operation, present resource, accessibility or exact modern site. |
| [F19-JUD-062](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8424,2781,286,245/full/0/default.jpg) | Quartz / Mill | mill | tentative: Quartz and Mill are legible; nearby Falls lettering overlaps or adjoins the first line. Separation into two annotations is tentative. |
| [F19-JUD-063](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7190,3380,404,220/full/0/default.jpg) | Doug. MᶜDonald | person-label | clear: Abbreviated personal name south of the River Denys Road place lettering; arrow nearby is not treated as a property boundary. |
| [F19-JUD-064](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8551,2216,555,548/full/0/default.jpg) | Diogenes Brook | watercourse | clear: Eastern multipart instance; completed in an edge-context window outside the core region. Separate from the upstream lettering F19-JUD-047. |
| [F19-JUD-065](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7713,3273,365,426/full/0/default.jpg) | West Branch | watercourse | clear: Southern West Branch annotation; parent name not supplied by this label. |
| [F19-JUD-066](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8039,3243,420,388/full/0/default.jpg) | East Branch | watercourse | clear: Southern East Branch annotation; relation to West Branch requires tracing. |
| [F19-JUD-067](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8273,3162,324,461/full/0/default.jpg) | Victoria Road | road-name | clear: Vertical/diagonal multipart lettering next to a road distinct from the railway. |
| [F19-JUD-068](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8383,3520,417,223/full/0/default.jpg) | MᶜLennan's Mill | mill | clear: Personal-name mill label near road and stream crossing. Not a proven association with any modern mill site. |
| [F19-JUD-069](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7908,3554,302,218/full/0/default.jpg) | Fall 25 | waterfall-annotation | tentative: Numerals read 25 after enlargement; no trailing unit mark confidently resolved. Preserve text without supplying a unit. |
| [F19-JUD-070](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8490,2775,295,220/full/0/default.jpg) | Falls | waterfall-annotation | tentative: Small lettering beside Quartz/Mill. This separation is tentative and could be revised on human review. |

## Unresolved and next placement work

- The large upright **River Denys Road** lettering is provisionally treated as a place label; smaller italic instances follow roads. Confirm the place classification before modern matching.
- **Quartz / Mill** and nearby **Falls** are provisionally separated; their crowded lettering needs human review. **Fall 30** and **Fall 25** retain readable numerals without inventing units.
- Widely spaced large lettering across the inland windows remains deferred until its complete wording can be read. Southern edge-context personal-name fragments are outside this batch.
- Trace the original roads and connected streams before comparing modern alignments. Repeated Graham River, River Denys Road, Southwest Mabou River and Diogenes Brook annotations are not proof of independent features.
- Prioritize the Judique church and road/stream crossings for local comparison. Four clear source-symbol associations narrow the source-side question but do not prove modern site continuity.
- The explicit **Gold Mine**, **Iron Ore**, and mill labels need survey-report and geographic corroboration before any site pin or resource interpretation.

## Attribution and checks

David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries. See [collection terms](https://www.davidrumsey.com/about/copyright-and-permissions), [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/), and the [existing permission record](../../../reports/fletcher/INVENTORY.md). Project transcription and review do not override source-image terms.

All nine source windows and all 41 saved label excerpts were visually inspected. Structural checks cover IDs across both batches, source and context bounds, coverage by declared windows, receipt references, association states, hashes and null historical-site geometry. Source-symbol review is manual and has not been independently corroborated. No renderer, theme, production map layer or georeferencing acceptance changed.

Local Fletcher suite: `python3 -m unittest discover -s tools/fletcher/tests -t .` ran 251 tests, with 249 passing and two skipped because optional benchmark image dependencies were unavailable. Data integrity checks and `git diff --check` passed. These checks do not establish geographic accuracy or deployment.

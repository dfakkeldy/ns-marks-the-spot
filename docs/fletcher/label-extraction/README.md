# Judique: first Fletcher label inventory

**Current progress: 70 printed annotations across two batches.** The [inland extension and source-symbol review](judique-inland-review.md) adds 41 annotations, uses the related georeferencing task's native regional-source mosaic, and reviews eight original facility labels. Four have a supported association with a printed symbol; four remain unresolved. These are source-image associations, not modern site coordinates. The first batch below retains its original source provenance.

The [six-crop model pilot](luna-pilot/README.md) compares blind Luna, Terra and Sol extraction against existing annotations. It records raw candidates, errors and source-box defects; none have been imported. The requested Claude Opus 5 comparison is pending account access.

Extracted September 5, 2026 from the original, unwarped 1884 Fletcher sheet 19. This is a research inventory for review, not a production map layer.

**29 separate annotations:** 3 schools, 2 forges, 2 mills, 4 shops, a post office, stables, a church, 5 personal-name annotations, 2 settlement/place names, 2 named brooks/rivers, 2 road names, 2 points, a barytes annotation and a quarry annotation. These count printed annotations, not independently established buildings or sites.

## What is ready

- Original wording and separate search typography for each annotation. One abbreviated given name remains a tentative reading.
- Manually inspected source-pixel rectangles and a direct source-context link for every entry. Multi-part road and river lettering retains separate rectangles.
- Five supported name/record matches and one additional watercourse candidate. A misleading Chisholm Brook alternative is recorded as rejected.
- No historical building, mill, mine or other site has been assigned a modern coordinate. Gazetteer representative points remain separate reference evidence.

## Scope and sources

The reviewed rectangle is **x=2700, y=1000, width=3100, height=2700** in the original 10815 × 7549 source image. It covers the Judique village district from Mackay Point through Graham River to Campbell Point, including inland labels. Nine overlapping windows were inspected, followed by a separate inspection of all 29 saved label-rectangle excerpts. This is not a complete transcription of sheet 19, all of Judique, or all Fletcher maps.

[Original review region](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/2700,1000,3100,2700/3100,2700/0/default.jpg) · [Rumsey manifest](https://www.davidrumsey.com/luna/servlet/iiif/m/RUMSEY~8~1~2644~290012/manifest) · [Machine-readable inventory](judique-pilot.json) · [Gazetteer evidence](judique-geonames-2026-09-05.json)

Pixel rectangles locate lettering only. The pilot JPEG is separately hash-bound; the prior whole-scan checksum is recorded as inherited lineage, not as a newly verified download. Scans and review images remain outside Git.

Geological unit codes, dip numbers/arrows, circled geological symbols, red report/page references, graticule, marginalia and unlabelled building symbols were excluded from this pilot. The rest of the sheet has not been inventoried. No inference of absence follows from an exclusion or an unreviewed area.

## Name matches

| Fletcher annotation | Present-day record evidence | Status / limit |
| --- | --- | --- |
| Mackay Point | Previously official **Mackay Point** (CAWOP) and official **McKays Point** (CAYJN) have the same feature ID. | Supported name identity; choose the geographic anchor separately. |
| Ben Noah | **Ben Noah** (CACSS) is retained as a **previously official locality**. | Supported historical name record; no currently official replacement established. Do not label it as a mountain. |
| Judique | Official **Judique** (CASLB), in the matching coastal village setting. | Supported settlement-name identity; the official representative point does not define the historical village extent. |
| Rory Chisholm's Brook | **Rory Brook** (CBGJQ), north of Graham River, is a plausible candidate. | Still a candidate: trace the watercourse and investigate the name history. **Chisholm Brook** (CAAAW), farther south, is rejected as a surname-only match. |
| Graham River | Official **Graham River** (CAOBS), matching the coastal sequence. | Supported name identity; trace the modern watercourse before placing the historical lettering. |
| Campbell Point | Official **Campbell Point** (CAFWR), south of Graham River. | Supported name identity; current shoreline anchor remains separate. |

Each ID links to its retrieved source URL in the gazetteer evidence file. Its reported 100 m coordinate accuracy applies to the source representative point, not a radius of uncertainty for a historical mill or building. Gazetteer bounding boxes are not historical feature footprints.

## Transcriptions

Open an excerpt to see the original ink and nearby context. Repeated generic labels deliberately keep separate IDs.

| ID | Original wording | Type | Reading | Context / next check |
| --- | --- | --- | --- | --- |
| [F19-JUD-001](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/2785,1450,560,270/560,270/0/default.jpg) | Mackay Point | cape | clear | Named coastal point west of the settlement. |
| [F19-JUD-002](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3150,1383,350,237/350,237/0/default.jpg) | John Gillis | person-label | clear | Personal name beside buildings on the point; no ownership or resident identity inferred. |
| [F19-JUD-003](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4290,1153,405,247/405,247/0/default.jpg) | MᶜEachern | person-label | clear | Surname beside buildings along the northern east-west road; superscript c retained. |
| [F19-JUD-004](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3910,1232,325,240/325,240/0/default.jpg) | School | school | clear | Northern school, south of the road near a stream crossing. |
| [F19-JUD-005](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3890,1435,295,243/295,243/0/default.jpg) | Forge | forge | clear | Northern forge near the road and stream, west of Sh. Mill. |
| [F19-JUD-006](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4115,1427,340,247/340,247/0/default.jpg) | Sh. Mill | mill | clear | Mill abbreviation is preserved. The expansion and exact building association are not established. |
| [F19-JUD-007](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4500,1690,345,246/345,246/0/default.jpg) | School | school | clear | Eastern school near an angled road junction, northwest of Ben Noah lettering. |
| [F19-JUD-008](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3665,1727,313,250/313,250/0/default.jpg) | Stage / Stables | stables | clear | Two-line label beside the coastal road near Shop and P.O.; site footprint unresolved. |
| [F19-JUD-009](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3795,1740,288,234/288,234/0/default.jpg) | Shop | shop | clear | Shop label immediately above P.O.; these are separate annotations, not two proven buildings. |
| [F19-JUD-010](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3795,1769,280,234/280,234/0/default.jpg) | P.O. | post-office | clear | Abbreviated post-office label below Shop; shared/separate premises not established. |
| [F19-JUD-011](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4185,1836,289,240/289,240/0/default.jpg) | Shop | shop | clear | Shop at the inland road junction east of the coastal stables and post office. |
| [F19-JUD-012](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4800,1825,560,283/560,283/0/default.jpg) | Ben Noah | named-place | clear | Large inland place label. The gazetteer describes the matching historical name as a locality, not a mountain. |
| [F19-JUD-013](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3540,2105,300,246/300,246/0/default.jpg) | Forge | forge | clear | Coastal forge north of the Judique lettering and R.C. Church. |
| [F19-JUD-014](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3710,2136,482,275/482,275/0/default.jpg) | Judique | settlement | clear | Settlement label spanning the coastal-road district; lettering position is not a settlement boundary. |
| [F19-JUD-015](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3590,2370,370,249/370,249/0/default.jpg) | R.C. Church | church | clear | Church label beside the coastal road and stream. Church-site continuity has not been established. |
| [F19-JUD-016](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3620,2430,486,245/486,245/0/default.jpg) | Rev. Archᵈ. Chisholm | person-label | tentative | Abbreviated given name is tentative; elevated d retained. Do not silently expand it or identify a parcel. |
| [F19-JUD-017](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4163,2382,339,248/339,248/0/default.jpg) | Barytes | mineral-annotation | clear | Mineral annotation near dark mapped marks. Does not establish a mine, extraction history, grade or current deposit. |
| [F19-JUD-018](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3510,2470,288,249/288,249/0/default.jpg) | Shop | shop | clear | Shop south of the church, west of the main coastal road. |
| [F19-JUD-019](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4025,2504,314,246/314,246/0/default.jpg) | School | school | clear | School along the diagonal road south of the church district. |
| [F19-JUD-020](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3405,2587,1084,375/1084,375/0/default.jpg) | Rory Chisholm's Brook | watercourse | clear | Name is printed in three separated parts along the brook north of Graham River. |
| [F19-JUD-021](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4233,2683,283,239/283,239/0/default.jpg) | Mill | mill | clear | Mill beside the brook and the diagonal road. Mill type and exact modern site remain unresolved. |
| [F19-JUD-022](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4360,2654,591,297/591,297/0/default.jpg) | River Denys Road | road-name | clear | Historical road name printed along a curved road. No current road segment equivalence asserted. |
| [F19-JUD-023](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4847,2686,429,248/429,248/0/default.jpg) | Rory Chisholm | person-label | clear | Separate personal-name annotation at an inland road junction; not merged with the brook name. |
| [F19-JUD-024](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3617,2892,280,244/280,244/0/default.jpg) | Shop | shop | clear | Shop beside the coastal road just north of Graham River. |
| [F19-JUD-025](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/3780,2905,686,285/686,285/0/default.jpg) | Graham River | watercourse | clear | River name printed in two parts south of the brook and north of Campbell Point. |
| [F19-JUD-026](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4595,2940,500,281/500,281/0/default.jpg) | Quarries of grey / and red sandstone | quarry-annotation | clear | Two-line quarry annotation. Extent, number of workings and present condition are not established. |
| [F19-JUD-027](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4357,3061,771,306/771,306/0/default.jpg) | Old Judique Road | road-name | clear | Three-part name follows a road crossing the Graham River area. Historical alignment is not yet traced. |
| [F19-JUD-028](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/4820,3273,443,247/443,247/0/default.jpg) | Allan MᶜDonald | person-label | clear | Personal name near the southern road/stream crossing; superscript c retained. |
| [F19-JUD-029](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/2950,3210,595,276/595,276/0/default.jpg) | Campbell Point | cape | clear | Named coastal point south of Graham River. |

## Items for local review

1. **Northern school / forge / Sh. Mill cluster:** use the source context and nearby streams/junctions to establish each symbol association before proposing modern sites. The `Sh.` abbreviation is not expanded to sawmill or shingle mill.
2. **Stage Stables, Shop and P.O.:** determine whether labels describe one premises or separate buildings. Do not infer three buildings from three labels.
3. **R.C. Church and the nearby personal-name annotation:** confirm the tentative abbreviation and investigate site continuity. A matching modern church or crossroads alone would not establish an identical footprint.
4. **Rory Chisholm’s Brook and its mill:** trace the candidate Rory Brook and seek naming evidence. The mill label does not become a pin at the gazetteer point.
5. **Old Judique Road / River Denys Road:** trace historical route segments independently of modern names. A current provincial road-name query containing JUDIQUE returned 106 records, all with trail names; it found no exact Old Judique Road name. That is a limited query result, not proof that the route disappeared.
6. **Barytes and sandstone quarries:** preserve the map’s wording and find the relevant survey reports before adding resource interpretations.

## Continue the extraction

Use the original sheet pixel coordinates to join future batches and deduplicate overlapping label rectangles. Extend the region before claiming sheet coverage. Add symbol anchors and modern candidate geometries only with explicit supporting evidence; keep the transcript unchanged when a modern name differs. Record unresolved readings, rejected alternatives and source errors rather than filling gaps.

Claude owns the map theme. This inventory changes no renderer or source layer and introduces no production data interface. Stable annotation IDs, source text, optional search typography and separately reviewed placement can support that later integration without inventing coordinates now.

## Attribution and limits

David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries. Original imagery: [collection terms](https://www.davidrumsey.com/about/copyright-and-permissions) and [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). See the existing [scoped permission record](../../../reports/fletcher/INVENTORY.md). Cropping and transcription are project work. The repository software licence does not replace imagery/source terms.

Modern name evidence is from Natural Resources Canada’s Canadian Geographical Names Database and its naming authorities, retrieved September 5, 2026. Source identifiers, status and decision dates are preserved. The map is screening/research evidence; neither transcription nor name matching establishes current existence, ownership, access, operation or site conditions.

## Verification

- Inspected all nine overlapping source windows and all 29 individual label-rectangle excerpts; corrected the post-office rectangle after noticing a clipped letter.
- Verified the live Rumsey manifest title and 10815 × 7549 source dimensions.
- Verified data integrity: unique IDs, positive source rectangles inside the declared review extent, valid crop URLs, source hashes, gazetteer references and no invented historical site coordinates.
- Compared every saved gazetteer field against the downloaded response, including official/previously-official status and the shared Mackay/McKays feature ID.
- Existing Fletcher pipeline suite: 242 tests passed. Archived browser evidence validator passed; this validates archived files, not current map behaviour.
- This is data/documentation only. No rendered map behaviour, georeferencing acceptance, deployment or full-sheet completeness is claimed.

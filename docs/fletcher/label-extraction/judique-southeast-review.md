# Fletcher sheet 19: Glendale and Kingsville extraction

**40 new source-reviewed annotations; 133 across four batches.** This batch extends southeast from the Judique/Long Point work through Glendale and Kingsville. It includes another printed “Gold Mine,” “Plumbago Mine,” Coal, Red Bridge, Blue Bridge, shops, a forge, mills, a church abbreviation, personal names, watercourses and roads. These are counts of printed annotations, not proven counts of distinct buildings or workings.

[Inventory JSON](judique-southeast.json) · [Candidate and review audit](judique-southeast-workflow/README.md) · [All batches](README.md)

The core is `[5600,3500,3100,2350]` in the original 10815 × 7549 sheet. Six overlapping 1100 × 1250 native crops were reviewed completely, with six additional context windows used only to finish intersecting lettering. The four core rectangles cover a union of **29,100,000 pixels (35.64% of the whole image, including water and blank areas)**. This is not 35.64% of the labels and is not full-sheet completeness. Other lettering visible only in edge context remains for later batches.

The widely spaced C/R/A fragments deferred in the Long Point batch now resolve to **CRAIGNISH** (`F19-JUD-130`). Its wording is clear; its cartographic role remains a broad named-place/landscape label rather than a proven settlement extent. `D. MᶜTaggart` remains a tentative surname. The three-line “Fine outcrops of / black shale full / of fossils” is preserved as descriptive source wording, without a present-day condition claim.

DeepSeek V4 Flash Vision Experimental supplied 69 raw candidates through three isolated OpenCode sessions. Every whole crop, raw candidate excerpt and retained lettering box was visually reviewed. Overlapping fragments map to prior IDs or one completed new annotation. The review corrected `School` to **Shop**, `Mine` to **Mills**, `Poll` to **Coal**, road grouping and several names/boxes. Two out-of-bounds raw rectangles and the eastern worker's incorrect `C01`/`C02` crop IDs remain explicitly recorded; raw outputs were not silently repaired.

All 40 additions remain `unlocated`, with null site geometry and empty gazetteer matches. Label boxes locate ink, not facility footprints. The merged [Judique georeferencing draft](../../../reports/fletcher/visual-expansion/README.md) is separate evidence; this batch neither changes its controls/checks nor treats its warp as proof of an individual site's location.

## Reviewed transcriptions

| ID / source context | Original wording | Type | Reading | Review note |
| --- | --- | --- | --- | --- |
| [F19-JUD-094](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6906,3846,303,166/full/0/default.jpg) | Gold Mine | mine-annotation | clear | Separate printed occurrence from F19-JUD-061; no mine-site identity or location inferred. |
| [F19-JUD-095](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6957,3890,253,471/full/0/default.jpg) | Glendale Brook | watercourse | clear |  |
| [F19-JUD-096](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6485,4173,524,350/full/0/default.jpg) | MᶜPherson's Brook | watercourse | clear | Multipart lettering spans I01 and I02. |
| [F19-JUD-097](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7008,4405,294,164/full/0/default.jpg) | D. MᶜInnes | person-label | clear | Independent source review agrees on McInnes. |
| [F19-JUD-098](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7275,4387,542,189/full/0/default.jpg) | Glendale | named-place | clear |  |
| [F19-JUD-099](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7443,4435,176,161/full/0/default.jpg) | P.O. | post-office | clear | Separate annotation from nearby Shop; shared premises unresolved. |
| [F19-JUD-100](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7389,4469,200,162/full/0/default.jpg) | Shop | shop | clear | The short word south of P.O. reads Shop, not School. |
| [F19-JUD-101](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7379,4529,208,163/full/0/default.jpg) | Mills | mill | clear | Plural wording retained; no count of physical mills inferred. |
| [F19-JUD-102](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7233,4573,232,166/full/0/default.jpg) | R.C.Ch. | church | clear | Abbreviation retained. |
| [F19-JUD-103](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6705,4566,363,169/full/0/default.jpg) | Plumbago Mine | mine-annotation | clear |  |
| [F19-JUD-104](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6908,4319,416,596/full/0/default.jpg) | River Inhabitants Road | road-name | clear | Multipart historical road label; separate from the watercourse wording. |
| [F19-JUD-105](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7630,3735,307,166/full/0/default.jpg) | Don. Smith | person-label | clear | Given-name abbreviation retained. |
| [F19-JUD-106](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7654,3835,304,166/full/0/default.jpg) | D. MᶜTaggart | person-label | tentative | Tentative surname: independent reviewer reads McTaggart; intervening strokes and the ending remain difficult. |
| [F19-JUD-107](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8283,4021,397,164/full/0/default.jpg) | Donald MᶜMaster | person-label | clear |  |
| [F19-JUD-108](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8063,4505,311,161/full/0/default.jpg) | D. Buchanan | person-label | clear |  |
| [F19-JUD-109](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7640,4581,200,165/full/0/default.jpg) | Fall | falls-annotation | clear | Separate from nearby numbered falls labels; no modern flow or height inferred. |
| [F19-JUD-110](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7767,4617,208,164/full/0/default.jpg) | Fall 6 | falls-annotation | clear | Printed number retained without inferred unit. |
| [F19-JUD-111](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7937,4659,226,162/full/0/default.jpg) | Falls 18 | falls-annotation | clear | Printed number retained without inferred unit. |
| [F19-JUD-112](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8376,4703,204,165/full/0/default.jpg) | Coal | mineral-annotation | clear | Mineral wording only; no mine or deposit extent inferred. |
| [F19-JUD-113](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/5851,4811,221,475/full/0/default.jpg) | Rough Brook | watercourse | clear |  |
| [F19-JUD-114](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6139,5212,360,166/full/0/default.jpg) | Mal. MᶜDonald | person-label | clear | Given-name abbreviation retained. |
| [F19-JUD-115](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/6037,5303,433,167/full/0/default.jpg) | Norman MᶜIntyre | person-label | clear |  |
| [F19-JUD-116](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/5778,5515,319,166/full/0/default.jpg) | Nor. MᶜIsaac | person-label | clear | Given-name abbreviation retained. |
| [F19-JUD-117](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7180,4829,288,169/full/0/default.jpg) | Red Bridge | bridge | clear | Historical bridge name only; no present-day structure match. |
| [F19-JUD-118](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7183,5010,204,167/full/0/default.jpg) | Shop | shop | clear | Northern shop on the road below Red Bridge. |
| [F19-JUD-119](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7205,5201,215,165/full/0/default.jpg) | Forge | forge | clear |  |
| [F19-JUD-120](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7177,5317,205,167/full/0/default.jpg) | Shop | shop | clear | Second shop occurrence north of Kingsville. |
| [F19-JUD-121](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7389,5375,409,183/full/0/default.jpg) | Kingsville | named-place | clear | One printed name crossing I05 and I06. |
| [F19-JUD-122](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7449,5447,357,165/full/0/default.jpg) | MᶜIntosh's Shop | shop | clear | Source enlargement and independent review resolve McIntosh; no owner identity inferred. |
| [F19-JUD-123](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7432,5499,200,166/full/0/default.jpg) | Shop | shop | clear | Separate shop wording from the named shop and P.O. |
| [F19-JUD-124](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7410,5522,192,165/full/0/default.jpg) | P.O. | post-office | clear | Shared or separate premises unresolved. |
| [F19-JUD-125](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7405,5569,293,165/full/0/default.jpg) | Blue Bridge | bridge | clear | Historical bridge name only. |
| [F19-JUD-126](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7772,4639,888,433/full/0/default.jpg) | River Inhabitants | watercourse | clear | Single curved name; separate from the road wording and other printed river occurrences. |
| [F19-JUD-127](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8515,4187,402,166/full/0/default.jpg) | Angus MᶜVarish | person-label | clear | Completed east of I03 from native source pixels. Nearby dots are building marks and are excluded from the lettering box. |
| [F19-JUD-128](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8582,4279,325,164/full/0/default.jpg) | Neil MᶜCuish | person-label | clear | Completed east of I03 from native source pixels. |
| [F19-JUD-129](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/8546,4587,407,236/full/0/default.jpg) | Fine outcrops of / black shale full / of fossils | descriptive-geology | clear | Three-line wording completed east of I06; line breaks preserved. |
| [F19-JUD-130](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/5090,3460,1675,2355/full/0/default.jpg) | CRAIGNISH | named-place-or-landscape | clear | The widely spaced black letters resolve in southwest-to-northeast order as C R A I G N I S H. Wording is clear; whether the cartographic role is a settlement/area or broader landscape label remains tentative. This is a separate inscription from the nearby Craignish River watercourse name. |
| [F19-JUD-131](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7197,5555,318,397/full/0/default.jpg) | Victoria Road | road-name | clear | Multipart lettering follows the road southwest from the Kingsville/Blue Bridge area. Box order follows source text: Victoria, then Road. The label intersects the core and continues below it. |
| [F19-JUD-132](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7537,5710,491,882/full/0/default.jpg) | River Inhabitants | watercourse | clear | Large watercourse lettering follows the river south beyond the I06/core edge. Box order follows source text: River, then Inhabitants. It is distinct from Victoria Road. |
| [F19-JUD-133](https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~2644~290012/7091,5763,654,846/full/0/default.jpg) | PROPOSED RAILWAY TO WHYCOCOMAGH | railway-annotation | clear | Added during the final core-boundary audit: the opening P intersects I05; the rest is completed from E06. Proposed status is explicit source wording, not evidence of construction or a modern route. |

## Theme handoff

The [Fletcher Atlas Theme artifact](https://claude.ai/code/artifact/eb654543-62e5-4db0-bf00-ea6e7b3f51c5) accompanies the already merged PR #347. Its palette, self-hosted font stacks and historical symbol specimens live in `web/src/atlas/`. The [Claude continuation prompt](../claude-theme-continuation-prompt.md) asks for more substantial orange/apricot areas while preserving readability, modern class meanings and separate worktree isolation. No renderer change is included in this extraction batch.

Reading confidence and geographic placement confidence remain separate. A clearly read “Gold Mine” cannot be displayed as a recorded or approximate geographic pin merely because that symbol treatment exists. An unlocated source inscription can be shown as a specimen or source excerpt until placement evidence is reviewed.

## Verification and attribution

The batch audit checks source/candidate hashes, explicit raw defects, crop aliases, all candidate dispositions, unique IDs, lettering bounds, source links, core coverage and null site geometries. Twelve exact PNG hashes were checked against local native-source crops. The existing Fletcher suite ran 257 tests: 249 passed and eight optional-image-dependency tests skipped. No browser behavior, deployment, modern-site acceptance or independent human completeness audit is claimed.

Source imagery: David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries. [Collection terms](https://www.davidrumsey.com/about/copyright-and-permissions), [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) and the existing [scoped permission record](../../../reports/fletcher/INVENTORY.md) apply. Native imagery and review contact sheets remain outside Git; source identity and native receipt are preserved in the inventory.

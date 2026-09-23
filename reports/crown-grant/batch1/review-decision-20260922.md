# Crown Grant batch 1: qualified acceptance review — 22 September 2026

## Decision

**Accept the five existing georeferences for historical research overlay use**, with the component and accuracy limitations below visible wherever their quality is described. This is a judgment under the user's 22 September direction to accept a sheet when further defensible improvement is unavailable, even if RMS exceeds the original target. It does not change the frozen measurements or establish whole-sheet accuracy at the original gates. It does not authorize public imagery redistribution or production activation.

The existing fit, check, mask, and render files remain canonical. No control, transform, crop, or raster was changed in this review. The original criteria in `acceptance-criteria.json` remain available for comparison; qualified acceptance is a separate decision, not a retroactive pass of those gates. `geographic_accepted: false` in each status continues to mean that **whole-sheet accuracy under every original numeric and coverage gate was not demonstrated**. `accepted_for_research: true` records the narrower decision.

| Sheet/component | Held-out physical checks | RMS, ground m | Review decision and limiting area |
|---|---:|---:|---|
| 002 main | 4 fresh; 6 reused diagnostics | 72.70 fresh | Accept approximate main placement. Eastern interior and edge support are sparse. The separate inset has no independent placement checks; show it as unvalidated. |
| 003 main | 12 independent | 52.52 | Accept. Distributed checks cover the mapped area; median 47.93 m and P95 81.09 m remain above the original 40/80 m goals. |
| 004 main/islands | 21 reference-audited | 92.79 | Accept approximate placement. Errors reach 229.13 m; Gannet Rock and several small islands/rocks lack precise checks. |
| 004a main | 10 independent | 101.96 | Accept approximate placement. Separate displaced island groups must keep their own fits. |
| 004a Northern Seal | 6 independent, paired by island | 167.56 | Accept approximate placement with visibly broad uncertainty; the largest error is 268.56 m. |
| 004a Southern Seal | 0 independent | unavailable | Accept the control-based placement as explicitly **unvalidated**. Do not claim an RMS or precise rock position. |
| 005 main | 7 source-audited | 123.46 | Accept approximate coastal placement. The largest error is 264.02 m; mainland interior support is sparse. |
| 005 Brier/Long inset | 7 on Brier/Peters | 35.36 | Accept. Long Island has two controls but no independent checks; its accuracy remains unvalidated. |

No component scores were pooled. Ground distances are WGS84 geodesic metres from the frozen score files. Check sets corrected after initial scoring retain their prior results and are described as audited, not untouched fresh validation. These are index maps for research screening; their alignment does not prove grant boundaries, title, current ownership, access, or a parcel match.

## Review evidence and model choice

I reacquired the five official PDFs from the recorded Nova Scotia URLs, extracted their embedded JPEGs, and checked all ten SHA-256 values against the saved receipts. Source dimensions match. I inspected every whole scan with its active controls and checks overlaid, plus native 600-pixel crops at high-error points: 003 Q03/Q15, 004 Q01/Q03/Q15, 004a NQ01/NQ03, and 005 MQ07/MQ10. Those source crosses land on the intended drawn lake, island, or shore features. This review does not replace the original modern-reference identity audits, and source-image inspection alone cannot resolve every historical/generalized shoreline difference.

I replayed the frozen fits and checked simple affine/similarity alternatives against the same excluded points as **diagnostics**, not fresh validation. No alternative warranted replacing the saved fit:

- 002/003/004/004a main: the existing affine check RMS values are 72.70/52.52/92.79/101.96 m; control-only similarity alternatives score 110.43/53.93/96.97/103.57 m. The small 003 difference is not a useful improvement.
- 004a Northern Seal: an unrestricted affine fit scores 150.83 m versus 167.56 m for the saved similarity, but its 8.6% unequal principal scales add unverified distortion to a small, displaced island group. Two high-error island tips remain above 180 m, and the same six checks were used to compare the models. Retain the constrained similarity pending distinct geographic evidence.
- 005 main: similarity scores 61.31 m on seven coastal checks versus 123.46 m for affine, but worsens controls MA04/MA05 to about 344/426 m error (from 206/204 m). Its largest leave-one-control-out error is about 744 m (affine: 613 m). The check set is concentrated along the central coast, so that refit would sacrifice support elsewhere. Retain the affine.
- 005 inset: the saved affine scores 35.36 m; similarity scores 49.96 m. The Southern Seal component has no independent checks, so a zero-residual affine through three controls would not be evidence of better geography.

Earlier raster coverage checks found complete mapped source content and no missing interior output cells. The previous browser records verify local raster display, not geographic accuracy. This review did not rerender or deploy imagery; it approves the existing immutable artifacts for qualified research use. Images and private review crops remain outside Git.

## Source and status

Source: [Province of Nova Scotia Crown Land index sheets](https://novascotia.ca/natr/land/grantmap.asp), sheets 002, 003, 004, 004a, and 005. The Province asks users to contact it for copies of the information referenced on the maps. Each sheet's `source-receipt.json`, `status.json`, and score files identify the exact source, control frame, transform, checks, and coverage. Publication permission for complete scans remains separate from this georeferencing decision.

# Inverness Church-map georeferencing — fifth attempt, 2026-07-25

## Outcome

**REJECTED, both panels. No mosaic, no tiles, no catalog change, no hosting
decision. The `church-inverness` layer remains unavailable.**

| Panel | n | held-out RMS | P95 | max | Verdict |
|---|---:|---:|---:|---:|---|
| Tolerance | — | **≤ 400 m** | **≤ 900 m** | **≤ 1,500 m** | |
| South | 11 | **457.8 m** | 798.4 m | 798.4 m | **Fails on RMS** |
| North | 2 | 802.2 m | 910.3 m | 910.3 m | **Not measurable** |

The measurement is unchanged from attempt 4, and that is this attempt's first
result rather than an absence of one: the numbers were re-derived by an
independent method and they survived. The tolerance was not adjusted.

Two things are new. The *diagnosis* of the south error, below; and a
**correction to why north cannot be measured** — attempt 4 blamed the modern
coastline for being too coarse, and that is wrong. See section 5. The verdict is
unaffected, but the next step changes completely.

Taking the south error first: it is now known to be **one uniform translation
plus ordinary scatter**, and the scatter alone is inside tolerance. The blocker is no longer "why is the error large" but
"where does a 404 m shift come from, and can it be justified independently of
the points used to measure it".

## 1. The offset is real. It is not the eyeball.

Attempt 4's pixel positions were read by eye off contact sheets, at a stated
±40 source px (~110 m). That left an unfalsified worry: a systematic reading
bias would look exactly like a systematic map offset, and attempt 4 could not
tell the two apart with its own data.

`tools/church/drawn.py` now derives the drawn coordinate by rule — threshold the
ink, trace the closed outline, take the shoelace centroid through the same
`landmarks.polygon_centroid` already applied to the modern island ring. Both
sides of every residual now come from one definition.

On the two south islands the detector could identify without ambiguity, it
reproduces the offset:

| Island | drawn centroid vs prediction |
|---|---|
| island-46-359n-61-262w (Margaree) | **+497 m E**, −73 m N |
| island-45-762n-61-068w (Floda) | **+262 m E**, +99 m N |

Against the eyeball mean of +318 m E. **Two methods that share no step agree
that the drawn features sit east of where the transform puts them.** The
eastward bias is a property of the sheet, not of whoever read it.

The two methods differ by 53 m on Floda and 325 m on Margaree. The second
exceeds attempt 4's claimed ±110 m, so that reading uncertainty was understated
— but not in a way that creates the offset, only one that widens it.

## 2. What the error actually is: a translation, not scatter

Pushing all eleven committed south check points through the panel's own TPS and
differencing against their modern coordinates gives the offset vector of each.

| Check point | dE (m) | dN (m) | dist |
|---|---:|---:|---:|
| island-46-359n-61-262w | −798 | −38 | 798 |
| island-45-956n-61-116w | −327 | −464 | 568 |
| island-45-948n-61-096w | −218 | −436 | 488 |
| island-45-875n-61-085w | −272 | −275 | 387 |
| island-45-814n-61-013w | −191 | −109 | 220 |
| island-45-801n-61-038w | −410 | −178 | 447 |
| island-45-797n-61-049w | −316 | −192 | 370 |
| island-45-790n-61-057w | −382 | −273 | 470 |
| island-45-762n-61-068w | −259 | −151 | 299 |
| island-45-757n-61-084w | −136 | −327 | 354 |
| island-45-750n-61-095w | −189 | −300 | 355 |

Negative means the drawn feature lands north-east of its true position. **All
eleven have the same sign on both axes.** That is not a distribution; it is an
offset.

```
mean            dE = −318 m   dN = −249 m      |mean| = 404 m
scatter about it  sd_E = 172 m  sd_N = 125 m
RMS as measured                                457 m   FAILS
RMS with the mean removed                      213 m   (hypothetical)
```

Removing the mean would leave max 524 m and P95 524 m — inside all three
bounds. The south panel is one constant away from passing.

**That constant is not available to be removed.** Fitting a translation to the
held-out points and then reporting the residual as accuracy consumes the very
data that makes the measurement honest, and would be the fourth attempt in a row
to publish a confident number built on a circular step. The 457.8 m figure
stands. The 213 m figure is a diagnosis, not a result, and is labelled as such
everywhere it appears.

## 3. Which of the three candidate causes it is

**(a) Rule-centre bias in detection — RULED OUT, by measurement.** The premise
was that the engraved rules are ~30 px thick, so returning an edge rather than a
centreline would shift every control by up to ~80 m. A vertical profile across
the south 46°00′ parallel at x=30,000 gives dark runs of 12, 9, 7, 2, 16, 6 and
1 px. The rules are **7–16 px**, not 30. The worst possible centre error is half
of 16 px = 8 px = **22 m**, and the largest conceivable error — returning the far
edge of the widest rule — is 43 m. The offset is 404 m. This mechanism is an
order of magnitude too small and cannot be the cause, on either panel.

**(b) Anchor half-step — RULED OUT, by arithmetic.** The south lattice steps
6,814 px per 10 arcminutes, so a half-step is 9,260 m. The offset is 404 m:
2.2 % of a step, and not a half, third, quarter or fifth of one. The north
panel's 5′ lattice gives the same answer. Nothing about 404 m looks like a
mis-set anchor index.

**(c) The 1884 sheet's graticule does not sit where WGS84 says it does —
CONSISTENT, and the only survivor.** A uniform translation is exactly this
signature. Expressed angularly the south shift is **14.8″ of longitude** and
8.1″ of latitude; the north panel gives 16″ and 21″ from its two points.

The **longitude components agree across the two panels** — 318 m and 345 m east,
well inside the scatter — which is what a property of the engraving should do and
what a per-panel fitting mistake should not. 14.8″ of longitude is 0.99 seconds
of time. For an 1884 county compilation tied to local astronomical stations
rather than telegraphic longitude, a one-second-of-time error is unremarkable.

The latitude components do **not** agree (249 m south, 644 m north), but the
north figure rests on two points, one of which is an extremal vertex on a
trending coast — the construction section 5 shows an extremal rule cannot
describe. It is not evidence of anything yet.

One thing this evidence cannot do is separate "19th-century datum" from "error
in Church's compilation". Both produce a constant shift. Distinguishing them
needs a second sheet, which is the next step below.

## 4. The programmatic detector, and why it is not the measurement of record

The detector works, and the committed check CSVs are still attempt 4's. That
needs justifying rather than glossing.

Run with every guard active it accepts **2 of 16 south candidates and 0 of 6
north**. Replacing an 11-point set with a 2-point one would leave both panels
unmeasurable and destroy the evidence this attempt rests on. So the eyeball set
remains the measurement of record — corroborated, and now with its uncertainty
honestly restated — and the detector's output is committed as *evidence* in
`reports/church/drawn-{north,south}.json`.

Getting there cost four wrong answers, each caught by looking at the contact
sheet, and each is now a guard with a test:

* **The threshold was wrong.** `darkness=140` is tuned for the heavy graticule
  rules; an island hairline is lighter, and at 140 the Margaree tile came back
  1.4 % ink with the island absent from it. It is 190 here.
* **The outlines are broken.** Margaree's traced shape encloses 10 %, 16 %, then
  106 % of the modern area at dilation radius 2, 3, 4. The engraved hairline is
  dashed by 3–4 px gaps. Without `dilate_px=4` the islands are simply not there.
* **It read lettering as islands.** The first clean run accepted the word "Cove"
  out of "Clarke Cove". An island encloses several times its own ink (3.69); a
  word is mostly ink (0.85–0.98). `MIN_FILL_RATIO` cuts between the two.
* **It matched the wrong island.** It paired the compact Clarke Id. with the
  candidate for the long Cameron Id. 470 px away, and separately matched two
  different modern islands to one drawn outline at (27161, 27227) — the same
  failure as attempt 4's four north candidates resolving to one vertex.
  `refuse_duplicate_matches` now refuses **both** sides of such a clash.

Two things were tried and removed rather than tuned:

* **Aspect and orientation matching.** The natural way to tell an island from its
  neighbour, and unusable here: NSTDB renders Margaree at 1.44∶1 where the
  engraving draws it at 3.62∶1, and returns a degenerate ring for another
  candidate. The reference is too generalised to carry shape. `DrawnShape` still
  reports both for the audit; nothing filters on them.
* **The wide area band.** Opened to 0.25–6.0 on the assumption that engravers
  exaggerate small islands, then closed to 0.6–1.7 once the run showed correct
  matches landing at 0.96–1.35 and every visually-confirmed *wrong* match at
  0.32–0.54. Church was faithful about island size.

That last change deserves a warning label, and carries one in the source:
tightening a filter after seeing the numbers drops badly-placed points and
therefore flatters the error. It is defensible only because those points were
shown to be the wrong features by eye, independently of their residual — you
cannot measure registration with a point that is not the feature — and anything
derived under it is an optimistic bound.

## 5. North is NOT blocked on the reference — that was a wrong inference

**This corrects attempt 4, and it corrects the first draft of this document.**
Both said the north panel was blocked because the modern coastline was too
coarse. It is not. The blocker is the candidate *rule*, and the data needed has
been on disk the whole time.

Attempt 4's observation was: sampled at 0.002° from 46.76 N to 46.90 N the
reference shore "has no local extremum in either direction", therefore Fishing
Cove, Pigeon Cove, White Capes, Shag Roost and Pollett Cove "are simply absent
from it". The observation is reproducible. The conclusion does not follow.

Measured on that exact stretch, with the extract's tile seam removed (56
vertices repeating the longitude −60.999997, which `walls.py` already knows how
to detect):

```
real coastline vertices          1,969
median vertex spacing              3.6 m
coastal trend               0.689 m east per metre north
residual spread about it         836 m
```

A line carrying a vertex every 3.6 m is not generalised, and a 220 m sampling
step cannot be what hides a cove in it. What actually defeats the search is the
**trend**: on a coast running steadily north-east, the westernmost vertex inside
a box is always whichever latitude bound the box cut. That is precisely the
condition `emit_candidates._refuse_if_truncated` already refuses, in a message
that says *"the coastline here simply runs westward without turning"*. The guard
was reporting that an extremal rule is the wrong instrument for this coast.
Attempt 4 read it as the features being missing.

Detrend the coast and they appear at once:

| Cove (detrended residual) | indentation from the coastal trend |
|---|---:|
| 46.7814 N | −158 m |
| 46.7890 N | −260 m |
| 46.7963 N | −349 m |

**The catch, and it is a real one.** Those three sit about 800 m apart, against a
north-panel error of roughly 700–900 m. A check feature spaced more closely than
the error being measured is a weak check: it can be paired with its neighbour
and nothing in the data would say so — the same failure that matched the compact
Clarke Id. to the candidate for the long Cameron Id. So these particular coves
are not the answer. A trend-immune rule applied across the **whole** panel
(46.30–47.10 N, against the 46.76–46.90 N stretch profiled here), preferring
kilometre-scale headlands whose prominence comfortably exceeds the error — Cape
Rouge, Presqu'île, Cape St Lawrence, Money Point — is.

### What was tried and rejected on the way

`nsgiwa.novascotia.ca` still does not respond from the compute host;
`nsgi.novascotia.ca`, `data.novascotia.ca` and `services1.arcgis.com` return
200. CanVec 50K Nova Scotia hydrography *was* fetched and tested
(`canvec_50K_NS_Hydro_shp.zip`, 61,779,513 bytes, SHA-256
`bca5b7ed…8b57d6`) on the theory that a national layer would resolve what the
provincial extract smoothed. It does not: **533 vertices against NSTDB's 2,139**
on the same stretch — coarser, not finer, and tiled on a 0.25° grid of its own.
Its one genuine advantage is an explicit `definit_en='Ocean'` classification,
which separates sea from lake without guessing.

It is **not adopted, not committed, and no licence claim is made for it** — the
archive carries no licence file that was located, and nothing was verified,
because it was rejected on technical grounds before licensing became relevant.

Lakes were also tried as a check-feature class and rejected on the evidence: the
QA sheet shows several "lakes" are marine embayments in the extract's exterior
rings (Cheticamp harbour, Pleasant Bay, Margaree Harbour), and the genuine
highland lakes sit on terrain Church labelled **"Barren"** — thirteen inside the
cutline, none drawn at a size matching the reference.

The QA sheet does confirm attempt 4 on the north *islands*: their tiles show
"Barren" twice, a dash-dot county boundary, hachured highland and small pond
outlines. Church drew no islands there.

The north panel is therefore still rejected **for want of a usable held-out
set** — but on a rule that has not yet been written, not on data that cannot be
obtained. That is a materially better position than attempt 4 recorded.

## 6. Smallest credible next step

1. **Georeference a second Cape Breton Church sheet — Victoria or Richmond — and
   measure its offset vector.** Rumsey holds all four Cape Breton counties. If
   the same ~15″ eastward shift appears on an independently-compiled sheet, it is
   a property of the series and can be committed as a versioned datum correction
   with its own evidence, at which point the south panel's residual scatter
   (213 m RMS, 524 m max) is inside tolerance on the *existing* held-out points
   without ever fitting to them. If it does not appear, the shift is per-sheet
   compilation error and no global correction is legitimate.

   This is the whole ballgame, and it is not circular: the correction would be
   determined on a different sheet from the one it is tested on.

2. **Write a trend-immune candidate rule for the north coast.** No new data is
   needed; see section 5. The existing extremal rules cannot describe a feature
   on a coast that trends, and every north candidate to date has died on that.
   A residual-from-local-chord rule (the Douglas–Peucker criterion, which is
   scale-free and immune to trend) names a headland or a cove head the same way
   on both representations, which is what a check rule has to do.

   Apply it across the whole panel, not one stretch, and **prefer prominence
   over count**: a feature whose amplitude is smaller than the error being
   measured cannot be identified reliably, so kilometre-scale headlands are
   worth more than a dozen 200 m coves.

3. Re-measure both panels against the same tolerance.

### Step 2 is done, and the north candidate supply is now measured

`tools/church/chords.py` implements the rule: deviation from the chord joining
the ends of the coastal stretch inside the box, which is the Douglas-Peucker
criterion. Subtracting the chord *is* detrending, so the rule is immune to the
trend by construction — its tests hold an 800 m headland at 800 ± 25 m across a
40× range of coastal slope, where an extremal rule's answer slides to whichever
end of the box the trend runs toward.

Applied across every reference ring touching the north panel, with tile seams
dropped, it finds **301 distinct coastal features, 155 of them inside the north
cutline**. Filtering as the prominence argument demands:

| prominence | inside cutline | also >1.5 km from the next | also >3 km |
|---|---:|---:|---:|
| ≥ 400 m | 81 | 11 | 5 |
| ≥ 600 m | 50 | 23 | 9 |
| ≥ 800 m | 17 | **8** | 5 |
| ≥ 900 m | 6 | 3 | 3 |

**Eight features clear 800 m of prominence and stand more than 1.5 km from their
nearest rival**, against the two points the panel has today. The isolation
column is the one that matters: prominence only just exceeds the 700–900 m error,
so it is separation, not size, that stops a feature being confused with its
neighbour.

The supply problem is therefore solved. What is not yet built is the **drawn**
side: `drawn.py` finds closed outlines, and a headland is a point on an open
curve, so reading one off the engraving needs the coastline traced as a path and
the same chord rule applied to it. That is the next piece of work, and until it
exists the north panel still has no measurement.

Only if both panels then clear the gate does mosaicking become appropriate, and
hosting remains a separate decision after that.

## 7. The drawn side of a headland, and what the north coast turned out to contain

Step 3 of the plan was the drawn-side detector: `drawn.py` reads an island by
tracing its closed outline and taking the shoelace centroid, but a headland is a
point on an open curve and has no centroid, so the north panel had no drawn side
at all. That detector now exists (`tools/church/headlands.py`), and running it
produced a clear answer — just not the one that was wanted.

**The north panel still has no measurement, and the verdict is unchanged: both
panels REJECTED.** No tolerance was adjusted, no tiles were built, no catalog or
hosting change was made.

### How the drawn shoreline is found

Tracing the ink fails on this map: at the dilation needed to close a dashed
hairline, the coast stroke merges with hachure, lot lines and lettering, and its
outline wanders into all of them. So the PAPER is filled instead, and the
shoreline appears as the boundary between two fills — clean on the seaward side
whatever the land carries.

Which fill is the sea never has to be decided. Every large region is measured and
PROMINENCE chooses, exactly as enclosed area chooses in `drawn.py`: a property of
the drawn shape alone, carrying no positional information, so the prediction
cannot pull an answer toward the transform under test. Paper is filled
4-connected against ink's 8-connected trace, because a single-pixel diagonal
hairline is watertight to one and porous to the other.

Both faces of the stroke are read and merged. They are traversed in opposite
directions, so one bulge yields two deviations of opposite sign; requiring that
opposition is free corroboration, and their midpoint cancels the stroke's own
thickness.

**It works.** The QA sheets show green paths following Chéticamp Island, Enragée
Point, White Capes, Red Head and Margaree Harbor correctly. Three separate
artifacts had to be removed first, each caught by looking at the sheet rather
than by any number:

| Artifact | What it did | Fix |
|---|---|---|
| Lake and river shores | 4 of 7 first-pass tiles carried no drawn coast: two inland lettering, one a dashed lot line, one the engraved 46°40′ meridian and its label | Restrict to NSTDB `WACO40` "Coast Water Area" over 100 km²; the layer classifies this itself |
| Engraved graticule | Church rules parallels across the open Gulf; the paper fill follows them, and 6 of 9 tiles chose a "headland" on a ruled line at the tile edge | Cut the path where it runs along the graticule, rebuilt from the committed control mesh and extended past it. Cut, not erased — erasing breaks the shoreline where the two cross |
| Fold-backs | A detour out along a road and back has a near-zero chord, so every point on it reads as enormously prominent | Refuse a path whose chord is under a tenth of its own traced length |

### What the coast actually contains

With those removed, the supply was measured properly — by sliding the *committed*
window along the *actual* marine shoreline and asking the *committed* rule at
every position, so discovery and measurement finally share a baseline. (Douglas–
Peucker proposes tips against chords up to 20 km long; the box then re-measures
against its own. Fishing Cove is the clean example: 827 m against 7.5 km, under
800 m against 4.4 km.)

| window | ≥600 m floor | ≥800 m | ≥1000 m |
|---|---:|---:|---:|
| 3.1 km | 7 | 4 | 3 |
| 4.4 km | 8 | 6 | 2 |
| 6.0 km | 12 | 7 | 5 |
| 8.0 km | 15 | **11** | 10 |

Counts are features inside the north cutline, isolated by 1.5 km, seams stripped.
Eleven candidates at the committed 800 m floor looked like enough.

**They are not usable, and the reason is the finding.** Every one of the nine
that survived to a committed box has a rival on its own stretch of coast at
85–99 % of its own prominence:

| candidate | prominence | rival | share |
|---|---:|---:|---:|
| 46.6035 N 61.0590 W | 2885 m | 2870 m | 99 % |
| 46.6181 N 61.0526 W | 2795 m | 2739 m | 98 % |
| 46.6500 N 61.0278 W | 2531 m | 2483 m | 98 % |
| 47.0325 N 60.6149 W | 1730 m | 1638 m | 95 % |
| 46.5238 N 61.0765 W | 1282 m | 1092 m | 85 % |
| 46.5976 N 61.0317 W | 1108 m | 1052 m | 95 % |
| 46.8044 N 60.8745 W | 1089 m | 1031 m | 95 % |
| 46.4407 N 61.1285 W | 1007 m | 912 m | 91 % |
| 46.7892 N 60.8898 W | 891 m | 876 m | 98 % |

Two features of equal prominence in one window cannot be told apart *by
prominence*, so pairing a drawn tip with either is a coin toss dressed as a
measurement. That is not a hypothesis: three of these candidates resolved to the
same engraved hook at Chéticamp Point, and the duplicate guard refused them —
the attempt-4 "four candidates, one vertex" failure repeating in a new form.

This is now enforced in the committed rule as `HEADLAND_MAX_RIVAL_SHARE`, which
refuses a candidate whose runner-up exceeds 75 % of the winner. It is isolation
in the property that actually does the choosing, rather than in distance. Under
it, **all nine north candidates are refused on the modern side, before any drawn
point is read.**

### What this means, stated carefully

The north panel's coast, at the scale Church drew it, does not supply
identifiable check features. Not because the reference is too coarse — that
claim was made in attempt 4 and corrected in section 5 — and not because the
detector fails, since it traces these shorelines correctly. The features
themselves are degenerate in the discriminating property: northern Inverness is a
fjorded shore of repeated similar coves, and NSTDB's Chéticamp barrier-and-lagoon
system is a shape Church did not draw at all.

Two honest routes remain, and both are larger than a detector:

1. **A different feature class.** Prominence discriminates poorly here. River
   mouths, lake outlines or the drawn road network might discriminate better, but
   each needs its own two-sided rule and its own anti-circularity argument.
2. **Accept that north is unmeasurable and say so in the product.** The south
   panel at least has 11 check points and a diagnosed 404 m NE translation. A
   panel that cannot be validated should not be published as if it had been.

The prominence band was NOT widened to admit anything. `PROMINENCE_RATIO_MIN`
and `MAX` are still the 0.5–2.0 prior set before the first north run, and the two
candidates that reached the drawn side read 2.15× and 2.92×. Widening the band
until they fit is exactly the tuning this pipeline exists to refuse.


## What is versioned from this attempt

- `tools/church/drawn.py` — ink masking, boundary tracing, shoelace centroid,
  shape descriptors, selection policy, duplicate refusal. Pure stdlib.
- `tools/church/drawn_checks.py` — the raster driver and QA contact sheet.
  Cannot run in CI; needs the scan and the reference.
- `tools/church/panels.py` — `DrawnCheckSettings` and `HeadlandCheckSettings`,
  versioned per panel, with the measurement behind each number beside it.
- `tools/church/headlands.py` — paper fill, shoreline extraction, two-faced
  merge, prominence selection, graticule segments. Pure stdlib.
- `tools/church/headland_checks.py` — the headland raster driver and QA sheet.
  Cannot run in CI; needs the scan and the reference.
- `tools/church/chords.py` — `Plane` and `path_extreme`, the chord rule on an
  open path in any metric plane, shared by the modern and drawn sides.
- `tools/church/checks/inverness-north-headland-candidates.csv` — the nine north
  candidates and the rival prominence that refuses each one.
- `reports/church/drawn-{north,south}.json` — per-candidate audit: what was
  found, what was chosen, and why each refusal happened.
- 391 tests, `python3 -m unittest discover -s tools/church/tests -t .`

## Reproducibility

- Compute host: Bazzite over SSH, `nsmarks-gis` distrobox
- GDAL 3.12.4, OpenCV 4.13.0, NumPy 2.4.6, Python 3.14
- Source JP2 SHA-256 verified as
  `37021ed086f7bbce542b519e9a74242acc5b53ed1944880468f6f91d6234a7f8` before use
- Warps reused from attempt 4 (`work/w-unclipped/inverness/`); the master
  GeoTIFF is 34,427 × 34,543
- Generated scans, GeoTIFFs, previews and tile trees stay out of Git

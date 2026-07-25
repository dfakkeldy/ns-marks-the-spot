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

What is new is the *diagnosis*. The south panel's error is now known to be
**one uniform translation plus ordinary scatter**, and the scatter alone is
inside tolerance. The blocker is no longer "why is the error large" but
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
north figure rests on two points, one of which is an extremal vertex on the
generalised coast this very report rejects as a reference. It is not evidence of
anything yet.

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

## 5. North: the reference blocker is unchanged

`nsgiwa.novascotia.ca` still does not respond from the compute host (curl exit
without a status). `nsgi.novascotia.ca`, `data.novascotia.ca` and
`services1.arcgis.com` all return 200. No adequate 1:10,000-class hydrography
was obtained, so **no new reference dataset was committed, and no licence claim
is made.**

The QA sheet confirms attempt 4's account of what the four north island
candidates actually are. Their tiles show the word **"Barren"** twice, a
dash-dot county boundary, hachured highland and small pond outlines. Church drew
no islands there, and the detector correctly found none.

The north panel is therefore rejected again **for want of evidence, on the
reference rather than on the warp** — the same finding as attempt 4, now with
the drawn side of the comparison automated and still returning nothing.

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

2. **North still needs a finer coastline.** Unchanged, and blocked on reaching a
   source. Licensing remains a separate gate.

3. Re-measure both panels against the same tolerance.

Only if both panels then clear the gate does mosaicking become appropriate, and
hosting remains a separate decision after that.

## What is versioned from this attempt

- `tools/church/drawn.py` — ink masking, boundary tracing, shoelace centroid,
  shape descriptors, selection policy, duplicate refusal. Pure stdlib.
- `tools/church/drawn_checks.py` — the raster driver and QA contact sheet.
  Cannot run in CI; needs the scan and the reference.
- `tools/church/panels.py` — `DrawnCheckSettings`, versioned per panel, with the
  measurement behind each number in the comment beside it.
- `reports/church/drawn-{north,south}.json` — per-candidate audit: what was
  found, what was chosen, and why each refusal happened.
- 325 tests, `python3 -m unittest discover -s tools/church/tests -t .`

## Reproducibility

- Compute host: Bazzite over SSH, `nsmarks-gis` distrobox
- GDAL 3.12.4, OpenCV 4.13.0, NumPy 2.4.6, Python 3.14
- Source JP2 SHA-256 verified as
  `37021ed086f7bbce542b519e9a74242acc5b53ed1944880468f6f91d6234a7f8` before use
- Warps reused from attempt 4 (`work/w-unclipped/inverness/`); the master
  GeoTIFF is 34,427 × 34,543
- Generated scans, GeoTIFFs, previews and tile trees stay out of Git

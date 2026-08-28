# Inverness Church-map georeferencing — fourth attempt, 2026-07-24

## Outcome

**REJECTED. No mosaic, no tiles, no catalog change, no hosting decision. The
`church-inverness` layer remains unavailable.**

The blocker carried since attempt 2 is closed: `check_count` is no longer 0.
Held-out physical check points were captured and measured through the existing
`georeference` path, against the tolerance agreed in advance.

| Panel | n | held-out RMS | P95 | max | Verdict |
|---|---:|---:|---:|---:|---|
| Tolerance | — | **≤ 400 m** | **≤ 900 m** | **≤ 1,500 m** | |
| South | 11 | **457.8 m** | 798.4 m | 798.4 m | **Fails on RMS** |
| North | 2 | 802.2 m | 910.3 m | 910.3 m | **Not measurable** |

The south panel is rejected on a measurement. The north panel is rejected for
want of evidence: two points cannot support an RMS, and a P95 of two numbers is
meaningless.

The tolerance was not adjusted after the numbers were seen. The south panel
misses the RMS bound by 58 m, and still misses it at 408.4 m with the single
largest residual removed.

## What was actually blocking, and it was not reading the contact sheets

Attempt 3 left one manual step: read two contact sheets and write down about
fifteen pixel positions per panel. That framing was wrong, and the reason is the
main finding of this attempt.

**Most of the committed candidate definitions were not physical features.** Two
guards now enforce what a candidate has to be, and they are what discovered it:

* **A box must select a feature, not clip it.** When an extremal rule returns a
  coordinate sitting on the box bound it sorts by, the feature continues past
  the box and the answer is an artifact of where the box was drawn.
  `cape-rouge-west-tip` returned lon −61.099997 against a `box_west` of −61.1
  and predicted onto blank paper beside the neat line.
* **The perpendicular bound must not choose the answer either.** On a monotonic
  coast a `west` rule always returns a point on the box's north or south edge,
  because the shore simply runs steadily westward as it runs south.
  `pleasant-bay-west-tip` returned lat 46.800017 against a `box_south` of 46.8.

Applied to the committed files: **5 of 14 north and 4 of 16 south candidates
survive**, and most survivors fall outside their own panel's cutline. Four
separate north candidates — Cape St Lawrence, Cape North, Meat Cove and Aspy Bay
— converge on the identical vertex −60.598363, 47.041977. Attempt 3 found three
of those by eye and treated it as three mis-drawn boxes. There is exactly one
northernmost point up there; they were never four features.

`tools/church/emit_candidates.py` now derives every candidate coordinate from
its own rule and box, and `--check` asserts the committed file still matches,
the same guarantee `emit_gcps --check` gives the control CSV. Before this, the
candidate CSVs cited a rule and a box that nothing in the repository could
re-apply — the same defect attempt 3 fixed for the eight analysis scripts.

## Why the north panel cannot be measured

Held-out points need a modern coordinate derived by rule **and** a feature
findable on the drawing. The north panel fails the first half, and the reason is
in the reference rather than the map.

In the NSTDB "major water" layer the north Cape Breton shore is a smooth
generalised line. Sampled at 0.002° (~220 m) from 46.76 N to 46.90 N it has **no
local extremum in either direction** — not one. Fishing Cove, Pigeon Cove, White
Capes, Shag Roost and Pollett Cove, every one of them drawn and named by Church,
are simply absent from it.

The only islands the layer resolves inside the north cutline are four sub-0.4 km²
highland ponds. Their contact-sheet tiles show the word **"Barren"**, a county
boundary, and a hachured hill. Church drew no islands there, exactly as the
attribution of that country would predict.

That leaves two usable north features, both recorded. This is a limitation of
the available reference, not of the warp — see the shoreline figures below,
which are now good across the whole panel.

The south panel is carried by islands: the Bras d'Or group is drawn and lettered
("Margaree Island" with its light, Dumpling, Crammond, Tailor, Cow, Cranberry,
Cameron, Floda, Macdonald), and an island centroid is unambiguous in both
representations without any judgement about where a coastline turns.

Five of the sixteen south candidates still yielded no point, and are recorded as
such in `tools/church/checks/inverness-south.csv` with the reason. Two were
ambiguous between the drawn "Round Id." and "Cranberry Id." — their drawn
north–south order contradicts the modern order, so any pairing would have been a
guess.

## The error tail was a defect in the measurement, not in the map

Attempt 2 attributed the north panel's coastal tail to undrawn "Barren"
interior. Attempt 3 disproved that and concluded the tail should be reported as
**real registration error on the coast**. Both were wrong.

The NSTDB extract is **tiled**, and where a tile boundary crosses open sea the
water polygon is closed along a straight artificial seam. `shoreline_error.py`
measured the distance from every reference water *edge* pixel to the nearest
historical ink, and a seam through the open Gulf is a water edge by that
definition — with nothing drawn anywhere near it.

Splitting the north panel's second quarter on that basis:

| Band 1 samples | n | RMS | median |
|---|---:|---:|---:|
| All | 4,087 | 1,094.1 m | 115.9 m |
| On an extract seam | 1,556 | 1,757.5 m | 1,295.9 m |
| Genuine coastline | 2,531 | **184.3 m** | **43.9 m** |

The published 1,091 m band was 1,556 seam samples. The real coastline in that
band is the **best-registered** stretch on the panel. 17.5 % of all north-panel
edge samples sat on seams.

This also explains attempt 3's confusing lake test. Removing inland lakes
deleted thousands of well-registered samples, which raised the seams' share of
what remained and pushed P95 *up* from 1,043 m to 1,679 m. That read as evidence
the tail lived in the coast. It was dilution.

`tools/church/walls.py` detects seams by repetition — a real shoreline never
puts dozens of vertices on one exact longitude to six decimals — and
`shoreline_error` now excludes them, reporting how many it dropped.
`--keep-extract-seams` reproduces the old numbers.

### Shoreline distance after the fix

Still a **lower bound** — any ink counts — and still not the accuracy figure.

| | North coast | South coast |
|---|---:|---:|
| samples | 8,718 | 38,880 |
| seam samples dropped | 1,635 | 1,146 |
| median | 80.0 m | 127.9 m |
| RMS | 231.1 m | 278.7 m |
| P95 | 531.6 m | 623.3 m |
| max | 1,020.0 m | 1,207.0 m |
| per-band RMS | 349 / **183** / 189 / 199 | 396 / 331 / 239 / 273 |

No band on either panel now exceeds 396 m. The tail is gone from both, and the
north panel's band 1 — the entire subject of two previous investigations — is
its second-best quarter.

Visual confirmation: a headless overlay of the band-1 stretch against the modern
coastline shows Church's shoreline hugging the red modern line continuously from
Eastern Harbour past Presqu'île, Cape Rouge, Shag Roost, Red Head, Pigeon Cove,
White Capes and Fishing Cove to Pleasant Bay.

## Why the south panel still fails

The proxy says ~279 m RMS along the coast; the held-out points say 457.8 m. Both
are consistent: the shoreline field is a lower bound that credits any ink,
including hachure and lettering, while a check point measures one feature's
position.

The residuals are not random. Every one of the eleven drawn islands sits
**north-east of where the transform puts it**, by roughly 100 px east and 100 px
north on the scan — a systematic offset of about 270 m, not scatter. The largest
residual, 798 m, is Margaree Island at the panel's northern edge, north of the
anchor parallel and outside the control hull in latitude.

A systematic offset of that shape is a fixable defect, not an inherent limit of
the engraving, which is the most useful thing this measurement says.

| Check point | error |
|---|---:|
| island-46-359n-61-262w (Margaree Island) | 798.4 m |
| island-45-956n-61-116w | 570.1 m |
| island-45-948n-61-096w | 490.6 m |
| island-45-790n-61-057w | 470.9 m |
| island-45-801n-61-038w | 447.7 m |
| island-45-875n-61-085w | 388.3 m |
| island-45-797n-61-049w | 370.3 m |
| island-45-750n-61-095w | 356.5 m |
| island-45-757n-61-084w | 356.0 m |
| island-45-762n-61-068w | 299.9 m |
| island-45-814n-61-013w (Cameron Id.) | 220.6 m |

Reading uncertainty on the pixel columns is about ±40 source pixels (~110 m),
estimated by re-reading island centroids across overlapping tiles. It adds in
quadrature: removing it entirely would still leave ~444 m.

## Smallest credible next step

1. **Chase the systematic south offset.** Eleven residuals pointing the same way
   is a bias in the fit, most likely the anchoring of the 10′ lattice, not
   irreducible error in the drawing. Worth testing before anything else: it is
   the difference between 458 m and something inside tolerance.
2. **Get a finer modern coastline for the north panel.** This is the whole
   blocker there. A 1:10,000-class NSTDB hydrography layer would resolve the
   coves Church drew and turn ~10 more north features into candidates. The
   compute host cannot currently reach `nsgiwa.novascotia.ca`; `nsgi` and
   `data.novascotia.ca` do respond. Licensing and provenance are a separate gate.
3. Re-measure both panels and judge against the same tolerance.

Only if both panels then clear the gate does mosaicking become appropriate, and
hosting remains a separate decision after that.

## What is versioned from this attempt

- `tools/church/checks/inverness-{north,south}.csv` — the held-out check points,
  with the features that yielded no point and why
- `tools/church/checks/inverness-{north,south}-candidates.csv` — rebuilt, every
  row re-derivable by `emit_candidates --check`
- `tools/church/emit_candidates.py`, `tools/church/walls.py` — new, tested
- `reports/church/sl-*.json` — shoreline distributions with seams excluded
- 273 tests, `python3 -m unittest discover -s tools/church/tests -t .`

## Reproducibility

- Compute host: Bazzite over SSH, `nsmarks-gis` container
- GDAL 3.12.4, OpenCV 4.13.0, NumPy 2.4.6
- Source JP2 SHA-256 verified as
  `37021ed086f7bbce542b519e9a74242acc5b53ed1944880468f6f91d6234a7f8` before use
- Generated scans, GeoTIFFs, previews, and tile trees stay out of Git

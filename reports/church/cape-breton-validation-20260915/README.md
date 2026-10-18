# Cape Breton: validation expansion — 15 September 2026

The unchanged eleven-control TPS now has **six fresh physical checks**, with
**467.19 m RMS**, compared with **915.96 m** on the original
affine using those exact six features. The 250 m working target remains unmet.
No controls, cutline or raster were changed; no new whole-panel acceptance,
activation, tiles or deployment is claimed.

This continues the [regional support report](../cape-breton-regional-20260915/README.md).
Its eleven controls and freeze are pinned through nightly commit
`8cda9fc422c8627883b79c79b43cc8cb3b196999`. Earlier Stewarts, Fraser Point island and
Green Island observations and first results remain byte-identical. Hay and
North Head remain selection diagnostics and are excluded from fresh validation.

| New check | TPS11 error | Original affine3 error | Hull |
| --- | ---: | ---: | --- |
| CB21 Gaspereaux Lake eastern stream junction | 386.48 m | 712.64 m | Inside |
| CB22 South Head eastern shore apex | 576.81 m | 755.47 m | Outside |
| CB23 Enon Lake eastern stream junction | 116.85 m | 1,299.02 m | Outside |

The new three alone give 406.50 m RMS. The six-check median is
286.64 m, empirical P95 795.03 m, maximum 867.77 m;
mean residual is -146.56 m east / +74.46 m north.
These are horizontal ground metres under the retained mean-latitude cosine
convention. P95 is an empirical sample percentile, not a confidence bound.
The three earlier fresh checks are not dropped or retuned, and the high Stewarts
failure remains in every cumulative score.

The original individual first results are retained. The intermediate five-check
aggregate is preserved as a clearly labelled numerical replay from unchanged
observations after the cumulative summary expanded to six; it is not represented
as an original byte-frozen snapshot. The new-three and cumulative-six CSV files
carry the identical eleven controls with separate check rows.

Gaspereaux Lake is identified by its three lobes, closed northern finger and
northeastern pond connection. Its eastern shore/stream node is measured instead
of a name point, a nearby pond or the road crossing. Source and reference show
more than one difference in the surrounding shoreline, so the point does not
establish full-outline agreement.

South Head is explicitly labelled “Cape Morien or South Head” on the main scan,
west of the separate Cow Bay plan. The eastern coast tip is distinct from the
large offshore lettering and sea engraving contours. The original reference
feature is coded WACOIS10; its continuous headland geometry and locality are used,
rather than assuming that this class always denotes a separate small island.

Enon is identified through its relationship to Munroe Lake and Lake Uist. The
source depicts its northern approach as a narrow brook, while modern geometry
has an elongated lake arm. The eastern shore/stream junction, immediately west
of the road crossing, supplies the check; no whole-basin centroid equivalence
is inferred. The nearby Lake Uist control means this is regional validation,
not a new independent assessment of the entire southwestern panel.

Round Island in the Mira River was distinguished from the similarly named
community farther east. The reviewed source detail did not establish a clearly
isolated matching island; no peninsula, label centre or predicted point was
adopted. `search-decisions.json` preserves that unresolved state without asserting
historical absence or adding a weak check to reach a quota.

Three new actual-raster/reference windows were inspected. They show the two
remaining displacements and the closer Enon junction, with source points on
nontransparent raster content. Prior full-raster coverage, distortion, decoder
and importer evidence remains attached to the same unchanged raster hash in the
regional report. The three editable inventories are checked through the production
parser and TPS solver. Gaspereaux and Enon were also reviewed in the actual browser,
including Enon at 10× terrain; terrain supplied context, not measurement pixels.

Six checks remain too few for whole-panel acceptance. Interior and coastal errors,
unvalidated southern-extension content, unresolved identities and seams remain.
The historical imagery retains David Rumsey / Stanford credit and recorded
CC BY-NC-SA 3.0 terms; original reference identity and provenance are preserved.

```sh
PYTHONPATH=. /opt/local/bin/python3.12 reports/church/cape-breton-validation-20260915/verify_reports.py
```

# Sheet 067 — Halifax Harbour entrance with Eastern Passage inset

**Components are assessed separately under the 100 m RMS ceiling.** All errors are WGS84 geodesic ground metres; no pooled accuracy claim is made.

| Component | Controls | Checks | RMS m | Median m | P95 m | Maximum m |
|---|---:|---:|---:|---:|---:|---:|
| main | 5 | 4 | 100.17 | 97.84 | 131.20 | 135.99 |
| eastern-passage-inset | 3 | 4 | 66.29 | 17.40 | 114.11 | 129.70 |

Original source: https://novascotia.ca/natr/land/indexmaps/067.pdf, 5828 × 4121, 160 ppi. The complete original scan is separately accessible with marginal attribution and warning.

Complete original outer frame retains Halifax Harbour entrance, the generalized western Herring Cove and Chebucto Head coast marked for sheet 057, McNabs and Lawlor islands, Thrumcap, Devil Island, Eastern Passage, Hartlen Point, Cow Bay, Osborne and Pensey heads, Cole Harbour and Lawrencetown coast, Egg Island, Graham Head, the mapped portion of Shut In Island and the entire original Atlantic Ocean frame. The enlarged circular Eastern Passage and Lawlor Island inset has its own transform and complementary native mask.

Main five controls form a sparse northern coastal band. The first fit and failure remain unchanged. Main Hartlen southwest check source was corrected to the shore corner before fitting; the materially different western Lawlor spur proposal was rejected before any fit or score.

The inset prints scale 1:15,840 and a GRID NORTH arrow. These supplied only a rough discovery orientation and scale; independently matched physical shore points determine its frozen transform. Inset Lawlor finger source and bay-check reference were refined before the first inset fit.

The circular inset outline is preserved with a 128-vertex ellipse enclosing its native border. The exact same ring removes the inset from the main component and supplies the separately transformed inset, preserving the original frame without duplication.

Limitations:

- Main map first RMS 100.17 m exceeds the strict 100 m ceiling; median 97.84 m also exceeds 75 m. Four northern coastal checks do not validate the western coast or southern ocean.
- Inset first RMS 66.29 m passes 100 m, with median 17.40 m, P95 114.11 m and maximum 129.70 m. All three controls and four checks are on Lawlor Island; mainland streets, harbour and river remain unvalidated.
- Both components use constrained similarities selected before scoring. Their Lawlor Island observations share modern reference geography; scores are not statistically independent and are not pooled.
- Egg Island has no corresponding outline in the downloaded modern reference. Its historical depiction remains retained; no disappearance cause is asserted.
- Main source uncertainty 18 px; enlarged inset 12 px. Full imagery retention is separate from geographic acceptance.

Both output-alpha coverage and the union of native masks pass, with no omitted/excess content outside edge tolerances and no source overlap. Each frozen transform retains the original pixel frame. Actual browser proof for both components and enlarged inset is recorded in `browser-verification.json`. Source scans, references, warps and paired audit images remain private; public records contain coordinates, code, hashes, measurements and provenance.

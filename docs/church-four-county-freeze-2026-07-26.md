# A.F. Church Four-County Alignment Freeze — 2026-07-26

## Decision

The four-county alignment and tiling run is **frozen and rejected**. It is not
eligible for promotion:

- no county-wide Church layer passed;
- no Church tiles were generated;
- no catalog source URL was activated;
- nothing was deployed; and
- the preserved compute workspace has no running alignment process.

The machine-readable receipt is
[`reports/church/four-county-freeze-2026-07-26.json`](../reports/church/four-county-freeze-2026-07-26.json).

## Source and licence boundary

The historical rasters came directly from the David Rumsey Map Collection.
The modern water reference is the official Nova Scotia NSTDB major-water
dataset. No OldMapsOnline geometry, control points, transforms, tiles, or other
data were used or retained.

The preserved source hashes are in the receipt. In particular, the Cape Breton
sheet was also fetched as the direct Rumsey JP2 and contained no embedded CRS
or GCPs that could provide a shortcut.

## Fixed acceptance gate

Each geographic panel needed at least six independent, identifiable held-out
physical checks. The unchanged numerical bounds were:

- RMS no greater than 400 m;
- P95 no greater than 900 m; and
- maximum error no greater than 1,500 m.

A diagnostic shoreline sample is not a held-out physical check set. A panel
with fewer than six accepted checks is unmeasurable rather than a pass.

## Results

### Inverness — rejected

The south panel passed with 12 controls and 11 held-out physical checks:
333.3 m RMS, 468.3 m P95, and 468.3 m maximum error.

The north panel had 30 graticule controls but no accepted independent physical
checks. Eight shoreline sequences provided a useful lower-bound diagnostic
(8,718 samples, 231.1 m RMS, 531.6 m P95, 1,020 m maximum), but they are not
independent identifiable held-out features and cannot satisfy the gate.
Because every geographic panel must pass, Inverness remains rejected.

### Richmond — rejected

Fourteen graticule controls and a fixed pre-residual supply of 24 island
candidates yielded 11 accepted held-out checks. Every viable transform failed:

| Model | RMS | P95 | Maximum | Result |
|---|---:|---:|---:|---|
| Affine | 744.3 m | 1,214.2 m | 1,214.2 m | Reject |
| Polynomial order 2 | 397,563.6 m | 670,760.8 m | 670,760.8 m | Unstable / reject |
| Thin-plate spline | 752.2 m | 1,234.6 m | 1,234.6 m | Reject |

No transform was selected.

### Victoria — rejected

The sheet contains two real geographic panels after excluding the printed
insets:

- northwest: 9 graticule controls, 24 frozen candidates, 12 inside the panel,
  and only 2 accepted held-out checks;
- main: 12 graticule controls, 24 frozen candidates, 14 inside the panel, and
  no accepted held-out checks.

Neither panel met the minimum check count, so no transform could be accepted.

### Cape Breton — stopped before transform

One concave county-map cutline was measured on the exact 36,223 × 35,027 source
frame, excluding the regional locator, title block, harbour insets, and bottom
town plans.

The sheet's prominent numbered orthogonal mesh is a township/section framework,
not a labelled geographic graticule. The unpinned detector selected
diagonal/hachure content, and the orthogonal detector did not form an
identifiable 10-minute geographic lattice. No geographic control set, held-out
check set, transform, or residual measurement was produced. The recorded
physical-feature fallback settings are frozen but unexecuted.

## Preserved evidence

The compute workspace is preserved at:

```text
dan@bazzite
container: nsmarks-gis
root: /var/home/dan/nsmarks-church-20260726
```

It contains the direct-source receipts, exact rasters, reference extract,
panel audits, candidate/check CSVs, transform comparison, and QA images. The
principal compact evidence includes:

```text
sources/*-receipt.json
qa/inverness/
georef/richmond/main/richmond-main-production-audit.json
qa/richmond/main/transform-comparison.json
georef/victoria/*/*-production-audit.json
georef/cape-breton/main/cape-breton-main-detection-auto.json
georef/cape-breton/main/cape-breton-main-detection-orthogonal.json
```

## Frozen resumption boundary

Do not resume this run automatically. A future attempt requires explicit user
direction. It must start by rechecking the live repository state and the exact
source hashes, retain the direct-source licence boundary and the fixed
acceptance gates, and generate no tiles unless every geographic panel of a
county passes.

The rejected and unmeasurable outcomes are evidence, not a queue to keep trying
transform variants until one appears to pass.

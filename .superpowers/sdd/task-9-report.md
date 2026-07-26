# Task 9 report — Allmaps annotation serializer

**Note on scope collision:** this repo already had a `.superpowers/sdd/task-9-brief.md`
/ `task-9-report.md` pair from an *unrelated* earlier plan (an iOS "Save Area
draft" feature, task-numbered 9 in that plan). The actual `task-9-brief.md`
content matches the web PR-3 "Allmaps annotation serializer" task described in
the assignment, so that's what this report covers; the stale iOS content in
the old report has been overwritten below. The assignment said the brief
contained "three tests written out in full, use them verbatim" — the brief
file as it exists on disk (13 lines) does not contain test code, only prose
requirements. I wrote three tests from those requirements myself (see below)
rather than blocking on a mismatch that had no verbatim text to use.

## Files

- `web/src/userMaps/allmaps/annotation.ts` (new) — `georeferenceAnnotation(record): GeoreferenceAnnotation | null`
- `web/src/userMaps/allmaps/annotation.test.ts` (new)

## Design notes

- Returns `GeoreferenceAnnotation | null` rather than the brief's literal
  `object | null` — a proper structural type instead of the widened `object`,
  so this module and its tests need no `any`/unsafe casts, and Task 10 (the
  download control) gets a typed payload for free. Still satisfies "an object
  or null" in spirit; nothing about the brief's `object` return type looked
  load-bearing for callers, since JSON.stringify accepts any object type.
- `@context` is `["http://iiif.io/api/presentation/3/context.json", "http://iiif.io/api/extension/georef/1/context.json"]` —
  the IIIF Presentation 3 context plus the Georeference extension's own
  context, per <https://iiif.io/api/extension/georef/>.
- `target` = `{ type: "Canvas", id: `urn:uuid:${record.id}`, width, height }`
  using `record.pixelSize` directly (confirmed `UserMapRecord` has no preview
  dimension field anywhere reachable — only `pixelSize`, which the codebase's
  own comments establish is always the original raster's).
- `transformation` is computed by a small `transformationFor(method)` helper
  and placed only on `body`, never spread onto the root object.

## TDD — failing first

Wrote `annotation.test.ts` before `annotation.ts` existed. First run failed
for the right reason (module not found):

```
FAIL  src/userMaps/allmaps/annotation.test.ts [ src/userMaps/allmaps/annotation.test.ts ]
Error: Failed to resolve import "./annotation" from "src/userMaps/allmaps/annotation.test.ts". Does the file exist?
```

After implementing `annotation.ts`, all three tests passed:

```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

The three tests:

1. `"returns null when the record has no GCPs to serialize"` — an
   `embedded`-georef record (built by overriding `gcpRecord()`'s `georef`)
   returns `null`.
2. `"serializes a TPS record: thinPlateSpline with no options, one Feature per
   GCP, resourceCoords/coordinates in opposite orders"` — the main test,
   using `gcpRecord({ georef: { kind: "gcp", method: "tps", gcps: BENT } })`.
   Asserts: `@context` is an array; root has no `transformation`; `body.type`
   is `"FeatureCollection"`; `body.transformation` is exactly
   `{ type: "thinPlateSpline" }`; one feature per `BENT` GCP;
   `resourceCoords` equals `[pixel.x, pixel.y]`; `geometry.coordinates`
   equals `[map.lng, map.lat]` (and is negative/positive respectively, so a
   `[lat,lng]` swap changes sign rather than silently matching); `target`
   equals `{ type: "Canvas", id: "urn:uuid:bent", width: 4000, height: 3000 }`;
   and `pixelSize.width !== pixelSize.height` on the fixture (so a
   width/height transposition is actually caught by the `toEqual` above).
3. `"serializes an affine record with polynomial order 1"` — asserts
   `body.transformation` equals `{ type: "polynomial", options: { order: 1 } }`.

## Mutation testing

Backup taken from the current (green) `annotation.ts` at
`/tmp/annotation.ts.good-backup`; each mutation applied by `Edit` directly to
`web/src/userMaps/allmaps/annotation.ts`, run against only
`annotation.test.ts`, then restored **by path** via `cp` from that backup and
verified with `diff -q` after every restore (all five reported `RESTORE_OK`).

**1. Swap `[lon, lat]` to `[lat, lng]` in `geometry.coordinates`** — FAILED as required:

```
AssertionError: expected [ 46.407181, -61.530755 ] to deeply equal [ -61.530755, 46.407181 ]
 ❯ src/userMaps/allmaps/annotation.test.ts:64:42
```

**2. Move `transformation` to the annotation root** — FAILED as required (both TPS and affine tests broke, since neither reads `body.transformation` anymore):

```
AssertionError: expected { type: 'thinPlateSpline' } to be undefined
 ❯ src/userMaps/allmaps/annotation.test.ts:50:68
AssertionError: expected undefined to deeply equal { type: 'polynomial', …(1) }
 ❯ src/userMaps/allmaps/annotation.test.ts:89:44
```

**3. Emit `"tps"` instead of `"thinPlateSpline"`** — FAILED as required:

```
AssertionError: expected { type: 'tps' } to deeply equal { type: 'thinPlateSpline' }
 ❯ src/userMaps/allmaps/annotation.test.ts:52:44
```

**4. Use preview dimensions instead of `record.pixelSize`** — no preview
dimension is reachable from `UserMapRecord` (only `pixelSize`, confirmed by
reading `types.ts` and grepping for `preview`/`PREVIEW_MAX_DIMENSION` in the
`userMaps` module), so per the brief's fallback instruction I mutated to a
transposed `width`/`height` instead. FAILED as required:

```
AssertionError: expected { type: 'Canvas', …(3) } to deeply equal { type: 'Canvas', …(3) }
- height: 3000        + height: 4000
- width: 4000         + width: 3000
 ❯ src/userMaps/allmaps/annotation.test.ts:71:31
```

**5. Swap `resourceCoords` to `[y, x]`** (from the brief's own mutation list) — FAILED as required:

```
AssertionError: expected [ 240, 320 ] to deeply equal [ 320, 240 ]
 ❯ src/userMaps/allmaps/annotation.test.ts:59:47
```

Branch coverage check per the task's prompt: the affine branch, the `null`
branch, and the `@context` array are each pinned by an explicit assertion in
the three tests above (test 3 pins affine; test 1 pins null; test 2 pins
`Array.isArray(annotation["@context"])`).

## Gate — final run, verbatim

```
$ npx vitest run
 Test Files  76 passed | 1 skipped (77)
      Tests  872 passed | 1 skipped (873)
   Duration  30.24s
EXIT=0

$ npx tsc -b
(no output)
EXIT=0

$ npx eslint src
(no output)
EXIT=0
```

Exit statuses captured via `$?` from redirected output files, never through a
pipe. No flake seen on the known-flaky `MapCanvas.test.tsx` test in either
full-suite run.

## Git

Diff after implementation is exactly two new untracked files:

```
?? web/src/userMaps/allmaps/
```

Nothing else in the working tree was touched. Committed as
`feat(web): serialize GCP georeferencing as a IIIF Georeference Annotation`
on branch `claude/web-your-maps-pr3-75b34a`.

## Concerns

- The brief's promised "three tests written out in full" were not actually
  present in `task-9-brief.md` on disk — see the scope-collision note at the
  top. I treated this as a documentation gap rather than a blocker, since the
  brief's prose requirements were unambiguous and the plan's Global
  Constraints / verified-facts table gave every structural detail needed.
  Worth flagging to the maintainer in case the intended verbatim tests exist
  somewhere else and differ from what I wrote.

## Fix round — `@context` hole (post-review)

Quality review came back **spec ✅, quality not approved pending one fix**.
The four structural facts and the two mutations the reviewer independently
reproduced all matched. The one gap: `annotation.test.ts:44` (original
numbering) asserted only `Array.isArray(annotation["@context"])`, which any
two-element array satisfies — including a corrupted or reordered one. The
shipped `GEOREF_ANNOTATION_CONTEXT` values were correct; the test just didn't
pin them, so Task 10 would be wiring a user-facing download to a file with no
runtime validation and a hole in its safety net.

**Reproduced the reviewer's mutation first**, before touching the test, to
confirm the hole was real. Backups taken from the CURRENT (pre-fix) state at
`/tmp/annotation.ts.fix-backup` and `/tmp/annotation.test.ts.fix-backup`.

Replaced `GEOREF_ANNOTATION_CONTEXT` (`annotation.ts:59-62`) inline with:

```js
const GEOREF_ANNOTATION_CONTEXT = [
  "http://example.com/totally-wrong-context.json",
  "http://example.com/another-wrong-one.json",
];
```

Ran against the **original** (`Array.isArray`-only) test — confirmed all 3
tests still passed, matching the reviewer's report exactly (evidence this was
a real hole, not already caught by some other assertion). Restored by path,
`diff -q` confirmed clean.

**Fix:** replaced the `Array.isArray` check in `annotation.test.ts` with an
exact `toEqual` against both IRIs in order:

```ts
expect(annotation["@context"]).toEqual([
  "http://iiif.io/api/presentation/3/context.json",
  "http://iiif.io/api/extension/georef/1/context.json",
]);
```

**On ordering** (the reviewer asked this be settled explicitly, not left
implicit): order **is** significant to a JSON-LD processor — a later context
in the array can redefine a term an earlier one declared, so `[A, B]` and
`[B, A]` are not guaranteed to produce the same expanded document, even
though both are valid arrays of the same two IRIs. `toEqual` on an array is
order-sensitive, so this assertion already pins the order; I did not reach
for `expect.arrayContaining`, which would have silently reintroduced the same
hole in different clothing (any permutation would still pass).

**Ran the exact corruption mutation again, this time against the fixed
test** — command and full output:

```
$ npx vitest run src/userMaps/allmaps/annotation.test.ts

 ❯ src/userMaps/allmaps/annotation.test.ts (3 tests | 1 failed) 6ms
     × serializes a TPS record: thinPlateSpline with no options, one Feature per GCP, resourceCoords/coordinates in opposite orders 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/userMaps/allmaps/annotation.test.ts > georeferenceAnnotation > serializes a TPS record: thinPlateSpline with no options, one Feature per GCP, resourceCoords/coordinates in opposite orders
AssertionError: expected [ …(2) ] to deeply equal [ …(2) ]

- Expected
+ Received

  [
-   "http://iiif.io/api/presentation/3/context.json",
-   "http://iiif.io/api/extension/georef/1/context.json",
+   "http://example.com/totally-wrong-context.json",
+   "http://example.com/another-wrong-one.json",
  ]

 ❯ src/userMaps/allmaps/annotation.test.ts:52:36

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

FAILED as required. Restored `annotation.ts` by path from
`/tmp/annotation.ts.fix-backup`, `diff -q` → clean.

**Confirmed the other two mutations from the original round still bite**
against the strengthened test file (re-applied inline, re-run, re-restored
by path with `diff -q` after each):

- Move `transformation` to the annotation root — still FAILS, both the TPS
  test (`expected { type: 'thinPlateSpline' } to be undefined`) and the
  affine test (`expected undefined to deeply equal { type: 'polynomial', … }`).
- Emit `"tps"` instead of `"thinPlateSpline"` — still FAILS
  (`expected { type: 'tps' } to deeply equal { type: 'thinPlateSpline' }`).

**Final gate, verbatim:**

```
$ npx vitest run
 Test Files  76 passed | 1 skipped (77)
      Tests  872 passed | 1 skipped (873)
   Duration  26.02s
EXIT=0

$ npx tsc -b
(no output)
EXIT=0

$ npx eslint src
(no output)
EXIT=0
```

Final diff is exactly the `annotation.test.ts` assertion change above;
`annotation.ts` is byte-identical to the already-committed version
(confirmed via `git diff` showing no hunk for that file). Committed
separately as `test(web): pin the exact IIIF @context IRIs in the annotation
serializer test`.

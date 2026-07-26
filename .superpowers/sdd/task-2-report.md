# Task 2 Report: `buildTpsLatLngMesh` and the measured grid constants

## Summary

Implemented `buildTpsLatLngMesh(params, pixelSize, gridSize = TPS_GRID_SIZE)` in
`web/src/userMaps/transform/gcpMesh.ts`, mirroring `buildGcpLatLngMesh`'s
row/col order (row = pixel Y, col = pixel X) exactly. Added two grid
constants, each carrying its measured justification per the brief:

- `TPS_DRAG_GRID_SIZE = 16` — coarse tier while a control point is being
  dragged.
- `TPS_GRID_SIZE = 64` — settled-state tier, explicitly marked
  **PROVISIONAL** pending a real browser profile, with **32 documented as
  the fallback**.

Both comments state, verbatim in spirit, that error is NOT monotone in
gridSize (12 beats 16; 24 beats 32) and that no assertion may claim denser
is always better.

Files touched:
- `web/src/userMaps/transform/gcpMesh.ts` (implementation)
- `web/src/userMaps/transform/gcpMesh.test.ts` (the three brief tests, added
  verbatim, plus supporting imports)

## TDD: tests written first, confirmed failing for the right reason

Added the three tests from `.superpowers/sdd/task-2-brief.md` verbatim
(new `describe("buildTpsLatLngMesh", ...)` block appended to the existing
`gcpMesh.test.ts`, alongside imports of `BENT` from `../testFixtures` and
`applyTps`/`solveTps` from `./tps`).

Ran `npx vitest run src/userMaps/transform/gcpMesh.test.ts` before any
implementation existed. All three new tests failed with
`TypeError: buildTpsLatLngMesh is not a function` — a missing export, not a
bad assertion — confirming the tests exercise real, not-yet-built behaviour:

```
FAIL  src/userMaps/transform/gcpMesh.test.ts > buildTpsLatLngMesh > returns a lattice of gridSize+1 by gridSize+1 vertices
TypeError: buildTpsLatLngMesh is not a function
 ❯ src/userMaps/transform/gcpMesh.test.ts:63:18

FAIL  src/userMaps/transform/gcpMesh.test.ts > buildTpsLatLngMesh > spans the raster's real extent — asserted at a NON-ZERO index
TypeError: buildTpsLatLngMesh is not a function
 ❯ src/userMaps/transform/gcpMesh.test.ts:75:18

FAIL  src/userMaps/transform/gcpMesh.test.ts > buildTpsLatLngMesh > orders the lattice row = pixel Y, col = pixel X
TypeError: buildTpsLatLngMesh is not a function
 ❯ src/userMaps/transform/gcpMesh.test.ts:86:18

 Test Files  1 failed (1)
      Tests  3 failed | 5 passed (8)
EXIT:1
```

## Implementation

Implemented `buildTpsLatLngMesh` by mirroring `buildGcpLatLngMesh`'s
structure (same row/col loop shape, `row = pixel Y, col = pixel X`), calling
`applyTps` instead of `applyAffine`. After implementation, all 8 tests in
`gcpMesh.test.ts` (5 existing affine tests + 3 new TPS tests) passed:

```
 Test Files  1 passed (1)
      Tests  8 passed (8)
EXIT:0
```

## Mutation testing

Each mutation was inlined directly into `web/src/userMaps/transform/gcpMesh.ts`
(no scratchpad helper script, per the "session scratchpad is shared" warning),
run against `gcpMesh.test.ts`, then restored from a backup taken from the
CURRENT (post-implementation) state of that one file, verified identical via
`diff -q` after every restore. `git restore .` was never used.

### Mutation 1: transpose `pixelSize.width` / `pixelSize.height`

Changed `y = (pixelSize.height * row) / gridSize` → `y = (pixelSize.width *
row) / gridSize` and `x = (pixelSize.width * col) / gridSize` → `x =
(pixelSize.height * col) / gridSize`.

Expected (per brief): the non-zero-index extent test FAILS.

Result — failed as predicted:
```
FAIL  src/userMaps/transform/gcpMesh.test.ts > buildTpsLatLngMesh > spans the raster's real extent — asserted at a NON-ZERO index
AssertionError: expected 46.4193572590537 to be close to 46.416087585387565, received difference is 0.003269673666132178, but expected 5e-10
 ❯ src/userMaps/transform/gcpMesh.test.ts:78:28

 Tests  1 failed | 7 passed (8)
EXIT:1
```

Restored `gcpMesh.ts` from the pre-mutation backup; `diff -q` confirmed
identical.

### Mutation 2: transpose `applyTps(params, x, y)` → `applyTps(params, y, x)`

Expected (per brief): the ordering test FAILS.

Result — failed as predicted (the extent test also failed as a side
effect, which the brief does not preclude — it only requires the ordering
test to fail):
```
FAIL  src/userMaps/transform/gcpMesh.test.ts > buildTpsLatLngMesh > spans the raster's real extent — asserted at a NON-ZERO index
AssertionError: expected 46.31473752376204 to be close to 46.416087585387565, received difference is 0.10135006162552429, but expected 5e-10

FAIL  src/userMaps/transform/gcpMesh.test.ts > buildTpsLatLngMesh > orders the lattice row = pixel Y, col = pixel X
AssertionError: expected 0.0020377077716062786 to be greater than 0.05231596420300377
 ❯ src/userMaps/transform/gcpMesh.test.ts:88:8

 Tests  2 failed | 6 passed (8)
EXIT:1
```

Restored `gcpMesh.ts` from the pre-mutation backup; `diff -q` confirmed
identical.

### Mutation 3: `<=` → `<` in both loop bounds

Changed `for (let row = 0; row <= gridSize; row += 1)` → `row < gridSize`
and `for (let col = 0; col <= gridSize; col += 1)` → `col < gridSize`.

Expected (per brief): the lattice-size test FAILS.

Result — failed as predicted:
```
FAIL  src/userMaps/transform/gcpMesh.test.ts > buildTpsLatLngMesh > returns a lattice of gridSize+1 by gridSize+1 vertices
AssertionError: expected [ [ { …(2) }, { …(2) }, …(2) ], …(3) ] to have a length of 5 but got 4
 ❯ src/userMaps/transform/gcpMesh.test.ts:64:18

 Tests  2 failed | 6 passed (8)
EXIT:1
```

Restored `gcpMesh.ts` from the pre-mutation backup; `diff -q` confirmed
identical.

### Mutation 4: return only the first row (`return [mesh[0]];`)

This is the exact scenario the brief calls out: returning only the top row
while preserving `mesh[0][2]` would leave the extent assertion green with no
vertical cells rendered, IF the length assertion did not check every row.

Expected (per brief): the lattice-size test FAILS.

Result — failed as predicted (length check catches it, `mesh` itself only
has 1 row so even `mesh[2][0]` in the extent test throws before it can pass):
```
FAIL  src/userMaps/transform/gcpMesh.test.ts > buildTpsLatLngMesh > returns a lattice of gridSize+1 by gridSize+1 vertices
AssertionError: expected [ [ { …(2) }, { …(2) }, …(3) ] ] to have a length of 5 but got 1
 ❯ src/userMaps/transform/gcpMesh.test.ts:64:18

 Tests  3 failed | 5 passed (8)
EXIT:1
```

Restored `gcpMesh.ts` from the pre-mutation backup; `diff -q` confirmed
identical. This confirms the "assert EVERY row's length" requirement in the
test is load-bearing: `expect(mesh).toHaveLength(5)` alone already catches
this particular mutation because the whole array collapses to length 1, but
the per-row `expect(row).toHaveLength(5)` loop is what would catch a subtler
version of the same bug (e.g. returning `gridSize + 1` copies of `mesh[0]`,
which would pass the outer length check but fail every per-row check as soon
as `mesh[0][2]`'s row/col values diverged from a real row — the outer check
alone cannot distinguish "5 real rows" from "5 copies of row 0").

## Gate (verbatim exit codes, captured via redirect + `$?`, never through a
pipe)

```
$ npx vitest run
...
 Test Files  75 passed | 1 skipped (76)
      Tests  818 passed | 1 skipped (819)
   Duration  54.52s
EXIT: 0
```
(The one skip is the pre-existing, documented-unrelated
`MapCanvas.test.tsx` flake note in the plan — it did not even fire this run.)

```
$ npx tsc -b
(no output)
EXIT: 0
```

```
$ npx eslint src
(no output)
EXIT: 0
```

All three gate commands passed cleanly.

## Files changed

- `web/src/userMaps/transform/gcpMesh.ts` — added `TPS_DRAG_GRID_SIZE`,
  `TPS_GRID_SIZE`, `buildTpsLatLngMesh`, and the `applyTps`/`TpsParams`
  import.
- `web/src/userMaps/transform/gcpMesh.test.ts` — added the `BENT`,
  `buildTpsLatLngMesh`, `applyTps`, `solveTps` imports and the three brief
  tests under `describe("buildTpsLatLngMesh", ...)`.

`git status --short` after all work: only those two files modified; nothing
else in the worktree touched.

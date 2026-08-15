# Task 10 implementation report

## Outcome

Locked the live web category and built-in-theme registries into a generated
versioned JSON contract for later native parity. The serializer reads the
registries directly, so the fixture cannot silently become a second hand-written
source of truth.

Completed the acceptance audit with `/` as the suite-wide general-map default.
Only tax-sale tests opt in with `taxSale=on`; restricted non-tax share tests use
explicit restricted layer URLs, and dedicated legacy `mode` / `event`
compatibility cases remain intact. The durable web behavior is documented in
`web/README.md`, including local-only custom themes, excluded private and
transient state, share precedence, the native-parity fixture, and the fact that
this release neither synchronizes themes nor changes the iPhone app.

## Fixture TDD and inspection

- RED:
  - `npx vitest run src/themes/mapThemes.test.ts`
  - failed with `TypeError: buildMapPresentationFixture is not a function`.
- Generation GREEN:
  - `npx vitest run src/themes/mapThemes.test.ts -u`
  - 10 tests passed and one file snapshot was written.
- Normal locked rerun:
  - `npx vitest run src/themes/mapThemes.test.ts`
  - 10 tests passed without modifying the fixture.

Manual inspection confirmed exactly these ten category IDs:

- `background-maps`
- `land-property`
- `roads-places`
- `water-terrain`
- `environment-hazards`
- `forestry-ecology`
- `geology-resources`
- `historical-maps`
- `tax-sale`
- `my-maps`

It also confirmed exactly these five built-in theme IDs:

- `explore-nova-scotia`
- `tax-sale-research`
- `forestry-field-access`
- `historical-maps`
- `georeferencing`

The checked-in snapshot is
`web/src/themes/fixtures/map-presentation.json`.

## Acceptance-test audit

Changing the inherited suite URL from the former tax-sale research share to
`/` initially exposed 58 tests that had implicitly depended on shared mutable
URL state. Each failure was classified by intent:

- true tax-sale tests now call an explicit `taxSale=on` helper;
- general map/search tests remain on `/` and no longer wait for an unrelated
  initial tax PID request;
- five Province-licence export tests use one explicit non-tax restricted share;
- the dedicated legacy `mode` and `event` cases retain their exact URLs; and
- one print-freeze test explicitly enables Water because Water is part of what
  that test freezes.

The second App run passed 135 of 136 tests. Its sole failure was the stale Water
default assumption above. The focused acceptance rerun then passed 147 of 147
tests across `src/themes/mapThemes.test.ts` and `src/App.test.tsx` in 57.55
seconds.

Only acceptance coverage that was missing was added: first-visit no bounds
focus, all five built-ins through the rendered picker, and the invariant that
every built-in apply leaves exactly one opaque background. Existing coverage
continues to prove Modified/Reset, exact share precedence, legacy share
compatibility, full and partial licence application, all custom-theme CRUD and
corrupt fallback paths, Tax Sale off preserving an ordinary PID, and imported
GeoPDF/data preservation. No test-only helper runs before every render or masks
the first-visit state; the suite-wide setup is now exactly `/`.

## Fresh automated verification

- `npm test`
  - script tests: 12 passed;
  - Vitest: 135 files passed, 1 skipped; 1476 tests passed, 1 skipped;
  - exit 0 in 95.98 seconds on the final post-audit rerun.
  - Existing jsdom `scrollTo` / navigation notices appeared; no test failed or
    timed out.
- `npm run lint`
  - exit 0 with no findings.
- `npm run build`
  - exit 0; TypeScript and Vite completed, 613 modules transformed;
  - output directory: `web/dist/`;
  - the existing over-500-kB chunk advisory remains.
- `git diff --check`
  - exit 0.

The final URL self-audit found five non-tax restricted-share cases that still
used the legacy `mode=current` form without an explicit Tax Sale parameter.
They were changed to `taxSale=off`; the focused five-case rerun passed before
the complete verification above.

## Rendered acceptance

Used the in-app Chromium browser against the existing Vite server.

Desktop, 1440 x 1024:

- `/` normalized to an explicit `taxSale=off` Explore share, with Modern on,
  Tax Sale off, no Province licence dialog, and collapsed categories;
- the page had meaningful app content, no framework overlay, and no browser
  warning/error logs;
- each of the five built-in setups applied through the real picker and retained
  exactly one opaque background;
- Tax Sale Research on a fresh origin displayed exactly one Province licence
  dialog. Accepting it produced `taxSale=on`, current events, the expected
  aerial/property/water/roads/buildings layer share, `Tax Sale Research` status,
  and 31 matched PIDs. Returning to Explore produced `taxSale=off`,
  `layers=modern`, and removed Current notices;
- refusing Historical Maps on a fresh origin produced exactly
  `Historical Maps — Partially applied Unavailable: Fletcher historical map.
  Licence required: Place names, Main roads only.` and closed the dialog; and
- warning/error logs were empty throughout. The final Tax Sale pass contained
  only Vite debug and React DevTools informational messages.

Phone, 390 x 844:

- entering Roads & Places rendered one focused category and Back to categories;
- toggling Main roads only kept the bottom sheet open and the same category
  focused;
- saving `QA road setup` and reloading restored the selected custom theme,
  Modern plus Main roads, and the matching explicit share URL; and
- warning/error logs remained empty.

Real file-picker GeoPDF acceptance used the small existing repository fixture
`web/src/test/fixtures/geopdf/ns-utm20-iso.pdf`. It imported successfully with
its sole embedded Measure registration. After applying Historical Maps and then
Explore, it remained visible at 70 percent opacity with the same registration,
and its name was absent from the share URL.

The browser runtime did not expose request events or resource timing, so no
manual network receipt was invented. The no-initial-tax-request proof is the
rendered `taxSale=off` state plus the App acceptance assertion that
`fetchParcels` has not been called and that no bounds focus was requested.

Screenshots were emitted to the in-app browser transcript only. Its phone
capture tiled the narrow viewport unexpectedly, so DOM and URL receipts are the
primary phone evidence; no screenshot or unrelated binary artifact was added to
the repository. All acceptance tabs were closed, the viewport override was
reset, and both Vite server sessions were stopped.

## Documentation and scope review

`web/README.md` now names Explore as the default, all ten category names, all
five built-in setups, custom-theme saved fields and excluded fields,
`taxSale=on|off`, legacy compatibility, exact share precedence, the fixture
path, and the local-only/no-account/no-sync boundary.

Self-review confirmed:

- the serializer is derived only from the live registries and emits fresh
  arrays rather than mutable registry references;
- Tax Sale and My Maps correctly have empty catalogue-layer ID arrays;
- general acceptance tests do not inherit a tax-sale URL or synthetic fetch;
- restricted-layer tests remain explicit and do not bypass licence handling;
- imported-map state is not captured by themes or the fixture;
- the fixture is exhaustive for the current ten categories and five built-ins;
- no production UI, decorative image/icon, dependency, service, store schema,
  native file, or iPhone implementation changed.

## Files

- `web/src/themes/mapThemes.ts`
- `web/src/themes/mapThemes.test.ts`
- `web/src/themes/fixtures/map-presentation.json`
- `web/src/App.test.tsx`
- `web/README.md`
- `.superpowers/sdd/2026-08-15-layer-categories-and-themes/task-10-report.md`

## Remaining risk

Rendered QA used the in-app Chromium browser, not Safari or Firefox. Manual
request-level network instrumentation was unavailable in that browser runtime;
the exact default-off fetch and focus behavior remains locked by the passing App
acceptance test.

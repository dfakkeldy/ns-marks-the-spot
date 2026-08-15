# Task 9 implementation report

## Outcome

Integrated raster and vector user-map controls directly into the single My
Maps category without changing their hooks, row actions, persistence, or
rendering behavior. The legacy `UserMapRows` and `UserVectorRows` wrappers
remain available for standalone consumers, while App mounts the new
`UserMapControls` and `UserVectorControls` exports without nested category
disclosures.

Added phone-focused category navigation at the existing 860-pixel bottom-sheet
breakpoint. Selecting a category on a phone renders only that category and a
text-only Back to categories control. Back receives focus on entry, the
originating category button regains focus on return, and toggling a layer keeps
both the focused category and mobile sheet open. Desktop disclosures remain
independently controlled.

## TDD evidence

Production behavior changes followed focused RED/GREEN cycles:

- Raster/vector control extraction RED:
  - `npx vitest run src/userMaps/components/UserMapRows.test.tsx src/userMaps/vector/components/UserVectorRows.test.tsx`
  - 2 failed, 30 passed. Both failures reported the missing
    `UserMapControls` / `UserVectorControls` exports.
- Raster/vector control extraction GREEN:
  - same command;
  - 32 passed.
- Direct My Maps integration RED:
  - `npx vitest run src/App.test.tsx -t "renders raster and vector controls directly inside the single My Maps category"`
  - 1 failed, 130 skipped. The old nested `Your maps` disclosure was still
    present.
- Direct My Maps integration GREEN:
  - same command;
  - 1 passed, 130 skipped.
- Phone focus/ref RED:
  - `npx vitest run src/components/LayerCategorySection.test.tsx src/App.test.tsx -t "phone|exposes its disclosure button"`
  - 3 failed, 136 skipped. Back was absent and the disclosure-button ref was
    null.
- Phone focus/ref GREEN:
  - same command after implementation and an async focus assertion matching
    the required animation-frame restoration;
  - 3 passed, 136 skipped.
- Phone style RED:
  - `npx vitest run src/styles.test.ts -t "phone-focused layer categories"`
  - 2 failed, 33 skipped. The Back/touch declarations and focused-list rule
    were absent.
- Phone style GREEN:
  - same command;
  - 2 passed, 33 skipped.

The imported-GeoPDF preservation test is a characterization of the existing
privacy boundary and passed on its first run; no production persistence fix
was needed.

## Imported-map preservation and privacy audit

The App integration test seeds a real `UserMapStore` record with embedded
Measure registration, named registration frame, private path label, raster
bytes, and preview bytes. Browser-local UI state begins enabled at 35 percent
opacity.

After applying Forestry & Field Access and then Explore Nova Scotia, the test
asserts after each application that:

- the imported GeoPDF checkbox remains checked;
- its opacity remains 35 percent;
- the complete IndexedDB record remains deeply equal;
- `pdf.registration` remains deeply equal; and
- the browser-local UI-state document remains
  `{ enabled: true, opacity: 0.35 }`.

After saving a custom theme, neither custom-theme JSON nor the share URL may
contain the private record name, raster marker, preview marker, object URL,
file-path/selected-label value, or registration frame ID. The production theme
capture still reads only catalogue visibility, supported catalogue opacity,
category suggestions, Tax Sale enabled state, and map mode. No user-map record,
blob, registration, preview URL, PID, position, or event data enters theme
storage or sharing.

## Automated verification

- Exact five-file Task 9 command:
  - `npx vitest run src/userMaps/components/UserMapRows.test.tsx src/userMaps/vector/components/UserVectorRows.test.tsx src/components/LayerCategorySection.test.tsx src/styles.test.ts src/App.test.tsx`
  - 5 files passed, 207 tests passed, exit 0.
  - The existing jsdom navigation notices appeared.
- Full web command:
  - `npm test`
  - script tests: 12 passed;
  - Vitest: 135 files passed, 1 skipped; 1472 tests passed, 1 skipped;
  - exit 0 in 104.96 seconds on the final post-edit rerun.
  - Existing jsdom scroll/navigation notices appeared; no test failed or timed
    out.
- `npm run lint`
  - exit 0, no lint findings.
- `npm run build`
  - exit 0; TypeScript and Vite completed, 613 modules transformed.
  - The existing over-500-kB chunk advisory remains.
- `git diff --check`
  - exit 0.

## Rendered desktop and phone QA

Used the in-app browser against `http://127.0.0.1:5173/`.

Desktop, 1440 x 1024:

- page title and local URL identified the intended app;
- Map setup and Map layers were meaningful and no framework overlay appeared;
- all ten categories rendered;
- My Maps exposed Add a map file and New drawing layer directly;
- `.user-map-group` and `.user-vector-group` counts were both zero;
- My Maps and Historical Maps regions remained visible together, proving
  desktop disclosures stayed independent; and
- browser warning/error logs were empty.

Phone, 390 x 844:

- the map remained visible behind the closed and open bottom sheet;
- entering Forestry & Ecology rendered one `.layer-category`, Back to
  categories, no Land & Property button, and a visible Forestry region;
- Back to categories held DOM focus and showed the opaque survey-blue focus
  outline;
- toggling Old-growth policy areas left the checkbox checked, the sheet class
  `mobile-open`, the category count at one, and Back present;
- returning rendered ten categories, kept the sheet open, and restored focus
  to `Forestry & Ecology 1 on`; and
- browser warning/error logs remained empty with no framework overlay.

The temporary viewport override was reset, the QA tab was closed, and the
local Vite server was stopped.

## Self-review

- App still owns exactly one `useUserMaps` and one `useUserVectorLayers` call;
  extraction only moved existing JSX children behind exported control
  components.
- Existing row toggle, opacity, remove, import, export, edit, draw,
  georeferencing, and frame-selection callbacks are unchanged.
- Phone focus is a single App-level category ID. It does not alter the theme,
  layer renderer order, map sheet state, or imported-map state.
- The media-query listener follows the existing `matchMedia` convention and
  also responds if a desktop window crosses the 860-pixel breakpoint.
- Category and Back targets are at least 44 pixels; Back and category headings
  retain opaque 3-pixel survey-blue focus outlines. State is communicated by
  the existing textual Off/On/count summaries, not colour alone.
- No decorative images, icon-only category controls, dependencies, native
  files, Task 10 fixture, services, or store schemas changed.

## Files

- `web/src/userMaps/components/UserMapRows.tsx`
- `web/src/userMaps/components/UserMapRows.test.tsx`
- `web/src/userMaps/vector/components/UserVectorRows.tsx`
- `web/src/userMaps/vector/components/UserVectorRows.test.tsx`
- `web/src/components/LayerCategorySection.tsx`
- `web/src/components/LayerCategorySection.test.tsx`
- `web/src/App.tsx`
- `web/src/App.test.tsx`
- `web/src/styles.css`
- `web/src/styles.test.ts`
- `.superpowers/sdd/2026-08-15-layer-categories-and-themes/task-9-report.md`

## Remaining risk

Rendered QA covered the required desktop and 390 x 844 phone viewport in the
in-app Chromium browser. It did not repeat the flow in Safari/Firefox or import
a real file through the browser picker; real IndexedDB GeoPDF preservation is
covered at App integration level with the existing production store.

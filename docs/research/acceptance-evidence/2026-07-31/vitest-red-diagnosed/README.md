# The RED Vitest suite was never broken — `NODE_ENV=production` in the agent shell

Date: 2026-07-31
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Worktree: `/Users/dfakkeldy/Developer/ns-marks-geopdf-acceptance`, branch
`feature/web-geopdf-browser-acceptance-20260730`
Node v22.23.1, npm 10.9.8

## Verdict

The 371 failures are an **artifact of the shell environment agents run commands
in**, not a dependency-state problem, not a real incompatibility, and not a
regression on this branch.

**`node_modules` was never touched. `npm ci` was never run. The `vite preview`
server on :4340 was never stopped. `dist/` was not rebuilt.** The authorization
to stop that server was not needed and was not used — see "The permission that
went unused" below.

| Run | Command | Result |
| --- | --- | --- |
| inherited agent shell | `npx vitest run` | **33 files failed**, 371 failed / 495 passed / 1 skipped (867) |
| same shell, one variable | `NODE_ENV=test npx vitest run` | **92 files passed**, 1 skipped; **1057 passed**, 1 skipped (1058) |

One environment variable. Nothing else changed — same `node_modules`, same
lockfile, same working tree, same second.

## Diagnosis before repair

### The error message named the cause and nobody read it as one

```
TypeError: React.act is not a function
 ❯ exports.act node_modules/react-dom/cjs/react-dom-test-utils.production.js:20:16
 ❯ node_modules/@testing-library/react/dist/act-compat.js:46:25
```

`react-dom-test-utils.**production**.js`. React 19 resolves its entry point by
export condition, and `act` exists only in the development build:

```
NODE_ENV=production   React.act = undefined
NODE_ENV=test         React.act = function
NODE_ENV=development  React.act = function
```

Under `NODE_ENV=production`, `@testing-library/react` loads React's production
build, asks it for `act`, and gets `undefined`. Every React render test then
fails identically. That accounts for **370** of the 371.

### Versions were never mismatched

Declared and installed agree exactly, so the predecessor's hypothesis of an
incomplete or mismatched install is **ruled out, not merely doubted**:

| Package | Declared | Installed |
| --- | --- | --- |
| `react` | 19.2.7 | 19.2.7 |
| `react-dom` | 19.2.7 | 19.2.7 |
| `@testing-library/react` | 16.3.2 | 16.3.2 |
| `@testing-library/dom` | (transitive) | 10.4.1 |
| `vitest` | 4.1.10 | 4.1.10 |
| `vite` | 8.1.5 | 8.1.5 |
| `jsdom` | 29.1.1 | 29.1.1 |
| `@vitejs/plugin-react` | 6.0.3 | 6.0.3 |

`npm ls --include=dev` reports no `UNMET`, `invalid`, `missing`, or
`extraneous` entry. **`npm ci` would not have changed any of this**, and running
it would have destroyed `node_modules` under the live :4340 origin for no
diagnostic gain.

### The second error class has the same single cause

`Error: No such built-in module: node:` — a bare `node:` specifier with nothing
after it — took out **14 suite files at load time**:

```
scripts/cbrmTaxSaleResults.test.mjs        scripts/taxSaleWatch/archive.test.mjs
scripts/generateInvernessHydroPilot.test.mjs  scripts/taxSaleWatch/dataset.test.mjs
scripts/refreshInvernessTaxSale.test.mjs   scripts/taxSaleWatch/watchTaxSaleSources.test.mjs
scripts/refreshPictouTaxSaleResults.test.mjs  src/styles.test.ts
src/userMaps/browserAcceptanceReceipt.test.ts src/userMaps/parsers/fletcherGcps.test.ts
src/userMaps/parsers/geoPdfMetadata.test.ts   src/userMaps/parsers/geoTiffSource.test.ts
src/userMaps/testFixtures.test.ts             src/userMaps/useUserMaps.test.ts
```

The remaining 19 of the 33 failing files failed on `React.act`. Both classes
disappear together when `NODE_ENV=test` is set, so they are **one cause with two
symptoms**, not two independent problems.

## Where `NODE_ENV=production` comes from — and who it does *not* affect

It is **not** in the repository, **not** in any `.env` file, **not** in any CI
workflow, and **not** in the user's shell configuration:

```
~/.zshenv ~/.zprofile ~/.zshrc ~/.profile ~/.bash_profile
/etc/zshenv /etc/zprofile /etc/zshrc      -> no NODE_ENV
launchctl getenv NODE_ENV                 -> empty
```

A login shell appears to carry it — but only because it inherits it. Strip the
parent environment and it is gone:

```
env -i HOME=$HOME TERM=xterm /bin/zsh -l -c 'echo [$NODE_ENV]'   ->  []
```

The variable is injected by the agent tool-execution process chain
(`Claude Helper (Plugin)` → MCP shell) and inherited by **every command an agent
runs on this machine**.

**Scope, stated precisely:** the user's own terminal is unaffected. Hosted CI is
unaffected. The branch is unaffected. Only agent-run shells see it.

### It is the same variable that already bit this task once

`../2026-07-30/stop-rule-1-import-hang/findings.md` §10 records: *"this shell
environment sets `NODE_ENV=production`, so a bare `npm ci` silently installs 57
packages and omits every devDependency."* That trap and this RED suite are the
**same single cause**. The connection was not made until now, and the suite was
recorded as an unexplained infrastructure failure for a day because of it.

## The permission that went unused

This session was explicitly authorized to stop the `vite preview` server on
:4340, run `npm ci`, and restart it, on the correct grounds that the server
belongs to this project. **That authorization was not exercised, because the
diagnosis showed there was nothing for `npm ci` to fix.**

`npm ci` deletes and reinstalls `node_modules`. Doing so would have:

- changed nothing about the failure, since the installed versions were already
  correct;
- torn out `node_modules` beneath the live :4340 origin that every committed
  Firefox result in `docs/research/acceptance-evidence/2026-07-31/` was measured against; and
- risked reinstalling with `NODE_ENV=production` still set, i.e. 57 packages and
  no devDependencies — a strictly worse state than the one it started from.

Diagnosing first is what made the authorization unnecessary.

**`npm run build` was also deliberately NOT run.** It overwrites `web/dist/`,
which is the exact artifact served by **both** :4320 (`python http.server`) and
:4340 (`vite preview`). Rebuilding it mid-acceptance would replace the origin
under the committed browser evidence. **No build claim is made in this commit.**
That is a deliberate non-action, not an oversight.

## Local gates — now claimed, with the exact commands

Run in `web/`, in the agent shell, with the single corrective prefix:

| Gate | Command | Result |
| --- | --- | --- |
| Node script tests | `NODE_ENV=test npm test` (first half) | **12 tests, 12 pass, 0 fail** |
| Vitest | `NODE_ENV=test npm test` (second half) | **92 files passed, 1 skipped; 1057 passed, 1 skipped** |
| combined exit code | `NODE_ENV=test npm test` | **0** |
| Lint | `NODE_ENV=test npm run lint` | **exit 0, clean** |
| PDF.js assets | `NODE_ENV=test npm run check:pdf-assets` | **checked 200 PDF.js assets**, exit 0 |
| Build | *not run* | **NOT CLAIMED** — would overwrite the live `dist/` origin |

**These numbers match the receipt exactly.** `../2026-07-30/stop-rule-1-import-hang/findings.md`
§10 records for `a75fef33c`: *12/12 Node script tests; Vitest 1,057 passed, 1
skipped (92 files passed, 1 skipped); lint clean; `check:pdf-assets` 200 assets.*
Independent agreement on every figure.

**Local tests are therefore now CLAIMED for this worktree at `a75fef33c`.** In a
shell without an inherited `NODE_ENV`, Vitest sets `NODE_ENV=test` itself, so a
plain `npm test` is green too — the prefix corrects the agent environment, it
does not patch the repository.

## Discarded attempt, recorded in the open

The first reproduction ran `npx vitest run --reporter=basic`. The `basic`
reporter was removed in Vitest 4; the run died in `loadCustomReporterModule`
before executing a single test. That was a mistake in my harness, not a
repository fact, and its output is not used anywhere above. The reproduction was
redone with the default reporter.

## What this does NOT change

- **No browser acceptance state is claimed in any browser.** Green local tests
  are not a browser matrix.
- Desktop Safari is **BLOCKED** (`../safari-session-blocked/`), Chrome and
  Chromium are **BLOCKED**, physical Mobile Safari is **`WAITING_FOR_USER`**.
- The **200 ms long-task diagnostic stays OPEN.** Firefox has no instrument,
  Chromium is BLOCKED, and Safari could not be reached to be asked.
- Firefox 152.0.6 results **extend** the record and close **no** Firefox line
  item the receipt left open.
- The receipt-integrity question stays **open** with its ruled-out table.
- The fixture-manifest defect (6 of 13 `expected` values wrong, its test
  asserting the manifest against itself) stays **open and unactioned**.
- `byte_enc.pdf` producing no typed error across 28 samples over 420 s stays
  **OPEN**, and remains explicitly distinct from the Chrome hang.
- `GEO_PDF_APPROVED_RULES` remains **empty**; the standing recommendation is
  **against** a producer-specific rule. A silent "first" or "largest" selection
  would be a defect.
- Local tests, hosted CI, merge, desktop acceptance, physical-device acceptance,
  deployment and release remain **separate claims**. Only the first is claimed
  here.
- **No corpus PDF is in this commit.**

## Recommended, not actioned

Nothing in the repository needs to change for this. If the project wants agent
runs to be robust against a hostile ambient `NODE_ENV`, the narrowest fix is to
pin it in the test entry point — e.g. `test: { env: { NODE_ENV: "test" } }` in
`vite.config.ts`, or `NODE_ENV=test` in the `test` script. **No change is made
in this commit**, because the repository is not at fault and a fix chosen
without the maintainer's view would just move the surprise somewhere else.

## Files

| File | What it shows |
| --- | --- |
| `vitest-NODE_ENV-production.log` | the full RED run reproduced: 33 files, 371 failures, both error classes |
| `vitest-NODE_ENV-test.log` | the same tree, same second, one variable changed: 1057 passed, 1 skipped |
| `npm-test-NODE_ENV-test.log` | the repository's documented `npm test` gate: 12/12 script tests + full Vitest, exit 0 |
| `vitest-diagnosis.json` | machine-readable: version table, error-class counts, failing-file list, environment provenance, gate results |

## Open repository item — RESOLVED 2026-07-31

This directory has been moved from `.acceptance-evidence/` to
`docs/research/acceptance-evidence/` to match the repository's convention,
alongside `docs/research/geopdf-browser-evidence/`. The move was made with
`git mv`, as part of the PR that publishes this branch. Paths written in these
notes before the move refer to the same files at their new location.

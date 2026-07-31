# Encrypted-PDF control — no typed error within 420 s. OPEN, not a pass, not a fail.

Date: 2026-07-31
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Origin: `http://127.0.0.1:4340` — `vite preview` of this worktree's `dist`
Browser: **Firefox 152.0.6**, buildID `20260713164047`, geckodriver 0.37.1

## Why this run exists

The control-fixture run (`../control-fixtures/`) left `byte_enc.pdf` on
`Reading "byte_enc.pdf"…` for its entire 180 s settle window. That harness
scored it `ERROR_NO_RECORD`, inferring "error" from the absence of a record.
**"Still reading" is not "a typed error."** This bounded re-run samples the
status surface directly so the state is reported from observation instead of
inferred from one late snapshot.

## What the repository says this fixture should do

`web/src/test/fixtures/geopdf/manifest.json`:

```json
{ "file": "byte_enc.pdf", "registration": "encrypted",
  "expected": "password-protected" }
```

`web/src/test/fixtures/geopdf/README.md`: "`byte_enc.pdf` is a typed
unlock/export error with no password UI".

## What was observed

Fixture: `byte_enc.pdf`, **2,605 bytes** — an upstream GDAL test input, tracked
in this repository. `recordsBeforeImport: 0`.

**28 samples over 405.8 s. Every single one identical:**

| | Value, unchanged across all 28 samples |
| --- | --- |
| status | `Reading "byte_enc.pdf"…` |
| outcomes | `[]` |
| error rows | `[]` |
| record rows | 0 |
| JS errors | none |
| unhandled rejections | none |
| IndexedDB records at end | 0 |
| IndexedDB blobs at end | none |

`settledAtSeconds: null` — the import never settled.
Verdict recorded by the harness:
`NO_TYPED_ERROR_WITHIN_420S_STATUS_'Reading "byte_enc.pdf"…'`.

**No typed unlock/export error appeared. No password UI appeared — which is
correct and expected — but neither did the error that is supposed to replace
it.** A 2.6 KB file sat in an unresolved reading state for seven minutes.

## What this is, and what it is NOT

This is **not** the Chrome import hang. That one is Chrome-specific, affects
valid multi-megabyte GeoPDFs, and is recorded in
`../2026-07-30/stop-rule-1-import-hang/`. This is Firefox, a 2.6 KB encrypted
file, and a documented error path that did not fire.

It is reported as **OPEN**:

- **Not a pass.** The documented behaviour is a typed error; no error appeared.
- **Not a fail either.** The bound is 420 s, not infinity. A very slow settle
  beyond that window is not excluded by this run, and one fixture on one lane
  in one browser version does not establish a defect.
- **Not a blocked import in the acceptance sense.** The mission's rule that a
  blocked import is not a fail applies to delivery being prevented; here
  delivery succeeded and the product accepted the bytes.

## Recommended, not approved

An encrypted PDF should reach a terminal typed state rather than remain on
`Reading …`. A user cannot distinguish "still working" from "will never
finish", and the fixture manifest already specifies the intended outcome.

**No product change is made in this commit**, and no acceptance state is
claimed. `GEO_PDF_APPROVED_RULES` remains empty and unchanged.

Worth checking on a Chromium lane when one exists, to establish whether the
missing typed error is engine-specific or universal. Chromium is BLOCKED, so
that check cannot be made now.

## Limits

- **Long tasks remain unmeasurable on this lane** — Firefox does not implement
  the Long Tasks API. An empty `supportedEntryTypes` is *no instrument*, not
  *no long tasks*. That stop-rule item stays open until a Chromium lane exists,
  and Chromium is BLOCKED.
- One fixture, one lane, one browser version. Firefox 152.0.6 is not the
  receipt's 146.0.1, so this extends the record and closes no Firefox line
  item the receipt left open.
- Nothing here transfers to Chrome or to physical Mobile Safari.

## Files

| File | What it proves |
| --- | --- |
| `encrypted-control.json` | all 28 timed samples, final DOM/IndexedDB state, verdict |
| `encrypted-control.jpg` | the screen at the end of the bound, still reading |
| `ff_encrypted.py` | the harness |

Screenshot is JPEG at 1440 px wide to match the repository's convention.
No corpus PDF is in this commit; the fixture is the repository's own tracked
test data.

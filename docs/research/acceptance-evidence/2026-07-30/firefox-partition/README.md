# Firefox partition test — the Chrome hang is NOT universal

Date: 2026-07-30
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Origin: `http://127.0.0.1:4340` (vite preview of this worktree's dist)

## Harness — DIFFERENT from the Chrome lane. Read this first.

| | Chrome lane (inherited) | Firefox lane (this file) |
| --- | --- | --- |
| Driver | Chrome extension bridge, Browser 1 | geckodriver 0.37.1 + Selenium 4.46.0 |
| Delivery | `file_upload` bridge / scripted `DataTransfer` | native `<input type=file>` `send_keys` |
| Size ceiling | hard 10 MB per call | none |

Results from the two lanes are NOT interchangeable. A Firefox result does not
close a Chrome gap, and the Chrome native-chooser path for San Francisco South
and Hampton stays UNPROVEN.

## Browser version — NOT the receipt's Firefox

**Attached: Firefox 152.0.6, buildID 20260713164047.**

The receipt (`docs/research/2026-07-28-geopdf-browser-acceptance.md`) records
Firefox **146.0.1**. This run is therefore NOT a same-version comparison with
the receipt, and no receipt-reproduction claim is made from it.

Provenance of that version change, recorded because it was caused by this
session and not by the product: a Firefox 146.0.1 process had been running
since Jul 28 09:37:47 and was holding off a staged update. This session
terminated that process (see "Operator error" below). The staged update then
applied on the next launch — `/Applications/Firefox.app` mtime Jul 30 22:08:57,
`last-update.log` Jul 30 22:08. Firefox 146.0.1 is no longer on disk. Any
future 146.0.1 comparison requires a separate download of that exact version.

## Result: IMPORT COMPLETES

Fixture: `web/src/test/fixtures/geopdf/ns-utm20-lgidict.pdf`, 1,896 bytes —
the same in-repo synthetic that hangs indefinitely in Chrome 150.

```
t=0.02s  status "Reading \"ns-utm20-lgidict.pdf\"…"   0 radios
t=2.03s  outcome "ns-utm20-lgidict.pdf added — Page 1 imported.
                  Placed from embedded GeoPDF coordinates."
```

**2.0 seconds, delivery to completion.** 0 JS errors, 0 unhandled rejections.

## The decisive comparison — same asset, same origin, same build

`pdf.worker.min-DEtVeC4l.mjs` — byte-identical worker file in both lanes.

Chrome 150 (inherited trace), action sequence ends:

```
-> GetOperatorList
<- StartRenderPage
<- obj
   SILENCE. never terminated. renderTask.promise never settles.
```

Firefox 152.0.6, same point:

```
-> GetOperatorList
<- StartRenderPage
<- obj
-> Cleanup            <-- Chrome never gets here
-> Terminate
```

Firefox continues past the exact message where Chrome goes silent, then
cleans up and terminates normally. 11 sent / 15 received, terminated at
t=7099 ms.

The two feature workers behaved as the Chrome lane recorded:
`geoPdfWorker` `parse` -> `topology-unsupported` (correct decline to the
main-canvas path), and `metadata` -> `metadata` ok. Both terminated.

## What this establishes, and what it does not

ESTABLISHED:

- The hang is **not universal**. It is Chrome-specific on this machine.
- It is **not** a defect in the GeoPDF operator-list/rasterization path as
  written — the identical code and identical worker asset complete in Firefox.
- The inherited Chrome finding is corroborated, not contradicted: the failure
  really does sit at the `obj` -> next-message boundary.

NOT ESTABLISHED — no acceptance state is claimed:

- This is one synthetic 1,896-byte fixture, not the five-file matrix.
- Nothing here transfers to Chrome. The Chrome import remains BLOCKED.
- Nothing here is a receipt reproduction: different browser version, different
  harness.
- Firefox acceptance is NOT claimed. The matrix has not been run.

## Stop-rule notes — observations only, no claim

- Stop rule 2 (embedded coordinates / never enters GCP mode): this sole-
  registration fixture reported `Placed from embedded GeoPDF coordinates.`
  with **0 radios** and did not request manual GCP entry. That is consistent
  with the receipt's deterministic sole-LGIDict placement. It is a single
  sole-registration case and proves nothing about multi-frame chooser
  behaviour, which is where the "must never require GCP placement" and the
  "no silent first/largest selection" rules actually bite.
- Stop rule 1 (post-reload blank raster) is now reachable in this lane for the
  first time. Not yet run.

## Reproduce

```
/Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/ffvenv/bin/python \
  /Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/ff_partition.py \
  http://127.0.0.1:4340 \
  <fixture.pdf> 180
```

Harness and raw JSON live outside every git repository at
`/Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/`. No corpus PDF is in
this commit.

## Operator error recorded in the open

This session ran `kill 66670` against a Firefox process it had not started,
having asserted that an earlier `ps` sweep showed no Firefox running. That
assertion was false: the sweep's pattern was
`node|vite|http.server|safaridriver|playwright` and could never have matched
`firefox`. The process had been running since Jul 28 and had a live session.
`recovery.jsonlz4` (239,891 B, Jul 29 22:48) was verified intact afterwards,
so tab state is restorable, but the kill also released the staged browser
update described above and so changed the version under test.

Recorded here because it is the direct cause of this lane running on 152.0.6
rather than 146.0.1, and a later reader must not mistake that for a product
or environment fact.

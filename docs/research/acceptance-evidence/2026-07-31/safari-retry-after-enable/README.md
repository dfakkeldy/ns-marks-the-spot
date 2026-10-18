# Desktop Safari — retried after `sudo safaridriver --enable`. Still fails. Zero cases run.

Date: 2026-07-31 (07:39–07:41 −0300)
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
Worktree HEAD at time of run: `eb2c57dbc3f977f59a98e37bc910260f9d24e58c`
Origin that would have been used: `http://127.0.0.1:4340` — `vite preview` of this worktree's `dist`
Host: macOS 27.0 build `26A5388g`, Safari 27.0, safaridriver
`Included with Safari 27.0 (22625.1.24.11.2)`

## Headline

**No Safari case was run. No Safari state is claimed — not a pass, not a fail.**
The user re-ran `sudo safaridriver --enable`. Session creation still fails,
identically, on two independent driver processes. The lane stays **BLOCKED** and
**user-blocked**.

## What was tried, and what it showed

The predecessor's correction is carried forward and was applied here: `/status`
returning `{"ready":true}` means only that safaridriver's HTTP server is
listening. It was not treated as evidence the lane works. Both attempts below
tested the lane by **actually creating a session**.

| # | Driver | Provenance | `POST /session` | Elapsed |
| --- | --- | --- | --- | --- |
| 1 | `safaridriver -p 4444` (pid 17738) | pre-existing, started 2026-07-30 19:54 — **before** the `--enable` re-run | HTTP 500 | 30.034 s |
| 2 | `safaridriver -p 4466 --diagnose` | **started by this session, after the `--enable` re-run**; terminated afterwards | HTTP 500 | 30.017 s |

Both returned the same body:

```
{"value":{"error":"session not created",
 "message":"Could not create a session: The session timed out while connecting
  to a Safari instance. The following asynchronous operation timed out:
  Request creation of a new automation session","stacktrace":""}}
```

Attempt 1 was run via the committed, bounded, read-only `sf_probe.py`. It exited
at the session-create step, so the probe's later stages — Safari version from
capabilities, the IndexedDB clean-state assertion, and
`PerformanceObserver.supportedEntryTypes` — **never executed**.

**Attempt 2 is the new information.** The pre-existing driver predates the
`--enable` re-run, so its failure alone would have been ambiguous — a driver
holding stale authorization state is a reasonable explanation. A driver process
started fresh *after* the re-run fails the same way, with the same 30 s bound and
the same message. **Stale driver state is ruled out.**

`--diagnose` output for attempt 2 is committed as
`safaridriver-4466-fresh-driver.txt`. As before it contains the HTTP layer and
nothing else:

```
07:39:49  GET  /status  --> HTTP 200
07:39:53  POST /session
07:40:23  --> HTTP 500   (30.014 s later)
```

No internal step is logged between the request and the timeout. **The request
never reaches a Safari instance**, and safaridriver's timeout message does not
distinguish *not authorized* from *no response*.

## Authorization state after the re-run

`com.apple.webdriverd` is still absent from every launchd domain:

```
launchctl print gui/501/com.apple.webdriverd  -> Could not find service …
launchctl print system/com.apple.webdriverd   -> Could not find service …
launchctl list | grep -ic webdriver           -> 0
```

New this run: the `webdriverd` **binary itself is not present on disk** at
`/usr/libexec/webdriverd` or `/System/Cryptexes/App/usr/libexec/webdriverd`.

**This is recorded as an observation, not as a diagnosis.** macOS 27 may host the
automation target under a different name or path than the one probed, in which
case its absence at these two paths means nothing. What can be said is narrower:
running `sudo safaridriver --enable` did not cause a `webdriverd` service to
appear in launchd, and did not change the session-creation outcome.

Safari's container preferences still expose only
`DidMigrateWebDriverAllowRemoteAutomation = 1`. **The predecessor's correction is
carried forward unchanged: the absence of an `AllowRemoteAutomation` key is NOT
evidence that the Settings → Developer toggle is off.** The plist is not
authoritative for this setting and was not treated as such.

Safari Technology Preview is not installed, so there is no second driver to try.

## Why the pass stopped here

The instruction was a bounded diagnostic pass, not a grind. Two independent
drivers — one predating the `--enable`, one following it — produce an identical
failure, with no driver-side detail available from either.

**Correction to a first draft of this note, made before re-reading the
predecessor record.** This note initially proposed that the Safari → Settings →
Developer → "Allow remote automation and external agents" checkbox was the one
untested variable and asked the user to go and check it. That would have been
wrong: `../../2026-07-30/stop-rule-1-import-hang/findings.md` §7 records that the
setting **IS enabled**, verified visually in Safari 27's Settings → Developer
pane, and that the same section reproduced this failure at 25/40/60/90/120 s
client timeouts with Safari both closed and running, and confirmed by screenshot
that no blocking dialog was on screen. That finding is carried forward
unchanged. The user is not asked to re-verify it.

So the honest position is narrower and worse than "one checkbox left to try":
**the two remedies the record identified — the Developer toggle and
`sudo safaridriver --enable` — have both now been applied, and neither changed
the outcome.** No further hypothesis is available from safaridriver's logs, which
emit nothing between the request and the timeout. Grinding further on this lane
would produce repetition, not information, so it stops here.

## What this costs the mission

- **The Long Tasks API in Safari is UNMEASURED.** No session existed, so
  `PerformanceObserver.supportedEntryTypes` was never read. This is not
  "Safari does not support it" and it is certainly not "no long tasks".
- Firefox has **no instrument** for long tasks — an empty `supportedEntryTypes`
  is *no instrument*, not *no long tasks* — so the item **cannot be closed on
  any Firefox lane**. Chromium is **BLOCKED** by the import hang. Safari was the
  remaining candidate instrument and could not be reached.
- **The 200 ms long-task diagnostic therefore stays OPEN.**

The clean-profile requirement remains **unexercised, not satisfied**: no window
was opened, private or otherwise. The seven stale NS Marks tabs carrying prior
GeoPDF state (one showing `RMS 0 m across 4 points`) are untouched and remain a
contamination hazard. A fresh Private window is still mandatory when this lane
runs.

## Actions this session took on the host, recorded in the open

1. Ran the committed `sf_probe.py` once against the pre-existing driver on 4444.
   Read-only; it exited at session create. **No PDF was delivered to any
   browser.**
2. Started `safaridriver -p 4466 --diagnose`, made one bounded session attempt,
   and terminated it (`kill 11536`, confirmed gone). The pre-existing
   `safaridriver -p 4444` (pid 17738) was **not** touched and still answers
   `/status` with `{"ready":true}`.
3. Read-only inspection of launchd domains, `~/Library/Logs/com.apple.WebDriver`,
   and Safari's preference domain.

`safaridriver --enable` was **not** invoked by this session, with or without
sudo. Nothing else on the host was modified. All four HTTP servers (4310 corpus,
4320 current `dist`, 4330 baseline control, 4340 `vite preview`) answered 200
before and after this run.

## Claims

- **Desktop Safari: `BLOCKED` — user-blocked. Zero cases run. No acceptance state
  claimed.** Chooser, embedded placement, and persistence/reload on Safari are
  all `NOT_RUN`.
- Chrome stays **BLOCKED**; Chromium stays **BLOCKED**.
- Physical Mobile Safari stays **`WAITING_FOR_USER`**.
- Firefox results **extend** the record and close **no** Firefox line item.
- The receipt-integrity question stays **open**.
- Local tests, hosted CI, merge, desktop acceptance, physical-device acceptance,
  deployment and release remain **separate claims**.
- `GEO_PDF_APPROVED_RULES` remains **empty**.
- **No corpus PDF is in this commit.**

## User action required

**Both documented remedies are already applied.** The Developer toggle is
enabled (verified visually by a predecessor, §7 of the import-hang findings) and
`sudo safaridriver --enable` has been run. There is no further step this record
can name with confidence.

What remains is escalation rather than configuration, and none of it is a small
ask:

1. A fresh macOS login session, or a different user account, to exclude
   per-session state that neither launchd nor safaridriver's log exposes.
2. Failing that, this is plausibly a macOS 27.0 beta (`26A5388g`) /
   Safari 27.0 defect in the automation-session path, and belongs in an Apple
   feedback report rather than in further local probing.
3. If a Safari result is needed sooner than either of those, the practical route
   is a different machine on a released macOS — not this host.

**None of the above is required for this branch to be reviewed.** The Safari lane
was already `BLOCKED` in the receipt and remains so; this run narrows the
diagnosis without changing the state.

If the lane is ever unblocked, re-run the bounded, read-only probe:

```
/Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/ffvenv/bin/python \
  ../safari-session-blocked/sf_probe.py http://127.0.0.1:4340 60
```

## Files

| File | What it shows |
| --- | --- |
| `safaridriver-4466-fresh-driver.txt` | `--diagnose` log of the fresh post-`--enable` driver: HTTP layer only, no internal step |
| `safari-retry-result.json` | machine-readable record of both attempts and the authorization observations |

No screenshots: no browser window was ever opened.

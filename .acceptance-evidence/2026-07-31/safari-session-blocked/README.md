# Desktop Safari lane — session creation still fails. Screen lock RULED OUT. Zero cases run.

Date: 2026-07-31
Runtime under test: nightly `a75fef33c1004943465b6b95713c7f28201fd0f5`
(worktree HEAD `eb4c05b64`; all commits ahead are documentation only)
Origin that would have been used: `http://127.0.0.1:4340` — `vite preview` of this worktree's `dist`
Host: macOS 27.0 build `26A5388g`, **Safari 27.0**, safaridriver
`Included with Safari 27.0 (22625.1.24.11.2)`

## Headline

**No Safari case was run. No Safari state is claimed — not a pass, not a fail.**
The lane is `BLOCKED` pending a user action, exactly as the receipt left it. What
this run adds is a narrower diagnosis than the one it inherited.

## The premise this run was given, and why it was wrong

This session began from the statement *"`safaridriver` now answers 200, so the
lane is live."* It does answer 200. The lane is not live.

```
GET  http://127.0.0.1:4444/status   -> 200 {"value":{"message":"","ready":true}}
POST http://127.0.0.1:4444/session  -> 500 after 30.027 s
     "Could not create a session: The session timed out while connecting to a
      Safari instance. The following asynchronous operation timed out:
      Request creation of a new automation session"
```

`/status` `ready:true` reports that **the safaridriver HTTP server is
listening**. It says nothing about whether Safari will accept an automation
session. It is necessary and not sufficient, and it is the same 200 the driver
returned yesterday while sessions were already failing.

This is recorded plainly because a green endpoint that does not mean what it
looks like is exactly the sort of thing a later reader inherits as fact.

## What was ruled out, and how

### Screen lock — RULED OUT as the cause

The Mac is locked right now (`CGSSessionScreenIsLocked: true`, locked
`2026-07-31 00:20:44` by display dim), and it is reasonable to suspect that a
locked screen prevents safaridriver from opening an automation window. It does
not explain this failure.

`loginwindow` lock/unlock transitions from the unified log:

| Time | Event |
| --- | --- |
| 2026-07-30 15:36:40 | `kScreenIsUnlocked` |
| 2026-07-30 19:23:08 | `startScreenLock kLWLockFromDisplayDim (5)` |
| 2026-07-30 19:27:35 | `kScreenIsUnlocked` |
| **2026-07-30 19:52:23** | **predecessor's session attempt → HTTP 500 after 30.02 s** |
| 2026-07-31 00:20:44 | `startScreenLock kLWLockFromDisplayDim (5)` |
| **2026-07-31 01:38:53** | **this session's attempt → HTTP 500 after 30.03 s** |
| **2026-07-31 01:40:36** | **this session's `--diagnose` attempt → HTTP 500 after 30.01 s** |

The inherited failure at 19:52:23 sits between an unlock at 19:27:35 and the
next lock at 00:20:44, so **the screen was unlocked for that attempt**. Both of
this session's attempts were made while locked. Same error, same 30 s bound,
same message, in both states.

**Screen lock is an additional obstacle to any future attempt. It is not the
explanation for this one.** Unlocking the Mac alone will not make the lane work.

### Fast user switching — noted, not the cause

Two console login sessions exist (`dfakkeldy` uid 501, `dmm` uid 505).
`kCGSSessionOnConsoleKey` is `true` for `dfakkeldy` and `false` for `dmm`, so
the automation target user owns the console. Recorded because a foreign console
owner would be a plausible cause; here it is excluded.

### The driver's own log has nothing further

`safaridriver -p 4455 --diagnose` was started on a free port, given one bounded
attempt, and terminated. Its log (`safaridriver-diagnose.txt`) contains the HTTP
layer and nothing else — `GET /status → 200`, `POST /session → 500` thirty
seconds later, with no internal step in between. **The request never reaches a
Safari instance**, and safaridriver's timeout message does not distinguish *not
authorized* from *no response*.

## Leading candidate — stated as a candidate, not as a finding

`com.apple.webdriverd` is **not registered in any launchd domain**:

```
launchctl print gui/501/com.apple.webdriverd  -> Could not find service …
launchctl print system/com.apple.webdriverd   -> Could not find service …
launchctl list | grep -i webdriver            -> no matches (574 services listed)
```

and no launchd plist for it is present at `/System/Library/LaunchAgents`,
`/Library/LaunchAgents`, or the Safari cryptex's LaunchAgents directory. That is
what `sudo safaridriver --enable` installs, and it is consistent with the
predecessor's outstanding admin step.

**This is consistent with every observation. It is not proven.** No log line
attributes the timeout to authorization, and macOS 27 may launch the automation
target by a path other than a registered `webdriverd` service. It is recorded as
the leading candidate and the first thing to try, not as the cause.

The only WebDriver-related key in Safari's container preferences is
`DidMigrateWebDriverAllowRemoteAutomation = true`. There is no
`AllowRemoteAutomation` key. **A predecessor's correction is carried forward
unchanged: the absence of that key is NOT evidence that the Settings → Developer
toggle is off.** The plist is not authoritative for this setting and was not
treated as such here.

Safari Technology Preview is not installed, so there is no second driver to try.

## What this costs the mission

- **The Long Tasks API in Safari is UNMEASURED.** No session existed, so
  `PerformanceObserver.supportedEntryTypes` was never read. This is not
  "Safari does not support it" and it is certainly not "no long tasks".
- Firefox has **no instrument** for long tasks — an empty `supportedEntryTypes`
  is *no instrument*, not *no long tasks* — so the item **cannot be closed on
  any Firefox lane**. Chromium is **BLOCKED** by the import hang. Safari was the
  remaining candidate instrument and could not be reached.
- **The 200 ms long-task diagnostic therefore stays OPEN.**

The clean-profile requirement is likewise **unexercised, not satisfied**: no
window was opened, private or otherwise. The seven stale NS Marks tabs carrying
prior GeoPDF state (one showing `RMS 0 m across 4 points`) are untouched and
remain a contamination hazard for whoever runs this lane next. A fresh Private
window is still mandatory when it runs.

## Actions this session took on the host, recorded in the open

1. Started `safaridriver -p 4455 --diagnose` on a free port and terminated it
   after one bounded attempt. The pre-existing `safaridriver -p 4444`
   (pid 17738) was **not** touched and still answers `/status`.
2. Invoked `/usr/bin/safaridriver --enable` **once, without sudo**. It cannot
   succeed without admin rights. The invoking shell was reaped, no
   `SecurityAgent` prompt was left on screen, and `com.apple.webdriverd`
   remained absent from every launchd domain afterwards — so nothing changed.
   Recorded because it is a state-changing command this session issued, not
   because it had an effect. **It was not repeated.**

Nothing else on the host was modified. All four HTTP servers (4310 corpus, 4320
current `dist`, 4330 baseline `4c46ca276`, 4340 `vite preview`) answered 200
before and after this run.

## Claims

- **Desktop Safari: `BLOCKED`. Zero cases run. No acceptance state claimed.**
- Chrome stays **BLOCKED**; Chromium stays **BLOCKED**.
- Physical Mobile Safari stays **`WAITING_FOR_USER`**. The receipt's blank
  post-reload raster was seen on a **physical iPhone**; the desktop Firefox
  `PERSISTED_BUT_OFFSCREEN` mechanism remains a strong candidate explanation and
  **not a closure**.
- Firefox results **extend** the record and close **no** Firefox line item.
- The receipt-integrity question stays **open** with its ruled-out table in
  `../../2026-07-30/stop-rule-1-import-hang/findings.md`.
- Local tests, hosted CI, merge, desktop acceptance, physical-device acceptance,
  deployment and release remain **separate claims**.
- `GEO_PDF_APPROVED_RULES` remains **empty**. The standing recommendation is
  **against** a producer-specific rule; any future selector would need a freshly
  frozen holdout larger than the discovery set, drawn from quadrangles not used
  here. A silent "first" or "largest" selection would be a defect.
- **No corpus PDF is in this commit.** No PDF was delivered to any browser in
  this run.

## User action required, in order

1. **Unlock the Mac.** Locked since `2026-07-31 00:20:44` (display dim).
2. **Run `sudo safaridriver --enable`.** Requires admin rights this session does
   not have.
3. **Confirm Safari → Settings → Developer → "Allow remote automation and
   external agents"** is enabled. In Safari 27 this lives in Settings →
   Developer, not the Develop menu, and neither the menu nor the plist is
   authoritative.

Then re-run `sf_probe.py`, which is bounded and read-only and imports nothing:

```
/Users/dfakkeldy/Developer/_geopdf-acceptance-tmp/ffvenv/bin/python \
  sf_probe.py http://127.0.0.1:4340 60
```

It reports the Safari version, asserts the automation window's IndexedDB is
empty (the clean-state control), and reads
`PerformanceObserver.supportedEntryTypes` so the Long Tasks question can be
answered on first contact.

## Files

| File | What it shows |
| --- | --- |
| `safari-session-diagnostic.json` | full machine-readable record: both attempts, the inherited attempt, lock timeline, authorization evidence, claims table |
| `safaridriver-diagnose.txt` | safaridriver's own `--diagnose` log — HTTP layer only, no internal step |
| `sf_probe.py` | the bounded read-only probe, ready to re-run once the lane is authorized |

No screenshots: no browser window was ever opened, and the screen is locked.

## Open repository item

`.acceptance-evidence/` may need to move under `docs/research/` to match this
repository's convention if this branch becomes a PR. Flagged, not actioned.

# Handoff — field review follow-ups

## 2026-09-02 — PR G opened (web mark and locate parity)
Done: #301 to nightly from feature/web-mark-locate-parity (4 commits). Closes
review 2.3 and 2.9: the browser one-shot names its failure by
GeolocationPositionError code, is held to the mark's own 10 s / 50 m rule,
stamps nsmts:capturedAt from the position's timestamp, and reports a write
that did not reach the device; the locate keeps a zoom already closer than 14
and flies only to a fix off screen; Reduce Motion is honoured. Four Codex
rounds also brought: one shared fix rule for both paths, a moved point giving
up its fix provenance, the popup naming the device rather than GPS and staying
silent for a malformed pair, the watch telling timeout from unavailable, and a
mark keeping the session it was aimed at. Gates: npm test 1826, lint, build,
all clean; verified in the running app (zoom kept from 16, fly to 14 from 9,
the three failure sentences, "±7.4 m").
Deferred to PR I: an edit write that fails after Done has no always-mounted
place to be shown, and a late failure can appear in the next layer's panel.
Next: PR H (web evidence-contract highs, section 11), then PR I, then PR J.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ns-marks-follow-ups-98d95e
git fetch origin && git checkout -b feature/web-evidence-contract origin/nightly
# PR H: review section 11, web/src/userMaps and web/src/services evidence states
```

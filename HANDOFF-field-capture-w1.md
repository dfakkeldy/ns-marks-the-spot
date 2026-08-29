# Handoff — field capture W1 (web live location + mark)

## 2026-08-29 — W1 implemented, verified, PR opened

Done: live watchPosition service + follow mode + heading wedge + mark-my-location
into "Field notes" (or the open edit session), parity fixture + captureSpec test,
recorded origin/source, GPS popup provenance, appendFeatures/ensureFieldNotesLayer.
All gates green (1611 tests, lint, build); browser-verified with a stubbed
geolocation (marker, follow-pan, mark persisted to IndexedDB, toggle-off).
Next: W2 (track recording) per docs/field-capture-design.md roadmap, branching
from nightly after this PR merges.
Resume:
```
Worktree: /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/ios-code-hig-audit-710af7
Branch: feature/web-field-capture-w1
Read docs/field-capture-design.md (on PR #260's branch or nightly once merged),
then implement PR W2 from the roadmap table on a fresh branch off nightly.
```

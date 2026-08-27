# Handoff — shared-link restore investigation (iOS 18.5 smoke test)

## 2026-08-27 — findings drafted, focused tests authored, run queued

Done: Traced restore(from:)/apply/MapShareState.parse/MapController.center on
916445cfe (identical to claude/nsmts-promotional-flyer-f17ce2 except build
settings). Static conclusion: the intact URL cannot produce the observed
symptom set; every in-app failure path is loud (licence sheet + notice) or
moves the camera. Evidence points at degraded text reaching restore() — the
success message only needs one recognizable query-parameter name, not an
intact link. Added 3 tests to
ns-marks-the-spotTests/Overlay/MapShareAndEvidenceTests.swift (intact link,
loud licence refusal, mangled-ampersand fingerprint).
Next: Focused run queued behind the 09:00 build-slot window (background task
gate --wait && slot -- xcodebuild, suite MapShareAndEvidenceTests, iPhone 17 /
iOS 26.5 sim). Commit tests + this note once green; report results.
Resume:
```
cd /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/optimistic-kalam-9dad56
# branch claude/pensive-hamilton-711505
# If the queued run died, rerun inside a build window:
/Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- xcodebuild test \
  -project ns-marks-the-spot.xcodeproj -scheme ns-marks-the-spot \
  -destination 'platform=iOS Simulator,id=24FBD923-387E-4B7E-9063-FCF166239B1C' \
  -only-testing:ns-marks-the-spotTests/MapShareAndEvidenceTests
```

## 2026-08-27 — tests green, findings verified

Done: All 3 new tests passed (41/41 in MapShareAndEvidenceTests, iPhone 17 /
iOS 26.5, 09:01 run; first run at 09:00 hit a stuck device-clone flake, fixed
with -parallel-testing-enabled NO). Verified: apply() restores the intact URL
fully; licence refusal is loud; a mangled ampersand keeps the message but
loses position + nsprd with no notice. Defect is upstream of restore() —
degraded HID-typed text — plus the message overclaims. Committed tests +
this note. Separately: killed a leftover app process pinning ~750% CPU in the
iOS 26.5 sim (flood-hazard per-pixel PolygonHitTest loop, FloodHazardResponse.
summarizeRasterAlpha); spawned task chip "Tame the flood-hazard raster
sampling hot loop".
Next: User decides the fix (harden carriesState/message on the flyer branch or
nightly; re-verify HID text via accessibility read-back before submit).
Resume: see block above; findings are in this file and the session report.

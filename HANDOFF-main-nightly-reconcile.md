# Handoff — main/nightly ladder reconciliation

## 2026-09-01 — Diagnosis complete, awaiting reconciliation decision

Done:
- Classified all 39 files in the 11-commit main-only lineage: 11 identical, 5 main-only docs, 23 differ.
- Verified nightly supersedes on all 23 differing files EXCEPT one line.
- Found the only genuine loss: `APP_REVIEW_CONTACT_PHONE` exists solely at
  `origin/main:.github/workflows/release-trains.yml:228`. Both nightly and weekly
  Fastfiles *require* it (`beta_review_info`, Fastfile:93; `lint_metadata`, Fastfile:248)
  and neither has the fallback `fastlane/metadata/review_information/phone_number.txt`.
- Scheduled runs use main's YAML but `actions/checkout` the train branch (`ref: needs.resolve.outputs.branch`),
  so main's line is load-bearing for the weekly external TestFlight train.
  Confirmed green: "Build and ship weekly" runs 2026-08-24, 08-28, 08-31 (run 33428045168).
- Secondary: GitHub Pages serves `main` `/docs`, so the public site is stale since 2026-07-05.
- PR #288 is BLOCKED with 0 checks: retargeting to nightly did not re-trigger "Build gate + tests".

Next:
- Get user approval on reconciliation option (a) narrow feature PR into nightly vs (b) full backflow.
- Recommended (a): carry the phone line into nightly + weekly BEFORE any nightly->weekly->main promotion,
  otherwise that promotion drops it and the weekly train fails at upload_to_testflight after a full archive.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/vigilant-poincare-7e6615
Branch claude/vigilant-poincare-7e6615
Next: on user approval, open feature/* PR into nightly adding APP_REVIEW_CONTACT_PHONE to
.github/workflows/release-trains.yml (mirroring origin/main:228) plus any of the 5 docs the user keeps.
```

## 2026-09-01 — Fix implemented on feature/restore-app-review-phone

Done:
- User approved option (a) narrow PR into nightly, carrying none of the 5 main-only docs.
- Added `APP_REVIEW_CONTACT_PHONE: ${{ secrets.APP_REVIEW_CONTACT_PHONE }}` to the
  "Upload TestFlight build" step in `.github/workflows/release-trains.yml`, matching
  main's placement. actionlint clean; upload-step env key set now identical to main's.

Next:
- Merge into nightly, then promote nightly -> weekly -> main so main keeps the line.
- Delete this handoff file in the PR that closes the task.
- Open, not addressed here: `lint_metadata` also requires the phone but is local-only
  (no workflow runs it); the MapEngine facade in CLAUDE.md no longer exists on nightly.

Resume:
```
Worktree /Users/dfakkeldy/Developer/ns-marks-the-spot/.claude/worktrees/vigilant-poincare-7e6615
Branch feature/restore-app-review-phone
Next: watch the PR's "Build gate + tests" check, then merge into nightly.
```

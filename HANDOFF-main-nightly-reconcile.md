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

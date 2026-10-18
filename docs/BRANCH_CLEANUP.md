# Branch And Worktree Cleanup Map

Status as of July 1, 2026.

Live GitHub state at audit time:

- Open PRs: none.
- Open issues: none.
- Default branch: `main`.
- GitHub Pages source: `main` `/docs`.
- Protected branches: `main`, `weekly`, and `nightly` all require `Build gate + tests`; required approvals are `0`.

## Active Branches To Keep

| Branch | Why keep |
| --- | --- |
| `main` | Default branch, Pages source, workflow source of truth. |
| `nightly` | Current integration branch and nightly TestFlight train. |
| `weekly` | Promotion branch for weekly beta train. |
| `chore/ci-release-ladder` | Historical CI ladder branch still has an upstream; keep until intentionally retired. |
| `migrate/01-data-layer-sendable` | Merged history branch with upstream; keep until Swift migration cleanup is deliberate. |
| `migrate/02-map-engine-isolation` | Merged history branch with upstream; keep until Swift migration cleanup is deliberate. |
| `migrate/03-swift6-language-mode` | Future Swift 6 migration branch; do not delete during docs cleanup. |

## Merged Or Stale Local Branches

These branches have merged PRs or deleted upstreams and can be cleaned up after
confirming there are no unpushed commits you still want:

| Branch | Worktree | Reason |
| --- | --- | --- |
| `codex/backmerge-testflight-info-to-nightly` | `/Users/dfakkeldy/.codex/worktrees/4f37/ns-marks-the-spot` | PR #74 merged; upstream deleted. |
| `codex/backmerge-schedule-slots-to-nightly` | none currently checked out | PR #72 merged; upstream deleted. |
| `codex/backmerge-signing-profile-to-nightly` | none currently checked out | PR #70 merged; upstream deleted. |
| `codex/backmerge-testflight-to-nightly` | none currently checked out | PR #68 merged; upstream deleted. |
| `hotfix/testflight-test-info` | none currently checked out | PR #73 merged; upstream deleted. |
| `hotfix/release-train-schedule-slots` | none currently checked out | PR #71 merged; upstream deleted. |
| `hotfix/apply-match-signing-profile` | none currently checked out | PR #69 merged; upstream deleted. |
| `hotfix/enable-nsmarks-testflight` | none currently checked out | PR #67 merged; upstream deleted. |
| `codex/devlog-automation` | `/Users/dfakkeldy/.codex/worktrees/ns-marks-devlog-automation` | PRs #5 and #7 merged. Current local branch is stale and would remove release metadata if reused. |
| `codex/v1-release-roadmap` | `/Users/dfakkeldy/.codex/worktrees/ns-marks-the-spot-v1-release-roadmap` | PR #8 merged. |
| `codex/fix-waterfall-poi-decode` | `/Users/dfakkeldy/.codex/worktrees/ns-marks-waterfall-poi-decode` | PR #10 merged. |
| `codex/real-world-test-findings` | `/private/tmp/nsmarks-findings-pr` | PR #60 merged; worktree is prunable because the path is gone. |
| `codex/issues-release-ci` | `/Users/dfakkeldy/.codex/worktrees/ns-marks-issue-batch-release-ci` | PR #61 merged. |
| `codex/issues-tile-cache-security` | `/Users/dfakkeldy/.codex/worktrees/ns-marks-issue-batch-tile-cache-security` | PR #62 merged; upstream deleted. |
| `codex/issues-offline-saved-areas` | `/Users/dfakkeldy/.codex/worktrees/ns-marks-issue-batch-offline-saved-areas` | PR #63 merged; upstream deleted. |
| `codex/issues-map-ui` | `/Users/dfakkeldy/.codex/worktrees/ns-marks-issue-batch-map-ui` | PR #64 merged; upstream deleted. |
| `codex/issues-poi-data` | `/Users/dfakkeldy/.codex/worktrees/ns-marks-issue-batch-poi-data` | PR #65 merged; upstream deleted. |
| `codex/remove-review-requirements` | `/Users/dfakkeldy/.codex/worktrees/ns-marks-the-spot-ci-release-ladder` | PR #6 merged; upstream still exists but work is complete. |

## Suggested Cleanup Commands

Run from the main checkout only after confirming there is no local work to keep:

```sh
git worktree prune
git branch -d codex/backmerge-testflight-info-to-nightly
git branch -d codex/backmerge-schedule-slots-to-nightly
git branch -d codex/backmerge-signing-profile-to-nightly
git branch -d codex/backmerge-testflight-to-nightly
git branch -d hotfix/testflight-test-info
git branch -d hotfix/release-train-schedule-slots
git branch -d hotfix/apply-match-signing-profile
git branch -d hotfix/enable-nsmarks-testflight
git branch -d codex/devlog-automation
git branch -d codex/v1-release-roadmap
git branch -d codex/fix-waterfall-poi-decode
git branch -d codex/real-world-test-findings
git branch -d codex/issues-release-ci
git branch -d codex/issues-tile-cache-security
git branch -d codex/issues-offline-saved-areas
git branch -d codex/issues-map-ui
git branch -d codex/issues-poi-data
git branch -d codex/remove-review-requirements
```

If a branch refuses `-d`, inspect it before using `-D`; the refusal means Git
does not believe the branch is fully merged into the current branch.

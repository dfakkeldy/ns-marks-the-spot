# Review rules

The `Claude review` check (`.github/workflows/claude-review.yml`) reviews every PR
with these rules, read from the base branch. An edit here applies from the PR after
it merges, and like any rule that judges merges it waits for Dan. Keep this file
short: every line is read on every review.

## Important: fails the check

- A defect the PR introduces that a user would hit: a wrong result, a crash, lost
  or corrupted data, a broken build, test run or release.
- A break of the evidence rules in `AGENTS.md`. For example: a PID, civic address,
  parcel match, owner, value or site condition that is invented or interpolated.
  Others are distinct states merged into one (`returned-empty`, `source-error`,
  `outside-coverage` and the rest), or an empty or failed response shown as
  absence. Lost provenance, licence gates or attribution count too.
- User-loaded maps, files or browser location that leave the browser.
- A secret, token or personal detail committed to this public repo, or written to a
  log.
- A frozen input read with `git show <rev>:<path>` and pinned to a PR-branch commit
  instead of a commit on the target branch.
- A check made weaker: a removed test, assertion, or CI step or job; a skipped or
  disabled test; or a way to ignore a failure (`continue-on-error`, `|| true`). It's
  fine when the PR body says why and the check moved, was replaced or no longer
  applies.
- The change doesn't do what the PR body says, or it breaks something the PR didn't
  mean to touch.

## Not a failure: don't report

- Style, naming, formatting, comment wording, import order, "could be simpler".
- Anything the compiler, ESLint, the type checker or CI tests already catch.
- Missing tests, unless the untested case is a likely bug you can name.
- Speculation without a concrete scenario (the input or state, and the wrong result).
- Layout and look, unless the diff plainly breaks it (CI can't prove layout either;
  the PR's Testing section should show it in a browser).

## Paths to ignore

Generated or binary files, which a review can't usefully read. They are left out
when the PR changes other files too; a PR that changes only these is reviewed whole.
Lockfiles stay in: a dependency change is worth a look.

- `**/*.png`
- `**/*.jpg`
- `**/*.jpeg`
- `**/*.webp`
- `**/*.gif`
- `**/*.pdf`
- `**/*.pbf`
- `**/*.gz`
- `**/*.xcassets/**`
- `web/public/atlas/**`
- `web/public/terrain/**`
- `reports/**/*.json`
- `reports/**/*.geojson`
- `reports/**/*.csv`
- `fastlane/screenshots/**`

## How to report

- Every finding has a file and line, names the class of bug and gives the concrete
  scenario and the fix. Report a class once and list its other places.
- Nit: a real minor defect only, at most three per review. Pre-existing: a real bug
  this PR didn't introduce. Neither blocks.
- The review opens with the count ("1 Important, 0 Nit, 2 Pre-existing") or says
  "no issues found".
- To answer a finding: fix it and push, or reply with why it isn't a bug and resolve
  the thread, then re-run the job. A resolved finding is never raised again.

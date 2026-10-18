# Fastlane Operations

Re-checked: October 6, 2026.

Match covers both the app and the Live Activity extension. A post-#330 internal
archive/upload is now verified: October 4 build `1.0 (109)` from nightly source
`3e7fb58130b04bba69b402a57f3473c11703c26f`. The October 5 train failed its
measurement UI test and skipped upload. These receipts do not establish a
current-head pass, device acceptance, App Store approval, or live availability.
Use the [native App Store release packet](APP_STORE_RELEASE.md) for current
branch gates, copy, assets, privacy evidence and unresolved content rights.

## Local Setup

Use the repo's pinned Ruby through rbenv:

```sh
PATH="$HOME/.rbenv/shims:$PATH" bundle exec fastlane ios lint_metadata
PATH="$HOME/.rbenv/shims:$PATH" bundle exec fastlane ios build
```

The current known-good stack from prior release work is Ruby 3.3.11 with
Fastlane 2.236.1.

## Metadata Layout

Production metadata:

- `fastlane/metadata/en-US/name.txt`
- `fastlane/metadata/en-US/subtitle.txt`
- `fastlane/metadata/en-US/promotional_text.txt`
- `fastlane/metadata/en-US/description.txt`
- `fastlane/metadata/en-US/keywords.txt`
- `fastlane/metadata/review_information/notes.txt`

TestFlight metadata:

- `fastlane/metadata/testflight/en-US/description.txt`
- `fastlane/metadata/testflight/en-US/feedback_email.txt`
- `fastlane/metadata/testflight/en-US/what_to_test.txt`

`fastlane ios lint_metadata` checks that required metadata files exist, are not
empty, and that `keywords.txt` stays within the 100-byte App Store Connect limit.

## Lanes

- `fastlane ios test`: unit tests on the primary scheme.
- `fastlane ios ui_test`: UI tests on the primary scheme.
- `fastlane ios test_all`: unit plus UI tests.
- `fastlane ios build`: simulator build sanity check with code signing skipped.
- `fastlane ios ci`: local CI-shaped Fastlane build plus tests.
- `fastlane ios lint_metadata`: local metadata validation.
- `fastlane ios signing_check`: inspect app and Live Activity bundle IDs and
  App Store profiles. Reads Apple records only; does not create identifiers,
  profiles, or Match assets.
- `fastlane ios provision_live_activity`: register the Live Activity bundle ID
  if it is missing, then create its App Store profile with Match in write mode
  using temporary write credentials. Not part of normal nightly, weekly, or App
  Store releases.
- `fastlane ios beta channel:nightly`: archive and upload an internal TestFlight
  build. Match stays readonly.
- `fastlane ios release`: archive and upload an App Store build without
  submitting for review. Match stays readonly.

## CI Secrets

GitHub Actions release uploads require:

- `APP_STORE_CONNECT_API_KEY_JSON`
- `MATCH_PASSWORD`
- `MATCH_GIT_SSH_KEY`

The Release Trains `signing_check` job runs the inspect-only Fastlane lane with
`APP_STORE_CONNECT_API_KEY_JSON` and separately probes the signing repository
with `MATCH_GIT_SSH_KEY` (clone plus push dry-run; no write).

The Release Trains `provision_live_activity` job is an opt-in exception. It
sets SSH from `MATCH_PROVISIONING_SSH_KEY` as a temporary write credential,
then runs the Fastlane lane with `APP_STORE_CONNECT_API_KEY_JSON` and
`MATCH_PASSWORD`. That SSH key is not used by normal trains.

Local upload can use ignored `fastlane/api_key.json`. Do not commit local keys,
review-contact secrets, generated reports, or credentials.

## Signing

`fastlane/Matchfile` points at the signing repository and requests readonly App
Store profiles for both bundle IDs:

- `com.danfakkeldy.nsmarksthespot` (app target `ns-marks-the-spot`)
- `com.danfakkeldy.nsmarksthespot.LiveActivity` (extension target
  `NSMarksLiveActivity`)

In CI, `apply_app_store_signing` maps target `ns-marks-the-spot` to the app
bundle ID and target `NSMarksLiveActivity` to the Live Activity bundle ID, then
assigns each its own App Store profile from Match. A missing Live Activity
profile fails the signing step instead of archiving with the app profile only.

Normal `beta` and `release` lanes call Match with `readonly: true`. They do not
register bundle IDs or create profiles.

## CI / Release Trains

`.github/workflows/release-trains.yml` still runs scheduled nightly and weekly
trains, plus `workflow_dispatch` with `channel` and optional `dry_run`. Those
shipping paths are unchanged: compile, test, then Match-readonly archive and
upload.

Two opt-in `workflow_dispatch` booleans skip the normal resolve/build/upload
jobs:

- `signing_check`: run the inspect-only Fastlane lane and an SSH access probe.
- `provision_live_activity`: register the extension if needed and save its
  profile using temporary write credentials.

Do not enable those inputs on a normal train. They are maintenance modes, not
release substitutes.

## Recent Proof

The latest inspected real internal shipping run,
[October 4 run 37199904619](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/37199904619),
checked out `3e7fb58130b04bba69b402a57f3473c11703c26f` and reported:

- "Successfully uploaded package to App Store Connect."
- "Successfully finished processing the build 1.0 - 109 for IOS."
- "Successfully distributed build to Internal testers."

The latest inspected real weekly shipping run,
[September 28 run 36472512037](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/36472512037),
checked out weekly `781d7b5b2206eee48cd20a00b2cfbcebea78d4d3`, uploaded and
processed `1.0 (103)`, then reported external distribution. Verify beta review,
group state and actual external acceptance in ASC before treating weekly as
release-accepted. The current main Fastfile predates the external-weekly changes;
the workflow's default-branch SHA is not the channel checkout SHA.

[October 5 run 37318150629](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/37318150629)
checked out `37a5c6228fcf83e0e544cac87ae3248e3c0fba0f`, compiled, and failed
`MapChromeUITests.testMeasuringReportsADistanceForTapsOnTheMap` at line 103:
the badge tap did not update both endpoint and card. Upload was skipped.
Later green resolver-only runs are not new uploads.

Historical signing provisioning was recorded in
[Actions run 33964009282](https://github.com/dfakkeldy/ns-marks-the-spot/actions/runs/33964009282)
before #330 merged. That run skipped build and upload; it is not a shipping
receipt. This audit did not inspect private signing assets.

## Known Gaps

- `fastlane release` uploads with `submit_for_review: false`; final App Review
  submission still needs manual completion unless the lane is intentionally
  changed.
- There is no checked-in App Store screenshot capture lane yet. The 12 tracked
  PNGs are July 3 captures; their README now distinguishes them from the fresh
  selected-build storyboard. Do not submit an old capture as current UI proof.
- `ITSAppUsesNonExemptEncryption` is not currently set in the project, so export
  compliance requires an owner determination; no guessed answer was inserted.
- Native privacy-policy access, exact-head native tests, final-archive privacy
  coverage and the specific native/offline map rights in the release packet
  remain preparation gates.
- The release packet is prepared copy, not metadata already applied in ASC.
  Main is still the July source; promote through weekly/main only with the
  separate requested release authorization and required strict checks.

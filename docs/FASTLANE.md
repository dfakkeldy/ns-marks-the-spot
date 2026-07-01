# Fastlane Operations

Status as of July 1, 2026.

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
- `fastlane ios beta channel:nightly`: archive and upload an internal TestFlight build.
- `fastlane ios release`: archive and upload an App Store build without submitting for review.

## CI Secrets

GitHub Actions release uploads require:

- `APP_STORE_CONNECT_API_KEY_JSON`
- `MATCH_PASSWORD`
- `MATCH_GIT_SSH_KEY`

Local upload can use ignored `fastlane/api_key.json`. Do not commit local keys,
review-contact secrets, generated reports, or credentials.

## Signing

`fastlane/Matchfile` points at the signing repository and uses readonly App
Store profiles for bundle id `com.danfakkeldy.nsmarksthespot`.

The release train configures an SSH key from `MATCH_GIT_SSH_KEY`, runs match,
applies the returned App Store provisioning profile to the app target, archives,
and uploads.

## Recent Proof

The latest inspected release-train run uploaded, processed, and distributed
TestFlight build `1.0 (4)` to internal testers. The relevant success lines were:

- "Successfully uploaded package to App Store Connect."
- "Successfully finished processing the build 1.0 - 4 for IOS."
- "Successfully distributed build to Internal testers."

## Known Gaps

- `fastlane release` uploads with `submit_for_review: false`; final App Review submission still needs manual completion unless the lane is intentionally changed.
- There is no checked-in App Store screenshot capture lane yet.
- `ITSAppUsesNonExemptEncryption` is not currently set in the project, so export compliance may add wait time during processing.
- The repository does not yet include `PrivacyInfo.xcprivacy`.

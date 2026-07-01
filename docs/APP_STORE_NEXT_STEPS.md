# App Store Next Steps

Status as of July 1, 2026.

This is the next operational path to get NS Marks The Spot onto the App Store.
It is based on the current repository, recent GitHub Actions evidence, Fastlane
metadata, and Axiom's App Store submission checklist.

## Current Proof

- Bundle id: `com.danfakkeldy.nsmarksthespot`
- App Store Connect app id: `6785084336`
- Version: `1.0`
- Latest proven TestFlight upload: build `1.0 (4)`
- Release train evidence: GitHub Actions run `28489316083`
- Upload proof: package uploaded to App Store Connect, processed, and distributed to internal testers.
- Current remaining uncertainty: tester invite/acceptance state in App Store Connect.

## Next Ten Steps

1. Confirm internal TestFlight visibility in App Store Connect.
   Build `1.0 (4)` is uploaded and internally distributed, but testers still need accepted invitations.

2. Add `PrivacyInfo.xcprivacy`.
   The current tree has no privacy manifest. Declare Required Reason APIs such as `UserDefaults`, file timestamps, disk space checks, and any collected data. Generate Xcode's aggregate privacy report from an archive.

3. Publish the privacy policy and support URL.
   App Store Connect requires a privacy policy URL. Axiom's checklist also expects the policy to be accessible inside the app or an equivalent in-app support/about surface.

4. Decide export compliance.
   The app appears to use standard networking. If it does not use non-exempt encryption, add `ITSAppUsesNonExemptEncryption = NO` so Fastlane/TestFlight does not need to pause on export-compliance confirmation.

5. Capture current App Store screenshots.
   Required current sizes include iPhone 6.9-inch or 6.5-inch screenshots and iPad 13-inch screenshots if iPad remains supported. Screenshots must show the actual current UI, not just marketing art.

6. Finish App Store Connect app metadata.
   Checked-in Fastlane files cover name, subtitle, promotional text, description, keywords, review notes, TestFlight description, feedback email, and What to Test. App Store Connect still needs category, pricing, territories, copyright, support URL, privacy policy URL, age rating, and compliance answers.

7. Run final release validation.
   Use `xcodebuild build-for-testing`, unit/UI tests where simulator availability allows, `fastlane ios lint_metadata`, and a real-device smoke test. Include location permission, layer toggles, saved Fletcher offline area, Data Sources & Licenses, and no-network behavior.

8. Run App Review pre-flight.
   Confirm there is no placeholder content, no broken links, no misleading metadata, no private APIs, no missing usage strings, no account/login requirements, and no unsupported claims in screenshots or metadata.

9. Promote the release candidate.
   Promote `nightly -> weekly -> main` after validation. Keep the one-way ladder intact and back-merge hotfixes only when needed.

10. Select the final build and submit.
    Use Fastlane or App Store Connect to upload/select the final build. The checked-in `fastlane release` lane uploads an App Store build with `submit_for_review: false`, so final submission still requires selecting the build, completing review details, and clicking submit in App Store Connect unless that behavior is intentionally changed.

## Known Risks

- `PrivacyInfo.xcprivacy` is missing.
- No checked-in screenshot automation exists for App Store screenshots yet.
- App Review may expect in-app privacy/support links, not just App Store metadata URLs.
- Recent GitHub Actions logs show a Swift warning in `OfflineAreasViewModel.swift` about an `await` with no async operations. It did not block archive/upload, but it should be cleaned up before review if time allows.
- The Fastlane upload flow notes that setting `ITSAppUsesNonExemptEncryption` in Info.plist would avoid a processing wait.
- TestFlight upload success does not prove App Store metadata, screenshots, age rating, privacy labels, or final review answers are complete.

## Pre-Submission Checklist

- [ ] Physical-device launch and core-map smoke test.
- [ ] IPv6-only network behavior checked.
- [ ] Privacy manifest present and archived privacy report reviewed.
- [ ] Privacy policy URL live and matches app behavior.
- [ ] Support URL live.
- [ ] App Store screenshots captured from the current build.
- [ ] Age rating questionnaire completed with the 2026 rating system.
- [ ] Export compliance answered.
- [ ] DSA/trader status completed if distributing in the EU.
- [ ] App Review notes explain optional location use and map-layer limitations.
- [ ] Final build selected in App Store Connect.

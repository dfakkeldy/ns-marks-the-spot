#!/bin/zsh
# The suites that failed in the hung gated run of 2026-08-14, run one
# invocation at a time.
#
# One at a time because the whole bundle hangs: suites that stub URLProtocol
# globally deadlock somewhere after a few hundred tests, and a hung run
# finalises no .xcresult at all, so its failures arrive as bare test names with
# no messages. Each suite writes its own result bundle for that reason — an
# interrupted run still leaves the ones that finished readable with
# `xcrun xcresulttool get test-results tests --path <bundle>`.
#
# Run it through the build slot as one command:
#   /Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh
set -u

ROOT=${0:a:h:h}
OUT=$ROOT/.build/focused-tests
DEST='platform=iOS Simulator,name=iPhone 17 Pro'
SUITES=(
  ParcelIdentifyTests
  POIFetcherTests
  FletcherTileLoaderTests
  TileStubbedSuites
  PrintMapCompositorTests
  PrintExportPlanTests
  UserVectorShapeTests
  LayerPanelTests
)

rm -rf $OUT && mkdir -p $OUT
failed=()
for suite in $SUITES; do
  print "=== $suite"
  xcodebuild test \
    -project "$ROOT/ns-marks-the-spot.xcodeproj" \
    -scheme ns-marks-the-spot \
    -destination $DEST \
    -resultBundlePath "$OUT/$suite.xcresult" \
    -only-testing:"ns-marks-the-spotTests/$suite" \
    2>&1 | tail -25
  [[ ${pipestatus[1]} -eq 0 ]] || failed+=$suite
done

print "=== result bundles in $OUT"
if (( ${#failed} )); then
  print "FAILED: $failed"
  exit 1
fi
print "all focused suites passed"

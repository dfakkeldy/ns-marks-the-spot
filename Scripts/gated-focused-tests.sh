#!/bin/zsh
# The whole app test target, one suite per invocation.
#
# One at a time because the whole bundle hangs: suites that stub URLProtocol
# globally deadlock somewhere after a few hundred tests, and a hung run
# finalises no .xcresult at all, so its failures arrive as bare test names with
# no messages. Each suite writes its own result bundle for that reason. An
# interrupted run still leaves the ones that finished readable with
# `xcrun xcresulttool get test-results tests --path <bundle>`.
#
# The suites are read out of the sources rather than listed here. A hand-kept
# list goes stale silently, and the way that shows up is a name no longer in the
# target failing the run with "no tests matched" — after the build gate has
# already spent an admission on it.
#
# Built once, then run without building, because a gate admission is scarce and
# fifty invocations would otherwise each re-check the whole project.
#
# Run it through the build slot as one command:
#   /Users/dfakkeldy/.claude/bin/xcode-build-slot.sh -- zsh Scripts/gated-focused-tests.sh
set -u

ROOT=${0:a:h:h}
OUT=$ROOT/.build/focused-tests
DERIVED=$OUT/DerivedData

# The simulator is looked up rather than named. A hard-coded name goes stale
# whenever Xcode ships a new device set, and the way that showed was
# "Unable to find a device matching the provided destination specifier" after
# the build gate had already spent an admission on the run. Resolved by id,
# newest iPhone first, a renamed device costs nothing.
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
runtimes = json.load(sys.stdin)["devices"]
best = None
for runtime, devices in runtimes.items():
    if "iOS" not in runtime:
        continue
    for device in devices:
        name = device["name"]
        if not name.startswith("iPhone"):
            continue
        try:
            model = int(name.split()[1])
        except (IndexError, ValueError):
            continue
        rank = (model, device["state"] == "Booted", name)
        if best is None or rank > best[0]:
            best = (rank, device["udid"], name)
if best is None:
    sys.exit(1)
print(best[1], best[2])
')
if [[ -z ${UDID:-} ]]; then
  print -u2 "no iOS simulator is available to run on"
  exit 1
fi
print "=== running on ${UDID#* } (${UDID%% *})"
DEST="platform=iOS Simulator,id=${UDID%% *}"

# Every top-level type in the test target that holds at least one `@Test`.
# Helper types — builders, fixtures — carry none and are left out, because
# `-only-testing` on one of them is an error rather than an empty run.
SUITES=($(awk '
  /^([a-zA-Z@ ]* )?(struct|final class|class) [A-Za-z_]+/ && $0 !~ /^ / {
    if (current != "" && hasTest) print current
    match($0, /(struct|final class|class) [A-Za-z_]+/)
    d = substr($0, RSTART, RLENGTH); sub(/^(struct|final class|class) /, "", d)
    current = d; hasTest = 0
  }
  /@Test/ { hasTest = 1 }
  END { if (current != "" && hasTest) print current }
' $(find $ROOT/ns-marks-the-spotTests -name '*.swift') | sort -u))

print "=== ${#SUITES} suites"

rm -rf $OUT && mkdir -p $OUT
print "=== building once"
xcodebuild build-for-testing \
  -project "$ROOT/ns-marks-the-spot.xcodeproj" \
  -scheme ns-marks-the-spot \
  -destination $DEST \
  -derivedDataPath "$DERIVED" \
  2>&1 | tail -25
if [[ ${pipestatus[1]} -ne 0 ]]; then
  print "the test target did not build; nothing was run"
  exit 1
fi

failed=()
for suite in $SUITES; do
  print "=== $suite"
  xcodebuild test-without-building \
    -project "$ROOT/ns-marks-the-spot.xcodeproj" \
    -scheme ns-marks-the-spot \
    -destination $DEST \
    -derivedDataPath "$DERIVED" \
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
print "all suites passed"

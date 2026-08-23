#!/bin/zsh
#
# Type-check the iOS app and its unit tests without an Xcode build.
#
# On this machine an Apple build is a gated, one-at-a-time resource, and the
# gate can be shut for a working day at a stretch. `swiftc -parse` is available
# any time but sees only syntax: it cannot tell you that a call has the wrong
# argument order, that a ternary has no common type, or that a `nonisolated`
# type touches main-actor state. Those are the errors that were costing whole
# gate admissions to discover one at a time.
#
# This runs the real type-checker with the same flags the target builds with —
# critically `-default-isolation MainActor`, without which every isolation
# error in the app target would be invisible here. It produces no binary, holds
# a fraction of the memory of a build, and finishes in under a minute, so it is
# not what the build gate exists to serialize.
#
# It is not a substitute for the gated `xcodebuild test` run. Type checking is
# not execution: it proves the code means something, not that it does the right
# thing. Run it before spending an admission, not instead of one.
#
#   scripts/typecheck-ios.sh          # app + tests + UI tests
#   scripts/typecheck-ios.sh app      # app only, the faster loop
#
set -eu

ROOT=${0:a:h:h}
WHAT=${1:-all}
SCRATCH=${TMPDIR:-/tmp}/ns-marks-typecheck
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
DEV=$(xcode-select -p)
MODULES=$SCRATCH/packages/arm64-apple-ios-simulator/debug/Modules

# The same six flags the app target uses.
FLAGS=(
  -sdk "$SDK"
  -target arm64-apple-ios26.0-simulator
  -swift-version 6
  -default-isolation MainActor
  -enable-upcoming-feature MemberImportVisibility
  -enable-upcoming-feature InferIsolatedConformances
  -enable-upcoming-feature NonisolatedNonsendingByDefault
)

cd "$ROOT"

# NSMarksCore cross-compiled for the simulator triple, so the app is checked
# against today's package rather than whatever a past xcodebuild left in
# DerivedData. `swift build` here is a package build, not an Apple app build.
print "building NSMarksCore for the simulator"
swift build --package-path NSMarksCore \
  --triple arm64-apple-ios26.0-simulator \
  -Xswiftc -sdk -Xswiftc "$SDK" \
  --scratch-path "$SCRATCH/packages" >/dev/null

APP=("${(@f)$(find ns-marks-the-spot -name '*.swift' | sort)}")

if [[ $WHAT == app ]]; then
  print "type-checking ${#APP} app sources"
  xcrun swiftc -typecheck "${FLAGS[@]}" -I "$MODULES" "${APP[@]}"
  exit 0
fi

# The tests `@testable import ns_marks_the_spot`, which needs a module rather
# than a pile of sources, so the app is emitted with -enable-testing first.
print "emitting the app module from ${#APP} sources"
mkdir -p "$SCRATCH/appmodule"
xcrun swiftc -emit-module \
  -module-name ns_marks_the_spot -enable-testing \
  -emit-module-path "$SCRATCH/appmodule/ns_marks_the_spot.swiftmodule" \
  "${FLAGS[@]}" -I "$MODULES" "${APP[@]}"

TESTS=("${(@f)$(find ns-marks-the-spotTests -name '*.swift' | sort)}")
print "type-checking ${#TESTS} test sources"
xcrun swiftc -typecheck \
  -module-name ns_marks_the_spotTests -enable-testing \
  "${FLAGS[@]}" \
  -I "$MODULES" -I "$SCRATCH/appmodule" \
  -plugin-path "$DEV/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/host/plugins/testing" \
  -F "$DEV/Platforms/iPhoneSimulator.platform/Developer/Library/Frameworks" \
  "${TESTS[@]}"

# The UI tests are their own target and share none of the app's settings: they
# import XCTest rather than the app module, and they are built without
# `-default-isolation MainActor`, under which every `override func setUp` in
# them is an isolation error. Checked here because a UI test that does not
# compile fails the whole gated run, and finding that out costs an admission.
UITESTS=("${(@f)$(find ns-marks-the-spotUITests -name '*.swift' | sort)}")
print "type-checking ${#UITESTS} UI test sources"
xcrun swiftc -typecheck \
  -module-name ns_marks_the_spotUITests \
  -sdk "$SDK" \
  -target arm64-apple-ios26.0-simulator \
  -swift-version 6 \
  -enable-upcoming-feature MemberImportVisibility \
  -enable-upcoming-feature InferIsolatedConformances \
  -enable-upcoming-feature NonisolatedNonsendingByDefault \
  -F "$DEV/Platforms/iPhoneSimulator.platform/Developer/Library/Frameworks" \
  -I "$DEV/Platforms/iPhoneSimulator.platform/Developer/usr/lib" \
  "${UITESTS[@]}"

# Type checking proves the code means something; it does not prove the compiler
# can emit it. A reabstraction thunk that crashes IRGen — the Swift 6.3.3 bug
# `mainActorSetter` exists to dodge — passes every check above and then aborts
# the build, which on this machine costs a whole gate admission to discover.
# Emitting objects in batch mode, file by file, is how the app target compiles,
# so it reproduces those crashes here for about twenty seconds.
OBJECTS=$SCRATCH/objects
mkdir -p "$OBJECTS"
{
  print '{'
  for f in $APP; do print "  \"$PWD/$f\": {\"object\": \"$OBJECTS/${f:t:r}.o\"},"; done
  print '  "": {"swift-dependencies": "'"$OBJECTS/module.swiftdeps"'"}'
  print '}'
} > "$OBJECTS/map.json"

print "emitting objects for ${#APP} app sources"
xcrun swiftc -c -enable-batch-mode \
  -module-name ns_marks_the_spot -enable-testing -Onone \
  "${FLAGS[@]}" -I "$MODULES" \
  -output-file-map "$OBJECTS/map.json" \
  "${APP[@]/#/$PWD/}"

{
  print '{'
  for f in $TESTS; do print "  \"$PWD/$f\": {\"object\": \"$OBJECTS/tests-${f:t:r}.o\"},"; done
  print '  "": {"swift-dependencies": "'"$OBJECTS/tests.swiftdeps"'"}'
  print '}'
} > "$OBJECTS/tests-map.json"

print "emitting objects for ${#TESTS} test sources"
xcrun swiftc -c -enable-batch-mode \
  -module-name ns_marks_the_spotTests -enable-testing -Onone \
  "${FLAGS[@]}" \
  -I "$MODULES" -I "$SCRATCH/appmodule" \
  -plugin-path "$DEV/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/host/plugins/testing" \
  -F "$DEV/Platforms/iPhoneSimulator.platform/Developer/Library/Frameworks" \
  -output-file-map "$OBJECTS/tests-map.json" \
  "${TESTS[@]/#/$PWD/}"

print "app, tests and UI tests type-check clean, and app and tests compile"

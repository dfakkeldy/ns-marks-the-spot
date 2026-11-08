import Foundation
import Testing
@testable import ns_marks_the_spot

/// What counts as a system cancel a test may repeat. A UI test repeats a tap only
/// on this answer, so each way of losing a touch that is the app's own doing, and
/// each touch that may already have acted, has to stay out of it.
@MainActor
struct UITestTouchLedgerTests {
    private func isRepeatable(
        appIsActive: Bool = true,
        windowIsKey: Bool = true,
        viewIsInWindow: Bool = true,
        gateRecognized: Bool = true,
        held: TimeInterval = 0.19
    ) -> Bool {
        UITestTouchLedger.isRepeatableSystemCancel(
            appIsActive: appIsActive,
            windowIsKey: windowIsKey,
            viewIsInWindow: viewIsInWindow,
            gateRecognized: gateRecognized,
            held: held
        )
    }

    @Test func theTracedSimulatorCancelIsRepeatable() {
        #expect(isRepeatable())
    }

    @Test func aCancelWithoutTheGateIsNotTheSystems() {
        #expect(!isRepeatable(gateRecognized: false))
    }

    @Test func aViewThatWentAwayIsTheAppsDoing() {
        #expect(!isRepeatable(viewIsInWindow: false))
    }

    @Test func aWindowThatTookOverIsTheAppsDoing() {
        #expect(!isRepeatable(windowIsKey: false))
    }

    @Test func anAppThatResignedIsNotARetryableTap() {
        #expect(!isRepeatable(appIsActive: false))
    }

    /// The map's 0.45 s long press places a point before the finger lifts, so a
    /// repeat would place a second one.
    @Test func aTouchHeldLongEnoughToActIsNotRepeatable() {
        #expect(!isRepeatable(held: 0.45))
        #expect(!isRepeatable(held: 0.4))
        #expect(isRepeatable(held: 0.39))
    }
}

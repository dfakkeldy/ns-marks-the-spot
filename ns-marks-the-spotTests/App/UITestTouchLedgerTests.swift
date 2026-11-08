import Testing
@testable import ns_marks_the_spot

/// What counts as the system taking a touch back. A UI test repeats a tap only
/// on this answer, so each way of losing a touch that is the app's own doing has
/// to stay out of it.
@MainActor
struct UITestTouchLedgerTests {
    @Test func allFourTogetherAreASystemCancel() {
        #expect(UITestTouchLedger.isSystemCancel(
            appIsActive: true, windowIsKey: true, viewIsInWindow: true, gateRecognized: true
        ))
    }

    @Test func aCancelWithoutTheGateIsNotTheSystems() {
        #expect(!UITestTouchLedger.isSystemCancel(
            appIsActive: true, windowIsKey: true, viewIsInWindow: true, gateRecognized: false
        ))
    }

    @Test func aViewThatWentAwayIsTheAppsDoing() {
        #expect(!UITestTouchLedger.isSystemCancel(
            appIsActive: true, windowIsKey: true, viewIsInWindow: false, gateRecognized: true
        ))
    }

    @Test func aWindowThatTookOverIsTheAppsDoing() {
        #expect(!UITestTouchLedger.isSystemCancel(
            appIsActive: true, windowIsKey: false, viewIsInWindow: true, gateRecognized: true
        ))
    }

    @Test func anAppThatResignedIsNotARetryableTap() {
        #expect(!UITestTouchLedger.isSystemCancel(
            appIsActive: false, windowIsKey: true, viewIsInWindow: true, gateRecognized: true
        ))
    }
}

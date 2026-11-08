import Testing
@testable import ns_marks_the_spot

/// What counts as a system cancel a test may repeat. A UI test repeats a tap only
/// on this answer, so each way of losing a touch that is the app's own doing, and
/// each touch that has already acted, has to stay out of it.
@MainActor
struct UITestTouchLedgerTests {
    private func isRepeatable(
        appIsActive: Bool = true,
        windowIsKey: Bool = true,
        viewIsInWindow: Bool = true,
        cancelCarriedNewTime: Bool = true,
        longPressHasActed: Bool = false
    ) -> Bool {
        UITestTouchLedger.isRepeatableSystemCancel(
            appIsActive: appIsActive,
            windowIsKey: windowIsKey,
            viewIsInWindow: viewIsInWindow,
            cancelCarriedNewTime: cancelCarriedNewTime,
            longPressHasActed: longPressHasActed
        )
    }

    @Test func theTracedSimulatorCancelIsRepeatable() {
        #expect(isRepeatable())
    }

    /// A cancel raised inside the app leaves the touch's time as it was.
    @Test func aCancelWithNoNewTimeIsTheAppsOwn() {
        #expect(!isRepeatable(cancelCarriedNewTime: false))
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

    /// While a drawing tool is armed, the map's long press places a point before
    /// the finger lifts, so a repeat would place a second one.
    @Test func aLongPressThatHasActedIsNotRepeatable() {
        #expect(!isRepeatable(longPressHasActed: true))
    }
}

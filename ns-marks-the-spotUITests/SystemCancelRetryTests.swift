import XCTest

/// What decides a repeated tap, without an app. A real system cancel is too rare
/// to wait for in a test, so these play back what the ledger would say.
final class SystemCancelRetryTests: XCTestCase {
    @MainActor
    private final class Playback {
        var ledgers: [TouchLedger?]
        var gestures = 0
        var logs: [String] = []
        init(_ ledgers: [TouchLedger?]) { self.ledgers = ledgers }
    }

    /// Performs one gesture against ledgers read in this order. The last repeats.
    @MainActor
    private func play(_ ledgers: [TouchLedger?]) -> Playback {
        let playback = Playback(ledgers)
        let retry = SystemCancelRetry(
            read: {
                playback.ledgers.count > 1
                    ? playback.ledgers.removeFirst()
                    : playback.ledgers.first ?? nil
            },
            pause: { _ in },
            log: { playback.logs.append($0) },
            settleTimeout: 0.05,
            retapDelay: 0
        )
        retry.perform { playback.gestures += 1 }
        return playback
    }

    private let start = TouchLedger(began: 4, ended: 4)

    @MainActor
    func testATouchThatEndedIsNotRepeatedAndLogsNothing() {
        let run = play([start, TouchLedger(began: 5, ended: 5)])
        XCTAssertEqual(run.gestures, 1)
        XCTAssertEqual(run.logs, [])
    }

    @MainActor
    func testASystemCancelIsRepeatedOnceAndLogged() {
        let cancelled = TouchLedger(began: 5, ended: 4, systemCancelled: 1)
        let run = play([start, cancelled, cancelled, TouchLedger(began: 6, ended: 5, systemCancelled: 1)])
        XCTAssertEqual(run.gestures, 2)
        XCTAssertEqual(run.logs.count, 2)
        XCTAssertTrue(run.logs[0].hasPrefix("system cancelled the tap"), run.logs[0])
        XCTAssertTrue(run.logs[1].hasPrefix("re-tap result: ended"), run.logs[1])
    }

    /// It may be this gesture, delivered late. It would act, and a repeat would
    /// act again.
    @MainActor
    func testATouchThatArrivesBeforeTheRepeatStopsIt() {
        let cancelled = TouchLedger(began: 5, ended: 4, systemCancelled: 1)
        let run = play([start, cancelled, TouchLedger(began: 6, ended: 5, systemCancelled: 1)])
        XCTAssertEqual(run.gestures, 1)
        XCTAssertTrue(run.logs[1].hasPrefix("a touch arrived before the repeat"), run.logs[1])
    }

    @MainActor
    func testALedgerUnreadableBeforeTheRepeatStopsIt() {
        let run = play([start, TouchLedger(began: 5, ended: 4, systemCancelled: 1), nil])
        XCTAssertEqual(run.gestures, 1)
        XCTAssertTrue(run.logs[1].hasPrefix("a touch arrived before the repeat"), run.logs[1])
    }

    @MainActor
    func testASecondSystemCancelIsNotRepeatedAgain() {
        let first = TouchLedger(began: 5, ended: 4, systemCancelled: 1)
        let second = TouchLedger(began: 6, ended: 4, systemCancelled: 2)
        let run = play([start, first, first, second])
        XCTAssertEqual(run.gestures, 2)
        XCTAssertTrue(run.logs[1].hasPrefix("re-tap result: systemCancelled"), run.logs[1])
    }

    @MainActor
    func testACancelTheSystemDidNotClaimIsNotRepeated() {
        let run = play([start, TouchLedger(began: 5, ended: 4, otherCancelled: 1)])
        XCTAssertEqual(run.gestures, 1)
        XCTAssertTrue(run.logs[0].hasPrefix("cancelled, and not safe to repeat"), run.logs[0])
    }

    /// The cancel may be the earlier touch's, with this tap still in flight. It
    /// would then end and act, and a repeat would act again.
    @MainActor
    func testACancelWhileAnEarlierTouchWasOpenIsNotRepeated() {
        let run = play([
            TouchLedger(began: 5, ended: 4),
            TouchLedger(began: 6, ended: 4, systemCancelled: 1),
        ])
        XCTAssertEqual(run.gestures, 1)
        XCTAssertTrue(run.logs[0].hasPrefix("cancelled while an earlier touch"), run.logs[0])
    }

    /// A late cancel of an earlier touch must not repeat a tap that ended.
    @MainActor
    func testATouchThatEndedOutranksACancelInTheSameInterval() {
        let run = play([start, TouchLedger(began: 6, ended: 5, systemCancelled: 1)])
        XCTAssertEqual(run.gestures, 1)
        XCTAssertEqual(run.logs, [])
    }

    @MainActor
    func testAnOtherCancelOutranksASystemCancelInTheSameInterval() {
        let run = play([start, TouchLedger(began: 6, ended: 4, systemCancelled: 1, otherCancelled: 1)])
        XCTAssertEqual(run.gestures, 1)
    }

    /// `tap()` can return just before the cancel reaches the app.
    @MainActor
    func testACancelThatArrivesAfterTheTapReturnsIsStillRepeated() {
        let run = play([
            start,
            TouchLedger(began: 5, ended: 4),
            TouchLedger(began: 5, ended: 4, systemCancelled: 1),
            TouchLedger(began: 5, ended: 4, systemCancelled: 1),
            TouchLedger(began: 6, ended: 5, systemCancelled: 1),
        ])
        XCTAssertEqual(run.gestures, 2)
    }

    @MainActor
    func testATouchTheAppNeverSawIsNotRepeated() {
        let run = play([start])
        XCTAssertEqual(run.gestures, 1)
        XCTAssertTrue(run.logs[0].hasPrefix("not seen to finish"), run.logs[0])
    }

    @MainActor
    func testATouchThatNeverFinishesIsNotRepeated() {
        let run = play([start, TouchLedger(began: 5, ended: 4)])
        XCTAssertEqual(run.gestures, 1)
    }

    /// One lost touch must not leave every later tap waiting on it.
    @MainActor
    func testATouchLostEarlierDoesNotHoldUpTheNextTap() {
        let lost = TouchLedger(began: 5, ended: 4)
        XCTAssertTrue(TouchLedger(began: 6, ended: 5).hasFinishedTouches(since: lost))
    }

    /// A touch the app saw begin and never saw end turns off repeats only until
    /// the app counts it lost, not for the rest of the launch.
    @MainActor
    func testATouchCountedLostNoLongerMakesLaterCancelsAmbiguous() {
        let stillOpen = TouchLedger(began: 5, ended: 4)
        XCTAssertTrue(stillOpen.hasOpenTouch)
        let counted = TouchLedger(began: 6, ended: 5, lost: 1)
        XCTAssertFalse(counted.hasOpenTouch)
        let cancelled = TouchLedger(began: 7, ended: 5, systemCancelled: 1, lost: 1)
        let run = play([counted, cancelled, cancelled, TouchLedger(began: 8, ended: 6, systemCancelled: 1, lost: 1)])
        XCTAssertEqual(run.gestures, 2)
    }

    /// The tap during which the loss is counted read the touch as open before it
    /// began, so its cancel could still be the lost touch's. It is not repeated.
    @MainActor
    func testTheTapDuringWhichATouchIsCountedLostIsNotRepeated() {
        let stillOpen = TouchLedger(began: 5, ended: 4)
        let run = play([stillOpen, TouchLedger(began: 6, ended: 4, systemCancelled: 1, lost: 1)])
        XCTAssertEqual(run.gestures, 1)
        XCTAssertTrue(run.logs[0].hasPrefix("cancelled while an earlier touch was open"), run.logs[0])
    }

    @MainActor
    func testAnUnreadableLedgerStillTapsOnce() {
        let run = play([nil])
        XCTAssertEqual(run.gestures, 1)
        XCTAssertTrue(run.logs[0].hasPrefix("ledger unreadable"), run.logs[0])
    }

    @MainActor
    func testTheLedgerReadsWhatTheAppPublishes() {
        XCTAssertEqual(
            TouchLedger(published: "began=3 ended=2 systemCancelled=1 otherCancelled=0"),
            TouchLedger(began: 3, ended: 2, systemCancelled: 1)
        )
        XCTAssertEqual(
            TouchLedger(published: "began=3 ended=1 systemCancelled=1 otherCancelled=0 lost=1"),
            TouchLedger(began: 3, ended: 1, systemCancelled: 1, lost: 1)
        )
        let withNote = TouchLedger(
            published: "began=1 ended=0 systemCancelled=1 otherCancelled=0\nlastCancel=system newTime=0.180"
        )
        XCTAssertEqual(withNote?.systemCancelled, 1)
        XCTAssertEqual(withNote?.lastCancel, "lastCancel=system newTime=0.180")
    }

    @MainActor
    func testAnythingElseIsNotALedger() {
        XCTAssertNil(TouchLedger(published: nil))
        XCTAssertNil(TouchLedger(published: ""))
        XCTAssertNil(TouchLedger(published: 7))
        XCTAssertNil(TouchLedger(published: "began=3 ended=2"))
        XCTAssertNil(TouchLedger(published: "began=three ended=2 systemCancelled=1 otherCancelled=0"))
    }
}

/// The ledger is the only evidence for a repeated tap, so it has to be there, in
/// every state a test taps in, and it has to count what happened.
final class TouchLedgerUITests: XCTestCase {
    private let timeout: TimeInterval = 15

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDown() {
        attachUIFailure()
        super.tearDown()
    }

    /// Through the read the tap itself uses. If it answered nothing, every tap
    /// would log that and go on, so tests would pass with repeats switched off.
    @MainActor
    private func ledger(_ state: String) throws -> TouchLedger {
        let read = SystemCancelRetry.live.read()
        return try XCTUnwrap(read, "the touch ledger cannot be read \(state)")
    }

    /// A tap the app acted on is counted once, as a touch that ended.
    @MainActor
    func testATapIsCountedOnceAsATouchThatEnded() throws {
        let app = XCUIApplication.launchedForUITests()
        let layers = app.buttons["toggle-layers-menu"]
        XCTAssertTrue(layers.waitForHittable(timeout: timeout))
        let before = try ledger("at launch")

        layers.tapRetryingSystemCancel()
        XCTAssertTrue(
            app.buttons["Close layers menu"].waitForHittable(timeout: timeout),
            "the layers panel did not open"
        )

        let after = try ledger("with the layers panel open")
        XCTAssertEqual(after.ended, before.ended + 1)
        XCTAssertEqual(after.otherCancelled, before.otherCancelled)
        // A system cancel may land here too, and is then repeated.
        XCTAssertEqual(
            after.began - after.systemCancelled,
            before.began - before.systemCancelled + 1
        )
    }

    /// Tests tap menu rows and sheet buttons as well as the map.
    @MainActor
    func testTheLedgerCanBeReadUnderAMenuAndASheet() throws {
        let app = XCUIApplication.launchedForUITests()
        let more = app.buttons["More Map Actions"]
        XCTAssertTrue(more.waitForHittable(timeout: timeout))

        more.tapRetryingSystemCancel()
        let sources = app.buttons["Data Sources and Licenses"]
        XCTAssertTrue(sources.waitForExistence(timeout: timeout), "the menu did not open")
        _ = try ledger("with a menu open")

        sources.tapRetryingSystemCancel()
        XCTAssertTrue(app.navigationBars["Map Info"].waitForExistence(timeout: timeout), "no sheet")
        _ = try ledger("with a sheet open")
    }
}

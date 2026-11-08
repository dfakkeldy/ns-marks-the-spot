import XCTest

/// The app's count of what became of its touches, from `UITestTouchLedger`.
struct TouchLedger: Equatable {
    var began = 0
    var ended = 0
    var systemCancelled = 0
    var otherCancelled = 0
    /// The app's note on its latest cancel, for the log. Not part of any decision.
    var lastCancel: String?

    var finished: Int { ended + systemCancelled + otherCancelled }

    init(began: Int = 0, ended: Int = 0, systemCancelled: Int = 0, otherCancelled: Int = 0) {
        self.began = began
        self.ended = ended
        self.systemCancelled = systemCancelled
        self.otherCancelled = otherCancelled
    }

    /// `began=3 ended=2 systemCancelled=1 otherCancelled=0`, then an optional
    /// line about the latest cancel.
    init?(published value: Any?) {
        guard let text = value as? String else { return nil }
        let lines = text.split(separator: "\n", maxSplits: 1)
        guard let counts = lines.first else { return nil }
        var fields: [Substring: Int] = [:]
        for field in counts.split(separator: " ") {
            let pair = field.split(separator: "=")
            guard pair.count == 2, let number = Int(pair[1]) else { return nil }
            fields[pair[0]] = number
        }
        guard let began = fields["began"],
              let ended = fields["ended"],
              let systemCancelled = fields["systemCancelled"],
              let otherCancelled = fields["otherCancelled"] else { return nil }
        self.init(
            began: began, ended: ended,
            systemCancelled: systemCancelled, otherCancelled: otherCancelled
        )
        lastCancel = lines.count > 1 ? String(lines[1]) : nil
    }

    /// Whether every touch begun since `earlier` has reached its end, and there
    /// was at least one. A touch lost before `earlier` cannot hold this up.
    func hasFinishedTouches(since earlier: TouchLedger) -> Bool {
        began > earlier.began && finished - earlier.finished >= began - earlier.began
    }
}

/// What the app says happened to a gesture, given its ledger on either side.
enum TapFate: Equatable {
    case ended
    case systemCancelled
    case otherCancelled
    /// The app never saw it, or has not seen it finish.
    case unfinished

    /// Ordered so that doubt never repeats a tap. A touch that ended outranks
    /// everything, because repeating it would hide the app ignoring a real tap.
    init(before: TouchLedger, after: TouchLedger) {
        if !after.hasFinishedTouches(since: before) {
            self = .unfinished
        } else if after.ended > before.ended {
            self = .ended
        } else if after.otherCancelled > before.otherCancelled {
            self = .otherCancelled
        } else {
            self = .systemCancelled
        }
    }
}

/// Performs a gesture, and once more only if the app saw the system cancel it.
///
/// Hosted simulators occasionally take back a synthesized touch, which fails a
/// test though the app did the right thing (grok-bots#937). This tells that
/// apart from a tap the app ignored, on the app's own evidence. It never reads
/// the result of the tap, so it cannot repeat a tap for having no effect, and
/// it changes no timeout: a test still has to see the effect in the time it
/// always had.
///
/// Every decision other than a normal ending logs a line starting `UITEST_TAP`.
@MainActor
struct SystemCancelRetry {
    var read: @MainActor () -> TouchLedger?
    var pause: @MainActor (TimeInterval) -> Void
    var log: @MainActor (String) -> Void
    /// How long a touch may take to reach its end. The first read normally
    /// answers: the slowest delivery in 2,109 touches under disk load was 0.64 s.
    var settleTimeout: TimeInterval = 5
    /// Long enough that the repeat cannot read as the second tap of a double tap.
    var retapDelay: TimeInterval = 0.5

    func perform(_ gesture: @MainActor () -> Void) {
        guard let before = read() else {
            log("ledger unreadable, so a system cancel would not be repeated")
            gesture()
            return
        }
        let after = run(gesture, from: before)
        switch TapFate(before: before, after: after) {
        case .ended:
            break
        case .systemCancelled:
            log("system cancelled the tap, re-tapping once. \(describe(before, after))")
            retap(gesture, from: after)
        case .otherCancelled:
            log("cancelled, not by the system; not re-tapping. \(describe(before, after))")
        case .unfinished:
            log("not seen to finish; not re-tapping. \(describe(before, after))")
        }
    }

    private func retap(_ gesture: @MainActor () -> Void, from before: TouchLedger) {
        pause(retapDelay)
        let after = run(gesture, from: before)
        log("re-tap result: \(TapFate(before: before, after: after)). \(describe(before, after))")
    }

    private func run(_ gesture: @MainActor () -> Void, from before: TouchLedger) -> TouchLedger {
        gesture()
        let deadline = Date().addingTimeInterval(settleTimeout)
        var latest = read() ?? before
        while !latest.hasFinishedTouches(since: before), Date() < deadline {
            pause(0.1)
            latest = read() ?? latest
        }
        return latest
    }

    private func describe(_ before: TouchLedger, _ after: TouchLedger) -> String {
        "began \(before.began)->\(after.began) ended \(before.ended)->\(after.ended) "
            + "system \(before.systemCancelled)->\(after.systemCancelled) "
            + "other \(before.otherCancelled)->\(after.otherCancelled) "
            + (after.lastCancel ?? "")
    }

    static var live: SystemCancelRetry {
        SystemCancelRetry(
            read: { TouchLedger(published: XCUIApplication().value) },
            pause: { RunLoop.current.run(until: Date().addingTimeInterval($0)) },
            log: { print("UITEST_TAP \($0)") }
        )
    }
}

extension XCUIElement {
    /// `tap()`, repeated once only if the app saw the system cancel the touch.
    @MainActor
    func tapRetryingSystemCancel() {
        SystemCancelRetry.live.perform { tap() }
    }
}

extension XCUICoordinate {
    /// `tap()`, repeated once only if the app saw the system cancel the touch.
    @MainActor
    func tapRetryingSystemCancel() {
        SystemCancelRetry.live.perform { tap() }
    }
}

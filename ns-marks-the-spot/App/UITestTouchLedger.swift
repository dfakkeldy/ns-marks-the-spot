#if DEBUG
import ObjectiveC
import UIKit

/// What became of every touch this process received, for UI tests to read.
///
/// A simulator occasionally takes back a synthesized tap. The touch begins and,
/// about 0.19 s later, reaches `UIApplication.sendEvent` as cancelled. The app
/// is right to do nothing, because a cancelled touch must not act as a tap, so
/// the test fails with nothing wrong (grok-bots#937). XCUITest cannot see this
/// from outside. The ledger can, so a test can repeat that tap, and only that
/// tap: a touch that ended and did nothing is still a failure.
///
/// Compiled out of Release, and `AppContainer.forLaunch` installs it only under
/// `UITestMode`. It reads `sendEvent` rather than adding a window recognizer,
/// because a recognizer would join the arbitration it is there to observe.
///
/// Published as the application's accessibility value, read on demand, so a
/// touch costs no redraw and the count stays readable under a sheet or a menu.
enum UITestTouchLedger {
    private static var began = 0
    private static var ended = 0
    private static var systemCancelled = 0
    private static var otherCancelled = 0
    private static var lastCancel: String?
    private static var open: [ObjectIdentifier: OpenTouch] = [:]
    private static var isInstalled = false

    private struct OpenTouch {
        weak var view: UIView?
        let downAt: TimeInterval
        /// The touch's own time when it was last seen. A finger that stays still
        /// leaves it alone, so only an event from outside the process moves it.
        var seenAt: TimeInterval
    }

    static func install() {
        guard !isInstalled,
              let original = class_getInstanceMethod(
                UIApplication.self, #selector(UIApplication.sendEvent(_:))
              ),
              let replacement = class_getInstanceMethod(
                UIApplication.self, #selector(UIApplication.uiTestTouchLedger_sendEvent(_:))
              ) else { return }
        isInstalled = true
        method_exchangeImplementations(original, replacement)
        // Called while the app struct is built, before `UIApplication.shared`
        // exists. A test must read zero before its first tap, not nothing.
        NotificationCenter.default.addObserver(
            forName: UIApplication.didFinishLaunchingNotification, object: nil, queue: .main
        ) { _ in
            MainActor.assumeIsolated { publish() }
        }
    }

    /// Whether the system took this touch back before it could act, as opposed
    /// to the app losing it or the touch having already done something.
    ///
    /// A cancel from outside the process carries a new hardware time. One raised
    /// inside it leaves the touch's time as it was, however late it comes. The
    /// system's gesture gate is no guide: natural cancels have found it recognized,
    /// failed, and already gone from the touch.
    ///
    /// Anything else is left for the test to fail on: a touch cancelled because a
    /// view went away, a window took over or the app resigned is behaviour a
    /// repeated tap would hide, and a long press that has fired would fire again.
    /// If a later iOS stops giving a cancel its own time, this reads false and
    /// tests fail as they did before, rather than repeating taps they should not.
    static func isRepeatableSystemCancel(
        appIsActive: Bool,
        windowIsKey: Bool,
        viewIsInWindow: Bool,
        cancelCarriedNewTime: Bool,
        longPressHasActed: Bool
    ) -> Bool {
        appIsActive && windowIsKey && viewIsInWindow && cancelCarriedNewTime && !longPressHasActed
    }

    fileprivate static func record(_ event: UIEvent) {
        guard event.type == .touches, let touches = event.allTouches else { return }
        for touch in touches {
            let id = ObjectIdentifier(touch)
            switch touch.phase {
            case .began:
                began += 1
                open[id] = OpenTouch(view: touch.view, downAt: touch.timestamp, seenAt: touch.timestamp)
            case .ended:
                guard open.removeValue(forKey: id) != nil else { continue }
                ended += 1
            case .cancelled:
                guard let opened = open.removeValue(forKey: id) else { continue }
                recordCancel(of: touch, opened: opened)
            default:
                // A drag moves the touch's time, and that is not the cancel's doing.
                open[id]?.seenAt = touch.timestamp
                continue
            }
            publish()
        }
    }

    /// Must run before the original `sendEvent`: the long press's state is the one
    /// the cancel arrived with.
    private static func recordCancel(of touch: UITouch, opened: OpenTouch) {
        let appIsActive = UIApplication.shared.applicationState == .active
        let windowIsKey = touch.window?.isKeyWindow == true
        let viewIsInWindow = opened.view?.window != nil
        // The one press that acts before the finger lifts. It is asked, not timed:
        // load delays delivery, and load is when the system takes touches back.
        let press = touch.gestureRecognizers?.first { $0.name == MapController.placeLongPressName }
        let newTime = touch.timestamp - opened.seenAt
        let isSystem = isRepeatableSystemCancel(
            appIsActive: appIsActive,
            windowIsKey: windowIsKey,
            viewIsInWindow: viewIsInWindow,
            cancelCarriedNewTime: newTime > 0,
            longPressHasActed: press?.state == .began || press?.state == .changed
        )
        if isSystem {
            systemCancelled += 1
        } else {
            otherCancelled += 1
        }
        let point = touch.location(in: nil)
        lastCancel = String(
            format: "lastCancel=%@ active=%d key=%d viewInWindow=%d press=%ld held=%.3f newTime=%.3f at=(%.1f,%.1f)",
            isSystem ? "system" : "other",
            appIsActive ? 1 : 0, windowIsKey ? 1 : 0, viewIsInWindow ? 1 : 0,
            press?.state.rawValue ?? -1,
            touch.timestamp - opened.downAt, newTime, point.x, point.y
        )
    }

    private static func publish() {
        var summary = "began=\(began) ended=\(ended) "
            + "systemCancelled=\(systemCancelled) otherCancelled=\(otherCancelled)"
        if let lastCancel { summary += "\n\(lastCancel)" }
        UIApplication.shared.accessibilityValue = summary
    }
}

extension UIApplication {
    /// Exchanged with `sendEvent(_:)`, so the inner call reaches the original.
    @objc fileprivate func uiTestTouchLedger_sendEvent(_ event: UIEvent) {
        UITestTouchLedger.record(event)
        uiTestTouchLedger_sendEvent(event)
    }
}
#endif

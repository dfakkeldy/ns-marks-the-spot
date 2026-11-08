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

    // EXPERIMENT — not for merge. Faults for the controls, by launch environment.
    private static let environment = ProcessInfo.processInfo.environment
    /// Every nth touch is cancelled by the app itself: not a system cancel.
    private static let appCancelEvery = environment["UITEST_APP_CANCEL_EVERY"].flatMap(Int.init)
    /// Every nth touch is cancelled as if the gate had recognized. Everything else
    /// about the touch still goes through the real classifier.
    private static let forcedSystemCancelEvery = environment["UITEST_FORCED_SYSTEM_CANCEL_EVERY"].flatMap(Int.init)
    /// The same, but 0.5 s after the touch began, past the 0.45 s long press.
    private static let lateCancelEvery = environment["UITEST_LATE_CANCEL_EVERY"].flatMap(Int.init)
    /// Every nth identify tap is ignored though its touch ended.
    private static let ignoreIdentifyEvery = environment["UITEST_IGNORE_IDENTIFY_EVERY"].flatMap(Int.init)
    private static var identifyTaps = 0
    private static var injectedCancelPending = false

    static func shouldIgnoreIdentifyTap() -> Bool {
        guard let every = ignoreIdentifyEvery else { return false }
        identifyTaps += 1
        return identifyTaps % every == 0
    }

    private static func injectCancelIfDue() {
        if let every = lateCancelEvery, began % every == 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                MainActor.assumeIsolated { injectCancel() }
            }
            return
        }
        guard let every = appCancelEvery ?? forcedSystemCancelEvery, began % every == 0 else { return }
        DispatchQueue.main.async {
            MainActor.assumeIsolated { injectCancel() }
        }
    }

    private static func injectCancel() {
        let selector = NSSelectorFromString("_cancelAllTouches")
        let responds = UIApplication.shared.responds(to: selector)
        print("LEDGER_INJECT cancel began=\(began) responds=\(responds)")
        MapTapTrace.record("ledger injected cancel began=\(began) responds=\(responds)")
        injectedCancelPending = true
        if responds { _ = UIApplication.shared.perform(selector) }
    }

    /// A touch held this long may already have acted. The shortest press that
    /// acts before the finger lifts is the map's 0.45 s long press, which places
    /// a point while a drawing tool is armed, so repeating that touch could place
    /// a second one.
    private static let longestRepeatableHold: TimeInterval = 0.4

    private struct OpenTouch {
        weak var view: UIView?
        /// The touch's own time, on the `systemUptime` clock. The time from here to
        /// the moment a cancel arrives is at least as long as any recognizer's
        /// timer has run, so a hold under the limit proves it has not fired.
        let downAt: TimeInterval
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
    /// to the app losing it or the touch having had time to do something.
    ///
    /// Every traced simulator cancel had all of these. Anything else is left for
    /// the test to fail on: a touch cancelled because a view went away, a window
    /// took over or the app resigned is behaviour a repeated tap would hide, and
    /// a touch held long enough to act could act twice. If a later iOS renames
    /// the gate, this reads false and tests fail as they did before, rather than
    /// repeating taps they should not.
    static func isRepeatableSystemCancel(
        appIsActive: Bool,
        windowIsKey: Bool,
        viewIsInWindow: Bool,
        gateRecognized: Bool,
        held: TimeInterval
    ) -> Bool {
        appIsActive && windowIsKey && viewIsInWindow && gateRecognized
            && held < longestRepeatableHold
    }

    fileprivate static func record(_ event: UIEvent) {
        guard event.type == .touches, let touches = event.allTouches else { return }
        for touch in touches {
            let id = ObjectIdentifier(touch)
            switch touch.phase {
            case .began:
                began += 1
                open[id] = OpenTouch(view: touch.view, downAt: touch.timestamp)
                injectCancelIfDue()
            case .ended:
                guard open.removeValue(forKey: id) != nil else { continue }
                ended += 1
            case .cancelled:
                guard let opened = open.removeValue(forKey: id) else { continue }
                recordCancel(of: touch, opened: opened)
            default:
                continue
            }
            publish()
        }
    }

    /// Must run before the original `sendEvent`: the gate's state is the one the
    /// cancel arrived with.
    private static func recordCancel(of touch: UITouch, opened: OpenTouch) {
        let appIsActive = UIApplication.shared.applicationState == .active
        let windowIsKey = touch.window?.isKeyWindow == true
        let viewIsInWindow = opened.view?.window != nil
        let gateRecognized = (touch.gestureRecognizers ?? []).contains {
            String(describing: type(of: $0)) == "_UISystemGestureGateGestureRecognizer"
                && $0.state == .recognized
        }
        let forced = injectedCancelPending && (forcedSystemCancelEvery != nil || lateCancelEvery != nil)
        injectedCancelPending = false
        let held = ProcessInfo.processInfo.systemUptime - opened.downAt
        let isSystem = isRepeatableSystemCancel(
            appIsActive: appIsActive,
            windowIsKey: windowIsKey,
            viewIsInWindow: viewIsInWindow,
            gateRecognized: gateRecognized || forced,
            held: held
        )
        if isSystem {
            systemCancelled += 1
        } else {
            otherCancelled += 1
        }
        let point = touch.location(in: nil)
        lastCancel = String(
            format: "lastCancel=%@ active=%d key=%d viewInWindow=%d gate=%d held=%.3f at=(%.1f,%.1f)",
            isSystem ? "system" : "other",
            appIsActive ? 1 : 0, windowIsKey ? 1 : 0, viewIsInWindow ? 1 : 0, gateRecognized ? 1 : 0,
            held, point.x, point.y
        )
    }

    private static func publish() {
        var summary = "began=\(began) ended=\(ended) "
            + "systemCancelled=\(systemCancelled) otherCancelled=\(otherCancelled)"
        if let lastCancel { summary += "\n\(lastCancel)" }
        UIApplication.shared.accessibilityValue = summary
        // EXPERIMENT — not for merge. A second carrier, for the carrier probe.
        for scene in UIApplication.shared.connectedScenes {
            (scene as? UIWindowScene)?.windows.forEach { $0.accessibilityValue = summary }
        }
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

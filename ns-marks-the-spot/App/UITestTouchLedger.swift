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
    private static var lost = 0
    private static var lastCancel: String?
    private static var open: [ObjectIdentifier: OpenTouch] = [:]
    private static var isInstalled = false

    // EXPERIMENT — not for merge. Faults for the controls, by launch environment.
    private static let environment = ProcessInfo.processInfo.environment
    /// Every nth touch is cancelled by the app itself: not a system cancel.
    private static let appCancelEvery = environment["UITEST_APP_CANCEL_EVERY"].flatMap(Int.init)
    /// Every nth touch is cancelled as if the cancel had carried a new time. All
    /// else about the touch still goes through the real classifier.
    private static let forcedSystemCancelEvery = environment["UITEST_FORCED_SYSTEM_CANCEL_EVERY"].flatMap(Int.init)
    /// Applies the fault to the first touch on the map, whatever came before it,
    /// for controls that have to swipe a panel first.
    private static let faultFirstMapTouch = environment["UITEST_FAULT_FIRST_MAP_TOUCH"] != nil
    private static var firstMapTouchTaken = false
    /// The same, but 0.5 s after the touch began, past the 0.45 s long press.
    private static let lateCancelEvery = environment["UITEST_LATE_CANCEL_EVERY"].flatMap(Int.init)
    /// Every nth touch is cancelled by the app after a delay, with nothing forced:
    /// the deciding control for what the gate and the touch's clock read on a cancel
    /// that is the app's own and arrives as late as the system's do.
    private static let delayedCancelEvery = environment["UITEST_DELAYED_CANCEL_EVERY"].flatMap(Int.init)
    private static let delayedCancelAfter = environment["UITEST_DELAYED_CANCEL_AFTER"].flatMap(Double.init) ?? 0.18
    /// Every nth identify tap is ignored though its touch ended.
    private static let ignoreIdentifyEvery = environment["UITEST_IGNORE_IDENTIFY_EVERY"].flatMap(Int.init)
    private static var identifyTaps = 0
    private static var injectedCancelPending = false

    static func shouldIgnoreIdentifyTap() -> Bool {
        guard let every = ignoreIdentifyEvery else { return false }
        identifyTaps += 1
        return identifyTaps % every == 0
    }

    private static func injectCancelIfDue(on touch: UITouch) {
        if faultFirstMapTouch {
            guard !firstMapTouchTaken, let map = MapTapTrace.mapView,
                  touch.view?.isDescendant(of: map) == true else { return }
            firstMapTouchTaken = true
        }
        func isDue(_ every: Int?) -> Bool {
            guard let every else { return false }
            return faultFirstMapTouch || began % every == 0
        }
        if isDue(delayedCancelEvery) {
            DispatchQueue.main.asyncAfter(deadline: .now() + delayedCancelAfter) {
                MainActor.assumeIsolated { injectCancel() }
            }
            return
        }
        if isDue(lateCancelEvery) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                MainActor.assumeIsolated { injectCancel() }
            }
            return
        }
        guard isDue(appCancelEvery ?? forcedSystemCancelEvery) else { return }
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
        if touches.contains(where: { $0.phase == .began }) {
            countLostTouches(current: touches)
        }
        for touch in touches {
            let id = ObjectIdentifier(touch)
            switch touch.phase {
            case .began:
                // UIKit reuses touch objects, so a touch whose end never arrived
                // can come back as this one.
                if open[id] != nil { lost += 1 }
                began += 1
                open[id] = OpenTouch(view: touch.view, downAt: touch.timestamp, seenAt: touch.timestamp)
                injectCancelIfDue(on: touch)
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

    /// A touch whose end never reached `sendEvent` would leave the counts one
    /// open for the rest of the launch, and every later cancel would look as if
    /// it might be that touch's, so none would be repeated. A new touch begins
    /// only with every live touch in its event, so an open one missing from it
    /// is gone. The tap during which this is noticed still is not repeated,
    /// because its earlier count showed the touch open; the ones after it are.
    private static func countLostTouches(current touches: Set<UITouch>) {
        let live = Set(touches.map(ObjectIdentifier.init))
        for id in open.keys where !live.contains(id) {
            open.removeValue(forKey: id)
            lost += 1
        }
    }

    /// Must run before the original `sendEvent`: the long press's state is the one
    /// the cancel arrived with.
    private static func recordCancel(of touch: UITouch, opened: OpenTouch) {
        let appIsActive = UIApplication.shared.applicationState == .active
        let windowIsKey = touch.window?.isKeyWindow == true
        let viewIsInWindow = opened.view?.window != nil
        let forced = injectedCancelPending && (forcedSystemCancelEvery != nil || lateCancelEvery != nil)
        injectedCancelPending = false
        // The one press that acts before the finger lifts. It is asked, not timed:
        // load delays delivery, and load is when the system takes touches back.
        let press = touch.gestureRecognizers?.first { $0.name == MapController.placeLongPressName }
        let newTime = touch.timestamp - opened.seenAt
        let isSystem = isRepeatableSystemCancel(
            appIsActive: appIsActive,
            windowIsKey: windowIsKey,
            viewIsInWindow: viewIsInWindow,
            cancelCarriedNewTime: newTime > 0 || forced,
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
            + "systemCancelled=\(systemCancelled) otherCancelled=\(otherCancelled) lost=\(lost)"
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

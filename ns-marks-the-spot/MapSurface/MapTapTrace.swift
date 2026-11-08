#if DEBUG
import MapKit
import ObjectiveC
import OSLog
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// EXPERIMENT — not for merge. Records how a map tap travels through the
/// gesture system in a UI-test launch, so a tap that places nothing can be
/// told apart from one that was recognized and then lost.
///
/// Off unless the launch carries `UITestMode`, and compiled out of Release.
/// Screen points and recognizer states only.
enum MapTapTrace {
    static let isEnabled = ProcessInfo.processInfo.arguments.contains("UITestMode")
    static weak var mapView: MKMapView?
    private static var entries: [String] = []
    private static var sequence = 0
    private static var observed = Set<ObjectIdentifier>()
    private static let observer = Observer()

    private static let log = Logger(subsystem: "nsmts.maptaptrace", category: "trace")

    static func record(_ message: @autoclosure () -> String) {
        guard isEnabled else { return }
        sequence += 1
        let time = String(format: "%.3f", ProcessInfo.processInfo.systemUptime)
        let line = "\(sequence) @\(time): \(message())"
        log.notice("\(line, privacy: .public)")
        entries.append(line)
        if entries.count > 180 { entries.removeFirst(entries.count - 180) }
        mapView?.accessibilityValue = entries.joined(separator: "\n")
    }

    /// Every touch the application receives, before any window or recognizer
    /// sees it: whether a synthesized tap reached the process at all, how far
    /// apart its down and up were in HID time, and how late the main thread
    /// was to handle each.
    static func installEventLog() {
        guard isEnabled, !eventLogInstalled else { return }
        eventLogInstalled = true
        guard let original = class_getInstanceMethod(
            UIApplication.self, #selector(UIApplication.sendEvent(_:))
        ), let replacement = class_getInstanceMethod(
            UIApplication.self, #selector(UIApplication.mapTapTrace_sendEvent(_:))
        ) else {
            record("event log NOT installed")
            return
        }
        method_exchangeImplementations(original, replacement)
        record("event log installed")
        // A touch the app resigned under is cancelled by UIKit, not by the
        // system: these say which.
        let names: [(Notification.Name, String)] = [
            (UIApplication.willResignActiveNotification, "willResignActive"),
            (UIApplication.didBecomeActiveNotification, "didBecomeActive"),
            (UIApplication.didEnterBackgroundNotification, "didEnterBackground"),
            (UIWindow.didBecomeKeyNotification, "windowDidBecomeKey"),
            (UIWindow.didResignKeyNotification, "windowDidResignKey"),
        ]
        for (name, label) in names {
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { note in
                let window = (note.object as? UIWindow).map { " \(type(of: $0))" } ?? ""
                MainActor.assumeIsolated { MapTapTrace.record("lifecycle \(label)\(window)") }
            }
        }
    }

    private static var eventLogInstalled = false
    private static var touchDown: [ObjectIdentifier: TimeInterval] = [:]
    private static var touchView: [ObjectIdentifier: WeakView] = [:]
    private static var observedWindows = Set<ObjectIdentifier>()

    private struct WeakView {
        weak var value: UIView?
        let type: String
    }

    static func logEvent(_ event: UIEvent) {
        guard event.type == .touches, let touches = event.allTouches else { return }
        let now = ProcessInfo.processInfo.systemUptime
        for touch in touches {
            let phase: String
            switch touch.phase {
            case .began: phase = "began"
            case .ended: phase = "ended"
            case .cancelled: phase = "cancelled"
            default: continue
            }
            let id = ObjectIdentifier(touch)
            var held = ""
            if let window = touch.window, observedWindows.insert(ObjectIdentifier(window)).inserted {
                // The system gesture gate lives on the window: a gate that
                // begins just before a cancel means the system took the touch.
                window.gestureRecognizers?.forEach(observe)
                record("window recognizers " + (window.gestureRecognizers ?? []).map(describe).joined(separator: "; "))
            }
            if touch.phase == .began {
                touchDown[id] = touch.timestamp
                touchView[id] = WeakView(
                    value: touch.view, type: touch.view.map { String(describing: type(of: $0)) } ?? "nil"
                )
            } else if let down = touchDown.removeValue(forKey: id) {
                held = String(format: " held=%.3f", touch.timestamp - down)
                if touch.phase == .cancelled {
                    held += String(
                        format: " event=%.3f class=%@ touches=%ld",
                        event.timestamp, NSStringFromClass(type(of: event)), touches.count
                    )
                }
            }
            let began = touch.phase == .began ? nil : touchView.removeValue(forKey: id)
            if touch.phase == .cancelled {
                let state: String
                switch UIApplication.shared.applicationState {
                case .active: state = "active"
                case .inactive: state = "inactive"
                case .background: state = "background"
                @unknown default: state = "unknown"
                }
                let viewNote = began.map { view in
                    view.value == nil
                        ? "\(view.type) released"
                        : "\(view.type) inWindow=\(view.value?.window != nil)"
                } ?? "unknown"
                let live = (touch.gestureRecognizers ?? []).filter { $0.state != .possible }
                record(
                    "cancel context appState=\(state) key=\(touch.window?.isKeyWindow ?? false) "
                        + "beganView=\(viewNote) recognizers not-possible: "
                        + (live.isEmpty ? "none" : live.map(describe).joined(separator: "; "))
                )
            }
            let point = touch.location(in: nil)
            let window = touch.window.map { String(describing: type(of: $0)) } ?? "nil"
            let view = touch.view.map { String(describing: type(of: $0)) } ?? "nil"
            record(String(
                format: "touch %@ at=(%.1f,%.1f) win=%@ view=%@ hid=%.3f late=%.3f taps=%ld%@",
                phase, point.x, point.y, window, view, touch.timestamp, now - touch.timestamp,
                touch.tapCount, held
            ))
        }
    }

    static func describe(_ recognizer: UIGestureRecognizer) -> String {
        var text = "\(type(of: recognizer))"
        if let name = recognizer.name { text += "[\(name)]" }
        text += " s=\(recognizer.state.rawValue)"
        if let view = recognizer.view { text += " on=\(type(of: view))" }
        if let tap = recognizer as? UITapGestureRecognizer {
            text += " taps=\(tap.numberOfTapsRequired)x\(tap.numberOfTouchesRequired)"
        }
        if let press = recognizer as? UILongPressGestureRecognizer {
            text += " min=\(press.minimumPressDuration)"
        }
        if !recognizer.isEnabled { text += " disabled" }
        return text
    }

    /// Adds an observing target. Target actions fire on began, changed,
    /// ended and cancelled; a failure is seen only through the identify tap.
    static func observe(_ recognizer: UIGestureRecognizer) {
        guard isEnabled, observed.insert(ObjectIdentifier(recognizer)).inserted else { return }
        recognizer.addTarget(observer, action: #selector(Observer.fired(_:)))
    }

    static func observeTree(_ view: UIView) {
        guard isEnabled else { return }
        view.gestureRecognizers?.forEach(observe)
        view.subviews.forEach(observeTree)
    }

    final class Observer: NSObject {
        @objc func fired(_ recognizer: UIGestureRecognizer) {
            MapTapTrace.record("fired \(MapTapTrace.describe(recognizer))")
        }
    }
}

extension UIApplication {
    /// Swapped with `sendEvent(_:)`, so this call reaches the original.
    @objc func mapTapTrace_sendEvent(_ event: UIEvent) {
        MapTapTrace.logEvent(event)
        mapTapTrace_sendEvent(event)
    }
}

/// The identify tap, with every touch and state change written to the trace.
/// Behaves exactly as `UITapGestureRecognizer`; only observation is added.
final class TracingTapGestureRecognizer: UITapGestureRecognizer {
    private var rivals: [WeakRecognizer] = []

    override var state: UIGestureRecognizer.State {
        didSet {
            guard state != oldValue else { return }
            MapTapTrace.record("identify state \(oldValue.rawValue)->\(state.rawValue)")
        }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        if let touch = touches.first {
            let hit = touch.view.map { String(describing: type(of: $0)) } ?? "nil"
            MapTapTrace.record(
                "identify touchesBegan point=\(touch.location(in: view)) hit=\(hit) tapCount=\(touch.tapCount)"
            )
            let others = (touch.gestureRecognizers ?? []).filter { $0 !== self }
            others.forEach(MapTapTrace.observe)
            rivals = others.map(WeakRecognizer.init)
            MapTapTrace.record("rivals " + others.map(MapTapTrace.describe).joined(separator: "; "))
        }
        super.touchesBegan(touches, with: event)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        if let touch = touches.first {
            MapTapTrace.record("identify touchesMoved point=\(touch.location(in: view))")
        }
        super.touchesMoved(touches, with: event)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        MapTapTrace.record("identify touchesEnded state=\(state.rawValue)")
        super.touchesEnded(touches, with: event)
        snapshotRivals("after touchesEnded")
        Task { @MainActor [weak self] in self?.snapshotRivals("next turn") }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        MapTapTrace.record("identify touchesCancelled state=\(state.rawValue)")
        super.touchesCancelled(touches, with: event)
    }

    override func reset() {
        MapTapTrace.record("identify reset from state=\(state.rawValue)")
        super.reset()
    }

    private func snapshotRivals(_ moment: String) {
        let live = rivals.compactMap(\.value).filter { $0.state != .possible }
        MapTapTrace.record(
            "rivals \(moment) not-possible: "
                + (live.isEmpty ? "none" : live.map(MapTapTrace.describe).joined(separator: "; "))
        )
    }

    private struct WeakRecognizer {
        weak var value: UIGestureRecognizer?
        init(_ value: UIGestureRecognizer) { self.value = value }
    }
}
#endif

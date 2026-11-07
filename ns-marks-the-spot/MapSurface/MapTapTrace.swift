#if DEBUG
import MapKit
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

    static func record(_ message: @autoclosure () -> String) {
        guard isEnabled else { return }
        sequence += 1
        let time = String(format: "%.3f", ProcessInfo.processInfo.systemUptime)
        entries.append("\(sequence) @\(time): \(message())")
        if entries.count > 180 { entries.removeFirst(entries.count - 180) }
        mapView?.accessibilityValue = entries.joined(separator: "\n")
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

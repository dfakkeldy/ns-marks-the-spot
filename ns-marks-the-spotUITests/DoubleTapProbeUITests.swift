import ObjectiveC
import XCTest

/// EXPERIMENT — not for merge (grok-bots#961). XCUITest's own gestures cannot
/// time two taps, so this uses XCTest's private event record to put touches on
/// one clock. Each scenario prints what the app did: points placed, whether the
/// camera changed, and the trace with touch and identify times.
final class DoubleTapProbeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    /// One finger: down at the first step, up at the last.
    private typealias Touch = [(point: CGPoint, at: TimeInterval)]

    @MainActor
    private func synthesize(_ touches: [Touch]) throws {
        guard let pathClass = NSClassFromString("XCPointerEventPath"),
              let recordClass = NSClassFromString("XCSynthesizedEventRecord") else {
            throw XCTSkip("XCTest's event classes are not there")
        }
        typealias PathInit = @convention(c) (AnyObject, Selector, CGPoint, Double) -> AnyObject
        typealias Offset = @convention(c) (AnyObject, Selector, Double) -> Void
        typealias Move = @convention(c) (AnyObject, Selector, CGPoint, Double) -> Void
        typealias RecordInit = @convention(c) (AnyObject, Selector, NSString, Int) -> AnyObject

        func imp<T>(_ object: AnyObject, _ selector: Selector, as type: T.Type) -> T {
            let method = class_getInstanceMethod(object_getClass(object), selector)
            XCTAssertNotNil(method, "no \(selector)")
            return unsafeBitCast(method_getImplementation(method!), to: type)
        }
        func allocate(_ cls: AnyClass) -> AnyObject {
            let selector = NSSelectorFromString("alloc")
            typealias Alloc = @convention(c) (AnyClass, Selector) -> AnyObject
            let method = class_getClassMethod(cls, selector)!
            return unsafeBitCast(method_getImplementation(method), to: Alloc.self)(cls, selector)
        }

        let recordInit = NSSelectorFromString("initWithName:interfaceOrientation:")
        let blank = allocate(recordClass)
        let record = imp(blank, recordInit, as: RecordInit.self)(blank, recordInit, "probe", 1)

        let pathInit = NSSelectorFromString("initForTouchAtPoint:offset:")
        let move = NSSelectorFromString("moveToPoint:atOffset:")
        let lift = NSSelectorFromString("liftUpAtOffset:")
        let add = NSSelectorFromString("addPointerEventPath:")
        for touch in touches {
            let first = touch[0]
            let blankPath = allocate(pathClass)
            let path = imp(blankPath, pathInit, as: PathInit.self)(blankPath, pathInit, first.point, first.at)
            for step in touch.dropFirst() {
                imp(path, move, as: Move.self)(path, move, step.point, step.at)
            }
            imp(path, lift, as: Offset.self)(path, lift, touch[touch.count - 1].at)
            _ = (record as! NSObject).perform(add, with: path)
        }

        let device = XCUIDevice.shared as NSObject
        guard let synthesizer = device.perform(NSSelectorFromString("eventSynthesizer"))?.takeUnretainedValue() as? NSObject else {
            throw XCTSkip("no event synthesizer")
        }
        let finished = expectation(description: "synthesized")
        let completion: @convention(block) (Bool, NSError?) -> Void = { ok, error in
            if !ok || error != nil { print("PROBE synth failed ok=\(ok) error=\(String(describing: error))") }
            finished.fulfill()
        }
        _ = synthesizer.perform(
            NSSelectorFromString("synthesizeEvent:completion:"),
            with: record,
            with: unsafeBitCast(completion, to: AnyObject.self)
        )
        wait(for: [finished], timeout: 30)
    }

    @MainActor
    private func map(_ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", "Map of Nova Scotia")).firstMatch
    }

    @MainActor
    private func traceLines(_ app: XCUIApplication) -> [Substring] {
        String(describing: map(app).value ?? "").split(separator: "\n")
    }

    @MainActor
    private func sequence(of line: Substring) -> Int {
        Int(line.prefix(while: \.isNumber)) ?? 0
    }

    /// Opens the map in measuring mode.
    @MainActor
    private func measuringApp() -> XCUIApplication {
        let app = XCUIApplication.launchedForUITests()
        let distance = app.buttons["measure-distance"]
        XCTAssertTrue(distance.waitForHittable(timeout: 30))
        distance.tap()
        XCTAssertTrue(app.descendants(matching: .any)["measure-readout"].waitForExistence(timeout: 10))
        return app
    }

    /// Runs one scenario, prints what happened, and takes back what it placed.
    @MainActor
    private func run(_ name: String, _ app: XCUIApplication, _ touches: [Touch], settle: TimeInterval = 2.5) throws {
        let before = traceLines(app).last.map(sequence(of:)) ?? 0
        try synthesize(touches)
        _ = waitForUI(timeout: settle) { false }
        let lines = traceLines(app).filter { sequence(of: $0) > before }
        let placed = lines.filter { $0.contains("measure count") }.count
        let regions = lines.filter { $0.contains("region latDelta") }.count
        let identifies = lines.filter { $0.contains("identify action state=3") }.count
        print("PROBE \(name) placed=\(placed) identify=\(identifies) regionChanges=\(regions)")
        print("PROBE_TRACE_BEGIN \(name)\n\(lines.joined(separator: "\n"))\nPROBE_TRACE_END")
        let undo = app.buttons["measure-undo"]
        var taken = 0
        while taken < placed, undo.isEnabled {
            undo.tap()
            taken += 1
            _ = waitForUI(timeout: 0.5) { false }
        }
    }

    private func tap(_ point: CGPoint, at start: TimeInterval, press: TimeInterval = 0.05) -> Touch {
        [(point, start), (point, start + press)]
    }

    private func drag(
        from: CGPoint, by: CGVector, at start: TimeInterval, duration: TimeInterval = 0.5
    ) -> Touch {
        (0...10).map { step in
            let fraction = CGFloat(step) / 10
            return (
                CGPoint(x: from.x + by.dx * fraction, y: from.y + by.dy * fraction),
                start + duration * Double(step) / 10
            )
        }
    }

    @MainActor
    private func points(_ app: XCUIApplication) -> (a: CGPoint, b: CGPoint, c: CGPoint) {
        let window = app.windows.firstMatch.frame
        func at(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: window.minX + window.width * x, y: window.minY + window.height * y)
        }
        return (at(0.20, 0.25), at(0.60, 0.25), at(0.20, 0.45))
    }

    /// A single tap alone: how long from lift to the action.
    @MainActor
    func testProbe1SingleTapLatency() throws {
        let app = measuringApp()
        let (a, _, _) = points(app)
        for round in 0..<10 {
            try run("single tap \(round)", app, [tap(a, at: 0)], settle: 1.5)
        }
    }

    /// Two taps in one spot, with each gap from lift to touch-down.
    @MainActor
    func testProbe2SameSpotGapSweep() throws {
        for gap in [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50, 0.70] {
            let app = measuringApp()
            let (a, _, _) = points(app)
            for round in 0..<3 {
                try run(
                    "same spot gap \(gap) round \(round)", app,
                    [tap(a, at: 0), tap(a, at: 0.05 + gap)]
                )
            }
            app.terminate()
        }
    }

    /// Two quick taps far apart: both must place. Each is a tap someone meant.
    @MainActor
    func testProbe3FarApartGapSweep() throws {
        let app = measuringApp()
        let (a, b, c) = points(app)
        for gap in [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40] {
            for round in 0..<3 {
                try run(
                    "far apart gap \(gap) round \(round)", app,
                    [tap(a, at: 0), tap(b, at: 0.05 + gap)]
                )
            }
        }
        for round in 0..<3 {
            try run(
                "burst of three round \(round)", app,
                [tap(a, at: 0), tap(b, at: 0.20), tap(c, at: 0.40)]
            )
        }
    }

    /// Two quick taps close together: where does a double tap stop being one?
    @MainActor
    func testProbe4DistanceSweep() throws {
        for distance in [10.0, 20.0, 40.0, 60.0, 80.0, 120.0] {
            let app = measuringApp()
            let (a, _, _) = points(app)
            let near = CGPoint(x: a.x + distance, y: a.y)
            for round in 0..<3 {
                try run(
                    "distance \(distance) gap 0.10 round \(round)", app,
                    [tap(a, at: 0), tap(near, at: 0.15)]
                )
            }
            app.terminate()
        }
    }

    /// Tap, then touch down again and drag: MapKit's one-handed zoom.
    @MainActor
    func testProbe5DoubleTapAndDrag() throws {
        for gap in [0.10, 0.20] {
            for round in 0..<3 {
                let app = measuringApp()
                let (a, _, _) = points(app)
                try run(
                    "double tap and drag gap \(gap) round \(round)", app,
                    [tap(a, at: 0), drag(from: a, by: CGVector(dx: 0, dy: 120), at: 0.05 + gap)]
                )
                app.terminate()
            }
        }
    }

    /// Tap, then pan straight away: the tap should place and the pan should pan.
    @MainActor
    func testProbe6TapThenPan() throws {
        let app = measuringApp()
        let (a, b, _) = points(app)
        for gap in [0.05, 0.10, 0.20, 0.30] {
            for round in 0..<2 {
                try run(
                    "tap then far pan gap \(gap) round \(round)", app,
                    [tap(a, at: 0), drag(from: b, by: CGVector(dx: -30, dy: 120), at: 0.05 + gap)]
                )
                try run(
                    "tap then near pan gap \(gap) round \(round)", app,
                    [tap(a, at: 0), drag(from: CGPoint(x: a.x + 80, y: a.y), by: CGVector(dx: 30, dy: 120), at: 0.05 + gap)]
                )
            }
        }
    }

    /// Three in one spot, and XCUITest's own double tap for comparison.
    @MainActor
    func testProbe7TripleAndPublicDoubleTap() throws {
        let app = measuringApp()
        let (a, _, _) = points(app)
        for round in 0..<3 {
            try run(
                "triple tap round \(round)", app,
                [tap(a, at: 0), tap(a, at: 0.15), tap(a, at: 0.30)]
            )
        }
        for round in 0..<3 {
            let before = traceLines(app).last.map(sequence(of:)) ?? 0
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.25)).doubleTap()
            _ = waitForUI(timeout: 2.5) { false }
            let lines = traceLines(app).filter { sequence(of: $0) > before }
            print("PROBE xcui double tap round \(round) placed=\(lines.filter { $0.contains("measure count") }.count)")
            print("PROBE_TRACE_BEGIN xcui double tap \(round)\n\(lines.joined(separator: "\n"))\nPROBE_TRACE_END")
        }
    }
}

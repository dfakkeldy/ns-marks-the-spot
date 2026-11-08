import ObjectiveC
import XCTest

/// EXPERIMENT — not for merge (grok-bots#961). XCUITest's own gestures cannot
/// time two taps, so this uses XCTest's private event record. Two fingers in
/// one record give a gap of about 0 ms (a path starts at the last one's lift).
/// Two records with a sleep between give real gaps from about 220 ms up. The
/// trace carries the HID times: read gaps from there, not from names here.
final class DoubleTapProbeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    /// One finger: down at the first step, up at the last.
    private typealias Touch = [(point: CGPoint, at: TimeInterval)]

    private typealias PathInit = @convention(c) (AnyObject, Selector, CGPoint, Double) -> AnyObject
    private typealias Offset = @convention(c) (AnyObject, Selector, Double) -> Void
    private typealias Move = @convention(c) (AnyObject, Selector, CGPoint, Double) -> Void
    private typealias RecordInit = @convention(c) (AnyObject, Selector, NSString, Int) -> AnyObject

    private func imp<T>(_ object: AnyObject, _ selector: Selector, as type: T.Type) -> T {
        let method = class_getInstanceMethod(object_getClass(object), selector)
        XCTAssertNotNil(method, "no \(selector)")
        return unsafeBitCast(method_getImplementation(method!), to: type)
    }

    private func allocate(_ cls: AnyClass) -> AnyObject {
        let selector = NSSelectorFromString("alloc")
        typealias Alloc = @convention(c) (AnyClass, Selector) -> AnyObject
        let method = class_getClassMethod(cls, selector)!
        return unsafeBitCast(method_getImplementation(method), to: Alloc.self)(cls, selector)
    }

    @MainActor
    private func synthesize(_ touches: [Touch]) throws {
        guard let pathClass = NSClassFromString("XCPointerEventPath"),
              let recordClass = NSClassFromString("XCSynthesizedEventRecord") else {
            throw XCTSkip("XCTest's event classes are not there")
        }
        let recordInit = NSSelectorFromString("initWithName:interfaceOrientation:")
        let blank = allocate(recordClass)
        let record = imp(blank, recordInit, as: RecordInit.self)(blank, recordInit, "probe", 1)

        let pathInit = NSSelectorFromString("initForTouchAtPoint:offset:")
        let moveTo = NSSelectorFromString("moveToPoint:atOffset:")
        let lift = NSSelectorFromString("liftUpAtOffset:")
        for touch in touches {
            let first = touch[0]
            let blankPath = allocate(pathClass)
            let path = imp(blankPath, pathInit, as: PathInit.self)(blankPath, pathInit, first.point, first.at)
            for step in touch.dropFirst() {
                imp(path, moveTo, as: Move.self)(path, moveTo, step.point, step.at)
            }
            imp(path, lift, as: Offset.self)(path, lift, touch[touch.count - 1].at)
            _ = (record as! NSObject).perform(NSSelectorFromString("addPointerEventPath:"), with: path)
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

    private func sequence(of line: Substring) -> Int {
        Int(line.prefix(while: \.isNumber)) ?? 0
    }

    @MainActor
    private func measuringApp() -> XCUIApplication {
        let app = XCUIApplication.launchedForUITests()
        let distance = app.buttons["measure-distance"]
        XCTAssertTrue(distance.waitForHittable(timeout: 60))
        distance.tap()
        XCTAssertTrue(app.descendants(matching: .any)["measure-readout"].waitForExistence(timeout: 10))
        return app
    }

    /// Runs one scenario, prints what happened, and takes back what it placed.
    @MainActor
    private func run(
        _ name: String, _ app: XCUIApplication, settle: TimeInterval = 2.5,
        _ act: () throws -> Void
    ) rethrows {
        let before = traceLines(app).last.map(sequence(of:)) ?? 0
        try act()
        _ = waitForUI(timeout: settle) { false }
        let lines = traceLines(app).filter { sequence(of: $0) > before }
        let placed = lines.filter { $0.contains("measure count") }.count
        let regions = lines.filter { $0.contains("region latDelta") }.count
        print("PROBE \(name) placed=\(placed) regionChanges=\(regions)")
        print("PROBE_TRACE_BEGIN \(name)\n\(lines.joined(separator: "\n"))\nPROBE_TRACE_END")
        let undo = app.buttons["measure-undo"]
        var taken = 0
        while taken < placed, undo.isEnabled {
            undo.tap()
            taken += 1
            _ = waitForUI(timeout: 0.5) { false }
        }
    }

    private func tap(_ point: CGPoint, at start: TimeInterval = 0) -> Touch {
        [(point, start), (point, start + 0.05)]
    }

    private func drag(from: CGPoint, by: CGVector, at start: TimeInterval, duration: TimeInterval = 0.5) -> Touch {
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

    /// A single tap alone: how long from lift to the point.
    @MainActor
    func testProbe1SingleTapLatency() throws {
        let app = measuringApp()
        let (a, _, _) = points(app)
        for round in 0..<12 {
            try run("single tap \(round)", app, settle: 1.5) { try synthesize([tap(a)]) }
        }
    }

    /// Two taps in one spot as two records: maps the edge of the window.
    @MainActor
    func testProbe2SameSpotGaps() throws {
        let sleeps = [0.0, 0.08, 0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.18, 0.25]
        for start in stride(from: 0, to: sleeps.count, by: 3) {
            let app = measuringApp()
            let (a, _, _) = points(app)
            for sleep in sleeps[start..<min(start + 3, sleeps.count)] {
                for round in 0..<4 {
                    try run("same spot sleep \(sleep) round \(round)", app) {
                        try synthesize([tap(a)])
                        Thread.sleep(forTimeInterval: sleep)
                        try synthesize([tap(a)])
                    }
                }
            }
            app.terminate()
        }
    }

    /// Two quick taps far apart: both are meant, and both must place.
    @MainActor
    func testProbe3FarApart() throws {
        let app = measuringApp()
        let (a, b, c) = points(app)
        for round in 0..<3 {
            try run("far apart gap 0 round \(round)", app) {
                try synthesize([tap(a), tap(b, at: 0.15)])
            }
        }
        for sleep in [0.0, 0.10, 0.20, 0.30, 0.50] {
            for round in 0..<2 {
                try run("far apart sleep \(sleep) round \(round)", app) {
                    try synthesize([tap(a)])
                    Thread.sleep(forTimeInterval: sleep)
                    try synthesize([tap(b)])
                }
            }
        }
        for round in 0..<3 {
            try run("burst of three round \(round)", app) {
                try synthesize([tap(a), tap(b, at: 0.20), tap(c, at: 0.40)])
            }
        }
    }

    /// Two quick taps close together: where does a double tap stop being one,
    /// and does the app agree with MapKit there?
    @MainActor
    func testProbe4DistanceSweep() throws {
        let distances = [20.0, 40.0, 42.0, 44.0, 45.0, 46.0, 47.0, 48.0, 49.0, 50.0, 55.0]
        for start in stride(from: 0, to: distances.count, by: 3) {
            let app = measuringApp()
            let (a, _, _) = points(app)
            for distance in distances[start..<min(start + 3, distances.count)] {
                for round in 0..<3 {
                    try run("distance \(distance) round \(round)", app) {
                        try synthesize([tap(a), tap(CGPoint(x: a.x + distance, y: a.y), at: 0.15)])
                    }
                }
            }
            app.terminate()
        }
    }

    /// Tap, then press again and drag: MapKit's one-handed zoom. And tap, then
    /// press again and hold still.
    @MainActor
    func testProbe5SecondTouchThatIsNotATap() throws {
        for round in 0..<3 {
            let app = measuringApp()
            let (a, _, _) = points(app)
            try run("double tap and drag round \(round)", app) {
                try synthesize([tap(a), drag(from: a, by: CGVector(dx: 0, dy: 120), at: 0.15)])
            }
            try run("tap then press and hold round \(round)", app) {
                try synthesize([tap(a), [(a, 0.15), (a, 1.35)]])
            }
            app.terminate()
        }
    }

    /// The edge of MapKit's window, twenty times at each gap: the before and
    /// after of the guard. Two records, so the gaps are real.
    @MainActor
    func testProbe11EdgeOfTheWindowTwentyTimes() throws {
        for sleep in [0.12, 0.13, 0.14, 0.15, 0.16, 0.18] {
            let app = measuringApp()
            let (a, _, _) = points(app)
            for round in 0..<20 {
                try run("edge sleep \(sleep) round \(round)", app, settle: 1.5) {
                    try synthesize([tap(a)])
                    Thread.sleep(forTimeInterval: sleep)
                    try synthesize([tap(a)])
                }
            }
            app.terminate()
        }
    }

    /// Tap, then a slow second press that drags or holds: is MapKit's
    /// one-handed zoom still open when its double tap has given up?
    @MainActor
    func testProbe12SlowSecondPress() throws {
        let app = measuringApp()
        let (a, _, _) = points(app)
        for sleep in [0.08, 0.12, 0.14, 0.16, 0.20] {
            for round in 0..<2 {
                try run("slow drag sleep \(sleep) round \(round)", app) {
                    try synthesize([tap(a)])
                    Thread.sleep(forTimeInterval: sleep)
                    try synthesize([drag(from: a, by: CGVector(dx: 0, dy: 120), at: 0)])
                }
                try run("slow hold sleep \(sleep) round \(round)", app) {
                    try synthesize([tap(a)])
                    Thread.sleep(forTimeInterval: sleep)
                    try synthesize([[(a, 0), (a, 1.2)]])
                }
            }
        }
    }

    /// Tap, then pan straight away: the tap should place and the pan should pan.
    @MainActor
    func testProbe6TapThenPan() throws {
        let app = measuringApp()
        let (a, b, _) = points(app)
        for round in 0..<3 {
            try run("tap then far pan round \(round)", app) {
                try synthesize([tap(a), drag(from: b, by: CGVector(dx: -30, dy: 120), at: 0.15)])
            }
            try run("tap then near pan round \(round)", app) {
                try synthesize([
                    tap(a),
                    drag(from: CGPoint(x: a.x + 80, y: a.y), by: CGVector(dx: 30, dy: 120), at: 0.15),
                ])
            }
        }
    }

    private func centre(_ element: XCUIElement) -> CGPoint {
        CGPoint(x: element.frame.midX, y: element.frame.midY)
    }

    /// Prints the trace since `before`: the order of the `measure count` lines
    /// shows whether the tap landed before the button or after it.
    @MainActor
    private func report(_ name: String, _ app: XCUIApplication, after before: Int, _ detail: String) {
        let lines = traceLines(app).filter { sequence(of: $0) > before }
        let counts = lines.filter { $0.contains("measure count") }
            .map { $0.split(separator: " ").dropFirst(4).first ?? "?" }
        print("PROBE \(name) counts=\(counts) \(detail)")
        print("PROBE_TRACE_BEGIN \(name)\n\(lines.joined(separator: "\n"))\nPROBE_TRACE_END")
    }

    /// A tap on the map with a button pressed at once. The tap must land first,
    /// in the mode it was made in.
    @MainActor
    func testProbe8TapThenChromeButton() throws {
        for round in 0..<4 {
            let app = measuringApp()
            let (a, _, _) = points(app)
            let readout = app.descendants(matching: .any)["measure-readout"]
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.30, dy: 0.35)).tap()
            _ = waitForUI(timeout: 2) { false }
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: 0.50)).tap()
            _ = waitForUI(timeout: 2) { false }
            let measured = readout.label

            var before = traceLines(app).last.map(sequence(of:)) ?? 0
            try synthesize([tap(a), tap(centre(app.buttons["measure-undo"]), at: 0.15)])
            _ = waitForUI(timeout: 2) { false }
            report("tap then undo round \(round)", app, after: before,
                   "kept=\(readout.label == measured) readout=\(readout.label)")

            before = traceLines(app).last.map(sequence(of:)) ?? 0
            let beforeFinish = readout.label
            try synthesize([tap(a), tap(centre(app.buttons["measure-finish"]), at: 0.15)])
            _ = waitForUI(timeout: 2) { false }
            report("tap then finish round \(round)", app, after: before,
                   "was=\(beforeFinish) readout=\(readout.label) finishEnabled=\(app.buttons["measure-finish"].isEnabled)")
            app.terminate()

            let browsing = XCUIApplication.launchedForUITests()
            let layers = browsing.buttons["toggle-layers-menu"]
            XCTAssertTrue(layers.waitForHittable(timeout: 60))
            before = traceLines(browsing).last.map(sequence(of:)) ?? 0
            let (spot, _, _) = points(browsing)
            try synthesize([tap(spot), tap(centre(layers), at: 0.15)])
            _ = waitForUI(timeout: 2) { false }
            report("tap then layers round \(round)", browsing, after: before,
                   "panelOpen=\(browsing.descendants(matching: .any)["base-map-style"].exists)")
            browsing.terminate()
        }
    }

    /// A held tap landing rebuilds the corners. Does a second touch already on
    /// an older corner survive that? And a double tap on a corner: does MapKit
    /// still take it, or does the second tap place a point?
    @MainActor
    func testProbe9OverPlacedCorners() throws {
        for round in 0..<4 {
            let app = measuringApp()
            let (a, _, _) = points(app)
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.30, dy: 0.35)).tap()
            _ = waitForUI(timeout: 2) { false }
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: 0.50)).tap()
            _ = waitForUI(timeout: 2) { false }
            let corner = app.descendants(matching: .any)["Placed corner 1"].firstMatch
            XCTAssertTrue(corner.waitForExistence(timeout: 5))

            var before = traceLines(app).last.map(sequence(of:)) ?? 0
            let target = centre(corner)
            try synthesize([tap(a), tap(target, at: 0.15)])
            _ = waitForUI(timeout: 2.5) { false }
            report("tap then placed corner round \(round)", app, after: before, "target=\(target)")

            before = traceLines(app).last.map(sequence(of:)) ?? 0
            let again = centre(corner)
            try synthesize([tap(again), tap(again, at: 0.15)])
            _ = waitForUI(timeout: 2.5) { false }
            report("double tap on placed corner round \(round)", app, after: before, "target=\(again)")
            app.terminate()
        }
    }

    /// Past the closest zoom there is nothing left to zoom to.
    @MainActor
    func testProbe10DoubleTapAtClosestZoom() throws {
        let app = measuringApp()
        let (a, _, _) = points(app)
        for _ in 0..<16 {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.25)).doubleTap()
            _ = waitForUI(timeout: 1.2) { false }
        }
        for round in 0..<3 {
            try run("double tap at closest zoom round \(round)", app) {
                try synthesize([tap(a), tap(a, at: 0.15)])
            }
        }
    }

    /// Three in one spot, and XCUITest's own double tap for comparison.
    @MainActor
    func testProbe7TripleAndPublicDoubleTap() throws {
        let app = measuringApp()
        let (a, _, _) = points(app)
        for round in 0..<2 {
            try run("triple tap round \(round)", app) {
                try synthesize([tap(a), tap(a, at: 0.15), tap(a, at: 0.30)])
            }
        }
        for round in 0..<3 {
            run("xcui double tap round \(round)", app) {
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.25)).doubleTap()
            }
        }
    }
}

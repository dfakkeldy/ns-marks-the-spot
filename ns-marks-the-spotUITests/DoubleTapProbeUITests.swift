import ObjectiveC
import XCTest

/// EXPERIMENT — not for merge (grok-bots#961). XCUITest's own gestures cannot
/// time two taps, so this uses XCTest's private event record. Paths in one
/// record started at each other's lift in the first probe, so one finger now
/// lifts and presses again on a single path; two records with a sleep between
/// them are the fallback. The trace carries the real HID times: read gaps from
/// there, not from the names here.
final class DoubleTapProbeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    private enum Step {
        case down(CGPoint, TimeInterval)
        case move(CGPoint, TimeInterval)
        case up(TimeInterval)
    }

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

    /// One finger on one path.
    @MainActor
    private func synthesize(_ steps: [Step]) throws {
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
        let press = NSSelectorFromString("pressDownAtOffset:")
        guard case .down(let start, let startOffset) = steps[0] else {
            throw XCTSkip("a path starts with a press")
        }
        let blankPath = allocate(pathClass)
        let path = imp(blankPath, pathInit, as: PathInit.self)(blankPath, pathInit, start, startOffset)
        var at = start
        for step in steps.dropFirst() {
            switch step {
            case .down(let point, let offset):
                if point != at {
                    imp(path, moveTo, as: Move.self)(path, moveTo, point, offset - 0.002)
                    at = point
                }
                imp(path, press, as: Offset.self)(path, press, offset)
            case .move(let point, let offset):
                imp(path, moveTo, as: Move.self)(path, moveTo, point, offset)
                at = point
            case .up(let offset):
                imp(path, lift, as: Offset.self)(path, lift, offset)
            }
        }
        _ = (record as! NSObject).perform(NSSelectorFromString("addPointerEventPath:"), with: path)

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
        XCTAssertTrue(distance.waitForHittable(timeout: 30))
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

    /// Two taps on one finger: the gap runs from the lift to the next press.
    private func twoTaps(_ first: CGPoint, _ second: CGPoint, gap: TimeInterval) -> [Step] {
        [.down(first, 0), .up(0.05), .down(second, 0.05 + gap), .up(0.10 + gap)]
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
        for round in 0..<10 {
            try run("single tap \(round)", app, settle: 1.5) {
                try synthesize([.down(a, 0), .up(0.05)])
            }
        }
    }

    /// Two taps in one spot, on one path, for each gap.
    @MainActor
    func testProbe2SameSpotGapSweep() throws {
        let gaps = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.33, 0.35, 0.37, 0.40, 0.50, 0.70]
        for start in stride(from: 0, to: gaps.count, by: 3) {
            let app = measuringApp()
            let (a, _, _) = points(app)
            for gap in gaps[start..<min(start + 3, gaps.count)] {
                for round in 0..<2 {
                    try run("same spot path gap \(gap) round \(round)", app) {
                        try synthesize(twoTaps(a, a, gap: gap))
                    }
                }
            }
            app.terminate()
        }
    }

    /// Two taps in one spot, as two records with a sleep between. Slower, and
    /// its real gaps are whatever the trace says, but it cannot be collapsed.
    @MainActor
    func testProbe3SameSpotTwoRecords() throws {
        let app = measuringApp()
        let (a, _, _) = points(app)
        for sleep in [0.0, 0.05, 0.10, 0.15, 0.20, 0.25] {
            for round in 0..<2 {
                try run("same spot records sleep \(sleep) round \(round)", app) {
                    try synthesize([.down(a, 0), .up(0.05)])
                    Thread.sleep(forTimeInterval: sleep)
                    try synthesize([.down(a, 0), .up(0.05)])
                }
            }
        }
    }

    /// Two quick taps far apart: both are meant, and both must place.
    @MainActor
    func testProbe4FarApart() throws {
        let app = measuringApp()
        let (a, b, c) = points(app)
        for gap in [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.60] {
            for round in 0..<2 {
                try run("far apart path gap \(gap) round \(round)", app) {
                    try synthesize(twoTaps(a, b, gap: gap))
                }
            }
        }
        for sleep in [0.0, 0.10, 0.20, 0.30, 0.50] {
            for round in 0..<2 {
                try run("far apart records sleep \(sleep) round \(round)", app) {
                    try synthesize([.down(a, 0), .up(0.05)])
                    Thread.sleep(forTimeInterval: sleep)
                    try synthesize([.down(b, 0), .up(0.05)])
                }
            }
        }
        for round in 0..<2 {
            try run("burst of three round \(round)", app) {
                try synthesize([
                    .down(a, 0), .up(0.05),
                    .down(b, 0.20), .up(0.25),
                    .down(c, 0.40), .up(0.45),
                ])
            }
        }
    }

    /// Two quick taps close together: where does a double tap stop being one?
    @MainActor
    func testProbe5DistanceSweep() throws {
        let distances = [20.0, 30.0, 40.0, 45.0, 50.0, 55.0, 60.0, 80.0]
        for start in stride(from: 0, to: distances.count, by: 3) {
            let app = measuringApp()
            let (a, _, _) = points(app)
            for distance in distances[start..<min(start + 3, distances.count)] {
                for round in 0..<2 {
                    try run("distance \(distance) round \(round)", app) {
                        try synthesize(twoTaps(a, CGPoint(x: a.x + distance, y: a.y), gap: 0.10))
                    }
                }
            }
            app.terminate()
        }
    }

    /// Tap, then press again and drag: MapKit's one-handed zoom. And tap, then
    /// press again and hold still.
    @MainActor
    func testProbe6SecondTouchThatIsNotATap() throws {
        for gap in [0.10, 0.20] {
            for round in 0..<2 {
                let app = measuringApp()
                let (a, _, _) = points(app)
                let start = 0.05 + gap
                var drag: [Step] = [.down(a, 0), .up(0.05), .down(a, start)]
                for step in 1...10 {
                    drag.append(.move(
                        CGPoint(x: a.x, y: a.y + 12 * CGFloat(step)),
                        start + 0.05 * Double(step)
                    ))
                }
                drag.append(.up(start + 0.55))
                try run("double tap and drag gap \(gap) round \(round)", app) {
                    try synthesize(drag)
                }
                try run("tap then press and hold gap \(gap) round \(round)", app) {
                    try synthesize([.down(a, 0), .up(0.05), .down(a, start), .up(start + 1.2)])
                }
                app.terminate()
            }
        }
    }

    /// Tap, then pan straight away: the tap should place and the pan should pan.
    @MainActor
    func testProbe7TapThenPan() throws {
        let app = measuringApp()
        let (a, b, _) = points(app)
        for gap in [0.10, 0.25] {
            for round in 0..<2 {
                func pan(from: CGPoint) -> [Step] {
                    let start = 0.05 + gap
                    var steps: [Step] = [.down(a, 0), .up(0.05), .down(from, start)]
                    for step in 1...10 {
                        steps.append(.move(
                            CGPoint(x: from.x - 3 * CGFloat(step), y: from.y + 12 * CGFloat(step)),
                            start + 0.04 * Double(step)
                        ))
                    }
                    steps.append(.up(start + 0.44))
                    return steps
                }
                try run("tap then far pan gap \(gap) round \(round)", app) {
                    try synthesize(pan(from: b))
                }
                try run("tap then near pan gap \(gap) round \(round)", app) {
                    try synthesize(pan(from: CGPoint(x: a.x + 80, y: a.y)))
                }
            }
        }
    }

    /// Three in one spot, and XCUITest's own double tap for comparison.
    @MainActor
    func testProbe8TripleAndPublicDoubleTap() throws {
        let app = measuringApp()
        let (a, _, _) = points(app)
        for round in 0..<2 {
            try run("triple tap round \(round)", app) {
                try synthesize([
                    .down(a, 0), .up(0.05),
                    .down(a, 0.15), .up(0.20),
                    .down(a, 0.30), .up(0.35),
                ])
            }
        }
        for round in 0..<3 {
            run("xcui double tap round \(round)", app) {
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.25)).doubleTap()
            }
        }
    }
}

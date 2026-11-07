import XCTest

/// EXPERIMENT — not for merge. Repeats the taps the map-tap flakes depend on
/// many times in one launch, and prints the app's trace (gesture decisions and
/// every touch the process received) for each one that did nothing.
final class MapTapProbeUITests: XCTestCase {
    private var tally: [String: (done: Int, dropped: Int)] = [:]

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    override func tearDown() {
        let summary = tally.keys.sorted().map {
            "\(name) \($0): done \(tally[$0]!.done) dropped \(tally[$0]!.dropped)"
        }
        print("PROBE_SUMMARY_BEGIN\n\(summary.joined(separator: "\n"))\nPROBE_SUMMARY_END")
        super.tearDown()
    }

    private func map(_ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", "Map of Nova Scotia")).firstMatch
    }

    private func traceLines(_ app: XCUIApplication) -> [Substring] {
        String(describing: map(app).value ?? "").split(separator: "\n")
    }

    private func lastSequence(_ app: XCUIApplication) -> Int {
        traceLines(app).last.map { Int($0.prefix(while: \.isNumber)) ?? 0 } ?? 0
    }

    /// Runs one probe and records whether `succeeded` came true.
    private func probe(
        _ key: String, app: XCUIApplication, timeout: TimeInterval = 5,
        act: () -> Void, succeeded: () -> Bool
    ) -> Bool {
        let before = lastSequence(app)
        let started = Date()
        act()
        let ok = waitForUI(timeout: timeout, succeeded)
        var entry = tally[key] ?? (done: 0, dropped: 0)
        if ok { entry.done += 1 } else { entry.dropped += 1 }
        tally[key] = entry
        print(String(format: "PROBE %@ ok=%@ took=%.2fs", key, ok ? "true" : "false", Date().timeIntervalSince(started)))
        if !ok {
            let slice = traceLines(app).filter { (Int($0.prefix(while: \.isNumber)) ?? 0) > before }
            print("PROBE_TRACE_BEGIN \(key)\n\(slice.joined(separator: "\n"))\nPROBE_TRACE_END")
        }
        return ok
    }

    /// Exact centres of the measuring corners, the badge, and bare ground,
    /// including ground close to the screen edge.
    @MainActor
    func testZZProbeMeasuringTaps() throws {
        let app = XCUIApplication.launchedForUITests()
        let distance = app.buttons["measure-distance"]
        XCTAssertTrue(distance.waitForHittable(timeout: 15))
        distance.tap()
        let readout = app.descendants(matching: .any)["measure-readout"]
        XCTAssertTrue(readout.waitForExistence(timeout: 10))
        let endpoint = app.descendants(matching: .any)["measure-endpoint-label"]
        let undo = app.buttons["measure-undo"]

        app.coordinate(withNormalizedOffset: CGVector(dx: 0.30, dy: 0.35)).tap()
        XCTAssertTrue(waitForUI { undo.isEnabled })
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: 0.50)).tap()
        XCTAssertTrue(waitForUI { endpoint.exists && readout.label.hasSuffix("km") })
        let base = readout.label
        let corner = app.descendants(matching: .any)["Placed corner 1"].firstMatch
        XCTAssertTrue(corner.waitForExistence(timeout: 5))
        print("PROBE_GEOMETRY corner1=\(corner.frame) endpoint=\(endpoint.frame) window=\(app.windows.firstMatch.frame)")

        func place(_ key: String, press: TimeInterval? = nil, at point: () -> CGPoint) {
            XCTAssertTrue(waitForUI(timeout: 10) { readout.label == base }, "did not return to two points")
            let target = point()
            let placed = probe(key, app: app, act: {
                if let press { app.pressMap(at: target, forDuration: press) } else { app.tapMap(at: target) }
            }, succeeded: { readout.label != base })
            if placed {
                XCTAssertTrue(undo.waitForHittable(timeout: 5))
                undo.tap()
            }
        }
        let cornerCentre = { CGPoint(x: corner.frame.midX, y: corner.frame.midY) }
        // The labelled endpoint view ends in the dot: 14 points at its foot.
        let lastDot = { CGPoint(x: endpoint.frame.midX, y: endpoint.frame.maxY - 7) }
        let badge = { endpoint.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).screenPoint }
        let nearBadge = { app.coordinate(withNormalizedOffset: CGVector(dx: 0.40, dy: 0.42)).screenPoint }
        let far = { app.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.25)).screenPoint }
        let edge25 = { CGPoint(x: 25, y: 445) }
        let edge10 = { CGPoint(x: 10, y: 445) }

        for round in 0..<30 {
            place("corner1 centre tap", at: cornerCentre)
            if round.isMultiple(of: 3) {
                place("last dot tap", at: lastDot)
                place("badge tap", at: badge)
                place("nearBadge tap", at: nearBadge)
                place("far tap", at: far)
                place("edge x25 tap", at: edge25)
                place("edge x10 tap", at: edge10)
            }
        }
        for duration in [0.15, 0.3, 0.6] {
            for _ in 0..<3 {
                place("corner1 centre press \(duration)s", press: duration, at: cornerCentre)
                place("edge x25 press \(duration)s", press: duration, at: edge25)
            }
        }
    }

    /// The tap beside the layers panel that should put it away.
    @MainActor
    func testZZProbeLayersCloseTaps() throws {
        let app = XCUIApplication.launchedForUITests()
        let layers = app.buttons["toggle-layers-menu"]
        let close = app.buttons["Close layers menu"]
        let panel = app.otherElements["layer-panel"]
        let window = app.windows.firstMatch
        for _ in 0..<25 {
            XCTAssertTrue(layers.waitForHittable(timeout: 15))
            layers.tap()
            XCTAssertTrue(close.waitForHittable(timeout: 15), "the layers panel did not open")
            XCTAssertTrue(panel.waitForStableFrame(in: window, timeout: 15, requiresHittable: false))
            let exposed = panel.frame.minX - window.frame.minX
            let target = CGPoint(x: window.frame.minX + exposed / 2, y: panel.frame.midY)
            let closed = probe("layers close at x=\(Int(target.x))", app: app, timeout: 10, act: {
                app.tapMap(at: target)
            }, succeeded: { !close.exists })
            if !closed, close.exists { close.tap() }
            XCTAssertTrue(waitForUI(timeout: 10) { !close.exists })
        }
    }

    /// Choosing a ground from the base-map menu.
    @MainActor
    func testZZProbeBaseMapMenuTaps() throws {
        let app = XCUIApplication.launchedForUITests()
        let strip = app.descendants(matching: .any)["map-attribution"]
        XCTAssertTrue(strip.waitForExistence(timeout: 15))
        let layers = app.buttons["toggle-layers-menu"]
        XCTAssertTrue(layers.waitForHittable(timeout: 15))
        layers.tap()
        let picker = app.descendants(matching: .any)["base-map-style"]
        XCTAssertTrue(picker.waitForHittable(timeout: 15))
        let choices = [("OpenStreetMap", "© OpenStreetMap contributors"), ("Atlas Fletcher", "NS Marks Atlas")]
        for round in 0..<30 {
            let (item, credit) = choices[round % 2]
            XCTAssertTrue(picker.waitForHittable(timeout: 15))
            picker.tap()
            let button = app.buttons[item]
            XCTAssertTrue(button.waitForHittable(timeout: 15), "\(item) is not offered")
            let chose = probe("menu \(item)", app: app, timeout: 10, act: {
                button.tap()
            }, succeeded: { strip.label.hasPrefix(credit) })
            if !chose {
                // Put the menu away and choose again, so the next round starts
                // from the ground it expects.
                if button.exists, button.isHittable { button.tap() }
                XCTAssertTrue(waitForUI(timeout: 10) { strip.label.hasPrefix(credit) })
            }
        }
    }
}

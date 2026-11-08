import XCTest

/// EXPERIMENT — not for merge. Repeats the taps the map-tap flakes depend on
/// many times in one launch, and prints the app's trace (gesture decisions and
/// every touch the process received) for each one that did nothing.
final class MapTapProbeUITests: XCTestCase {
    private var tally: [String: (done: Int, dropped: Int)] = [:]
    /// Probes whose next passing trace is printed too.
    private var alwaysTrace: Set<String> = ["corner1 centre tap", "layers close at x=25", "menu OpenStreetMap"]

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    override func tearDown() {
        let summary = tally.keys.sorted().map {
            "\(name) \($0): done \(tally[$0]!.done) dropped \(tally[$0]!.dropped)"
        }
        print("PROBE_SUMMARY_BEGIN\n\(summary.joined(separator: "\n"))\nPROBE_SUMMARY_END")
        print("FINAL_LEDGER \(name) \(String(describing: XCUIApplication().value))")
        super.tearDown()
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
    private func lastSequence(_ app: XCUIApplication) -> Int {
        traceLines(app).last.map { Int($0.prefix(while: \.isNumber)) ?? 0 } ?? 0
    }

    /// Runs one probe and records whether `succeeded` came true.
    @MainActor
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
        if !ok || alwaysTrace.contains(key) {
            if ok { alwaysTrace.remove(key) }
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
        let badge = { endpoint.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).screenPoint }
        let nearBadge = { app.coordinate(withNormalizedOffset: CGVector(dx: 0.40, dy: 0.42)).screenPoint }
        let far = { app.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.25)).screenPoint }
        let edge25 = { CGPoint(x: 25, y: 445) }
        let edge10 = { CGPoint(x: 10, y: 445) }

        for round in 0..<30 {
            place("corner1 centre tap", at: cornerCentre)
            if round.isMultiple(of: 3) {
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
        // Last, because it zooms. A double tap zooms. Count what it places: the trace says how many
        // times the identify tap fired.
        for _ in 0..<3 {
            XCTAssertTrue(waitForUI(timeout: 10) { readout.label == base }, "did not return to two points")
            let before = lastSequence(app)
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.25)).doubleTap()
            _ = waitForUI(timeout: 3) { false }
            let slice = traceLines(app).filter { (Int($0.prefix(while: \.isNumber)) ?? 0) > before }
            let placed = slice.filter { $0.contains("measure count") }.count
            print("PROBE double tap placed=\(placed)")
            print("PROBE_TRACE_BEGIN double tap\n\(slice.joined(separator: "\n"))\nPROBE_TRACE_END")
            var entry = tally["double tap placed nothing"] ?? (done: 0, dropped: 0)
            if placed == 0 { entry.done += 1 } else { entry.dropped += 1 }
            tally["double tap placed nothing"] = entry
            for _ in 0..<placed where undo.isEnabled && readout.label != base {
                undo.tap()
                _ = waitForUI(timeout: 3) { readout.label == base }
            }
        }
    }

    /// Many cheap taps, to catch the system cancelling a synthesized touch
    /// and record why: a map tap that places a point, then the Undo button.
    @MainActor
    func testZZCancelHunt() throws {
        let app = XCUIApplication.launchedForUITests()
        let distance = app.buttons["measure-distance"]
        XCTAssertTrue(distance.waitForHittable(timeout: 30))
        distance.tap()
        let readout = app.descendants(matching: .any)["measure-readout"]
        XCTAssertTrue(readout.waitForExistence(timeout: 30))
        let undo = app.buttons["measure-undo"]
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.30, dy: 0.35)).tap()
        XCTAssertTrue(waitForUI { undo.isEnabled })
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: 0.50)).tap()
        XCTAssertTrue(waitForUI { readout.label.hasSuffix("km") })
        let base = readout.label
        let undoPoint = CGPoint(x: undo.frame.midX, y: undo.frame.midY)
        let far = app.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.25)).screenPoint
        for _ in 0..<350 {
            XCTAssertTrue(waitForUI(timeout: 15) { readout.label == base }, "did not return to two points")
            let placed = probe("hunt map tap", app: app, timeout: 10, act: {
                app.tapMap(at: far)
            }, succeeded: { readout.label != base })
            if placed {
                _ = probe("hunt undo tap", app: app, timeout: 10, act: {
                    app.tapMap(at: undoPoint)
                }, succeeded: { readout.label == base })
            }
            if readout.label != base, undo.exists { undo.tap() }
        }
    }

    /// Where the ledger can be read from, in each state a test taps in, and what
    /// a read costs next to an ordinary query.
    @MainActor
    func testZZLedgerCarrierProbe() throws {
        let app = XCUIApplication.launchedForUITests()
        let layers = app.buttons["toggle-layers-menu"]
        XCTAssertTrue(layers.waitForHittable(timeout: 30))
        func timed<T>(_ read: () -> T) -> (T, String) {
            let started = Date()
            let value = read()
            return (value, String(format: "%.3fs", Date().timeIntervalSince(started)))
        }
        func report(_ state: String) {
            for _ in 0..<3 {
                let (appValue, appTime) = timed { app.value }
                let (windowValue, windowTime) = timed { app.windows.firstMatch.value }
                let (exists, queryTime) = timed { layers.exists }
                let (liveRead, liveTime) = timed { SystemCancelRetry.live.read() }
                print(
                    "CARRIER \(state) app=\(String(describing: appValue)) \(appTime) "
                        + "window=\(String(describing: windowValue)) \(windowTime) "
                        + "layersExists=\(exists) \(queryTime) "
                        + "liveRead=\(liveRead != nil) \(liveTime)"
                )
            }
        }
        report("map")
        layers.tap()
        XCTAssertTrue(app.buttons["Close layers menu"].waitForHittable(timeout: 30))
        report("layers open")
        let picker = app.descendants(matching: .any)["base-map-style"]
        XCTAssertTrue(picker.waitForHittable(timeout: 30))
        picker.tap()
        XCTAssertTrue(app.buttons["OpenStreetMap"].waitForHittable(timeout: 30))
        report("picker menu open")
        app.buttons["OpenStreetMap"].tap()
        app.buttons["Close layers menu"].tap()
        let more = app.buttons["More Map Actions"]
        XCTAssertTrue(more.waitForHittable(timeout: 30))
        more.tap()
        let sources = app.buttons["Data Sources and Licenses"]
        XCTAssertTrue(sources.waitForExistence(timeout: 30))
        report("more menu open")
        sources.tap()
        XCTAssertTrue(app.navigationBars["Map Info"].waitForExistence(timeout: 30))
        report("sheet open")
    }

    /// One map tap, then Undo, repeated: the shape of the hunt, for the controls.
    @MainActor
    private func runMeasuringControl(_ label: String, environment key: String, rounds: Int = 40) {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launchEnvironment[key] = "5"
        app.launch()
        let distance = app.buttons["measure-distance"]
        XCTAssertTrue(distance.waitForHittable(timeout: 30))
        distance.tap()
        let readout = app.descendants(matching: .any)["measure-readout"]
        XCTAssertTrue(readout.waitForExistence(timeout: 30))
        let undo = app.buttons["measure-undo"]
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.30, dy: 0.35)).tap()
        XCTAssertTrue(waitForUI { undo.isEnabled })
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: 0.50)).tap()
        XCTAssertTrue(waitForUI { readout.label.hasSuffix("km") })
        let base = readout.label
        let undoPoint = CGPoint(x: undo.frame.midX, y: undo.frame.midY)
        let far = app.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.25)).screenPoint
        for _ in 0..<rounds {
            XCTAssertTrue(waitForUI(timeout: 15) { readout.label == base }, "did not return to two points")
            let placed = probe("\(label) map tap", app: app, timeout: 6, act: {
                app.tapMap(at: far)
            }, succeeded: { readout.label != base })
            if placed {
                _ = probe("\(label) undo tap", app: app, timeout: 6, act: {
                    app.tapMap(at: undoPoint)
                }, succeeded: { readout.label == base })
            }
            if readout.label != base, undo.exists { undo.tap() }
        }
    }

    /// Every fifth map tap ends normally and the app ignores it, the shape of a
    /// real bug such as #674. Expected: drops stay visible, no re-tap at all.
    @MainActor
    func testZZControlIgnoredTapIsNotRepeated() throws {
        runMeasuringControl("control ignored", environment: "UITEST_IGNORE_IDENTIFY_EVERY")
    }

    /// Every fifth touch is cancelled by the app, without the gate. Expected:
    /// counted as other, drops stay visible, no re-tap at all.
    @MainActor
    func testZZControlAppCancelIsNotRepeated() throws {
        runMeasuringControl("control app cancel", environment: "UITEST_APP_CANCEL_EVERY")
    }

    /// Every fifth touch is cancelled and classified as the system's, which runs
    /// the re-tap path often. Expected: every one re-tapped, no drops.
    @MainActor
    func testZZControlForcedSystemCancelIsRepeated() throws {
        runMeasuringControl("control forced system", environment: "UITEST_FORCED_SYSTEM_CANCEL_EVERY")
    }

    /// Measuring with two points, then one press, the fourth touch. Prints what
    /// the press placed. The last point carries the endpoint label, so one placed
    /// point adds one `Placed corner`.
    @MainActor
    private func runPressControl(
        _ label: String, environment key: String, extra: [String: String] = [:], onUndo: Bool = false
    ) {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launchEnvironment[key] = "4"
        extra.forEach { app.launchEnvironment[$0.key] = $0.value }
        app.launch()
        let distance = app.buttons["measure-distance"]
        XCTAssertTrue(distance.waitForHittable(timeout: 30))
        distance.tap()
        let readout = app.descendants(matching: .any)["measure-readout"]
        XCTAssertTrue(readout.waitForExistence(timeout: 30))
        let undo = app.buttons["measure-undo"]
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.30, dy: 0.35)).tap()
        XCTAssertTrue(waitForUI { undo.isEnabled })
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: 0.50)).tap()
        XCTAssertTrue(waitForUI { readout.label.hasSuffix("km") })
        let corners = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH %@", "Placed corner"))
        let before = corners.count
        let target = onUndo
            ? CGPoint(x: undo.frame.midX, y: undo.frame.midY)
            : app.coordinate(withNormalizedOffset: CGVector(dx: 0.20, dy: 0.25)).screenPoint
        app.pressMap(at: target, forDuration: 0.6)
        _ = waitForUI(timeout: 5) { false }
        print("PRESS_CONTROL \(label) corners \(before)->\(corners.count) ledger=\(String(describing: app.value))")
        printCancelTrace(label, app)
    }

    @MainActor
    private func printCancelTrace(_ label: String, _ app: XCUIApplication) {
        let lines = traceLines(app).filter {
            $0.contains("cancel context") || $0.contains("touch cancelled")
                || $0.contains("ledger injected") || $0.contains("long press began")
        }
        print("PRESS_TRACE_BEGIN \(label)\n\(lines.joined(separator: "\n"))\nPRESS_TRACE_END")
    }

    /// While measuring the long press never begins, so a press acts at touch-up.
    /// Cancelled before the finger lifts. Expected: one repeat, one point.
    @MainActor
    func testZZControlEarlyPressCancelIsRepeated() throws {
        runPressControl("early cancel", environment: "UITEST_FORCED_SYSTEM_CANCEL_EVERY")
    }

    /// The same at 0.5 s. Nothing has acted, so a repeat is safe. Expected: one
    /// repeat, one point, which a clock-based rule would have refused.
    @MainActor
    func testZZControlLatePressCancelIsRepeated() throws {
        runPressControl("late cancel", environment: "UITEST_LATE_CANCEL_EVERY")
    }

    /// The deciding control. The app cancels its own touch, with nothing forced,
    /// as late as the system does. What do the gate and the touch's own clock read?
    /// Those readings decide which rule can tell this from a natural cancel.
    @MainActor
    func testZZControlDelayedAppCancelReadings() throws {
        for delay in ["0.05", "0.1", "0.18", "0.3", "0.5"] {
            runPressControl(
                "delayed app cancel \(delay)",
                environment: "UITEST_DELAYED_CANCEL_EVERY",
                extra: ["UITEST_DELAYED_CANCEL_AFTER": delay]
            )
        }
        runPressControl(
            "delayed app cancel on undo 0.18",
            environment: "UITEST_DELAYED_CANCEL_EVERY",
            extra: ["UITEST_DELAYED_CANCEL_AFTER": "0.18"],
            onUndo: true
        )
    }

    /// A drawing tool armed, so the long press acts while the finger is down:
    /// layers, Draw, Draw point, then the press, the fourth touch.
    @MainActor
    private func runDrawingPressControl(_ label: String, environment key: String) {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launchEnvironment[key] = "4"
        app.launch()
        let layers = app.buttons["toggle-layers-menu"]
        XCTAssertTrue(layers.waitForHittable(timeout: 30))
        layers.tap()
        let draw = app.buttons["Draw"]
        XCTAssertTrue(draw.waitForExistence(timeout: 30))
        draw.tap()
        let point = app.buttons["Draw point"]
        XCTAssertTrue(point.waitForHittable(timeout: 30))
        point.tap()
        XCTAssertTrue(waitForUI { point.isSelected }, "the point tool did not arm")
        print("DRAW_CONTROL \(label) before press ledger=\(String(describing: app.value))")
        let target = app.coordinate(withNormalizedOffset: CGVector(dx: 0.50, dy: 0.30)).screenPoint
        app.pressMap(at: target, forDuration: 0.6)
        _ = waitForUI(timeout: 5) { false }
        let began = traceLines(app).filter { $0.contains("long press began") }.count
        print("DRAW_CONTROL \(label) pressBegan=\(began) ledger=\(String(describing: app.value))")
        printCancelTrace(label, app)
    }

    /// Cancelled before the 0.45 s press fired. Expected: one repeat, and the
    /// long press acts once, on the repeat.
    @MainActor
    func testZZControlDrawingEarlyCancelIsRepeated() throws {
        runDrawingPressControl("drawing early", environment: "UITEST_FORCED_SYSTEM_CANCEL_EVERY")
    }

    /// Cancelled at 0.5 s, after the press fired and placed its point, with the
    /// gate faked. Expected: the recognizer's state says it acted, so no repeat,
    /// and the long press acts once. A repeat here would place a second point.
    @MainActor
    func testZZControlDrawingLateCancelIsNotRepeated() throws {
        runDrawingPressControl("drawing late", environment: "UITEST_LATE_CANCEL_EVERY")
    }

    /// A cancel with the gate faked, on the row of the base-map menu: the third
    /// touch, after layers and the picker. Shows whether a menu row passes the
    /// classifier's window checks, and whether a repeat can choose the row.
    @MainActor
    func testZZControlForcedCancelOnBaseMapRow() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launchEnvironment["UITEST_FORCED_SYSTEM_CANCEL_EVERY"] = "3"
        app.launch()
        let strip = app.descendants(matching: .any)["map-attribution"]
        XCTAssertTrue(strip.waitForExistence(timeout: 30))
        let layers = app.buttons["toggle-layers-menu"]
        XCTAssertTrue(layers.waitForHittable(timeout: 30))
        layers.tap()
        let picker = app.descendants(matching: .any)["base-map-style"]
        XCTAssertTrue(picker.waitForHittable(timeout: 30))
        picker.tap()
        let row = app.buttons["OpenStreetMap"]
        XCTAssertTrue(row.waitForHittable(timeout: 30))
        let credit = strip.label
        row.tapRetryingSystemCancel()
        let chose = waitForUI(timeout: 10) { strip.label.hasPrefix("© OpenStreetMap contributors") }
        print("MENU_CONTROL base map row chose=\(chose) creditBefore=\(credit) ledger=\(String(describing: app.value))")
    }

    /// The same on a row of the More menu, the second touch.
    @MainActor
    func testZZControlForcedCancelOnMoreRow() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launchEnvironment["UITEST_FORCED_SYSTEM_CANCEL_EVERY"] = "2"
        app.launch()
        let more = app.buttons["More Map Actions"]
        XCTAssertTrue(more.waitForHittable(timeout: 30))
        more.tap()
        let sources = app.buttons["Data Sources and Licenses"]
        XCTAssertTrue(sources.waitForExistence(timeout: 30))
        sources.tapRetryingSystemCancel()
        let opened = app.navigationBars["Map Info"].waitForExistence(timeout: 10)
        print("MENU_CONTROL more row opened=\(opened) ledger=\(String(describing: app.value))")
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

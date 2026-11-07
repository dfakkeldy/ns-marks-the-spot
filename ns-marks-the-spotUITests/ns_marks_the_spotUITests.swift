//
//  ns_marks_the_spotUITests.swift
//  ns-marks-the-spotUITests
//
//  Created by Dan Fakkeldy on 2026-05-18.
//

import XCTest

final class ns_marks_the_spotUITests: XCTestCase {
    private let timeout: TimeInterval = 15

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDownWithError() throws {
        attachUIFailure()
    }

    /// The three ways off the map, on screen rather than merely built. An
    /// element can exist and sit under the fold, which is the state this whole
    /// bundle was written to catch.
    @MainActor
    func testMapEntryPointsAreReachableOnLaunch() throws {
        let app = XCUIApplication.launchedForUITests()

        for name in ["Offline Maps", "Save Area", "toggle-layers-menu"] {
            XCTAssertTrue(
                app.buttons[name].waitForHittable(timeout: timeout),
                "\(name) is not on screen at launch"
            )
        }
    }

    @MainActor
    func testLayersMenuControlsAreAccessible() throws {
        let app = XCUIApplication.launchedForUITests()

        // The rail button is named rather than described, and the panel's
        // state is its value: open and closed used to sound identical.
        //
        // Waited for rather than read once, as the licence switch is: the
        // button is published before its value is.
        let layers = app.buttons["toggle-layers-menu"]
        XCTAssertTrue(layers.waitForHittable(timeout: timeout))
        XCTAssertEqual(layers.label, "Layers", "the control is described rather than named")
        let closed = expectation(
            for: NSPredicate(format: "value == %@", "Closed"),
            evaluatedWith: layers
        )
        wait(for: [closed], timeout: 10)

        layers.tap()

        let opened = expectation(
            for: NSPredicate(format: "value == %@", "Open"),
            evaluatedWith: layers
        )
        wait(for: [opened], timeout: 10)

        XCTAssertTrue(app.buttons["Close layers menu"].waitForHittable(timeout: timeout))
        // Background Maps is the one section the panel opens expanded, so NS
        // Aerial is what a reader sees without opening anything. `UITestMode`
        // launches with the licence unanswered, and a restricted layer in that
        // state carries a lock rather than a switch: the layer is one decision
        // away, not unavailable.
        XCTAssertTrue(app.buttons["NS Aerial licence required"].waitForHittable(timeout: timeout))

        // The rest are collapsed, Fletcher among them. Reaching that switch
        // means opening its section first, which is the panel the browser has
        // and the reason this assertion used to fail: the old flat list is
        // gone, and a switch inside a closed section is not on screen at all.
        let panel = app.scrollRegion("layer-panel-scroll")
        let historical = app.descendants(matching: .any)
            .matching(identifier: "layer-section-historical-maps")
            .firstMatch
        XCTAssertTrue(historical.waitForExistence(timeout: timeout))
        XCTAssertTrue(app.scroll(historical, into: panel), "the historical section cannot be reached")
        historical.tap()

        let fletcher = app.switches["Fletcher visibility"]
        XCTAssertTrue(fletcher.waitForExistence(timeout: timeout), "the section did not open")
        XCTAssertTrue(
            app.scroll(fletcher, into: panel),
            "Fletcher's switch is in the panel and cannot be reached"
        )
    }

    /// Compare first taps at the centre and indicator in separate fresh launches.
    /// The indicator result cannot satisfy a failed centre assertion.
    @MainActor
    func testHistoricalSectionAcceptsACentreTap() throws {
        let tapTargets: [(String, CGFloat)] = [("centre", 0.5), ("indicator", 0.97)]
        for cycle in 1...5 {
            var centreOpened = false
            var observations: [String] = []
            for (name, x) in tapTargets {
                let app = XCUIApplication.launchedForUITests()
                let layers = app.buttons["toggle-layers-menu"]
                XCTAssertTrue(layers.waitForHittable(timeout: timeout))
                layers.tap()
                XCTAssertTrue(app.buttons["Close layers menu"].waitForHittable(timeout: timeout))

                let panel = app.scrollRegion("layer-panel-scroll")
                let historical = app.buttons.matching(identifier: "layer-section-historical-maps").firstMatch
                XCTAssertTrue(historical.waitForExistence(timeout: timeout))
                let reached = app.scroll(historical, into: panel)
                let scrollReceipt = "cycle=\(cycle) arm=\(name) reached=\(reached) header=\(historical.frame) panel=\(panel.frame)"
                print(scrollReceipt)
                XCTAssertTrue(reached, scrollReceipt)
                // The experiment needs the tap point inside the visible panel.
                // A full-rectangle containment check stopped the first hosted
                // diagnostic before either tap despite a visible header. Keep
                // the frame stable in the window and record both AX frames.
                XCTAssertTrue(historical.waitForStableFrame(in: app.windows.firstMatch, timeout: timeout), scrollReceipt)
                let frame = historical.frame
                let point = CGPoint(x: frame.minX + frame.width * x, y: frame.midY)
                let pointReceipt = "\(scrollReceipt) settledHeader=\(frame) tap=\(point)"
                XCTAssertTrue(panel.frame.contains(point), pointReceipt)
                historical.coordinate(withNormalizedOffset: CGVector(dx: x, dy: 0.5)).tap()
                let opened = app.switches["Fletcher visibility"].waitForExistence(timeout: timeout)
                if name == "centre" { centreOpened = opened }
                let observation = "\(pointReceipt) opened=\(opened)"
                print(observation)
                observations.append(observation)
                let receipt = XCTAttachment(string: observation + "\n" + app.debugDescription)
                receipt.name = "Historical section first tap: \(name), cycle \(cycle)"
                receipt.lifetime = .keepAlways
                add(receipt)
                if !opened {
                    let screenshot = XCTAttachment(screenshot: app.screenshot())
                    screenshot.lifetime = .keepAlways
                    add(screenshot)
                }
                app.terminate()
            }
            XCTAssertTrue(centreOpened, observations.joined(separator: "\n"))
        }
    }

    @MainActor
    func testLaunchPerformance() throws {
        // Launched once and checked before anything is timed. A launch that
        // crashes before the map appears still returns from `launch()`, so the
        // metric on its own would happily report how fast the app failed. The
        // check is kept out of the measured block because waiting for a control
        // would be counted as launch time.
        let app = XCUIApplication.launchedForUITests()
        XCTAssertTrue(
            app.buttons["Current Location"].waitForHittable(timeout: 30),
            "the app did not reach its map"
        )
        app.terminate()

        measure(metrics: [XCTApplicationLaunchMetric()]) {
            _ = XCUIApplication.launchedForUITests()
        }
    }
}

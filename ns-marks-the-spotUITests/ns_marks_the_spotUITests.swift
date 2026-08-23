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

    /// The three ways off the map, on screen rather than merely built. An
    /// element can exist and sit under the fold, which is the state this whole
    /// bundle was written to catch.
    @MainActor
    func testMapEntryPointsAreReachableOnLaunch() throws {
        let app = XCUIApplication.launchedForUITests()

        for name in ["Offline Maps", "Save Area", "Toggle Layers Menu"] {
            XCTAssertTrue(
                app.buttons[name].waitForHittable(timeout: timeout),
                "\(name) is not on screen at launch"
            )
        }
    }

    @MainActor
    func testLayersMenuControlsAreAccessible() throws {
        let app = XCUIApplication.launchedForUITests()

        XCTAssertTrue(app.buttons["Toggle Layers Menu"].waitForHittable(timeout: timeout))
        app.buttons["Toggle Layers Menu"].tap()

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

    @MainActor
    func testLaunchPerformance() throws {
        // Launched once and checked before anything is timed. A launch that
        // crashes before the map appears still returns from `launch()`, so the
        // metric on its own would happily report how fast the app failed. The
        // check is kept out of the measured block because waiting for a control
        // would be counted as launch time.
        let app = XCUIApplication.launchedForUITests()
        XCTAssertTrue(
            app.buttons["Toggle Layers Menu"].waitForHittable(timeout: 30),
            "the app did not reach its map"
        )
        app.terminate()

        measure(metrics: [XCTApplicationLaunchMetric()]) {
            _ = XCUIApplication.launchedForUITests()
        }
    }
}

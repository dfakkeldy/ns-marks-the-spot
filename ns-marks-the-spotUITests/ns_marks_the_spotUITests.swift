//
//  ns_marks_the_spotUITests.swift
//  ns-marks-the-spotUITests
//
//  Created by Dan Fakkeldy on 2026-05-18.
//

import XCTest

final class ns_marks_the_spotUITests: XCTestCase {

    override func setUpWithError() throws {
        // Put setup code here. This method is called before the invocation of each test method in the class.

        // In UI tests it is usually best to stop immediately when a failure occurs.
        continueAfterFailure = false

        // In UI tests it’s important to set the initial state - such as interface orientation - required for your tests before they run. The setUp method is a good place to do this.
    }

    override func tearDownWithError() throws {
        // Put teardown code here. This method is called after the invocation of each test method in the class.
    }

    @MainActor
    func testMapEntryPointsExistOnLaunch() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launch()

        XCTAssertTrue(app.buttons["Offline Maps"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Save Area"].exists)
        XCTAssertTrue(app.buttons["Toggle Layers Menu"].exists)
    }

    @MainActor
    func testLayersMenuControlsAreAccessible() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launch()

        XCTAssertTrue(app.buttons["Toggle Layers Menu"].waitForExistence(timeout: 5))
        app.buttons["Toggle Layers Menu"].tap()

        XCTAssertTrue(app.buttons["Close layers menu"].waitForExistence(timeout: 5))
        // Background Maps is the one section the panel opens expanded, so its
        // switch is the one a reader sees without opening anything.
        XCTAssertTrue(app.switches["NS Aerial visibility"].waitForExistence(timeout: 5))

        // The rest are collapsed, Fletcher among them. Reaching that switch
        // means opening its section first, which is the panel the browser has
        // and the reason this assertion used to fail: the old flat list is
        // gone, and a switch inside a closed section is not on screen at all.
        let historical = app.descendants(matching: .any)
            .matching(identifier: "layer-section-historical-maps")
            .firstMatch
        XCTAssertTrue(historical.waitForExistence(timeout: 5))
        historical.tap()

        XCTAssertTrue(app.switches["Fletcher visibility"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testSaveAreaSelectionOffersVisibleMapAlternative() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launch()

        XCTAssertTrue(app.buttons["Save Area"].waitForExistence(timeout: 5))
        app.buttons["Save Area"].tap()

        XCTAssertTrue(app.buttons["Use Visible Map"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testLaunchPerformance() throws {
        // This measures how long it takes to launch your application.
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            let app = XCUIApplication()
            app.launchArguments.append("UITestMode")
            app.launch()
        }
    }
}

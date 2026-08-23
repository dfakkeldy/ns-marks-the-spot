//
//  ns_marks_the_spotUITestsLaunchTests.swift
//  ns-marks-the-spotUITests
//
//  Created by Dan Fakkeldy on 2026-05-18.
//

import XCTest

final class ns_marks_the_spotUITestsLaunchTests: XCTestCase {

    override class var runsForEachTargetApplicationUIConfiguration: Bool {
        true
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testLaunch() throws {
        let app = XCUIApplication.launchedForUITests()

        // The screenshot below is evidence of whatever was on the screen, and
        // a crashed app photographs as somebody's home screen. Waiting for a
        // map control first is what makes the attachment a picture of this app.
        XCTAssertTrue(
            app.buttons["Toggle Layers Menu"].waitForHittable(timeout: 30),
            "the app did not reach its map"
        )

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Launch Screen"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

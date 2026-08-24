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
        //
        // Current Location and not the Layers control, because this class runs
        // once per target application UI configuration and one of those is
        // landscape. The rail's last three controls are legitimately off the
        // bottom of a sideways screen until it is scrolled, which
        // `ControlReachabilityUITests` covers; Current Location is the first
        // control in the rail and is on screen either way up.
        XCTAssertTrue(
            app.buttons["Current Location"].waitForHittable(timeout: 30),
            "the app did not reach its map"
        )

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Launch Screen"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

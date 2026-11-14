import XCTest
import UIKit

final class DriveOverlapUITests: XCTestCase {
    override func tearDown() {
        attachUIFailure()
        XCUIDevice.shared.orientation = .portrait
        super.tearDown()
    }

    @MainActor func testOverlapControlsHaveLargeHitFrames() {
        let app = XCUIApplication()
        app.launchArguments += ["UITestMode", "UITestDriveOverlap"]
        app.launch()
        for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
            XCTAssertTrue(app.rotate(to: orientation), "The app did not reach \(orientation)")
            let swap = app.buttons["drive-overlap-swap"]
            let visibility = app.buttons["drive-overlap-visibility"]
            XCTAssertTrue(swap.waitForExistence(timeout: 30))
            XCTAssertTrue(visibility.waitForExistence(timeout: 30))
            for control in [swap, visibility] {
                XCTAssertGreaterThanOrEqual(control.frame.width, 64)
                XCTAssertGreaterThanOrEqual(control.frame.height, 64)
            }
        }
    }

    @MainActor func testOverlapControlsAreAbsentWithoutOverlap() {
        let app = XCUIApplication()
        app.launchArguments += ["UITestMode", "UITestDriveNoOverlap"]
        app.launch()
        XCTAssertTrue(app.staticTexts["drive-overlap-fixture-ready"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.buttons["drive-overlap-swap"].exists)
        XCTAssertFalse(app.buttons["drive-overlap-visibility"].exists)
    }
}

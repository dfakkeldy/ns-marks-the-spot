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
            XCUIDevice.shared.orientation = orientation
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
}

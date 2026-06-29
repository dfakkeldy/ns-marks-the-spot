import XCTest

final class OfflineFlowUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testOfflineStorageAndSaveAreaEntryPointsExist() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launch()

        let timeout: TimeInterval = 15
        let offlineMapsButton = app.buttons["Offline Maps"]
        XCTAssertTrue(offlineMapsButton.waitForExistence(timeout: timeout))
        offlineMapsButton.tap()

        XCTAssertTrue(app.navigationBars["Offline Maps"].waitForExistence(timeout: timeout))
        XCTAssertTrue(app.buttons["Save Area"].waitForExistence(timeout: timeout))
    }
}

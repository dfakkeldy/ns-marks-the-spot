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

        XCTAssertTrue(app.buttons["Offline Maps"].waitForExistence(timeout: 5))
        app.buttons["Offline Maps"].tap()

        XCTAssertTrue(app.navigationBars["Offline Maps"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Save Area"].waitForExistence(timeout: 5))
    }
}

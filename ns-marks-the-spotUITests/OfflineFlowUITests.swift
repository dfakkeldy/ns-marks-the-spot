import XCTest

/// Getting from the map to a Fletcher download, and being told what a download
/// does and does not include before choosing one.
final class OfflineFlowUITests: XCTestCase {
    private let timeout: TimeInterval = 15

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// The route to a saved area, all the way to a real estimate.
    ///
    /// The map has its own "Save Area" control, so matching on that label alone
    /// used to pass while standing on the map with the offline screen never
    /// opened. The screen's own entry point is named for the sample area, and
    /// the estimate is what proves it leads to a working draft rather than a
    /// dead row.
    @MainActor
    func testTheOfflineScreenEstimatesASampleArea() throws {
        let app = XCUIApplication.launchedForUITests()

        let offlineMaps = app.buttons["Offline Maps"]
        XCTAssertTrue(offlineMaps.waitForHittable(timeout: timeout))
        offlineMaps.tap()
        XCTAssertTrue(app.navigationBars["Offline Maps"].waitForExistence(timeout: timeout))

        let storage = app.scrollRegion("offline-storage-list")
        let sample = app.buttons["Save Sample Halifax Area"]
        XCTAssertTrue(
            sample.waitForExistence(timeout: timeout),
            "the offline screen offers no area to save"
        )
        XCTAssertTrue(app.scroll(sample, into: storage), "the sample area cannot be reached")
        sample.tap()

        XCTAssertTrue(
            app.navigationBars["Save Area"].waitForExistence(timeout: timeout),
            "the sample area does not open a draft"
        )

        // Said where the download is chosen, because this is where a reader
        // decides what they will still have out of coverage.
        XCTAssertTrue(
            app.staticTexts.containing(
                NSPredicate(format: "label CONTAINS[c] %@", "are not downloaded")
            ).firstMatch.exists,
            "the draft does not say which layers a saved area leaves behind"
        )

        let draft = app.scrollRegion("save-area-draft-form")
        let estimate = app.buttons["Estimate Fletcher Tiles"]
        XCTAssertTrue(app.scroll(estimate, into: draft), "the estimate cannot be reached")
        XCTAssertTrue(estimate.isEnabled, "a named draft cannot be estimated")
        estimate.tap()

        // The section stops asking for an estimate once it has one, and what
        // replaces the question is a tile count the pyramid was actually walked
        // for.
        XCTAssertTrue(
            app.staticTexts["Estimate a draft area to preview the Fletcher download size."]
                .waitForNonExistence(timeout: 10),
            "the draft produced no estimate"
        )
        XCTAssertTrue(
            app.staticTexts["Tiles"].waitForExistence(timeout: 10),
            "the estimate does not report how many tiles it would download"
        )
    }
}

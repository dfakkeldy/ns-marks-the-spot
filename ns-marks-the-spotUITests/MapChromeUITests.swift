import XCTest

/// The parts of the map's chrome a reader has to be able to find: the
/// measuring readout with its caveat, the sources sheet with its licence, and
/// the attribution strip that opens onto both.
///
/// These are the checks a person would otherwise be asked to make by hand on a
/// device. Automated evidence is not human acceptance, but a run that fails
/// here has already answered the question.
final class MapChromeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func launched() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launch()
        return app
    }

    @MainActor
    func testMeasuringOpensAReadoutThatSaysItIsNotASurvey() throws {
        let app = launched()
        let distance = app.buttons["measure-distance"]
        XCTAssertTrue(distance.waitForExistence(timeout: 15))
        distance.tap()

        let readout = app.descendants(matching: .any)["measure-readout"]
        XCTAssertTrue(readout.waitForExistence(timeout: 10), "no measuring readout")
        // The number never travels without it.
        XCTAssertTrue(
            app.staticTexts["Measured on the map, not surveyed."].exists,
            "the measured-not-surveyed caveat is missing"
        )
        XCTAssertTrue(app.buttons["measure-done"].isHittable)
        app.buttons["measure-done"].tap()
        XCTAssertTrue(
            readout.waitForNonExistence(timeout: 10),
            "the measuring card stayed up after Done"
        )
    }

    @MainActor
    func testTheSourcesSheetCarriesItsLicenceAndScrolls() throws {
        let app = launched()
        let sources = app.buttons["Data Sources and Licenses"]
        XCTAssertTrue(sources.waitForExistence(timeout: 15))
        sources.tap()

        XCTAssertTrue(app.navigationBars["Map Info"].waitForExistence(timeout: 10))
        // What the sheet is for: the screening-not-proof statement at the top,
        // and the sources far enough down that reaching them proves the sheet
        // scrolls.
        XCTAssertTrue(
            app.staticTexts.containing(
                NSPredicate(format: "label CONTAINS[c] %@", "screening and research tool")
            ).firstMatch.waitForExistence(timeout: 10),
            "the sheet does not say what the map is for"
        )

        let sheet = app.scrollViews.firstMatch
        XCTAssertTrue(sheet.exists)
        for _ in 0..<8 where !app.staticTexts["Data Sources & Licenses"].isHittable {
            sheet.swipeUp()
        }
        XCTAssertTrue(
            app.staticTexts["Data Sources & Licenses"].isHittable,
            "the source list cannot be reached by scrolling"
        )
    }

    @MainActor
    func testTheAttributionStripOpensOntoEverySource() throws {
        let app = launched()
        let strip = app.descendants(matching: .any)["map-attribution"]
        XCTAssertTrue(strip.waitForExistence(timeout: 15), "no attribution on the map")
        XCTAssertTrue(strip.isHittable, "the attribution is off the bottom of the screen")
        // Disabled when nothing drawn is borrowed from anyone, which is a
        // legitimate state on a fresh install and not a failure of this.
        try XCTSkipUnless(strip.isEnabled, "no layer with a credit is switched on")
        strip.tap()

        let all = app.descendants(matching: .any)["map-attribution-all-sources"]
        XCTAssertTrue(
            all.waitForExistence(timeout: 10),
            "the expanded attribution offers no way to the full source list"
        )
    }
}

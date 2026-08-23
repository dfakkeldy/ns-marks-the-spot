import XCTest

/// The parts of the map's chrome a reader has to be able to find: the
/// measuring readout with its caveat, the sources sheet with its licences, and
/// the attribution strip that opens onto both.
///
/// These are the checks a person would otherwise be asked to make by hand on a
/// device. Automated evidence is not human acceptance, but a run that fails
/// here has already answered the question.
final class MapChromeUITests: XCTestCase {
    private let timeout: TimeInterval = 15

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Measuring, by actually measuring.
    ///
    /// The readout exists from the moment the mode opens, saying what to do
    /// rather than what it found, so asserting that it appeared proves only
    /// that a card was built. Two taps on the map are what turns the prompt
    /// into a distance, and the distance is what the caveat has to travel with.
    @MainActor
    func testMeasuringReportsADistanceForTapsOnTheMap() throws {
        let app = XCUIApplication.launchedForUITests()
        let distance = app.buttons["measure-distance"]
        XCTAssertTrue(distance.waitForExistence(timeout: timeout))
        XCTAssertTrue(distance.waitForHittable(timeout: timeout), "measuring cannot be started")
        distance.tap()

        let readout = app.descendants(matching: .any)["measure-readout"]
        XCTAssertTrue(readout.waitForExistence(timeout: 10), "no measuring readout")

        let prompt = "Tap the map to measure distance"
        XCTAssertEqual(readout.label, prompt, "the readout reports something before any point exists")

        // Left of the control rail and above the card, so both taps land on the
        // map rather than on the chrome over it.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.30, dy: 0.35)).tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.55, dy: 0.50)).tap()

        let measured = expectation(
            for: NSPredicate(format: "label != %@", prompt),
            evaluatedWith: readout
        )
        wait(for: [measured], timeout: 10)

        let label = readout.label
        XCTAssertTrue(
            label.hasSuffix(" m") || label.hasSuffix(" km"),
            "the readout says \"\(label)\", which is not a distance"
        )
        // The number never travels without it.
        XCTAssertTrue(
            app.staticTexts["Measured on the map, not surveyed."].waitForHittable(timeout: 5),
            "the measured-not-surveyed caveat is not on screen beside the number"
        )

        XCTAssertTrue(app.buttons["measure-done"].waitForHittable(timeout: 5))
        app.buttons["measure-done"].tap()
        XCTAssertTrue(
            readout.waitForNonExistence(timeout: 10),
            "the measuring card stayed up after Done"
        )
    }

    /// The sheet is long, and the sources are at the bottom of it. What is
    /// asserted is that scrolling reaches them and that a licence is written
    /// where it can be read, not merely that a heading exists.
    @MainActor
    func testTheSourcesSheetCarriesItsLicencesAndScrolls() throws {
        let app = XCUIApplication.launchedForUITests()
        let sources = app.buttons["Data Sources and Licenses"]
        XCTAssertTrue(sources.waitForExistence(timeout: timeout))
        XCTAssertTrue(sources.waitForHittable(timeout: timeout), "the sources control is off screen")
        sources.tap()

        XCTAssertTrue(app.navigationBars["Map Info"].waitForExistence(timeout: 10))
        // What the sheet is for, said before anything it lists.
        XCTAssertTrue(
            app.staticTexts.containing(
                NSPredicate(format: "label CONTAINS[c] %@", "screening and research tool")
            ).firstMatch.waitForExistence(timeout: 10),
            "the sheet does not say what the map is for"
        )

        let sheet = app.scrollViews["map-info-scroll"]
        XCTAssertTrue(sheet.waitForExistence(timeout: 10), "the info sheet is not the scrolling one")

        let heading = app.staticTexts["Data Sources & Licenses"]
        XCTAssertTrue(
            app.scroll(heading, into: sheet),
            "the source list cannot be reached by scrolling"
        )

        // And the list carries terms, not just names. Fletcher's Rumsey scans
        // are the entry whose licence is a link, so reaching it proves both
        // that the catalogue rendered and that its licence came with it.
        let rumsey = app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "CC BY-NC-SA 3.0")
        ).firstMatch
        XCTAssertTrue(
            app.scroll(rumsey, into: sheet),
            "no layer in the list states its licence"
        )
    }

    /// The whole route from a locked layer to the credit it owes, which is the
    /// contract the restricted Province licence is under: accept it, get the
    /// layer, and have its source named under the map.
    ///
    /// The strip is disabled while nothing borrowed is drawn, which used to
    /// make this test skip itself in exactly the state CI launches in. Turning
    /// a layer on first is what gives it something to say.
    @MainActor
    func testAcceptingTheLicenceTurnsTheLayerOnAndCreditsIt() throws {
        let app = XCUIApplication.launchedForUITests()
        let layers = app.buttons["Toggle Layers Menu"]
        XCTAssertTrue(layers.waitForHittable(timeout: timeout))
        layers.tap()

        let lock = app.buttons["NS Aerial licence required"]
        XCTAssertTrue(lock.waitForHittable(timeout: timeout), "the locked layer offers nothing to tap")
        lock.tap()

        XCTAssertTrue(
            app.navigationBars["Province Data Licence"].waitForExistence(timeout: 10),
            "the lock leads nowhere"
        )
        let accept = app.buttons["Accept"]
        XCTAssertTrue(accept.waitForHittable(timeout: 10))
        // Accept is disabled when the bundled licence text cannot be read, so
        // an enabled button is the assertion that the text a user is agreeing
        // to actually shipped in this build.
        XCTAssertTrue(accept.isEnabled, "the licence text is missing from the build, so there is nothing to accept")
        accept.tap()

        XCTAssertTrue(
            app.switches["NS Aerial visibility"].waitForExistence(timeout: 10),
            "accepting did not turn the lock into a switch"
        )
        XCTAssertTrue(
            lock.waitForNonExistence(timeout: 10),
            "the layer is still locked after the licence was accepted"
        )

        app.buttons["Close layers menu"].tap()

        let strip = app.descendants(matching: .any)["map-attribution"]
        XCTAssertTrue(strip.waitForExistence(timeout: timeout), "no attribution on the map")
        XCTAssertTrue(strip.waitForHittable(timeout: timeout), "the attribution is off the bottom of the screen")
        XCTAssertTrue(strip.isEnabled, "a layer is drawn and its source is not named")
        strip.tap()

        let all = app.descendants(matching: .any)["map-attribution-all-sources"]
        XCTAssertTrue(
            all.waitForHittable(timeout: 10),
            "the expanded attribution offers no way to the full source list"
        )
        all.tap()
        XCTAssertTrue(
            app.navigationBars["Map Info"].waitForExistence(timeout: 10),
            "All sources does not open the sources sheet"
        )
    }
}

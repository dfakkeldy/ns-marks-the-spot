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
        // "0 m" carries a unit and still means the geometry returned nothing,
        // and so does any small constant. The app opens on the whole province,
        // where a quarter of the screen is a hundred kilometres or so of
        // ground, so a kilometre is a floor no correct answer can be under and
        // no broken one can reach by accident. Reading in metres, because "900
        // m" and "9.00 km" both parse to nine hundred otherwise.
        //
        // If the launch camera is ever tightened to a town this assertion is
        // the one to revisit; it is a claim about where the map opens, not
        // about the arithmetic.
        let unit = label.hasSuffix(" km") ? 1000.0 : 1.0
        // en_CA groups thousands, sometimes with a space that is not a space.
        let digits = label.prefix(while: { $0 != " " })
            .filter { $0.isNumber || $0 == "." }
        let metres = Double(digits).map { $0 * unit }
        XCTAssertNotNil(metres, "the readout says \"\(label)\", which has no number in it")
        XCTAssertGreaterThan(
            metres ?? 0, 1000,
            "two taps a quarter of a screen apart on a map of Nova Scotia measured \"\(label)\""
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
        // Behind the rail's More menu now: share, print and the sources are
        // occasional actions, folded so the rail fits an SE-class screen.
        let more = app.buttons["More Map Actions"]
        XCTAssertTrue(more.waitForExistence(timeout: timeout))
        XCTAssertTrue(more.waitForHittable(timeout: timeout), "the More control is off screen")
        more.tap()
        let sources = app.buttons["Data Sources and Licenses"]
        XCTAssertTrue(sources.waitForExistence(timeout: timeout), "the sources action is not in the menu")
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

        // And the list carries terms, attached to the layer they govern.
        // Fletcher is the Rumsey scan this app opens showing and composites
        // into a printed sheet, so a wrong or missing licence on that row is
        // the one that would put someone in breach.
        // Fletcher is the last of thirty-six catalogued layers and each row runs
        // to a disclaimer and a caveat, so the list below the heading is
        // several thousand points long. The first run of this test failed here
        // for that reason and not because the licence was missing, which is why
        // `scroll` now stops on a list that has stopped rather than on a count.
        let fletcherLicence = app.descendants(matching: .any)["source-licence-fletcher"]
        XCTAssertTrue(
            app.scroll(fletcherLicence, into: sheet),
            "Fletcher's row does not state a licence"
        )
        XCTAssertEqual(
            fletcherLicence.label, "CC BY-NC-SA 3.0",
            "Fletcher is credited under the wrong licence"
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
        let layers = app.buttons["toggle-layers-menu"]
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

        let aerial = app.switches["NS Aerial visibility"]
        XCTAssertTrue(
            aerial.waitForExistence(timeout: 10),
            "accepting did not turn the lock into a switch"
        )
        XCTAssertTrue(
            lock.waitForNonExistence(timeout: 10),
            "the layer is still locked after the licence was accepted"
        )
        // Accepting is meant to answer the tap that raised the sheet, not just
        // to record a decision. A switch that came back Off means the user said
        // yes and got nothing.
        //
        // Waited for rather than read once: the switch is published before its
        // value is, so a correct app spends a moment reading Off.
        let switchedOn = expectation(
            for: NSPredicate(format: "value == %@ OR value == %@", "1", "On"),
            evaluatedWith: aerial
        )
        wait(for: [switchedOn], timeout: 10)

        app.buttons["Close layers menu"].tap()

        let strip = app.descendants(matching: .any)["map-attribution"]
        XCTAssertTrue(strip.waitForExistence(timeout: timeout), "no attribution on the map")
        XCTAssertTrue(strip.waitForHittable(timeout: timeout), "the attribution is off the bottom of the screen")
        XCTAssertTrue(strip.isEnabled, "a layer is drawn and its source is not named")
        strip.tap()

        // The credit for this layer, not for whichever layer happens to be on.
        // Service Nova Scotia publishes the imagery, and it is the one credit
        // line in the catalogue that names a branch rather than the province.
        // On screen, not merely in the card. A credit clipped out of the
        // expanded strip is a credit nobody has been given.
        XCTAssertTrue(
            app.staticTexts["Service Nova Scotia"].waitForHittable(timeout: 10),
            "the layer that was just turned on is not the one being credited"
        )

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

    /// The chrome over the map stays on the screen while the layers panel is
    /// open.
    ///
    /// The panel used to be laid out in the same row as the search field and
    /// the control rail. The three of them are wider than a phone, and a row
    /// that cannot fit overflows rather than shrinking — which grew the stack
    /// every other thing drawn over the map sits in. The search field went off
    /// the left edge, the rail off the right, and a parcel card opened in that
    /// state was laid out hundreds of points wider than the phone and centred,
    /// so its title and figures hung off both sides.
    ///
    /// Asserted on frames rather than on hittability: an element pushed off
    /// the edge of the screen is reported as existing, and the attribution
    /// strip and the rail are the two ends of the row that showed it.
    @MainActor
    func testTheMapChromeStaysOnScreenWithTheLayersPanelOpen() throws {
        let app = XCUIApplication.launchedForUITests()
        let layers = app.buttons["toggle-layers-menu"]
        XCTAssertTrue(layers.waitForHittable(timeout: timeout))
        layers.tap()
        XCTAssertTrue(
            app.buttons["Close layers menu"].waitForHittable(timeout: timeout),
            "the layers panel did not open"
        )

        let screen = app.windows.firstMatch.frame
        let strip = app.descendants(matching: .any)["map-attribution"]
        XCTAssertTrue(strip.waitForExistence(timeout: timeout), "no attribution on the map")
        XCTAssertTrue(
            screen.contains(strip.frame),
            "the attribution strip is \(strip.frame) on a \(screen.width) point screen"
        )
        XCTAssertTrue(
            screen.contains(layers.frame),
            "the control rail is \(layers.frame) on a \(screen.width) point screen"
        )
    }

    /// A tap on the map with the panel open puts the panel away.
    ///
    /// The panel covers most of a phone, so the map left around it is mostly
    /// the gap a reader aims for to dismiss it. That tap used to fall through
    /// to the map and identify a parcel behind the panel instead.
    @MainActor
    func testTappingTheMapClosesTheLayersPanel() throws {
        let app = XCUIApplication.launchedForUITests()
        let layers = app.buttons["toggle-layers-menu"]
        XCTAssertTrue(layers.waitForHittable(timeout: timeout))
        layers.tap()

        let close = app.buttons["Close layers menu"]
        XCTAssertTrue(close.waitForHittable(timeout: timeout), "the layers panel did not open")

        // Measured off the panel rather than tapped at a fixed point: it is
        // anchored to the trailing edge and capped at 300 points, so the map
        // it leaves exposed is a strip down the leading edge as wide as the
        // screen allows.
        let panel = app.scrollViews["layer-panel-scroll"]
        XCTAssertTrue(panel.waitForExistence(timeout: timeout), "the panel has no scrolling region")
        let exposed = panel.frame.minX
        try XCTSkipIf(exposed < 24, "no map is exposed beside the panel on this screen")
        app.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: exposed / 2, dy: panel.frame.midY))
            .tap()

        XCTAssertTrue(
            close.waitForNonExistence(timeout: 10),
            "a tap on the map beside the panel left it open"
        )
        // And the map is still there to be used: the panel gave the tap up,
        // it did not put a card over what it was covering.
        XCTAssertFalse(
            app.descendants(matching: .any)["parcel-inspector"].exists,
            "the tap that closed the panel also opened a parcel card"
        )
    }

    /// Whether the panel's own chrome grows with the reader's text size.
    ///
    /// The close control was a glyph frozen at a fixed point size inside a
    /// fixed 44 point frame, so at an accessibility size it stayed exactly the
    /// size it is at the default one while the layer names beside it grew.
    /// Measured on the frame the control reports: 44 points at this text size
    /// is the frozen layout, whatever the setting says.
    @MainActor
    func testTheLayersCloseControlGrowsWithTheTextSize() throws {
        let app = XCUIApplication.launchedForUITests(
            textSize: "UICTContentSizeCategoryAccessibilityXXXL"
        )
        // The rail is taller than the screen at this text size, so the layers
        // control is reached rather than tapped where it sits by default.
        let rail = app.scrollViews["map-control-rail"]
        XCTAssertTrue(rail.waitForExistence(timeout: timeout), "there is no control rail")
        let layers = app.buttons["toggle-layers-menu"]
        XCTAssertTrue(app.scroll(layers, into: rail), "the layers control cannot be reached")
        layers.tap()

        let close = app.buttons["Close layers menu"]
        XCTAssertTrue(close.waitForHittable(timeout: timeout), "the layers panel did not open")
        XCTAssertGreaterThan(
            close.frame.height, 44,
            "the close control is \(close.frame.height) points at an accessibility text size"
        )
    }
}

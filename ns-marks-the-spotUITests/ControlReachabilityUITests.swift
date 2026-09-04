import XCTest

/// Whether the map's own controls can be reached on a phone held sideways.
///
/// The right-hand rail runs to eleven 44-point targets. In landscape that is
/// taller than the screen, and the ones that fall off the end are Data
/// Sources, Save Area and Layers — the route to every licence gate and every
/// layer that failed. This is the automated half of that claim; the panel is a
/// human check.
final class ControlReachabilityUITests: XCTestCase {
    private let timeout: TimeInterval = 15

    /// The three at the bottom of the rail, which are the ones that fall off
    /// the end of a landscape screen. Share, print and the sources sheet live
    /// inside "More Map Actions" now, so the menu control is the reachable
    /// thing.
    private let endOfRail = ["More Map Actions", "Save Area", "toggle-layers-menu"]

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDown() {
        XCUIDevice.shared.orientation = .portrait
        super.tearDown()
    }

    @MainActor
    func testTheControlsAtTheBottomOfTheColumnAreReachableInLandscape() throws {
        let app = XCUIApplication.launchedForUITests()
        XCTAssertTrue(app.buttons["Current Location"].waitForExistence(timeout: timeout))
        XCTAssertTrue(app.rotate(to: .landscapeLeft), "the app never turned sideways")

        let rail = app.scrollViews["map-control-rail"]
        XCTAssertTrue(rail.waitForExistence(timeout: timeout), "there is no control rail")

        // Each of the three, one at a time. They cannot all be on screen at
        // once in landscape, which is the reason the rail scrolls at all, so
        // what is asserted is that each has a route rather than that they
        // share a moment.
        for name in endOfRail {
            let control = app.buttons[name]
            XCTAssertTrue(control.exists, "\(name) left the hierarchy in landscape")
            XCTAssertTrue(
                app.scroll(control, into: rail),
                "\(name) cannot be reached in landscape"
            )
        }

        // And the route ends somewhere. Opening the panel is the claim the
        // Layers control makes.
        XCTAssertTrue(app.scroll(app.buttons["toggle-layers-menu"], into: rail))
        app.buttons["toggle-layers-menu"].tap()
        XCTAssertTrue(
            app.buttons["Close layers menu"].waitForHittable(timeout: timeout),
            "the layers panel did not open from landscape"
        )
    }

    /// The top of the rail must not be cut off by the same scrolling that
    /// makes its bottom reachable.
    @MainActor
    func testTheTopOfTheColumnIsOnScreenInPortrait() throws {
        let app = XCUIApplication.launchedForUITests()
        XCTAssertTrue(app.buttons["Current Location"].waitForExistence(timeout: timeout))
        XCTAssertTrue(app.rotate(to: .portrait), "the app never stood up")

        XCTAssertTrue(
            app.buttons["Current Location"].waitForHittable(timeout: timeout),
            "the first control is not on screen"
        )
        XCTAssertTrue(
            app.buttons["toggle-layers-menu"].waitForHittable(timeout: timeout),
            "the last control is not on screen in portrait"
        )
    }

    /// The way out of area selection is outside the scrolling part of the
    /// rail, so a rail that was scrolled down cannot hide it.
    @MainActor
    func testTheWayOutOfAreaSelectionIsOnScreen() throws {
        let app = XCUIApplication.launchedForUITests()
        let rail = app.scrollViews["map-control-rail"]
        XCTAssertTrue(rail.waitForExistence(timeout: timeout))

        let saveArea = app.buttons["Save Area"]
        XCTAssertTrue(app.scroll(saveArea, into: rail), "Save Area cannot be reached")
        saveArea.tap()

        for name in ["Use Visible Map", "Cancel"] {
            XCTAssertTrue(
                app.buttons[name].waitForHittable(timeout: timeout),
                "\(name) is not reachable while an area is being chosen"
            )
        }

        // And the rest of the rail reads as switched off while it is up. The
        // whole scrolling column is out of the gesture path in this mode, but
        // a control that is merely inert still announces as available: one
        // button offering itself in a column of dimmed ones reads as the one
        // thing still on offer, and taps on it do nothing.
        let offlineMaps = app.buttons["Offline Maps"]
        XCTAssertTrue(
            offlineMaps.exists,
            "Offline Maps left the hierarchy while an area is being chosen"
        )
        XCTAssertFalse(
            offlineMaps.isEnabled,
            "Offline Maps still reads as available while an area is being chosen"
        )

        app.buttons["Cancel"].tap()
        XCTAssertTrue(
            app.buttons["Use Visible Map"].waitForNonExistence(timeout: timeout),
            "area selection did not end"
        )
    }
}

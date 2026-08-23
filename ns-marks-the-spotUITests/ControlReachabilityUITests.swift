import XCTest

/// Whether the map's own controls can be reached on a phone held sideways.
///
/// The right-hand column runs to eleven 44-point targets. In landscape that is
/// taller than the screen, and the ones that fall off the end are Data
/// Sources, Save Area and Layers — the route to every licence gate and every
/// layer that failed. This is the automated half of that claim; the panel is a
/// human check.
final class ControlReachabilityUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    override func tearDown() {
        XCUIDevice.shared.orientation = .portrait
        super.tearDown()
    }

    @MainActor
    func testTheControlsAtTheBottomOfTheColumnAreReachableInLandscape() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launch()

        let timeout: TimeInterval = 15
        let location = app.buttons["Current Location"]
        XCTAssertTrue(location.waitForExistence(timeout: timeout))

        XCUIDevice.shared.orientation = .landscapeLeft
        // The rotation is animated, and a hit test run through it answers about
        // a layout that is still moving.
        XCTAssertTrue(location.waitForExistence(timeout: timeout))

        let layers = app.buttons["Toggle Layers Menu"]
        XCTAssertTrue(layers.exists, "the layers control left the hierarchy in landscape")

        // Reached by scrolling rather than by being on screen already: the
        // column is taller than the phone is wide, and what this asserts is
        // that there is a way to the bottom of it at all.
        if !layers.isHittable {
            // Swiped on the column itself, not on the app: a swipe through the
            // middle of the screen pans the map and leaves the controls
            // exactly where they were.
            let column = app.scrollViews.firstMatch
            if column.exists {
                column.swipeUp()
            } else {
                let strip = app.coordinate(withNormalizedOffset: CGVector(dx: 0.94, dy: 0.8))
                strip.press(
                    forDuration: 0.05,
                    thenDragTo: app.coordinate(
                        withNormalizedOffset: CGVector(dx: 0.94, dy: 0.2)
                    )
                )
            }
            XCTAssertTrue(
                layers.waitForHittable(timeout: timeout),
                "the layers control cannot be reached in landscape"
            )
        }

        layers.tap()
        // Any of the panel's own controls will do. Named by identifier rather
        // than by label so a wording change does not read as a panel that
        // failed to open.
        let panelMark = app.descendants(matching: .any)["base-map-style"]
        XCTAssertTrue(
            panelMark.waitForExistence(timeout: timeout),
            "the layers panel did not open from landscape"
        )
    }

    /// The top of the column must not be cut off by the same scrolling that
    /// makes its bottom reachable.
    @MainActor
    func testTheTopOfTheColumnIsOnScreenInPortrait() throws {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launch()

        let location = app.buttons["Current Location"]
        XCTAssertTrue(location.waitForExistence(timeout: 15))
        XCTAssertTrue(location.isHittable, "the first control is not on screen")

        let layers = app.buttons["Toggle Layers Menu"]
        XCTAssertTrue(layers.isHittable, "the last control is not on screen in portrait")
    }
}

extension XCUIElement {
    /// `waitForExistence` for hittability: an element can be in the hierarchy
    /// and off the bottom of the screen, which is the whole subject here.
    func waitForHittable(timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if isHittable { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return isHittable
    }
}

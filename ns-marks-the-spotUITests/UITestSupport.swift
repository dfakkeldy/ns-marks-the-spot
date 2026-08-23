import XCTest

extension XCUIElement {
    /// `waitForExistence`, for hittability.
    ///
    /// An element can be in the hierarchy and off the bottom of the screen,
    /// which is what most of these tests are actually about. Existence proves
    /// the view was built. It does not prove anybody can reach it.
    @discardableResult
    func waitForHittable(timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if exists, isHittable { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return exists && isHittable
    }
}

extension XCUIApplication {
    /// Launches with the app's own test container.
    static func launchedForUITests() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        app.launch()
        return app
    }

    /// Turns the device, and waits for the window to agree.
    ///
    /// Setting the orientation returns before the device has turned. Asserting
    /// through the rotation answers about a layout that is still moving, and a
    /// rotation the app refuses outright leaves every assertion below it
    /// quietly measuring the orientation the test meant to leave behind.
    func rotate(to orientation: UIDeviceOrientation, timeout: TimeInterval = 15) -> Bool {
        XCUIDevice.shared.orientation = orientation
        let wantsLandscape = orientation.isLandscape
        let deadline = Date().addingTimeInterval(timeout)
        var previous = CGRect.zero
        while Date() < deadline {
            let frame = windows.firstMatch.frame
            let turned = wantsLandscape
                ? frame.width > frame.height : frame.height > frame.width
            // The same reading twice: the first frame wide enough can be one
            // taken part way through the turn.
            if turned, frame == previous, frame != .zero { return true }
            previous = frame
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return false
    }

    /// The scrolling region carrying this identifier, or the whole app.
    ///
    /// SwiftUI does not always surface an identifier applied to a `List` or a
    /// `Form` as an element of its own. Swiping the app scrolls whatever is
    /// frontmost, which is the same region in every case here, so a container
    /// that did not come through is a looser query rather than a failure.
    func scrollRegion(_ identifier: String) -> XCUIElement {
        let named = descendants(matching: .any)[identifier]
        return named.exists ? named : self
    }

    /// Scrolls `element` into reach inside `container`, and says whether it got
    /// there. Both directions, because the control that needs reaching can be
    /// above the current offset as easily as below it.
    func scroll(
        _ element: XCUIElement, into container: XCUIElement, swipes: Int = 8
    ) -> Bool {
        if element.exists, element.isHittable { return true }
        for direction in [true, false] {
            for _ in 0..<swipes {
                direction ? container.swipeUp() : container.swipeDown()
                if element.exists, element.isHittable { return true }
            }
        }
        return false
    }
}

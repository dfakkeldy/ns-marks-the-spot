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
    ///
    /// `textSize` is a `UIContentSizeCategory` raw value. Passing one starts
    /// the app at that text size, which is the only way to ask a built layout
    /// what it does under Dynamic Type; the default leaves the launch exactly
    /// as it was, at the device's own setting.
    static func launchedForUITests(textSize: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments.append("UITestMode")
        if let textSize {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", textSize]
        }
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
            if !turned, frame == previous {
                // A busy runner has been seen to swallow the first set (CI run
                // 32671472142 sat portrait for the whole wait). While a turn is
                // in flight the frame is changing, so this only fires when
                // nothing is moving — a no-op if the device already took the
                // order, a retry if it dropped it.
                XCUIDevice.shared.orientation = orientation
            }
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
    /// there.
    ///
    /// Stops when the list stops moving rather than after a fixed number of
    /// swipes. A swipe count is a constant about somebody else's content: the
    /// sources sheet is as long as the layer catalogue, which is thirty-six
    /// entries and grows, and a run at an accessibility text size is longer
    /// again. Watching the target's own frame asks the question that decides
    /// the answer, which is whether there is any more list, and costs one extra
    /// swipe rather than thirty. `limit` is only a backstop against a view that
    /// scrolls forever.
    ///
    /// Downwards only on request. Swiping down inside a presented sheet that is
    /// already at its top hands the gesture to interactive dismissal, and a
    /// target that was simply mis-queried then fails as a vanished sheet rather
    /// than as the reachability question actually being asked.
    func scroll(
        _ element: XCUIElement,
        into container: XCUIElement,
        limit: Int = 40,
        alsoUpwards: Bool = false
    ) -> Bool {
        if element.exists, element.isHittable { return true }
        var directions: [() -> Void] = [container.swipeUp]
        if alsoUpwards { directions.append(container.swipeDown) }

        for swipe in directions {
            var previous: CGRect?
            var unmoved = 0
            for _ in 0..<limit {
                swipe()
                if element.exists, element.isHittable { return true }
                // A target a lazy `List` or `Form` has not built yet has no
                // frame to compare, and that is the case where giving up early
                // would be wrong: it is exactly what "keep scrolling" means.
                guard element.exists else {
                    previous = nil
                    unmoved = 0
                    continue
                }
                let frame = element.frame
                unmoved = frame == previous ? unmoved + 1 : 0
                if unmoved >= 2 { break }
                previous = frame
            }
        }
        return false
    }
}

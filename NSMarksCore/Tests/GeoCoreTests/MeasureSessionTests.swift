import Testing

@testable import GeoCore

@Suite("Measuring on the map")
struct MeasureSessionTests {
    private static let square = [
        GeoPoint(lat: 45.0, lng: -61.0),
        GeoPoint(lat: 45.0, lng: -60.99),
        GeoPoint(lat: 45.01, lng: -60.99),
        GeoPoint(lat: 45.01, lng: -61.0),
    ]

    @Test func aDistanceNeedsTwoPointsAndAnAreaNeedsThree() {
        var distance = MeasureSession(mode: .distance)
        var area = MeasureSession(mode: .area)
        for point in Self.square.prefix(2) {
            distance.add(point)
            area.add(point)
        }

        #expect(distance.canFinish)
        #expect(area.canFinish == false)
        area.add(Self.square[2])
        #expect(area.canFinish)
    }

    /// The prompt is not decoration: a shape too short to have a size must not
    /// print a number, because "0 m" reads as a measured zero rather than as
    /// nothing measured yet.
    @Test func aShapeTooShortToHaveASizePromptsInsteadOfReportingZero() {
        var distance = MeasureSession(mode: .distance)
        #expect(distance.readout == "Tap the map to measure distance")
        distance.add(Self.square[0])
        #expect(distance.readout == "Tap the map to measure distance")

        var area = MeasureSession(mode: .area)
        area.add(Self.square[0])
        area.add(Self.square[1])
        #expect(area.readout == "Tap the map to outline an area")
    }

    @Test func theReadoutIsWhatTheSharedFormatterSays() {
        var distance = MeasureSession(mode: .distance)
        distance.add(Self.square[0])
        distance.add(Self.square[1])
        #expect(distance.readout == Geodesy.formatDistance(distance.value))

        var area = MeasureSession(mode: .area)
        for point in Self.square { area.add(point) }
        #expect(area.readout == Geodesy.formatArea(area.value))
        #expect(area.value == Geodesy.polygonAreaSquareMetres(Self.square))
    }

    /// The web restarts on the next click after a finish, and so does this: a
    /// tap meant to begin a second measurement must not silently extend the
    /// first one the user thought they had put down.
    @Test func tappingAfterFinishingStartsAgainRatherThanExtending() {
        var session = MeasureSession(mode: .distance)
        session.add(Self.square[0])
        session.add(Self.square[1])
        session.finish()
        #expect(session.isFinished)

        session.add(Self.square[2])

        #expect(session.points == [Self.square[2]])
        #expect(session.isFinished == false)
    }

    @Test func aShapeTooShortToFinishStaysUnfinished() {
        var session = MeasureSession(mode: .area)
        session.add(Self.square[0])
        session.add(Self.square[1])

        session.finish()

        #expect(session.isFinished == false)
    }

    /// Undoing past the minimum takes the readout back to counting. A finished
    /// flag left standing would keep printing an area for a ring that is now
    /// two corners.
    @Test func undoingBelowTheMinimumUnfinishesTheShape() {
        var session = MeasureSession(mode: .area)
        for point in Self.square.prefix(3) { session.add(point) }
        session.finish()

        session.undoLastPoint()

        #expect(session.isFinished == false)
        #expect(session.readout == "Tap the map to outline an area")
    }

    @Test func undoingAFinishedShapeAllowsTheNextPointToExtendIt() {
        var session = MeasureSession(mode: .area)
        for point in Self.square { session.add(point) }
        session.finish()

        session.undoLastPoint()

        #expect(!session.isFinished)
        #expect(session.points.count == 3)
        session.add(Self.square[3])
        #expect(session.points == Self.square)
    }

    @Test func clearingEmptiesTheShapeWithoutChangingTheMode() {
        var session = MeasureSession(mode: .area)
        for point in Self.square { session.add(point) }
        session.finish()

        session.clear()

        #expect(session.isEmpty)
        #expect(session.isFinished == false)
        #expect(session.mode == .area)
    }

    @Test func undoingAnEmptyShapeDoesNothing() {
        var session = MeasureSession(mode: .distance)
        session.undoLastPoint()
        #expect(session.isEmpty)
    }
}

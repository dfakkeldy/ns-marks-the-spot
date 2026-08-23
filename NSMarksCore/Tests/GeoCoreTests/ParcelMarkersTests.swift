import Foundation
import Testing

@testable import GeoCore

@Suite("Standing in for a parcel too small to see")
struct ParcelMarkersTests {
    private func square(
        _ west: Double, _ south: Double, _ east: Double, _ north: Double
    ) -> [GeoPoint] {
        [
            GeoPoint(lat: south, lng: west),
            GeoPoint(lat: south, lng: east),
            GeoPoint(lat: north, lng: east),
            GeoPoint(lat: north, lng: west),
            GeoPoint(lat: south, lng: west),
        ]
    }

    @Test func aSimpleParcelIsMarkedAtItsMiddle() throws {
        let point = try #require(
            ParcelMarkers.representativePoint(parts: [[square(-63, 44, -62, 45)]])
        )
        #expect(abs(point.lng - -62.5) < 1e-9)
        #expect(abs(point.lat - 44.5) < 1e-9)
    }

    /// A parcel split by a road is several parts, and the mean of the parts can
    /// land on the road — pointing at ground the parcel does not include.
    @Test func aSplitParcelIsMarkedOnItsLargestPiece() throws {
        let point = try #require(
            ParcelMarkers.representativePoint(parts: [
                [square(-63, 44, -62.99, 44.01)],
                [square(-60, 46, -59, 47)],
            ])
        )
        #expect(abs(point.lng - -59.5) < 1e-9)
        #expect(abs(point.lat - 46.5) < 1e-9)
    }

    /// Holes are not parts. A right-of-way through a lot does not get its own
    /// marker, and it must not pull the lot's marker towards it either.
    @Test func aHoleIsNotAPieceOfItsOwn() throws {
        let point = try #require(
            ParcelMarkers.representativePoint(parts: [
                [square(-63, 44, -62, 45), square(-62.9, 44.9, -62.8, 44.95)]
            ])
        )
        #expect(abs(point.lng - -62.5) < 1e-9)
    }

    @Test func aParcelWithNoBoundaryIsMarkedNowhere() {
        #expect(ParcelMarkers.representativePoint(parts: []) == nil)
        #expect(ParcelMarkers.representativePoint(parts: [[]]) == nil)
    }

    /// A degenerate ring is a boundary the source supplied badly, not an error
    /// to refuse: its own first corner is as good a place to point at as any.
    @Test func aZeroAreaRingIsStillMarkedSomewhereOnItself() throws {
        let line = [
            GeoPoint(lat: 44, lng: -63), GeoPoint(lat: 44, lng: -62),
            GeoPoint(lat: 44, lng: -63), GeoPoint(lat: 44, lng: -63),
        ]
        let point = try #require(ParcelMarkers.representativePoint(parts: [[line]]))
        #expect(point.lat == 44)
    }
}

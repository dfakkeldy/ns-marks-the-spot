import Foundation
import GeoCore
import MapCatalog
import MapKit
import Testing

@testable import ns_marks_the_spot

/// Where the batch install path puts things.
///
/// §5.11 asked for the batch route on the parcel path, which rebuilds every
/// polygon on every selection, every tap, every tax-sale toggle and every
/// filter change. The batch route may replace the loop only if it leaves the
/// map in the same state, and MapKit has no z-index: an overlay's position in
/// `overlays` *is* the drawing order. "The same state" is therefore the whole
/// correctness question, and it is the only thing asserted here.
///
/// Nothing in this suite reads a clock. The measurement that motivated the
/// change was taken once, by hand, and is recorded in the pull request with
/// the machine and the date — a wall clock in a test suite on a shared
/// machine asserts nothing and fails at random.
@Suite("Overlay install order")
@MainActor
struct OverlayInstallOrderTests {
    /// A polygon whose ring, point count and pid are all its own.
    ///
    /// The suite this replaced compared point counts, and every polygon in it
    /// had three — so it would have passed on any permutation of the parcels,
    /// which is exactly the mistake it existed to catch.
    private func parcel(_ index: Int) -> ParcelPolygon {
        let lat = 44.0 + Double(index) * 0.001
        var coordinates = (0...(index % 5 + 3)).map { step in
            CLLocationCoordinate2D(
                latitude: lat + Double(step) * 0.0001,
                longitude: -63.0 + Double(step) * 0.0001
            )
        }
        let polygon = ParcelPolygon(coordinates: &coordinates, count: coordinates.count)
        polygon.pid = "pid-\(index)"
        return polygon
    }

    private func tiles(_ count: Int) -> [OpacityTileOverlay] {
        (0..<count).map { index in
            OpacityTileOverlay(
                configuration: TileLayerConfiguration(
                    id: "order-\(index)",
                    name: "Order \(index)",
                    source: .tile(URL(string: "https://example.invalid/{z}/{x}/{y}.png")!)
                )
            )
        }
    }

    private func feature(order: Int, id: String) -> FeaturePolygon {
        var coordinates = [
            CLLocationCoordinate2D(latitude: 45.0, longitude: -62.0),
            CLLocationCoordinate2D(latitude: 45.001, longitude: -62.0),
            CLLocationCoordinate2D(latitude: 45.001, longitude: -61.999),
        ]
        let polygon = FeaturePolygon(coordinates: &coordinates, count: coordinates.count)
        polygon.featureID = id
        polygon.drawOrder = order
        return polygon
    }

    @Test("The batch path leaves the map exactly as the loop would have")
    func theBatchPathLeavesTheMapExactlyAsTheLoopWouldHave() throws {
        let parcels = (0..<40).map(parcel)
        let parcelOrder = parcels[0].webDrawOrder

        // A scene with something below the parcels, something level with them
        // and something above: the three cases the insertion point has to get
        // right. Level is the interesting one — equal orders go above the
        // equals already installed, so the batch must not slide underneath a
        // feature that was there first.
        let scene: [any MKOverlay & WebDrawOrdered] =
            tiles(4) + [
                feature(order: parcelOrder - 1, id: "below"),
                feature(order: parcelOrder, id: "level"),
                feature(order: parcelOrder + 1, id: "above"),
            ]

        let byLoop = MKMapView()
        let byBatch = MKMapView()
        for map in [byLoop, byBatch] {
            for overlay in scene { map.installInDrawOrder(overlay) }
        }

        for parcel in parcels { byLoop.installInDrawOrder(parcel) }
        byBatch.installInDrawOrder(parcels)

        // The same objects in the same places. Identity, element by element:
        // the two maps hold the very same overlay instances, so this cannot
        // be satisfied by a coincidence of shape.
        #expect(
            byLoop.overlays.map { ObjectIdentifier($0) }
                == byBatch.overlays.map { ObjectIdentifier($0) }
        )

        // Both paths agree — and this is what they agree on. Said separately,
        // because two paths that broke the same way would agree with each
        // other about the wrong answer.
        let installed = byBatch.overlays
        let parcelIndices = installed.indices.filter { installed[$0] is ParcelPolygon }
        let firstParcel = try #require(parcelIndices.first)
        let lastParcel = try #require(parcelIndices.last)
        func index(of id: String) -> Int? {
            installed.firstIndex { ($0 as? FeaturePolygon)?.featureID == id }
        }
        let below = try #require(index(of: "below"))
        let level = try #require(index(of: "level"))
        let above = try #require(index(of: "above"))
        #expect(below < firstParcel)
        // Level, and installed first, so it stays below every parcel.
        #expect(level < firstParcel)
        #expect(lastParcel < above)
        // The parcels keep the order their caller stated. They all share one
        // draw order, so nothing but the caller's sequence decides this.
        #expect(installed.compactMap { ($0 as? ParcelPolygon)?.pid } == parcels.map(\.pid))
    }

    @Test("A batch of one and a batch of none go the same way as the loop")
    func aBatchOfOneAndABatchOfNoneGoTheSameWayAsTheLoop() {
        let map = MKMapView()
        for tile in tiles(2) { map.installInDrawOrder(tile) }
        let before = map.overlays.count

        map.installInDrawOrder([any MKOverlay & WebDrawOrdered]())
        #expect(map.overlays.count == before)

        let only = parcel(7)
        map.installInDrawOrder([only])
        #expect(map.overlays.count == before + 1)
        #expect((map.overlays.last as? ParcelPolygon)?.pid == only.pid)
    }
}

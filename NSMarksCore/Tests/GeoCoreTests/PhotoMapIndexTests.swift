import Foundation
import Testing

@testable import GeoCore

@Suite("Photo-map index")
struct PhotoMapIndexTests {
    private let halifax = PhotoMapIndex.Entry(
        id: "a", latitude: 44.65, longitude: -63.58, capturedAt: nil
    )
    private let sydney = PhotoMapIndex.Entry(
        id: "b", latitude: 46.14, longitude: -60.20, capturedAt: nil
    )

    @Test func aViewportUnionsIntersectingZ15Buckets() {
        let snapshot = PhotoMapIndex.Snapshot(entries: [halifax, sydney])
        let bounds = GeoBoundingBox(
            south: 44.64, west: -63.59, north: 44.66, east: -63.57
        )
        let view = PhotoMapIndex.viewport(snapshot, bounds: bounds)
        #expect(view.entries.map(\.id) == ["a"])
        #expect(view.truncated == false)
        #expect(view.totalInView == 1)
    }

    @Test func overTheCapIsTruncatedNotASilentSubsetWithoutANote() {
        let bounds = GeoBoundingBox(south: 44, west: -64, north: 45, east: -63)
        let extras = (0..<(PhotoMapIndex.maxAnnotations + 10)).map { index in
            PhotoMapIndex.Entry(
                id: "p\(index)",
                latitude: 44.5,
                longitude: -63.5,
                capturedAt: nil
            )
        }
        let view = PhotoMapIndex.viewport(
            PhotoMapIndex.Snapshot(entries: extras), bounds: bounds
        )
        #expect(view.entries.count == PhotoMapIndex.maxAnnotations)
        #expect(view.truncated)
        #expect(view.totalInView == PhotoMapIndex.maxAnnotations + 10)
    }
}

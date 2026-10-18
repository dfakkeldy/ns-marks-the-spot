import Foundation
import Testing

@testable import GeoCore

/// The bucketed lookup and the cap's subset.
@Suite("Photo-map index buckets")
struct PhotoMapIndexBucketTests {
    private func entry(_ id: String, lat: Double, lng: Double, at: String? = nil) -> PhotoMapIndex.Entry {
        PhotoMapIndex.Entry(id: id, latitude: lat, longitude: lng, capturedAt: at)
    }

    /// The snapshot buckets its entries once, by z15 tile.
    @Test func entriesAreBucketedByZ15Tile() {
        let snapshot = PhotoMapIndex.Snapshot(entries: [
            entry("a", lat: 44.65, lng: -63.58),
            entry("b", lat: 44.6501, lng: -63.5801),
            entry("c", lat: 46.14, lng: -60.20),
        ])
        #expect(snapshot.bucketCount == 2)
    }

    /// Walking the buckets and scanning the entries answer the same query;
    /// which one runs is a matter of cost, never of result.
    @Test func bucketWalkAndScanAgree() {
        var entries: [PhotoMapIndex.Entry] = []
        for index in 0..<400 {
            entries.append(entry("p\(index)", lat: 44 + Double(index) * 0.005, lng: -64 + Double(index) * 0.005))
        }
        let snapshot = PhotoMapIndex.Snapshot(entries: entries)
        // A small box: few buckets, so the walk runs.
        let small = GeoBoundingBox(south: 44.5, west: -63.5, north: 44.6, east: -63.4)
        let walked = PhotoMapIndex.viewport(snapshot, bounds: small)
        let scanned = entries.filter { small.contains($0.point) }
        #expect(Set(walked.entries.map(\.id)) == Set(scanned.map(\.id)))
        #expect(walked.totalInView == scanned.count)
        // A province-wide box: more buckets than entries, so the scan runs.
        let wide = GeoBoundingBox(south: 43, west: -67, north: 47, east: -59)
        #expect(PhotoMapIndex.viewport(snapshot, bounds: wide).totalInView == 400)
    }

    /// Above the cap the most recent photos are kept, in a fixed order, so
    /// the subset is the same on every pan rather than an arbitrary prefix.
    @Test func overTheCapTheMostRecentAreKeptDeterministically() {
        let bounds = GeoBoundingBox(south: 44, west: -64, north: 45, east: -63)
        var entries: [PhotoMapIndex.Entry] = []
        for index in 0..<(PhotoMapIndex.maxAnnotations + 50) {
            let day = String(format: "%02d", index % 28 + 1)
            entries.append(entry("p\(index)", lat: 44.5, lng: -63.5, at: "2026-08-\(day)T10:00:00.000Z"))
        }
        let snapshot = PhotoMapIndex.Snapshot(entries: entries)
        let first = PhotoMapIndex.viewport(snapshot, bounds: bounds)
        let again = PhotoMapIndex.viewport(snapshot, bounds: bounds)
        #expect(first.truncated)
        #expect(first.entries.count == PhotoMapIndex.maxAnnotations)
        #expect(first.entries.map(\.id) == again.entries.map(\.id))
        let dates = first.entries.map { $0.capturedAt ?? "" }
        #expect(dates == dates.sorted(by: >))
        #expect(dates.first == "2026-08-28T10:00:00.000Z")
    }

    /// Two reads of the same library compare equal, whatever order the
    /// library handed the assets over in, so the map is not refreshed for
    /// nothing.
    @Test func snapshotsCompareByEntriesAndToken() {
        let one = PhotoMapIndex.Snapshot(entries: [entry("a", lat: 44.65, lng: -63.58)], changeToken: Data([1]))
        let same = PhotoMapIndex.Snapshot(entries: [entry("a", lat: 44.65, lng: -63.58)], changeToken: Data([1]))
        let newer = PhotoMapIndex.Snapshot(entries: [entry("a", lat: 44.65, lng: -63.58)], changeToken: Data([2]))
        #expect(one == same)
        #expect(one != newer)
    }

    /// An index file written before pixel sizes were kept still reads.
    @Test func anOlderEntryDecodesWithoutASize() throws {
        let json = Data("""
            {"id":"a","latitude":44.65,"longitude":-63.58,"capturedAt":null}
            """.utf8)
        let decoded = try JSONDecoder().decode(PhotoMapIndex.Entry.self, from: json)
        #expect(decoded.width == nil)
        #expect(decoded.id == "a")
    }
}

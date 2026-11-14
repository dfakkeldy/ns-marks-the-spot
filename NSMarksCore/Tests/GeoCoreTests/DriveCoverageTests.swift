import Foundation
import Testing
@testable import GeoCore

@Suite("Drive coverage")
struct DriveCoverageTests {
    @Test func coverageVectorsDrawAboveUserMaps() {
        #expect(OverlayZIndex.drawOrder(OverlayZIndex.userVector, in: .pane) > OverlayZIndex.drawOrder(OverlayZIndex.userMaps, in: .tile))
    }
    @Test func exportsOneTrackPerTripAndEveryRecordedSegmentWithTimes() throws {
        let first = TrackFix(latitude: 45, longitude: -61, accuracyM: 5, timestamp: Date(timeIntervalSince1970: 1_000))
        let second = TrackFix(latitude: 45.001, longitude: -61, accuracyM: 5, timestamp: Date(timeIntervalSince1970: 1_010))
        let third = TrackFix(latitude: 45.002, longitude: -61, accuracyM: 7, timestamp: Date(timeIntervalSince1970: 1_030))
        let raw = Data(TrackGpx.rawGpx(name: "First", rawSegments: [[first, second], [third]]).utf8)
        let output = try DriveCoverageExport.gpx([.init(name: "Trip & one", legs: [raw]), .init(name: "Trip two", legs: [raw])])
        let root = try XmlTree.parse(Data(output.utf8))
        let tracks = root.children(named: "trk")
        #expect(tracks.count == 2)
        #expect(tracks[0].firstChild(named: "name")?.trimmedText == "Trip & one")
        let segments = tracks[0].children(named: "trkseg")
        #expect(segments.count == 2)
        #expect(segments[1].children(named: "trkpt").first?.firstChild(named: "time")?.trimmedText == CaptureTime.iso(third.timestamp))
    }

    @Test func malformedOriginalIsRefused() {
        #expect(throws: (any Error).self) {
            try DriveCoverageExport.gpx([.init(name: "Trip", legs: [Data("<gpx>".utf8)])])
        }
    }
}

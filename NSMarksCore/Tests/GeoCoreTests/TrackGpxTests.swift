import Foundation
import Testing

@testable import GeoCore

@Suite("Raw-recording GPX and per-vertex times")
struct TrackGpxTests {
    private let start = Date(timeIntervalSince1970: 1_700_000_000)

    private func fix(
        lat: Double, lng: Double = -63.5, accuracy: Double = 7, secondsIn: Double,
        altitude: Double? = nil
    ) -> TrackFix {
        TrackFix(
            latitude: lat, longitude: lng, altitudeM: altitude,
            accuracyM: accuracy, timestamp: start.addingTimeInterval(secondsIn)
        )
    }

    @Test func theRawRecordingRoundTripsThroughGpxParse() throws {
        let segments = [
            [fix(lat: 44.6, secondsIn: 0, altitude: 12), fix(lat: 44.6002, secondsIn: 10)],
            [fix(lat: 44.61, secondsIn: 60), fix(lat: 44.6102, secondsIn: 70)],
        ]
        let gpx = TrackGpx.rawGpx(name: "Morning walk", rawSegments: segments)
        let parsed = try GpxParse.parse(Data(gpx.utf8))

        #expect(parsed.featureCount == 1)
        let feature = try #require(parsed.features.first)
        #expect(feature.properties["name"] == .string("Morning walk"))
        guard case .multiLineString(let lines)? = feature.geometry else {
            Issue.record("Expected one MultiLineString from two segments.")
            return
        }
        #expect(lines.count == 2)
        #expect(lines[0][0].lat == 44.6)
        #expect(lines[0][0].altitude == 12)
        #expect(lines[1][1].lat == 44.6102)

        // The per-point times come back in the togeojson convention: nested
        // arrays parallel to a MultiLineString's coordinates.
        guard case .object(let coordinateProperties)? =
            feature.properties["coordinateProperties"],
            case .array(let times)? = coordinateProperties["times"],
            case .array(let firstSegment)? = times.first
        else {
            Issue.record("Expected nested coordinateProperties.times.")
            return
        }
        #expect(times.count == 2)
        #expect(firstSegment.count == 2)
        #expect(firstSegment[0] == .string(CaptureTime.iso(start)))
    }

    @Test func aSingleSegmentWritesOneTrksegAndFlatTimes() throws {
        let gpx = TrackGpx.rawGpx(
            name: "Line", rawSegments: [[fix(lat: 44.6, secondsIn: 0), fix(lat: 44.7, secondsIn: 9_000)]]
        )
        #expect(gpx.components(separatedBy: "<trkseg>").count == 2)
        let parsed = try GpxParse.parse(Data(gpx.utf8))
        let feature = try #require(parsed.features.first)
        guard case .lineString? = feature.geometry else {
            Issue.record("Expected a LineString from one segment.")
            return
        }
        guard case .object(let coordinateProperties)? =
            feature.properties["coordinateProperties"],
            case .array(let times)? = coordinateProperties["times"]
        else {
            Issue.record("Expected flat coordinateProperties.times.")
            return
        }
        #expect(times.count == 2)
        #expect(times[0].stringValue?.hasSuffix("Z") == true)
    }

    @Test func theAccuracyExtensionAndEscapingAreWritten() {
        let gpx = TrackGpx.rawGpx(
            name: "A <tricky> & name",
            rawSegments: [[fix(lat: 44.6, accuracy: 7.5, secondsIn: 0)]]
        )
        #expect(gpx.contains("<nsmts:accuracyM>7.5</nsmts:accuracyM>"))
        #expect(gpx.contains("A &lt;tricky&gt; &amp; name"))
        #expect(gpx.contains("creator=\"NS Marks The Spot\""))
    }
}

@Suite("GPX trkpt times on import")
struct GpxTimeParseTests {
    private func gpx(_ body: String) throws -> ParsedVector {
        try GpxParse.parse(Data("<gpx version=\"1.1\">\(body)</gpx>".utf8))
    }

    @Test func trkptTimesLandInCoordinateProperties() throws {
        let parsed = try gpx(
            """
            <trk><trkseg>
              <trkpt lat="44.6" lon="-63.5"><time>2026-08-29T14:00:00.000Z</time></trkpt>
              <trkpt lat="44.7" lon="-63.4"><time>2026-08-29T14:05:00.000Z</time></trkpt>
            </trkseg></trk>
            """
        )
        let feature = try #require(parsed.features.first)
        guard case .object(let coordinateProperties)? =
            feature.properties["coordinateProperties"],
            case .array(let times)? = coordinateProperties["times"]
        else {
            Issue.record("Expected coordinateProperties.times.")
            return
        }
        #expect(times == [
            .string("2026-08-29T14:00:00.000Z"),
            .string("2026-08-29T14:05:00.000Z"),
        ])
    }

    /// A point with no time stays null so the array stays parallel to the
    /// coordinates — dropping it would shift every later timestamp one
    /// vertex early.
    @Test func aMissingTimeIsNullNotDropped() throws {
        let parsed = try gpx(
            """
            <trk><trkseg>
              <trkpt lat="44.6" lon="-63.5"><time>2026-08-29T14:00:00.000Z</time></trkpt>
              <trkpt lat="44.7" lon="-63.4"></trkpt>
            </trkseg></trk>
            """
        )
        let feature = try #require(parsed.features.first)
        guard case .object(let coordinateProperties)? =
            feature.properties["coordinateProperties"],
            case .array(let times)? = coordinateProperties["times"]
        else {
            Issue.record("Expected coordinateProperties.times.")
            return
        }
        #expect(times == [.string("2026-08-29T14:00:00.000Z"), .null])
    }

    @Test func aTrackWithNoTimesWritesNoCoordinateProperties() throws {
        let parsed = try gpx(
            """
            <trk><trkseg>
              <trkpt lat="44.6" lon="-63.5"></trkpt>
              <trkpt lat="44.7" lon="-63.4"></trkpt>
            </trkseg></trk>
            """
        )
        let feature = try #require(parsed.features.first)
        #expect(feature.properties["coordinateProperties"] == nil)
    }
}

import Foundation
import Testing

@testable import GeoCore

@Suite("Building the saved track feature")
struct TrackFeatureTests {
    private let start = Date(timeIntervalSince1970: 1_700_000_000)

    private func point(_ lat: Double, secondsIn: Double) -> TrackPoint {
        TrackPoint(
            lat: lat, lng: -63.5, altitudeM: nil, accuracyM: 5,
            timestamp: start.addingTimeInterval(secondsIn)
        )
    }

    private func result(segments: [[TrackPoint]]) -> TrackRecording.StopResult {
        TrackRecording.StopResult(
            startedAt: start,
            endedAt: start.addingTimeInterval(120),
            segments: segments,
            rawSegments: [],
            rawFixCount: 40,
            acceptedFixCount: 30,
            distanceM: 250,
            recordingSeconds: 120
        )
    }

    @Test func oneSegmentBecomesALineStringWithParallelTimes() throws {
        let feature = try #require(
            TrackFeature.buildRecordedTrackFeature(
                result(segments: [[point(44.6, secondsIn: 0), point(44.6002, secondsIn: 10)]]),
                name: "Morning walk",
                simplifyToleranceM: 0,
                id: "track-1"
            )
        )
        #expect(feature.id == "track-1")
        #expect(feature.properties["name"] == .string("Morning walk"))
        guard case .lineString(let line)? = feature.geometry else {
            Issue.record("Expected a LineString.")
            return
        }
        #expect(line.count == 2)
        // Geometry stays 2D on purpose; altitude lives in the raw GPX.
        #expect(line[0].altitude == nil)
        guard case .object(let coordinateProperties)? =
            feature.properties["coordinateProperties"],
            case .array(let times)? = coordinateProperties["times"]
        else {
            Issue.record("Expected coordinateProperties.times.")
            return
        }
        #expect(times.count == 2)
        #expect(times[0] == .string(CaptureTime.iso(start)))
    }

    @Test func theRecordingDeclarationDescribesTheProcessing() throws {
        let feature = try #require(
            TrackFeature.buildRecordedTrackFeature(
                result(segments: [
                    [point(44.6, secondsIn: 0), point(44.6001, secondsIn: 5), point(44.6002, secondsIn: 10)]
                ]),
                name: "Walk",
                simplifyToleranceM: 1
            )
        )
        guard case .object(let recording)? = feature.properties[CaptureSpec.recordingKey] else {
            Issue.record("Expected nsmts:recording.")
            return
        }
        #expect(recording["startedAt"] == .string(CaptureTime.iso(start)))
        #expect(recording["rawFixCount"] == .number(40))
        #expect(recording["acceptedFixCount"] == .number(30))
        // The collinear middle vertex simplified away, and the declared
        // count describes the geometry as saved.
        #expect(recording["simplifiedVertexCount"] == .number(2))
        #expect(recording["simplifyToleranceM"] == .number(1))
        #expect(
            recording["smoothingAlpha"] == .number(CaptureSpec.TrackFilter.smoothingAlpha)
        )
    }

    @Test func pausedSegmentsBecomeAMultiLineStringWithNestedTimes() throws {
        let feature = try #require(
            TrackFeature.buildRecordedTrackFeature(
                result(segments: [
                    [point(44.6, secondsIn: 0), point(44.6002, secondsIn: 10)],
                    [point(44.61, secondsIn: 60), point(44.6102, secondsIn: 70)],
                ]),
                name: "Walk",
                simplifyToleranceM: 0
            )
        )
        guard case .multiLineString(let lines)? = feature.geometry else {
            Issue.record("Expected a MultiLineString.")
            return
        }
        #expect(lines.count == 2)
        guard case .object(let coordinateProperties)? =
            feature.properties["coordinateProperties"],
            case .array(let times)? = coordinateProperties["times"],
            case .array? = times.first
        else {
            Issue.record("Expected nested times.")
            return
        }
        #expect(times.count == 2)
    }

    /// A one-vertex segment draws nothing and would corrupt a
    /// MultiLineString; a recording with nothing else has nothing to save.
    @Test func aRecordingWithNoDrawableSegmentIsNil() {
        let feature = TrackFeature.buildRecordedTrackFeature(
            result(segments: [[point(44.6, secondsIn: 0)]]),
            name: "Nothing",
            simplifyToleranceM: 0
        )
        #expect(feature == nil)
    }

    @Test func theDefaultNameCarriesTheLocalStartTime() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Halifax")!
        let name = TrackFeature.defaultTrackName(startedAt: start, calendar: calendar)
        // 2023-11-14 22:13 UTC is 18:13 in Halifax (UTC−4 in November).
        #expect(name == "Track 2023-11-14 18:13")
    }
}

@Suite("Building a GPS mark")
struct MarkFeatureTests {
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    @Test func aMarkCarriesItsCaptureClaim() throws {
        let fix = TrackFix(
            latitude: 44.6, longitude: -63.5, altitudeM: 31, accuracyM: 6.7, timestamp: now
        )
        let feature = MarkFeature.buildGpsMarkFeature(fix, id: "mark-1")
        #expect(feature.id == "mark-1")
        #expect(feature.properties[CaptureSpec.capturedAtKey] == .string(CaptureTime.iso(now)))
        #expect(feature.properties[CaptureSpec.accuracyKey] == .number(6.7))
        #expect(feature.properties[CaptureSpec.altitudeKey] == .number(31))
        guard case .point(let position)? = feature.geometry else {
            Issue.record("Expected a point.")
            return
        }
        #expect(position.lat == 44.6)
        #expect(position.lng == -63.5)
        #expect(position.altitude == 31)
    }

    @Test func aFixWithoutAltitudeWritesNoAltitudeKey() {
        let fix = TrackFix(latitude: 44.6, longitude: -63.5, accuracyM: 5, timestamp: now)
        let feature = MarkFeature.buildGpsMarkFeature(fix)
        #expect(feature.properties[CaptureSpec.altitudeKey] == nil)
    }

    @Test func theFreshnessRuleMatchesTheContract() {
        func fix(ageSeconds: Double, accuracy: Double) -> TrackFix {
            TrackFix(
                latitude: 44.6, longitude: -63.5, accuracyM: accuracy,
                timestamp: now.addingTimeInterval(-ageSeconds)
            )
        }
        #expect(MarkFeature.isUsable(fix(ageSeconds: 5, accuracy: 20), now: now))
        // Older than 10 s is stale.
        #expect(!MarkFeature.isUsable(fix(ageSeconds: 11, accuracy: 20), now: now))
        // Rougher than 50 m is not worth saving silently.
        #expect(!MarkFeature.isUsable(fix(ageSeconds: 5, accuracy: 51), now: now))
        #expect(!MarkFeature.isUsable(fix(ageSeconds: 5, accuracy: 0), now: now))
    }
}

@Suite("The recorded origin")
struct RecordedOriginTests {
    @Test func theRecordedOriginRoundTripsThroughCodable() throws {
        let started = Date(timeIntervalSince1970: 1_700_000_000)
        let ended = started.addingTimeInterval(600)
        let origin = UserVectorOrigin.recorded(startedAt: started, endedAt: ended)
        let data = try JSONEncoder().encode(origin)
        let decoded = try JSONDecoder().decode(UserVectorOrigin.self, from: data)
        #expect(decoded == origin)
        // The wire shape matches the web's { kind, startedAt, endedAt }.
        let object = try #require(
            try JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        #expect(object["kind"] as? String == "recorded")
        #expect(object["startedAt"] != nil)
        #expect(object["endedAt"] != nil)
    }

    @Test func theProvenanceLineIsThePinnedString() {
        let origin = UserVectorOrigin.recorded(startedAt: .now, endedAt: .now)
        #expect(origin.provenanceText == CaptureSpec.recordedProvenance)
        #expect(origin.provenanceText == "Recorded on this device")
    }

    @Test func theLibraryVersionIsTwo() {
        #expect(UserVectorLibrary.currentVersion == 2)
        // A version-1 document from an earlier build still reads.
        #expect(UserVectorLibrary(version: 1, layers: []).isReadable)
        #expect(!UserVectorLibrary(version: 3, layers: []).isReadable)
    }

    @Test func aGpsMarkedFeatureGetsItsCalloutProvenanceLine() {
        let record = UserVectorLayerRecord(
            id: "layer-1", name: "Field notes", source: .drawn,
            origin: .drawn(createdAt: .now), createdAt: .now,
            colorHex: "#d55e00", featureCount: 1, bbox: nil
        )
        let marked = GeoJsonFeature(
            id: "mark-1",
            geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6)),
            properties: [
                CaptureSpec.capturedAtKey: .string("2026-08-29T14:00:00.000Z"),
                CaptureSpec.accuracyKey: .number(6.7),
            ]
        )
        #expect(
            VectorFeatureCallout(feature: marked, record: record).gpsProvenance
                == "Marked from GPS on this device (±7 m)"
        )
        // Either key missing means no line — the claim is only rendered when
        // the data actually makes it.
        let bare = GeoJsonFeature(
            id: "plain", geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6)),
            properties: [CaptureSpec.accuracyKey: .number(6.7)]
        )
        #expect(VectorFeatureCallout(feature: bare, record: record).gpsProvenance == nil)
    }
}

import Foundation
import GeoCore
import Testing

@testable import ns_marks_the_spot

/// The store-facing half of native field capture: the version stamp, the
/// recorded layer's save path, and the mark destinations.
@Suite("Field-capture storage")
@MainActor
struct FieldCaptureStoreTests {
    private func temporaryStore() throws -> (UserVectorStore, URL) {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return (UserVectorStore(directory: root), root)
    }

    /// The write-stamp bug named in the design doc: `write(_:)` used to
    /// write back whatever version it read, so a version-1 document stayed
    /// version 1 even once it held version-2 records — and an old build then
    /// decoded garbage instead of refusing cleanly.
    @Test("A mutation stamps the library with the current version")
    func aMutationStampsTheCurrentVersion() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        // A version-1 document from an earlier build.
        let libraryURL = root.appendingPathComponent("library.json")
        try Data(#"{"version":1,"layers":[],"hiddenLayerIDs":["ghost"]}"#.utf8)
            .write(to: libraryURL)

        // A mutation that needs no existing layer: switching visibility on a
        // layer the library does not hold is refused now.
        let record = UserVectorLayerRecord(
            id: "new", name: "New", source: .drawn,
            origin: .drawn(createdAt: Date(timeIntervalSince1970: 0)),
            createdAt: Date(timeIntervalSince1970: 0), colorHex: "#0072b2",
            featureCount: 0, bbox: nil
        )
        _ = try await store.add(record, geometry: ParsedVector(features: [], bbox: nil))
        await #expect(throws: UserVectorStore.StoreRefusal.noSuchLayer("ghost")) {
            _ = try await store.setVisible(true, id: "ghost")
        }

        struct Stamp: Decodable { var version: Int }
        let written = try JSONDecoder().decode(
            Stamp.self, from: Data(contentsOf: libraryURL)
        )
        #expect(written.version == UserVectorLibrary.currentVersion)
        #expect(written.version == 3)
    }

    @Test("A recording saves geometry, raw GPX original, and recorded origin")
    func aRecordingSavesItsThreeParts() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let viewModel = UserVectorsViewModel(store: store)

        let start = Date(timeIntervalSince1970: 1_700_000_000)
        var recording = TrackRecording()
        recording.start(now: start)
        for index in 0...3 {
            recording.addFix(
                TrackFix(
                    latitude: 44.6 + Double(index) * 0.0001, longitude: -63.5,
                    accuracyM: 5, timestamp: start.addingTimeInterval(Double(index * 10))
                )
            )
        }
        let stopped = recording.stop(now: start.addingTimeInterval(40))
        let result = try #require(stopped)

        let row = try #require(
            await viewModel.addRecordedLayer(result, name: "Morning walk", simplifyToleranceM: 1)
        )
        #expect(row.record.source == .recorded)
        #expect(row.record.origin == .recorded(startedAt: start, endedAt: result.endedAt))
        #expect(row.record.provenanceText == "Recorded on this device")

        // The processed line is on disk under the record.
        let stored = try await store.geometry(id: row.id)
        #expect(stored.featureCount == 1)

        // The raw GPX rides the original-file mechanism, byte for byte.
        let original = try #require(await viewModel.originalFile(for: row.id))
        let gpx = try #require(String(data: original, encoding: .utf8))
        #expect(gpx.contains("<trkseg>"))
        #expect(gpx.contains("nsmts:accuracyM"))
        // Every fix, kept and dropped alike.
        #expect(gpx.components(separatedBy: "<trkpt ").count == 5)
    }

    @Test("Field notes is created once, reused, and recreated after deletion")
    func fieldNotesIsCreatedOnceAndReused() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let viewModel = UserVectorsViewModel(store: store)

        let first = try #require(await viewModel.fieldNotesRow())
        #expect(first.record.name == "Field notes")
        #expect(first.record.source == .drawn)

        let second = try #require(await viewModel.fieldNotesRow())
        #expect(second.id == first.id)
        #expect(viewModel.rows.count == 1)

        await viewModel.delete(id: first.id)
        let third = try #require(await viewModel.fieldNotesRow())
        #expect(third.id != first.id)
    }

    /// The relaunch bug behind "Your location couldn't be found" with the blue
    /// dot on screen. The store read its own files through the import parser,
    /// which refuses an empty collection, so a drawn layer that had no
    /// features yet came back unreadable on the next launch: Edit did nothing,
    /// and a mark into Field notes failed with a message about GPS.
    @Test("An empty drawn layer reads back after relaunch and takes a mark")
    func anEmptyDrawnLayerSurvivesRelaunch() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let firstLaunch = UserVectorsViewModel(store: store)
        let created = try #require(await firstLaunch.fieldNotesRow())
        #expect(created.record.featureCount == 0)

        // The empty collection is on disk and reads back as one.
        let stored = try await store.geometry(id: created.id)
        #expect(stored.featureCount == 0)
        #expect(stored.bbox == nil)

        let secondLaunch = UserVectorsViewModel(store: store)
        await secondLaunch.load()
        let reloaded = try #require(secondLaunch.rows.first { $0.id == created.id })
        #expect(reloaded.parsed != nil)
        #expect(await secondLaunch.loadedRow(id: created.id) != nil)
        #expect(secondLaunch.lastRefusal == nil)

        let fix = TrackFix(
            latitude: 45.80849, longitude: -61.47137, accuracyM: 8,
            timestamp: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let feature = MarkFeature.buildGpsMarkFeature(fix)
        #expect(await secondLaunch.appendFeature(feature, to: created.id))
        #expect(secondLaunch.rows.first { $0.id == created.id }?.record.featureCount == 1)
    }

    /// A geometry file this build cannot read is said, not swallowed: the
    /// callers turn a bare nil into "Edit does nothing" and "the mark was
    /// not saved".
    @Test("An unreadable geometry file is reported as a storage refusal")
    func anUnreadableGeometryFileIsReported() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let viewModel = UserVectorsViewModel(store: store)
        let row = try #require(await viewModel.newDrawingLayer())
        try Data("not json".utf8).write(to: root.appendingPathComponent("\(row.id).geojson"))

        let relaunched = UserVectorsViewModel(store: store)
        await relaunched.load()
        #expect(await relaunched.loadedRow(id: row.id) == nil)
        #expect(relaunched.lastRefusal?.userMessage.contains("could not be read") == true)
    }

    @Test("A GPS mark appends to its layer and dates the edit")
    func aMarkAppendsAndDatesTheLayer() async throws {
        let (store, root) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }
        let viewModel = UserVectorsViewModel(store: store)
        let row = try #require(await viewModel.fieldNotesRow())

        let fix = TrackFix(
            latitude: 44.6, longitude: -63.5, accuracyM: 6.7,
            timestamp: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let feature = MarkFeature.buildGpsMarkFeature(fix)
        #expect(await viewModel.appendFeature(feature, to: row.id))

        let updated = try #require(viewModel.rows.first { $0.id == row.id })
        #expect(updated.record.featureCount == 1)
        #expect(updated.record.modifiedAt != nil)
        let stored = try await store.geometry(id: row.id)
        let mark = try #require(stored.features.first)
        #expect(mark.properties["nsmts:accuracyM"] == .number(6.7))
        #expect(mark.properties["nsmts:capturedAt"]?.stringValue != nil)
    }
}

import CoreGraphics
import Foundation
import GeoCore
import ImageIO
import Testing
import UniformTypeIdentifiers

@testable import ns_marks_the_spot

/// One selection holding both kinds of file, from either Import button.
@Suite("Importing maps and data together")
@MainActor
struct UnifiedImportTests {
    @Test("A mixed selection lands in both sections")
    func aMixedSelectionLandsInBothSections() async throws {
        try await withDirectories { maps, vectors, files in
            let urls = [
                try Self.write(Self.png(), named: "scan.png", in: files),
                try Self.write(Self.geoJson(), named: "lots.geojson", in: files),
            ]
            await UserFileImport.load(urls, maps: maps, vectors: vectors)

            #expect(maps.rows.map(\.record.name) == ["scan"])
            #expect(vectors.rows.map(\.record.name) == ["lots"])
            #expect(maps.notices.isEmpty)
            #expect(vectors.importNotices.isEmpty)
        }
    }

    /// The bytes decide, not the name on the file. A reader who exported
    /// GeoJSON from a tool that wrote `.txt` still gets their layer.
    @Test("A misnamed file goes where its bytes belong")
    func aMisnamedFileGoesWhereItsBytesBelong() async throws {
        try await withDirectories { maps, vectors, files in
            let urls = [
                try Self.write(Self.geoJson(), named: "lots.txt", in: files),
                try Self.write(Self.png(), named: "sheet.geojson", in: files),
            ]
            await UserFileImport.load(urls, maps: maps, vectors: vectors)

            #expect(vectors.rows.map(\.record.name) == ["lots"])
            #expect(maps.rows.map(\.record.name) == ["sheet"])
        }
    }

    /// One file's refusal never stops the next, and the reader is told which
    /// of their files did not come — the whole point of naming each message.
    @Test("A broken file in the batch is named and the rest still arrive")
    func aBrokenFileInTheBatchIsNamedAndTheRestStillArrive() async throws {
        try await withDirectories { maps, vectors, files in
            let urls = [
                try Self.write(Data("PID,owner\n1,x\n".utf8), named: "notes.csv", in: files),
                try Self.write(Self.geoJson(), named: "lots.geojson", in: files),
                try Self.write(Self.png(), named: "scan.png", in: files),
            ]
            await UserFileImport.load(urls, maps: maps, vectors: vectors)

            #expect(maps.rows.map(\.record.name) == ["scan"])
            #expect(vectors.rows.map(\.record.name) == ["lots"])
            // Unrecognised bytes go to the map pipeline, which is the one whose
            // refusals name the file.
            #expect(maps.notices.map(\.name) == ["notes"])
            #expect(maps.notices.filter(\.isRefusal).count == maps.notices.count)
        }
    }

    /// Each batch's messages are that batch's. A refusal left over from the
    /// last selection reads as a file that just failed.
    @Test("A new selection clears both sections' messages")
    func aNewSelectionClearsBothSectionsMessages() async throws {
        try await withDirectories { maps, vectors, files in
            let broken = try Self.write(Data("not a map".utf8), named: "broken.dat", in: files)
            await UserFileImport.load([broken], maps: maps, vectors: vectors)
            #expect(!maps.notices.isEmpty)

            let vectorBroken = try Self.write(
                Data("<kml></kml>".utf8), named: "empty.kml", in: files
            )
            await UserFileImport.load([vectorBroken], maps: maps, vectors: vectors)
            #expect(maps.notices.isEmpty)
            #expect(vectors.importNotices.map(\.name) == ["empty"])
        }
    }

    /// Several vector files at once, which the panel could not take before.
    /// A single refusal slot would have reported the last one and lost the
    /// other two.
    @Test("Every refused file in a vector batch is reported")
    func everyRefusedFileInAVectorBatchIsReported() async throws {
        try await withDirectories { maps, vectors, files in
            let urls = [
                try Self.write(Data("<kml></kml>".utf8), named: "one.kml", in: files),
                try Self.write(Data("<kml></kml>".utf8), named: "two.kml", in: files),
                try Self.write(Self.geoJson(), named: "three.geojson", in: files),
            ]
            await UserFileImport.load(urls, maps: maps, vectors: vectors)

            #expect(vectors.rows.map(\.record.name) == ["three"])
            #expect(vectors.importNotices.map(\.name) == ["one", "two"])
        }
    }

    // MARK: - Fixtures

    private func withDirectories(
        _ body: (UserMapsViewModel, UserVectorsViewModel, URL) async throws -> Void
    ) async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let maps = root.appendingPathComponent("maps", isDirectory: true)
        let vectors = root.appendingPathComponent("vectors", isDirectory: true)
        let files = root.appendingPathComponent("files", isDirectory: true)
        for directory in [maps, vectors, files] {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }
        defer { try? FileManager.default.removeItem(at: root) }
        try await body(
            UserMapsViewModel(store: UserMapStore(directory: maps)),
            UserVectorsViewModel(store: UserVectorStore(directory: vectors)),
            files
        )
    }

    private static func write(_ data: Data, named name: String, in directory: URL) throws -> URL {
        let url = directory.appendingPathComponent(name)
        try data.write(to: url)
        return url
    }

    private static func png() -> Data {
        let context = CGContext(
            data: nil, width: 8, height: 8, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
        context?.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context?.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        guard let image = context?.makeImage() else { return Data() }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output, UTType.png.identifier as CFString, 1, nil
        ) else { return Data() }
        CGImageDestinationAddImage(destination, image, nil)
        CGImageDestinationFinalize(destination)
        return output as Data
    }

    private static func geoJson() -> Data {
        Data(
            """
            {"type":"FeatureCollection","features":[{"type":"Feature","properties":{},\
            "geometry":{"type":"Point","coordinates":[-63.5,44.6]}}]}
            """.utf8
        )
    }
}

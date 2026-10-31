import Foundation
import MapCatalog
import MapKit
import Testing
import UIKit

@testable import ns_marks_the_spot

/// How the Atlas ground loads, which is what App Review's iPad could not do
/// on 2026-10-30 (plan R-0).
///
/// A first view on an iPad asks for a few hundred squares at once. Four of
/// them are cut from each rendered tile, and most of them over open water
/// are the same ocean stand-in, so these hold the overlay to one request and
/// one decode per tile however many squares want it. They drive the real
/// `loadTile` against a stubbed session, each test on its own host.
@Suite("Loading the Atlas ground")
struct AtlasBaseLoadingTests {
    private static func overlay(
        host: String, progress: LayerLoadProgressBox? = nil
    ) -> AtlasBaseOverlay {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return AtlasBaseOverlay(
            style: .day,
            baseURL: URL(string: "https://\(host)")!,
            session: URLSession(configuration: configuration),
            progress: progress
        )
    }

    /// The four MapKit squares at zoom `z` cut from one rendered tile.
    private static func quarters(z: Int, parentX: Int, parentY: Int) -> [MKTileOverlayPath] {
        [(0, 0), (1, 0), (0, 1), (1, 1)].map { dx, dy in
            MKTileOverlayPath(x: parentX * 2 + dx, y: parentY * 2 + dy, z: z, contentScaleFactor: 2)
        }
    }

    private static func loadAll(
        _ paths: [MKTileOverlayPath], on overlay: AtlasBaseOverlay
    ) async throws -> [Data] {
        try await withThrowingTaskGroup(of: Data.self) { group in
            for path in paths {
                group.addTask { try await overlay.loadTile(at: path) }
            }
            var tiles: [Data] = []
            for try await tile in group { tiles.append(tile) }
            return tiles
        }
    }

    @Test("Four squares cut from one tile share one request and one decode")
    func fourSquaresShareOneTile() async throws {
        let host = "quarters-\(UUID().uuidString.prefix(8).lowercased()).atlas.test"
        let fixture = TestTileFactory.pngData()
        StubURLProtocol.stub(host: host, with: .success(fixture))
        defer { StubURLProtocol.clear(host: host) }
        let overlay = Self.overlay(host: host)
        // The fixture is drawn at the screen's scale, so its width is read
        // back rather than assumed.
        let tileWidth = try #require(UIImage(data: fixture)?.cgImage?.width)

        let tiles = try await Self.loadAll(Self.quarters(z: 10, parentX: 321, parentY: 360), on: overlay)

        #expect(tiles.count == 4)
        #expect(StubURLProtocol.requestCount(host: host) == 1)
        #expect(AtlasRasterBase.decodeCount(baseURL: overlay.baseURL) == 1)
        // Each square is a quarter of the tile it was cut from.
        for tile in tiles {
            #expect(UIImage(data: tile)?.cgImage?.width == tileWidth / 2)
        }

        // A square asked for again is cut from the tile already decoded.
        _ = try await overlay.loadTile(at: Self.quarters(z: 10, parentX: 321, parentY: 360)[0])
        #expect(StubURLProtocol.requestCount(host: host) == 1)
        #expect(AtlasRasterBase.decodeCount(baseURL: overlay.baseURL) == 1)
    }

    @Test("Open water asks for the ocean once however many squares are sea")
    func openWaterAsksForTheOceanOnce() async throws {
        let host = "ocean-\(UUID().uuidString.prefix(8).lowercased()).atlas.test"
        StubURLProtocol.stub(host: host, matching: [
            ("/ocean/", .success(TestTileFactory.pngData(color: .systemTeal))),
            ("", .status(404)),
        ])
        defer { StubURLProtocol.clear(host: host) }
        let overlay = Self.overlay(host: host)

        let paths = Self.quarters(z: 10, parentX: 300, parentY: 340)
            + Self.quarters(z: 10, parentX: 301, parentY: 340)
        let tiles = try await Self.loadAll(paths, on: overlay)

        #expect(tiles.count == 8)
        // Two tiles that are not there, and one stand-in for both.
        #expect(StubURLProtocol.requestCount(host: host) == 3)
        #expect(AtlasRasterBase.decodeCount(baseURL: overlay.baseURL) == 1)

        // The absence is remembered: the same squares again ask nothing.
        _ = try await Self.loadAll(paths, on: overlay)
        #expect(StubURLProtocol.requestCount(host: host) == 3)
    }

    @Test("A failure is not remembered, so the square loads when the host answers")
    func aFailureIsNotRemembered() async throws {
        let host = "flaky-\(UUID().uuidString.prefix(8).lowercased()).atlas.test"
        StubURLProtocol.stub(host: host, with: .status(503))
        defer { StubURLProtocol.clear(host: host) }
        let overlay = Self.overlay(host: host)
        let path = MKTileOverlayPath(x: 642, y: 720, z: 10, contentScaleFactor: 2)

        await #expect(throws: (any Error).self) {
            _ = try await overlay.loadTile(at: path)
        }

        StubURLProtocol.stub(host: host, with: .success(TestTileFactory.pngData()))
        let tile = try await overlay.loadTile(at: path)
        #expect(UIImage(data: tile) != nil)
    }

    @Test("Below the package's zooms a square is composed from the tiles it covers")
    func belowThePackageASquareIsComposed() async throws {
        let host = "composite-\(UUID().uuidString.prefix(8).lowercased()).atlas.test"
        StubURLProtocol.stub(host: host, with: .success(TestTileFactory.pngData()))
        defer { StubURLProtocol.clear(host: host) }
        let overlay = Self.overlay(host: host)

        // MapKit's zoom 5 is cut from rendered zoom 4, which the package
        // does not have: it is drawn from the four zoom-5 tiles beneath.
        let tile = try await overlay.loadTile(
            at: MKTileOverlayPath(x: 20, y: 22, z: 5, contentScaleFactor: 2)
        )

        #expect(StubURLProtocol.requestCount(host: host) == 4)
        #expect(UIImage(data: tile)?.cgImage?.width == AtlasRaster.imagePixels / 2)
    }

    @Test("A load every square has abandoned is cancelled, and the next ask starts afresh")
    func anAbandonedLoadIsCancelled() async throws {
        let host = "abandoned-\(UUID().uuidString.prefix(8).lowercased()).atlas.test"
        StubURLProtocol.stub(host: host, with: .success(TestTileFactory.pngData()))
        defer { StubURLProtocol.clear(host: host) }
        let overlay = Self.overlay(host: host)
        let path = MKTileOverlayPath(x: 642, y: 720, z: 10, contentScaleFactor: 2)

        let abandoned = Task { try await overlay.loadTile(at: path) }
        abandoned.cancel()
        _ = await abandoned.result

        // Whether or not the first fetch got out, the square loads when asked
        // again: a cancelled load is never what a later ask is handed.
        let tile = try await overlay.loadTile(at: path)
        #expect(UIImage(data: tile) != nil)
    }

    @Test("The ground reports its load, failing included, under the modern map's id")
    func theGroundReportsItsLoad() async throws {
        let host = "progress-\(UUID().uuidString.prefix(8).lowercased()).atlas.test"
        StubURLProtocol.stub(host: host, with: .status(500))
        defer { StubURLProtocol.clear(host: host) }
        let progress = LayerLoadProgressBox()
        let overlay = Self.overlay(host: host, progress: progress)
        let path = MKTileOverlayPath(x: 642, y: 720, z: 10, contentScaleFactor: 2)

        _ = try? await overlay.loadTile(at: path)
        #expect(progress.phase(for: AtlasRasterBase.layerID) == .failing)

        StubURLProtocol.stub(host: host, with: .success(TestTileFactory.pngData()))
        _ = try await overlay.loadTile(at: path)
        #expect(progress.phase(for: AtlasRasterBase.layerID) == .ready)
    }
}

import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
import UIKit

@testable import ns_marks_the_spot

/// Whether a saved offline area is ever drawn.
///
/// The download side of this feature was tested and the drawing side was not,
/// and the two halves did not meet: the downloader writes tiles to `TileStore`,
/// and every read on the map went to `TileCache`. An area could report itself
/// complete, and the map would still go to the network for every square — and
/// with the phone offline would draw nothing at all. These tests are the seam,
/// so a future change that unplugs the store fails here rather than in a
/// cottage with no signal.
@Suite("Saved areas on the map")
struct SavedAreaRenderingTests {
    /// Covered by the sheet index at zoom 10, which matters for the tests that
    /// assert something about the network: over ground no sheet covers, "no
    /// request was made" is true whether or not the store was ever read.
    private static let coordinate = TileCoordinate(z: 10, x: 339, y: 359)
    private static let path = MKTileOverlayPath(
        x: coordinate.x, y: coordinate.y, z: coordinate.z, contentScaleFactor: 1
    )

    /// The area the downloader writes under. Its bounds are not consulted here,
    /// because every download below names its coordinates outright: what the
    /// planner picks for a box has its own tests, and this suite is about what
    /// happens to a tile after it is picked.
    private static let area = SavedOfflineArea(
        id: "cape-breton",
        name: "Cape Breton",
        bounds: MapBounds(
            minLatitude: 45.5,
            minLongitude: -61.5,
            maxLatitude: 47.1,
            maxLongitude: -59.7
        ),
        minZoom: 10,
        maxZoom: 10
    )

    private static func temporaryStore() throws -> (TileStore, URL) {
        let root = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("SavedAreaRendering-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return (TileStore(rootDirectory: root), root)
    }

    private static func overlay(
        host: String,
        store: TileStore,
        migration: Task<Void, Never>? = nil
    ) -> OpacityTileOverlay {
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [StubURLProtocol.self]
        return OpacityTileOverlay(
            configuration: TileLayerConfiguration(
                id: LayerID.fletcher.rawValue,
                name: "Fletcher",
                source: .fletcherSheets(baseURL: URL(string: "https://\(host)")!)
            ),
            tileCache: nil,
            tileFetcher: TileFetcher(
                urlSession: URLSession(configuration: sessionConfiguration)
            ),
            tileStore: store,
            fletcherMigration: migration
        )
    }

    /// Runs the real download path: the loader resolves the covering sheets and
    /// stacks what they answer, and the manager writes the result.
    private static func download(
        host: String, store: TileStore
    ) async -> TileDownloadProgress {
        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [StubURLProtocol.self]
        let loader = FletcherTileLoader(
            tileFetcher: TileFetcher(
                urlSession: URLSession(configuration: sessionConfiguration)
            ),
            baseURL: URL(string: "https://\(host)")!
        )
        return await TileDownloadManager(tileStore: store).download(
            area: area,
            loader: loader,
            targetCoordinates: [coordinate]
        )
    }

    @Test func aDownloadedTileIsDrawnWithoutAskingTheNetwork() async throws {
        let host = "saved.tiles.test"
        // Anything the overlay fetches here would be a failure, not a tile, so
        // a request reaching the network cannot be mistaken for the stored
        // bytes coming back.
        StubURLProtocol.stub(host: host, with: .status(503))
        defer { StubURLProtocol.clear(host: host) }

        let (store, root) = try Self.temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }

        let saved = TestTileFactory.pngData(color: .systemGreen, label: "saved")
        try await store.store(
            saved,
            z: Self.path.z, x: Self.path.x, y: Self.path.y,
            layerID: LayerID.fletcher.rawValue,
            savedAreaID: "cape-breton"
        )

        let drawn = try await Self.overlay(host: host, store: store)
            .loadTile(at: Self.path)

        #expect(drawn == saved)
        #expect(StubURLProtocol.requestCount(host: host) == 0)
    }

    @Test func aDownloadedTileWithNoInkIsCoverageAnsweredNotAPictureDrawn() async throws {
        let host = "saved-blank.tiles.test"
        StubURLProtocol.stub(host: host, with: .status(503))
        defer { StubURLProtocol.clear(host: host) }

        let (store, root) = try Self.temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }

        // What the downloader saves where every covering sheet answered and
        // none of them had ink. The live path calls that square outside
        // coverage, and a printed legend built from the saved copy has to say
        // the same thing — otherwise saving an area would quietly turn blank
        // ground into a source's answer.
        let blank = try #require(TileComposite.transparent)
        try await store.store(
            blank,
            z: Self.path.z, x: Self.path.x, y: Self.path.y,
            layerID: LayerID.fletcher.rawValue,
            savedAreaID: "cape-breton"
        )

        let (_, outcome, substance) = try await Self.overlay(host: host, store: store)
            .exportTile(at: Self.path)

        #expect(outcome == .served)
        #expect(substance == .outsideCoverage)
    }

    @Test func aDownloadedTileWithInkIsCreditedToTheSheet() async throws {
        let host = "saved-ink.tiles.test"
        StubURLProtocol.stub(host: host, with: .status(503))
        defer { StubURLProtocol.clear(host: host) }

        let (store, root) = try Self.temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }

        try await store.store(
            TestTileFactory.pngData(color: .brown, label: "ink"),
            z: Self.path.z, x: Self.path.x, y: Self.path.y,
            layerID: LayerID.fletcher.rawValue,
            savedAreaID: "cape-breton"
        )

        let (_, outcome, substance) = try await Self.overlay(host: host, store: store)
            .exportTile(at: Self.path)

        #expect(outcome == .served)
        #expect(substance == .source)
    }

    /// A tile from a superseded build must not reach the screen while the sweep
    /// that retires it is still running.
    ///
    /// `TileStore` keys Fletcher tiles by layer id alone, so bytes from the old
    /// build sit under the same key as the current one until
    /// `FletcherSourceMigration` deletes them — and that runs detached at
    /// launch. This is the rights obligation in
    /// `docs/FLETCHER_GEOREFERENCING.md`, not a freshness preference: the
    /// permission does not cover the retired source.
    @Test func aTileFromTheOldBuildIsNotDrawnWhileTheSweepIsStillRunning() async throws {
        let host = "swept.tiles.test"
        StubURLProtocol.stub(
            host: host, with: .success(TestTileFactory.pngData(color: .systemBlue, label: "fresh"))
        )
        defer { StubURLProtocol.clear(host: host) }

        let (store, root) = try Self.temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }

        let stale = TestTileFactory.pngData(color: .systemRed, label: "stale")
        try await store.store(
            stale,
            z: Self.path.z, x: Self.path.x, y: Self.path.y,
            layerID: LayerID.fletcher.rawValue,
            savedAreaID: "cape-breton"
        )

        // Started, not finished, exactly as the app starts it. The sleep is
        // what makes the failing case fail: an overlay that reads the store
        // without waiting wins this race every time, which is the bug.
        let migration = Task.detached(priority: .utility) {
            try? await Task.sleep(for: .milliseconds(50))
            try? await store.deleteLayer(LayerID.fletcher.rawValue)
        }

        let drawn = try await Self.overlay(host: host, store: store, migration: migration)
            .loadTile(at: Self.path)

        #expect(drawn != stale)
        #expect(StubURLProtocol.requestCount(host: host) > 0)
    }

    /// The whole chain in one test: sheets answered, tile stacked, tile stored,
    /// tile read back.
    ///
    /// Each half had tests and the join did not. What this pins is the blank
    /// tile's identity across it — `FletcherTileLoader` saves
    /// `TileComposite.transparent` where every covering sheet answered 404, and
    /// the overlay decides "outside coverage" by comparing against that same
    /// constant. Two blanks written by two encoders would read as a picture
    /// drawn, and a printed legend would credit a source for ground it never
    /// reached.
    @Test func groundNoSheetInkedIsSavedAndReadBackAsCoverageAnswered() async throws {
        let downloadHost = "download-blank.tiles.test"
        let drawHost = "draw-blank.tiles.test"
        // 404 is a sheet saying it has no ink here. 503 on the drawing host is
        // the guard: if the map went to the network for this square instead of
        // to the store, the substance would come back a placeholder.
        StubURLProtocol.stub(host: downloadHost, with: .status(404))
        StubURLProtocol.stub(host: drawHost, with: .status(503))
        defer {
            StubURLProtocol.clear(host: downloadHost)
            StubURLProtocol.clear(host: drawHost)
        }

        let (store, root) = try Self.temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }

        let progress = await Self.download(host: downloadHost, store: store)
        #expect(progress.succeeded == 1)
        #expect(progress.failed == 0)

        let (_, outcome, substance) = try await Self.overlay(host: drawHost, store: store)
            .exportTile(at: Self.path)

        #expect(outcome == .served)
        #expect(substance == .outsideCoverage)
        #expect(StubURLProtocol.requestCount(host: drawHost) == 0)
    }

    /// The same chain where the sheets do have ink: the bytes the map draws are
    /// the bytes the downloader saved, not a fresh composite it built again.
    @Test func theBytesTheDownloaderSavedAreTheBytesTheMapDraws() async throws {
        let downloadHost = "download-ink.tiles.test"
        let drawHost = "draw-ink.tiles.test"
        StubURLProtocol.stub(
            host: downloadHost,
            with: .success(TestTileFactory.pngData(color: .brown, label: "sheet"))
        )
        StubURLProtocol.stub(host: drawHost, with: .status(503))
        defer {
            StubURLProtocol.clear(host: downloadHost)
            StubURLProtocol.clear(host: drawHost)
        }

        let (store, root) = try Self.temporaryStore()
        defer { try? FileManager.default.removeItem(at: root) }

        let progress = await Self.download(host: downloadHost, store: store)
        #expect(progress.succeeded == 1)

        let stored = try #require(
            await store.tile(
                z: Self.coordinate.z,
                x: Self.coordinate.x,
                y: Self.coordinate.y,
                layerID: LayerID.fletcher.rawValue
            )
        )
        let (drawn, outcome, substance) = try await Self.overlay(host: drawHost, store: store)
            .exportTile(at: Self.path)

        #expect(drawn == stored)
        #expect(outcome == .served)
        #expect(substance == .source)
        #expect(StubURLProtocol.requestCount(host: drawHost) == 0)
    }
}

import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
import UIKit

@testable import ns_marks_the_spot

/// The counters are only worth having if the overlay actually reports into
/// them, and only correct if it reports the right thing.
///
/// These drive the real `loadTile` against a stubbed session rather than
/// calling `began`/`finished` directly. That distinction is the point of the
/// file: the counter tests next door pass whether or not `OpacityTileOverlay`
/// has ever heard of a progress box, so deleting the reporting would leave the
/// panel permanently blank with a green suite.
@Suite("Tile load reporting")
struct OpacityTileOverlayProgressTests {
    /// Each test gets its own host, because the stub is keyed by host and the
    /// suite runs in parallel.
    private static func overlay(
        host: String,
        source: TileLayerSource,
        clearance: ProvinceLicenceState = .accepted,
        layerID: String = "test-layer"
    ) -> (OpacityTileOverlay, LayerLoadProgressBox) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let progress = LayerLoadProgressBox()
        let overlay = OpacityTileOverlay(
            configuration: TileLayerConfiguration(
                id: layerID, name: "Test", source: source
            ),
            tileCache: nil,
            tileFetcher: TileFetcher(urlSession: URLSession(configuration: configuration)),
            // Derived through the store rather than built directly, so the test
            // gates on the same clearance the app would have.
            clearanceBox: LicenceClearanceBox(
                ProvinceLicenceStore(
                    storage: InMemoryProvinceLicenceStorage(initial: clearance)
                ).clearance
            ),
            progress: progress
        )
        return (overlay, progress)
    }

    private static let path = MKTileOverlayPath(x: 1, y: 1, z: 10, contentScaleFactor: 1)

    @Test func aTileThatArrivesLeavesTheLayerReady() async throws {
        let host = "served.tiles.test"
        StubURLProtocol.stub(host: host, with: .success(TestTileFactory.pngData()))
        defer { StubURLProtocol.clear(host: host) }

        let (overlay, progress) = Self.overlay(
            host: host,
            source: .tile(URL(string: "https://\(host)/{z}/{x}/{y}.png")!)
        )

        _ = try await overlay.loadTile(at: Self.path)

        #expect(progress.phase(for: "test-layer") == .ready)
    }

    @Test func aSourceThatCannotBeReachedLeavesTheLayerFailing() async throws {
        let host = "broken.tiles.test"
        StubURLProtocol.stub(host: host, with: .status(503))
        defer { StubURLProtocol.clear(host: host) }

        let (overlay, progress) = Self.overlay(
            host: host,
            source: .tile(URL(string: "https://\(host)/{z}/{x}/{y}.png")!)
        )

        // A transparent tile still comes back — MapKit retries a thrown error,
        // and a retry loop against a source that is down is worse than a blank
        // square with the panel saying why.
        _ = try await overlay.loadTile(at: Self.path)

        #expect(progress.phase(for: "test-layer") == .failing)
    }

    @Test func aCancelledFetchIsNotReportedAsAnOutage() async throws {
        // What MapKit does on every fast pan: the tiles for the viewport being
        // left are cancelled mid-flight. Reporting that as a failure would put
        // "Source temporarily unavailable" under a healthy source, and the user
        // would see it while panning rather than while anything was wrong.
        let host = "cancelled.tiles.test"
        StubURLProtocol.stub(host: host, with: .failure(.cancelled))
        defer { StubURLProtocol.clear(host: host) }

        let (overlay, progress) = Self.overlay(
            host: host,
            source: .tile(URL(string: "https://\(host)/{z}/{x}/{y}.png")!)
        )

        _ = try await overlay.loadTile(at: Self.path)

        #expect(progress.phase(for: "test-layer") != .failing)
        #expect(progress.phase(for: "test-layer") == .idle)
    }

    @Test func aTimeoutIsStillAnOutage() async throws {
        // The other half of the cancellation change: only cancellation is
        // excused. A `URLError` that means the network failed still has to
        // reach the panel, or the fix would have made the row permanently
        // optimistic.
        let host = "timeout.tiles.test"
        StubURLProtocol.stub(host: host, with: .failure(.timedOut))
        defer { StubURLProtocol.clear(host: host) }

        let (overlay, progress) = Self.overlay(
            host: host,
            source: .tile(URL(string: "https://\(host)/{z}/{x}/{y}.png")!)
        )

        _ = try await overlay.loadTile(at: Self.path)

        #expect(progress.phase(for: "test-layer") == .failing)
    }

    @Test func aFletcherSquareWithNoInkIsAnAnswerRatherThanAnOutage() async throws {
        // The survey's sheets are rectangles drawn around ragged scans, so a
        // sheet legitimately 404s for squares inside its own bounds. Reporting
        // that as an outage would leave every edge of the survey saying the
        // source was down.
        let host = "fletcher.tiles.test"
        StubURLProtocol.stub(host: host, with: .status(404))
        defer { StubURLProtocol.clear(host: host) }

        let covered = try #require(Self.aTileSomeSheetCovers())
        let (overlay, progress) = Self.overlay(
            host: host,
            source: .fletcherSheets(baseURL: URL(string: "https://\(host)/fletcher")!)
        )

        _ = try await overlay.loadTile(
            at: MKTileOverlayPath(
                x: covered.x, y: covered.y, z: covered.z, contentScaleFactor: 1
            )
        )

        #expect(StubURLProtocol.requestCount(host: host) > 0)
        #expect(progress.phase(for: "test-layer") == .ready)
    }

    @Test func aRefusedLayerIsNeitherRequestedNorReportedAsBroken() async throws {
        // The licence gate turns a restricted layer into a blank square. That
        // is the gate working, and the row already says the licence is what
        // stands in the way — colouring it as a source outage would blame the
        // Province for a decision the user made.
        let host = "restricted.tiles.test"
        StubURLProtocol.stub(host: host, with: .success(TestTileFactory.pngData()))
        defer { StubURLProtocol.clear(host: host) }

        let (overlay, progress) = Self.overlay(
            host: host,
            source: .catalogExport(.crownLands),
            clearance: .declined,
            layerID: LayerID.crownLands.rawValue
        )

        _ = try await overlay.loadTile(at: Self.path)

        #expect(StubURLProtocol.requestCount(host: host) == 0)
        #expect(progress.phase(for: LayerID.crownLands.rawValue) != .failing)
    }

    /// A tile at least one Fletcher sheet claims, so the 404 path is exercised
    /// rather than the "no sheet covers this" early return.
    private static func aTileSomeSheetCovers() -> (z: Int, x: Int, y: Int)? {
        for zoom in FletcherSheets.zoomRange {
            for sheet in FletcherSheets.all {
                let centre = sheet.bounds.center
                let tile = TileMath.tileXY(
                    latitude: centre.lat, longitude: centre.lng, zoom: zoom
                )
                if !FletcherSheets.sheets(coveringTileX: tile.x, y: tile.y, z: zoom).isEmpty {
                    return (zoom, tile.x, tile.y)
                }
            }
        }
        return nil
    }
}

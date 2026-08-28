import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
@testable import ns_marks_the_spot

// MARK: - TileCache

struct TileCacheTests {
    @Test func memoryCacheRoundTrip() {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = TileCache(diskRoot: root)
        let data = Data([0x01, 0x02, 0x03])

        cache.cacheTile(data, z: 10, x: 300, y: 400, layerName: "Fletcher")

        let retrieved = cache.cachedTile(z: 10, x: 300, y: 400, layerName: "Fletcher")
        #expect(retrieved == data)
    }

    @Test func nilOnCacheMiss() {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = TileCache(diskRoot: root)

        let result = cache.cachedTile(z: 0, x: 0, y: 0, layerName: "Nonexistent")
        #expect(result == nil)
    }

    @Test func differentLayerNamesDontCollide() {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = TileCache(diskRoot: root)
        let dataA = Data([0xAA])
        let dataB = Data([0xBB])

        cache.cacheTile(dataA, z: 5, x: 10, y: 10, layerName: "Fletcher")
        cache.cacheTile(dataB, z: 5, x: 10, y: 10, layerName: "Other")

        #expect(cache.cachedTile(z: 5, x: 10, y: 10, layerName: "Fletcher") == dataA)
        #expect(cache.cachedTile(z: 5, x: 10, y: 10, layerName: "Other") == dataB)
    }

    @Test func differentCoordinatesDontCollide() {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = TileCache(diskRoot: root)
        let dataA = Data([0x11])
        let dataB = Data([0x22])

        cache.cacheTile(dataA, z: 5, x: 10, y: 20, layerName: "Fletcher")
        cache.cacheTile(dataB, z: 5, x: 30, y: 40, layerName: "Fletcher")

        #expect(cache.cachedTile(z: 5, x: 10, y: 20, layerName: "Fletcher") == dataA)
        #expect(cache.cachedTile(z: 5, x: 30, y: 40, layerName: "Fletcher") == dataB)
    }

    @Test func diskCacheEvictsOldestTilesWhenQuotaIsExceeded() async {
        let root = makeTemporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = TileCache(diskRoot: root, maxDiskBytes: 3)
        let oldest = Data([0x01, 0x02])
        let newest = Data([0x03, 0x04])

        cache.cacheTile(oldest, z: 1, x: 1, y: 1, layerName: "Fletcher")
        #expect(await eventuallyCacheFileExists(root: root, layerName: "Fletcher", z: 1, x: 1, y: 1))

        cache.cacheTile(newest, z: 1, x: 2, y: 2, layerName: "Fletcher")
        #expect(await eventuallyDiskSummary(atMost: 3, cache: cache))

        #expect(cache.cachedTile(z: 1, x: 1, y: 1, layerName: "Fletcher") == nil)
        #expect(cache.cachedTile(z: 1, x: 2, y: 2, layerName: "Fletcher") == newest)
    }

    private func makeTemporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }

    private func eventuallyCacheFileExists(
        root: URL,
        layerName: String,
        z: Int,
        x: Int,
        y: Int
    ) async -> Bool {
        let file = root
            .appendingPathComponent(layerName, isDirectory: true)
            .appendingPathComponent("\(z)", isDirectory: true)
            .appendingPathComponent("\(x)", isDirectory: true)
            .appendingPathComponent("\(y).png")

        for _ in 0..<20 {
            if FileManager.default.fileExists(atPath: file.path) {
                return true
            }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return false
    }

    private func eventuallyDiskSummary(atMost maxBytes: Int, cache: TileCache) async -> Bool {
        for _ in 0..<20 {
            if await cache.diskSummary().totalBytes <= maxBytes {
                return true
            }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return false
    }
}

// MARK: - TileLayerConfiguration

struct TileLayerConfigurationTests {
    @Test func initialization() {
        let url = URL(fileURLWithPath: "Tiles/Fletcher")
        let configuration = TileLayerConfiguration(id: "fletcher", name: "Fletcher", source: .tile(url))

        #expect(configuration.id == "fletcher")
        #expect(configuration.name == "Fletcher")
        #expect(configuration.minZoom == 0)
        #expect(configuration.maxZoom == 24)

        if case .tile(let storedURL) = configuration.source {
            #expect(storedURL == url)
        } else {
            Issue.record("Expected .tile source, got \(configuration.source)")
        }
    }

    @Test func layerStateDefaultsToFullyVisible() {
        let layer = MapLayerState(
            configuration: TileLayerConfiguration(id: "test", name: "Test", source: .tile(URL(fileURLWithPath: "/")))
        )

        #expect(layer.opacity == 1.0)
        #expect(layer.isVisible == true)
        #expect(layer.effectiveAlpha == 1.0)
    }

    @Test func hiddenLayerHasZeroEffectiveAlpha() {
        let layer = MapLayerState(
            configuration: TileLayerConfiguration(id: "test", name: "Test", source: .tile(URL(fileURLWithPath: "/"))),
            opacity: 0.6,
            isVisible: false
        )

        #expect(layer.effectiveAlpha == 0.0)
    }

    @Test func adHocLayerUsesDeterministicHashedCacheIdentifier() {
        let configuration = TileLayerConfiguration(id: "test", name: "Test", source: .tile(URL(fileURLWithPath: "/tmp/tiles")))
        let rebuilt = TileLayerConfiguration(id: "test", name: "Test", source: .tile(URL(fileURLWithPath: "/tmp/tiles")))

        #expect(configuration.cacheIdentifier.hasPrefix("test_"))
        #expect(configuration.cacheIdentifier != "test")
        #expect(configuration.cacheIdentifier == rebuilt.cacheIdentifier)
    }
}

// MARK: - OverlayViewModel

@MainActor
struct OverlayViewModelTests {
    @Test func updateLayerOpacityForwardsToController() {
        let controller = MapController()
        controller.addLayer(
            MapLayerState(
                configuration: TileLayerConfiguration(id: "l1", name: "Test", source: .tile(URL(fileURLWithPath: "/"))),
                opacity: 0.5
            )
        )
        let vm = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage())
        )

        vm.updateLayerOpacity(for: "l1", to: 0.75)

        #expect(controller.layers.first?.opacity == 0.75)
    }

    @Test func updateLayerOpacityOnUnknownLayerDoesNotCrash() {
        let controller = MapController()
        let vm = OverlayViewModel(
            controller: controller,
            licenceStore: ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage())
        )

        vm.updateLayerOpacity(for: "nonexistent", to: 1.0)
    }
}

// MARK: - Release readiness

struct ReleaseReadinessTests {
    @Test func tileDebugGridIsDisabledForReleaseReadiness() {
        #expect(OpacityTileOverlay.debugShowTileGrid == false)
    }

    @Test func noFletcherPyramidIsBundledInTheApp() {
        // The 311 MB `Tiles/Fletcher` pyramid shipped inside the app until the
        // direct-Rumsey switch. It was derived from OldMapsOnline, which the
        // David Rumsey permission does not cover, and that permission does not
        // extend to native offline bundling either — so nothing may reappear
        // here without a separate written agreement, however convenient an
        // offline default would be.
        #expect(Bundle.main.url(forResource: "Tiles", withExtension: nil) == nil)
        #expect(Bundle.main.url(forResource: "Tiles/Fletcher/11/676/724", withExtension: "png") == nil)
    }

    /// The Info sheet's version footer and feedback subject both come from
    /// these formatters. A beta report is only traceable to its build if the
    /// build number survives formatting — and a preview host with no version
    /// must produce no row rather than "Version  ()".
    @Test func versionDescriptionFormatsMarketingAndBuildNumbers() {
        #expect(
            InfoSheetView.versionDescription(shortVersion: "1.0", build: "7") == "1.0 (7)"
        )
        #expect(InfoSheetView.versionDescription(shortVersion: "1.0", build: nil) == "1.0")
        #expect(InfoSheetView.versionDescription(shortVersion: "1.0", build: "") == "1.0")
        #expect(InfoSheetView.versionDescription(shortVersion: nil, build: "7") == nil)
        #expect(InfoSheetView.versionDescription(shortVersion: "", build: "7") == nil)
    }

    @Test func feedbackSubjectCarriesTheBuildWhenThereIsOne() {
        #expect(
            InfoSheetView.feedbackSubject(version: "1.0 (7)") == "NS Marks The Spot 1.0 (7)"
        )
        #expect(InfoSheetView.feedbackSubject(version: nil) == "NS Marks The Spot")
    }
}

/// Both suites below drive the same stubbed `URLProtocol`, whose response is a
/// single global. Swift Testing runs tests — and suites — concurrently unless
/// told otherwise, and `-disable-concurrent-testing` does not reach it: run in
/// parallel, each test overwrites the answer the others are waiting for, and
/// whichever wrote last is the only one that passes. `.serialized` is recursive,
/// so it covers both suites and everything in them.
@Suite(.serialized)
struct TileStubbedSuites {
    // MARK: - Province licence gate

    /// The gate where it actually stands: `OpacityTileOverlay.loadTile`.
    ///
    /// The view-model tests check that acceptance reaches the clearance box. That is
    /// not the same claim as this one, and a box that is perfectly in step is worth
    /// nothing if the tile path does not read it — which is why these drive the
    /// overlay and count the requests that left the process.
    @MainActor
    struct ProvinceLicenceGateTests {
        @Test func aRestrictedLayerMakesNoRequestBeforeTheLicenceIsAccepted() async throws {
            let png = try #require(Data(base64Encoded: TileFetcherTests.onePixelPNGBase64))
            TileFetcherURLProtocol.reset(statusCode: 200, contentType: "image/png", data: png)
            let overlay = try Self.overlay(for: .nsprd, clearance: LicenceClearanceBox())

            let data = try await overlay.loadTile(at: MKTileOverlayPath(x: 42, y: 55, z: 15, contentScaleFactor: 1))

            // A transparent tile rather than a thrown error: MapKit retries a
            // throwing tile, and retrying a refusal forever is not a refusal.
            #expect(data.isEmpty == false)
            #expect(TileFetcherURLProtocol.requests.isEmpty, "a refused layer must not reach the network")
        }

        @Test func acceptingTheLicenceLetsTheSameLayerLoad() async throws {
            let png = try #require(Data(base64Encoded: TileFetcherTests.onePixelPNGBase64))
            TileFetcherURLProtocol.reset(statusCode: 200, contentType: "image/png", data: png)

            let box = LicenceClearanceBox()
            let overlay = try Self.overlay(for: .nsprd, clearance: box)
            let store = ProvinceLicenceStore(storage: InMemoryProvinceLicenceStorage(initial: .unknown))
            let viewModel = OverlayViewModel(
                controller: MapController(),
                licenceStore: store,
                clearanceBox: box
            )
            viewModel.acceptProvinceLicence()

            _ = try await overlay.loadTile(at: MKTileOverlayPath(x: 42, y: 55, z: 15, contentScaleFactor: 1))

            // The same overlay instance, unchanged, now reaches the service: the
            // box is read per tile rather than captured at install time.
            let requested = try #require(TileFetcherURLProtocol.requests.first?.url)
            let host = try #require(requested.host())
            #expect(requested.absoluteString.contains("/export"))
            // Against the catalog's own set rather than a hostname spelled out
            // here: the province serves the restricted layers from more than
            // one host, and which one NSPRD is on is the catalog's to say.
            #expect(LayerCatalog.restrictedHosts.contains(host))
        }

        private static func overlay(
            for id: LayerID,
            clearance: LicenceClearanceBox
        ) throws -> OpacityTileOverlay {
            let descriptor = try #require(LayerCatalog.descriptor(for: id))
            #expect(descriptor.requiresProvinceClearance, "this test needs a restricted layer")

            let configuration = TileLayerConfiguration(
                descriptor: descriptor,
                source: .catalogExport(id)
            )
            let session = URLSessionConfiguration.ephemeral
            session.protocolClasses = [TileFetcherURLProtocol.self]
            return OpacityTileOverlay(
                configuration: configuration,
                // No cache: a cached tile would answer before the network is
                // reached, and "made no request" would then be true for the wrong
                // reason.
                tileCache: nil,
                tileFetcher: TileFetcher(urlSession: URLSession(configuration: session)),
                clearanceBox: clearance
            )
        }
    }

    // MARK: - TileFetcher

    struct TileFetcherTests {
        @Test func expandsRawXYZTemplateURL() throws {
            let fetcher = TileFetcher()
            let baseURL = try #require(
                URL(string: "https://example.com/tiles/{z}/{x}/{y}.png?token=test")
            )

            let url = fetcher.tileURL(z: 12, x: 345, y: 678, from: baseURL)

            #expect(url.absoluteString == "https://example.com/tiles/12/345/678.png?token=test")
        }

        @Test func expandsEncodedXYZTemplateURL() throws {
            let fetcher = TileFetcher()
            let baseURL = try #require(
                URL(string: "https://example.com/tiles/%7Bz%7D/%7Bx%7D/%7By%7D.png?token=test")
            )

            let url = fetcher.tileURL(z: 9, x: 87, y: 65, from: baseURL)

            #expect(url.absoluteString == "https://example.com/tiles/9/87/65.png?token=test")
        }

        @Test func fallsBackToLegacyDirectoryTilePathWhenTemplateIsAbsent() throws {
            let fetcher = TileFetcher()
            let baseURL = try #require(URL(string: "https://example.com/tiles"))

            let url = fetcher.tileURL(z: 7, x: 11, y: 13, from: baseURL)

            #expect(url.absoluteString == "https://example.com/tiles/7/11/13.jpg")
        }

        @Test func rejectsHTTPErrorTileResponsesBeforeCaching() async throws {
            let root = makeTemporaryRoot()
            defer { try? FileManager.default.removeItem(at: root) }
            TileFetcherURLProtocol.reset(
                statusCode: 404,
                contentType: "text/html",
                data: Data("<html>not found</html>".utf8)
            )
            let cache = TileCache(diskRoot: root)
            let fetcher = TileFetcher(tileCache: cache, urlSession: makeURLSession())
            let baseURL = try #require(URL(string: "https://example.com/tiles/{z}/{x}/{y}.png"))

            await #expect(throws: TileFetcherError.invalidHTTPStatus(404)) {
                _ = try await fetcher.fetchTile(z: 3, x: 4, y: 5, from: baseURL, layerName: "fletcher")
            }

            #expect(cache.cachedTile(z: 3, x: 4, y: 5, layerName: "fletcher") == nil)
        }

        @Test func rejectsNonImageSuccessfulTileResponsesBeforeCaching() async throws {
            let root = makeTemporaryRoot()
            defer { try? FileManager.default.removeItem(at: root) }
            TileFetcherURLProtocol.reset(
                statusCode: 200,
                contentType: "application/json",
                data: Data("{\"error\":\"not an image\"}".utf8)
            )
            let cache = TileCache(diskRoot: root)
            let fetcher = TileFetcher(tileCache: cache, urlSession: makeURLSession())
            let baseURL = try #require(URL(string: "https://example.com/tiles/{z}/{x}/{y}.png"))

            await #expect(throws: TileFetcherError.invalidContentType("application/json")) {
                _ = try await fetcher.fetchTile(z: 3, x: 4, y: 5, from: baseURL, layerName: "fletcher")
            }

            #expect(cache.cachedTile(z: 3, x: 4, y: 5, layerName: "fletcher") == nil)
        }

        @Test func fetchTileCanBypassViewedCacheForSavedAreaDownloads() async throws {
            let root = makeTemporaryRoot()
            defer { try? FileManager.default.removeItem(at: root) }
            let png = try #require(Data(base64Encoded: Self.onePixelPNGBase64))
            TileFetcherURLProtocol.reset(statusCode: 200, contentType: "image/png", data: png)
            let cache = TileCache(diskRoot: root)
            let fetcher = TileFetcher(tileCache: cache, urlSession: makeURLSession())
            let baseURL = try #require(URL(string: "https://example.com/tiles/{z}/{x}/{y}.png"))

            let data = try await fetcher.fetchTile(
                z: 3,
                x: 4,
                y: 5,
                from: baseURL,
                layerName: "fletcher",
                cacheResult: false
            )

            #expect(data == png)
            #expect(cache.cachedTile(z: 3, x: 4, y: 5, layerName: "fletcher") == nil)
        }

        @Test func imageDataRejectsANonImageResponseWithoutReturningBytes() async throws {
            // The zoom floor this test used to assert is gone: `TileFetcher` no
            // longer refuses low zooms of its own accord, because `MKTileOverlay`
            // already declines to ask outside `minimumZ...maximumZ` and the floor
            // was silently refusing waterfalls at z7 and place names at z8. What
            // remains the fetcher's job is refusing a response that is not imagery.
            TileFetcherURLProtocol.reset(
                statusCode: 200,
                contentType: "application/json",
                data: Data("{\"error\":{\"code\":499}}".utf8)
            )
            let fetcher = TileFetcher(urlSession: makeURLSession())
            let url = try #require(URL(string: "https://example.com/arcgis/rest/services/layer/MapServer/export"))

            await #expect(throws: TileFetcherError.invalidContentType("application/json")) {
                _ = try await fetcher.imageData(from: url)
            }
        }

        static let onePixelPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

        private func makeTemporaryRoot() -> URL {
            FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
        }

        private func makeURLSession() -> URLSession {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.protocolClasses = [TileFetcherURLProtocol.self]
            return URLSession(configuration: configuration)
        }
    }

}

/// URLSession invokes protocol overrides on its own loading threads, so the
/// stubbed response and recorded requests live behind a lock.
nonisolated private final class TileFetcherURLProtocolState: @unchecked Sendable {
    private let lock = NSLock()
    private var recordedRequests: [URLRequest] = []
    private var statusCode = 200
    private var contentType = "image/png"
    private var responseData = Data()

    var requests: [URLRequest] {
        lock.withLock { recordedRequests }
    }

    func record(_ request: URLRequest) {
        lock.withLock { recordedRequests.append(request) }
    }

    func stub() -> (statusCode: Int, contentType: String, responseData: Data) {
        lock.withLock { (statusCode, contentType, responseData) }
    }

    func reset(statusCode: Int, contentType: String, data: Data) {
        lock.withLock {
            recordedRequests = []
            self.statusCode = statusCode
            self.contentType = contentType
            responseData = data
        }
    }
}

nonisolated private final class TileFetcherURLProtocol: URLProtocol {
    private static let state = TileFetcherURLProtocolState()

    static var requests: [URLRequest] { state.requests }

    static func reset(statusCode: Int, contentType: String, data: Data) {
        state.reset(statusCode: statusCode, contentType: contentType, data: data)
    }

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        Self.state.record(request)
        let stub = Self.state.stub()
        guard let url = request.url,
              let response = HTTPURLResponse(
                url: url,
                statusCode: stub.statusCode,
                httpVersion: nil,
                headerFields: ["Content-Type": stub.contentType]
              ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }

        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.responseData)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

import Foundation
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

// MARK: - MapAnnotation

struct MapAnnotationTests {
    @Test func initialization() {
        let annotation = MapAnnotation(
            id: "test-1",
            latitude: 44.6488,
            longitude: -63.5752,
            title: "Test POI",
            subtitle: "waterfall"
        )

        #expect(annotation.id == "test-1")
        #expect(annotation.coordinate.latitude == 44.6488)
        #expect(annotation.coordinate.longitude == -63.5752)
        #expect(annotation.title == "Test POI")
        #expect(annotation.subtitle == "waterfall")
    }

    @Test func subtitleIsOptional() {
        let annotation = MapAnnotation(
            id: "no-sub",
            latitude: 45.0,
            longitude: -63.0,
            title: "No Subtitle"
        )

        #expect(annotation.subtitle == nil)
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
        let vm = OverlayViewModel(controller: controller)

        vm.updateLayerOpacity(for: "l1", to: 0.75)

        #expect(controller.layers.first?.opacity == 0.75)
    }

    @Test func updateLayerOpacityOnUnknownLayerDoesNotCrash() {
        let controller = MapController()
        let vm = OverlayViewModel(controller: controller)

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

    @Test func dynamicArcGISTilesRejectLowZoomBeforeNetworkFetch() async throws {
        TileFetcherURLProtocol.reset(statusCode: 200, contentType: "image/png", data: Data())
        let fetcher = TileFetcher(urlSession: makeURLSession())
        let serverURL = try #require(URL(string: "https://example.com/arcgis/rest/services/layer/MapServer"))

        await #expect(throws: TileFetcherError.unsupportedDynamicLayerZoom(10)) {
            _ = try await fetcher.fetchArcGISDynamicTile(
                z: 10,
                x: 330,
                y: 375,
                from: serverURL,
                layerName: "nsprd"
            )
        }

        #expect(TileFetcherURLProtocol.requests.isEmpty)
    }

    private static let onePixelPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

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

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

// MARK: - MapKitTileLayer

@MainActor
struct MapKitTileLayerTests {
    @Test func initialization() {
        let url = URL(fileURLWithPath: "Tiles/Fletcher")
        let layer = MapKitTileLayer(id: "fletcher", name: "Fletcher", type: .tile(url))

        #expect(layer.id == "fletcher")
        #expect(layer.name == "Fletcher")
        #expect(layer.opacity == 1.0)
        #expect(layer.isVisible == true)

        if case .tile(let storedURL) = layer.type {
            #expect(storedURL == url)
        } else {
            Issue.record("Expected .tile type, got \(layer.type)")
        }
    }

    @Test func opacityIsMutable() {
        let layer = MapKitTileLayer(id: "test", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        layer.opacity = 0.3
        #expect(layer.opacity == 0.3)
    }

    @Test func visibilityToggles() {
        let layer = MapKitTileLayer(id: "test", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        layer.isVisible = false
        #expect(layer.isVisible == false)
    }

    @Test func adHocLayerUsesDeterministicHashedCacheIdentifier() {
        let layer = MapKitTileLayer(id: "test", name: "Test", type: .tile(URL(fileURLWithPath: "/tmp/tiles")))

        #expect(layer.cacheIdentifier.hasPrefix("test_"))
        #expect(layer.cacheIdentifier != "test")
    }
}

// MARK: - OverlayViewModel

@MainActor
struct OverlayViewModelTests {
    @Test func initialOpacity() {
        let engine = MockMapEngine()
        let vm = OverlayViewModel(engine: engine)

        #expect(vm.opacity == 0.5)
        #expect(vm.selectedLayerId == nil)
    }

    @Test func updateOpacity() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(id: "l1", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        layer.opacity = 0.5
        engine.addLayer(layer)

        let vm = OverlayViewModel(engine: engine)
        vm.selectLayer("l1")
        vm.updateOpacity(0.75)

        #expect(vm.opacity == 0.75)
        #expect(layer.opacity == 0.75)
    }

    @Test func updateOpacityWithoutSelectedLayerDoesNotCrash() {
        let engine = MockMapEngine()
        let vm = OverlayViewModel(engine: engine)

        vm.updateOpacity(1.0)
        #expect(vm.opacity == 1.0)
    }

    @Test func selectLayerSyncsOpacity() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(id: "l1", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        layer.opacity = 0.25
        engine.addLayer(layer)

        let vm = OverlayViewModel(engine: engine)
        vm.selectLayer("l1")

        #expect(vm.opacity == 0.25)
        #expect(vm.selectedLayerId == "l1")
    }

    @Test func opacityClampedByEngine() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(id: "l1", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        engine.addLayer(layer)

        let vm = OverlayViewModel(engine: engine)
        vm.selectLayer("l1")

        // Engine clamps to 0...1
        vm.updateOpacity(-0.5)
        #expect(layer.opacity == 0.0)

        vm.updateOpacity(1.8)
        #expect(layer.opacity == 1.0)
    }
}

// MARK: - MapEngine setVisible

@MainActor
struct SetVisibleTests {
    @Test func setVisibleTogglesLayerVisibility() {
        let engine = MockMapEngine()
        let layer = MapKitTileLayer(id: "l1", name: "Test", type: .tile(URL(fileURLWithPath: "/")))
        engine.addLayer(layer)

        engine.setVisible(for: "l1", to: false)
        #expect(layer.isVisible == false)

        engine.setVisible(for: "l1", to: true)
        #expect(layer.isVisible == true)
    }

    @Test func setVisibleOnUnknownLayerDoesNotCrash() {
        let engine = MockMapEngine()
        engine.setVisible(for: "nonexistent", to: false)
    }
}

// MARK: - Release readiness

struct ReleaseReadinessTests {
    @Test func tileDebugGridIsDisabledForReleaseReadiness() {
        #expect(OpacityTileOverlay.debugShowTileGrid == false)
    }

    @Test func bundledFletcherZoomRangeMatchesCheckedInAssets() {
        #expect(OpacityTileOverlay.bundledNativeZoomRange == 11...15)
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

private final class TileFetcherURLProtocol: URLProtocol {
    static var requests: [URLRequest] = []
    static var statusCode = 200
    static var contentType = "image/png"
    static var responseData = Data()

    static func reset(statusCode: Int, contentType: String, data: Data) {
        requests = []
        self.statusCode = statusCode
        self.contentType = contentType
        responseData = data
    }

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        Self.requests.append(request)
        guard let url = request.url,
              let response = HTTPURLResponse(
                url: url,
                statusCode: Self.statusCode,
                httpVersion: nil,
                headerFields: ["Content-Type": Self.contentType]
              ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }

        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseData)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

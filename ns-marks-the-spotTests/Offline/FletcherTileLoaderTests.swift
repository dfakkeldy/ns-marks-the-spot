import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing
import UIKit

@testable import ns_marks_the_spot

/// The offline downloader has to resolve and stack sheets the same way the map
/// draws them, or a saved area comes back holding a picture the user never saw.
///
/// These drive the real `FletcherTileLoader` against a stubbed session rather
/// than asserting on the sheet index it consults: the index has its own parity
/// tests in the package, and what is worth checking here is which URLs the
/// loader actually asks for and what it does with the answers.
@Suite("Fletcher offline downloads")
struct FletcherTileLoaderTests {
    static let base = URL(string: "https://tiles.example.test/fletcher")!

    private func makeLoader() -> (FletcherTileLoader, URLSession) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FletcherStubURLProtocol.self]
        let session = URLSession(configuration: configuration)
        return (
            FletcherTileLoader(
                tileFetcher: TileFetcher(urlSession: session),
                baseURL: Self.base
            ),
            session
        )
    }

    /// A tile two sheets both claim, which is the case worth testing — the
    /// single-sheet path is the easy one.
    private func overlappedCoordinate() throws -> (TileCoordinate, [Int]) {
        for zoom in FletcherSheets.zoomRange {
            for sheet in FletcherSheets.all {
                let centre = sheet.bounds.center
                // Walk the sheet's own edge, where an overlap is likely.
                for probe in [
                    (sheet.bounds.north, sheet.bounds.west),
                    (sheet.bounds.north, sheet.bounds.east),
                    (sheet.bounds.south, sheet.bounds.west),
                    (sheet.bounds.south, sheet.bounds.east),
                    (centre.lat, centre.lng),
                ] {
                    let corner = TileMath.tileXY(
                        latitude: probe.0, longitude: probe.1, zoom: zoom
                    )
                    let covering = FletcherSheets.sheets(
                        coveringTileX: corner.x, y: corner.y, z: zoom
                    )
                    if covering.count >= 2 {
                        return (
                            TileCoordinate(z: zoom, x: corner.x, y: corner.y),
                            covering.map(\.sheet)
                        )
                    }
                }
            }
        }
        throw SheetSearchFailure()
    }

    private struct SheetSearchFailure: Error {}

    /// A solid, genuinely decodable tile in one colour.
    private func pngTile(_ colour: UIColor) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: CGSize(width: 256, height: 256), format: format)
            .pngData { context in
                colour.setFill()
                context.fill(CGRect(x: 0, y: 0, width: 256, height: 256))
            }
    }

    /// The RGBA of one pixel, so a stacking order can be asserted rather than
    /// inferred from byte inequality — two identical sheets re-encode to the
    /// same bytes, and a test comparing those would pass whatever the order.
    private func pixel(_ data: Data, x: Int, y: Int) throws -> (UInt8, UInt8, UInt8, UInt8) {
        let image = try #require(UIImage(data: data))
        let cgImage = try #require(image.cgImage)
        var buffer = [UInt8](repeating: 0, count: 4)
        let context = try #require(
            CGContext(
                data: &buffer,
                width: 1,
                height: 1,
                bitsPerComponent: 8,
                bytesPerRow: 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
        )
        context.draw(
            cgImage,
            in: CGRect(x: -CGFloat(x), y: -CGFloat(cgImage.height - 1 - y), width: CGFloat(cgImage.width), height: CGFloat(cgImage.height))
        )
        return (buffer[0], buffer[1], buffer[2], buffer[3])
    }

    @Test func refusesACoordinateNoSheetCovers() async throws {
        // Halifax: on the map, outside the survey.
        FletcherStubURLProtocol.reset()
        defer { FletcherStubURLProtocol.reset() }

        let halifax = TileMath.tileXY(latitude: 44.65, longitude: -63.57, zoom: 13)
        let (loader, _) = makeLoader()

        await #expect(throws: FletcherTileLoader.NoCoveringSheet.self) {
            try await loader.data(
                for: TileCoordinate(z: 13, x: halifax.x, y: halifax.y),
                layerID: "fletcher"
            )
        }
        // And it costs nothing: the refusal happens before the network, which is
        // what keeps panning off the survey from firing 24 requests a tile.
        #expect(FletcherStubURLProtocol.requestedPaths.isEmpty)
    }

    @Test func requestsEverySheetThatCoversTheCoordinate() async throws {
        let (coordinate, sheets) = try overlappedCoordinate()
        FletcherStubURLProtocol.reset(default: .success(pngTile(.red)))
        defer { FletcherStubURLProtocol.reset() }

        let (loader, _) = makeLoader()
        _ = try await loader.data(for: coordinate, layerID: "fletcher")

        // Taking the first sheet that answered would request one of these and
        // stop, leaving the rest of the tile blank wherever the sheets divide
        // the ground between them.
        let requested = FletcherStubURLProtocol.requestedSheets
        #expect(requested == sheets)
        #expect(requested.count >= 2)
        // Ascending, because that is the order Leaflet mounts them in and
        // therefore the order they stack.
        #expect(requested == requested.sorted())
    }

    @Test func drawsTheHighestSheetOnTop() async throws {
        let (coordinate, sheets) = try overlappedCoordinate()
        let highest = try #require(sheets.last)
        FletcherStubURLProtocol.reset(default: .success(pngTile(.red)))
        FletcherStubURLProtocol.stub(sheet: highest, with: .success(pngTile(.blue)))
        defer { FletcherStubURLProtocol.reset() }

        let (loader, _) = makeLoader()
        let data = try await loader.data(for: coordinate, layerID: "fletcher")

        // Every covering sheet paints the whole tile here, so whoever is on top
        // is the only thing visible — which makes this the stacking order
        // itself, not a proxy for it. Leaflet mounts 1 through 24 in order, so
        // the highest number wins.
        let (r, g, b, a) = try pixel(data, x: 128, y: 128)
        #expect(a == 255)
        #expect(b > 200, "expected the highest sheet (blue) on top, got rgb(\(r), \(g), \(b))")
        #expect(r < 60)
    }

    @Test func savesWhatItCanWhenOneSheetHasNoTile() async throws {
        let (coordinate, sheets) = try overlappedCoordinate()
        let available = try #require(sheets.first)
        FletcherStubURLProtocol.reset(default: .status(404))
        FletcherStubURLProtocol.stub(sheet: available, with: .success(pngTile(.green)))
        defer { FletcherStubURLProtocol.reset() }

        let (loader, _) = makeLoader()
        // A sheet with no raster here is indistinguishable from one behind a
        // dead connection, and refusing the whole tile would make every seam in
        // a saved area a permanent failure that Retry can never clear.
        let data = try await loader.data(for: coordinate, layerID: "fletcher")
        #expect(!data.isEmpty)
        #expect(UIImage(data: data) != nil)
    }

    @Test func refusesTheTileWhenOneSheetIsUnreachable() async throws {
        let (coordinate, sheets) = try overlappedCoordinate()
        let broken = try #require(sheets.last)
        FletcherStubURLProtocol.reset(default: .success(pngTile(.red)))
        FletcherStubURLProtocol.stub(sheet: broken, with: .status(503))
        defer { FletcherStubURLProtocol.reset() }

        let (loader, _) = makeLoader()
        // The counterpart to the 404 case below it: a sheet that is temporarily
        // down must not be quietly dropped, because the resulting tile would be
        // saved and then preferred over every later fetch. Failing here is what
        // lets Retry put the missing half back.
        await #expect(throws: FletcherTileLoader.SheetsUnavailable.self) {
            try await loader.data(for: coordinate, layerID: "fletcher")
        }
    }

    @Test func savesABlankTileWhereNoSheetHasAnyRaster() async throws {
        let (coordinate, _) = try overlappedCoordinate()
        FletcherStubURLProtocol.reset(default: .status(404))
        defer { FletcherStubURLProtocol.reset() }

        let (loader, _) = makeLoader()
        // Real ground: a rotated scan leaves empty corners inside its own
        // bounding box, so every covering sheet can honestly answer "nothing
        // here". Throwing would mark the coordinate failed forever and make
        // every Retry ask for it again.
        let data = try await loader.data(for: coordinate, layerID: "fletcher")
        let (_, _, _, alpha) = try pixel(data, x: 128, y: 128)
        #expect(alpha == 0)
    }

    @Test func reportsACoordinateNoSheetWouldServe() async throws {
        let (coordinate, _) = try overlappedCoordinate()
        FletcherStubURLProtocol.reset(default: .status(500))
        defer { FletcherStubURLProtocol.reset() }

        let (loader, _) = makeLoader()
        // Distinct from `NoCoveringSheet`: this one is worth retrying, and the
        // caller can only tell them apart if the types differ.
        await #expect(throws: FletcherTileLoader.SheetsUnavailable.self) {
            try await loader.data(for: coordinate, layerID: "fletcher")
        }
    }

    @Test func addressesTheRevisionedSheetPath() async throws {
        let (coordinate, sheets) = try overlappedCoordinate()
        FletcherStubURLProtocol.reset(default: .success(pngTile(.red)))
        defer { FletcherStubURLProtocol.reset() }

        let (loader, _) = makeLoader()
        _ = try await loader.data(for: coordinate, layerID: "fletcher")

        let first = try #require(FletcherStubURLProtocol.requestedPaths.first)
        let sheet = try #require(sheets.first)
        #expect(first.contains("/\(FletcherSheets.tileRevision)/"))
        #expect(first.contains(String(format: "/sheet-%02d/", sheet)))
        #expect(first.hasSuffix("/\(coordinate.z)/\(coordinate.x)/\(coordinate.y).png"))
    }
}

// MARK: - Stub

nonisolated enum FletcherStubResponse: Sendable {
    case success(Data)
    case status(Int)
}

nonisolated private final class FletcherStubState: @unchecked Sendable {
    private let lock = NSLock()
    private var paths: [String] = []
    private var defaultResponse = FletcherStubResponse.status(404)
    private var bySheet: [Int: FletcherStubResponse] = [:]

    var requestedPaths: [String] { lock.withLock { paths } }

    func record(_ path: String) {
        lock.withLock { paths.append(path) }
    }

    func response(forSheet sheet: Int?) -> FletcherStubResponse {
        lock.withLock {
            guard let sheet, let stubbed = bySheet[sheet] else { return defaultResponse }
            return stubbed
        }
    }

    func reset(default response: FletcherStubResponse) {
        lock.withLock {
            paths = []
            defaultResponse = response
            bySheet = [:]
        }
    }

    func stub(sheet: Int, with response: FletcherStubResponse) {
        lock.withLock { bySheet[sheet] = response }
    }
}

/// Answers per sheet, so a test can make one sheet available and another not.
nonisolated final class FletcherStubURLProtocol: URLProtocol {
    private static let state = FletcherStubState()

    static var requestedPaths: [String] { state.requestedPaths }

    /// The sheet numbers requested, in request order.
    static var requestedSheets: [Int] {
        state.requestedPaths.compactMap(sheetNumber(inPath:))
    }

    static func reset(default response: FletcherStubResponse = .status(404)) {
        state.reset(default: response)
    }

    static func stub(sheet: Int, with response: FletcherStubResponse) {
        state.stub(sheet: sheet, with: response)
    }

    private static func sheetNumber(inPath path: String) -> Int? {
        guard let range = path.range(of: "/sheet-") else { return nil }
        let digits = path[range.upperBound...].prefix(2)
        return Int(digits)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        Self.state.record(url.path)

        let response = Self.state.response(forSheet: Self.sheetNumber(inPath: url.path))
        let statusCode: Int
        let body: Data
        switch response {
        case .success(let data):
            statusCode = 200
            body = data
        case .status(let code):
            statusCode = code
            body = Data()
        }

        guard let httpResponse = HTTPURLResponse(
            url: url,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "image/png"]
        ) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        client?.urlProtocol(self, didReceive: httpResponse, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

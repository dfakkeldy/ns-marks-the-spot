import Foundation
import UIKit

nonisolated enum TileFetcherError: Error, Equatable {
    case invalidHTTPStatus(Int)
    case invalidContentType(String?)
    case invalidImageData
    case unsupportedDynamicLayerZoom(Int)

    /// Whether this means "there is no tile here" rather than "the tile could
    /// not be fetched right now".
    ///
    /// The distinction only matters for the Fletcher sheets, and there it
    /// matters a lot. A sheet's bounds are a rectangle drawn around a scan with
    /// ragged content, so along the survey's edges a sheet legitimately covers
    /// tiles it has no ink for, and a 404 is the normal answer. Treating that
    /// as a failure makes every seam permanently incomplete. A 5xx or a dropped
    /// connection is the opposite: a tile we could have had, and one that will
    /// probably be there on the next try, so a composite missing it must not be
    /// cached or saved as though it were whole.
    ///
    /// 403 and 410 are here because object stores answer that way for a missing
    /// key — S3 returns 403 without `ListBucket`, and a pyramid served straight
    /// out of a bucket is the likely hosting.
    static func meansNoTileExists(_ error: any Error) -> Bool {
        guard let error = error as? TileFetcherError else { return false }
        switch error {
        case .invalidHTTPStatus(let code):
            return code == 404 || code == 403 || code == 410
        case .invalidContentType, .invalidImageData, .unsupportedDynamicLayerZoom:
            return false
        }
    }
}

/// Stateless beyond its two `Sendable` collaborators, so tile fetches can run
/// on MapKit's background tile-loading tasks without hopping to the main actor.
nonisolated final class TileFetcher: Sendable {
    private static let minimumArcGISDynamicZoom = 12
    private static let maximumArcGISDynamicExportSize = 1024

    private let tileCache: TileCache?
    private let urlSession: URLSession

    init(tileCache: TileCache? = nil, urlSession: URLSession = .shared) {
        self.tileCache = tileCache
        self.urlSession = urlSession
    }

    func fetchTile(
        z: Int,
        x: Int,
        y: Int,
        from baseURL: URL,
        layerName: String,
        cacheResult: Bool = true
    ) async throws -> Data {
        let url = tileURL(z: z, x: x, y: y, from: baseURL)
        let (data, response) = try await urlSession.data(from: url)
        try validateImageResponse(data: data, response: response)

        if cacheResult {
            tileCache?.cacheTile(data, z: z, x: x, y: y, layerName: layerName)
        }

        return data
    }

    func tileURL(z: Int, x: Int, y: Int, from baseURL: URL) -> URL {
        let template = baseURL.absoluteString
        let replacements = [
            "{z}": "\(z)",
            "{x}": "\(x)",
            "{y}": "\(y)",
            "%7Bz%7D": "\(z)",
            "%7Bx%7D": "\(x)",
            "%7By%7D": "\(y)"
        ]

        var expanded = template
        for (placeholder, value) in replacements {
            expanded = expanded.replacingOccurrences(
                of: placeholder,
                with: value,
                options: [.caseInsensitive]
            )
        }

        if expanded != template, let url = URL(string: expanded) {
            return url
        }

        return baseURL
            .appendingPathComponent("\(z)")
            .appendingPathComponent("\(x)")
            .appendingPathComponent("\(y).jpg")
    }

    func fetchArcGISDynamicTile(
        z: Int,
        x: Int,
        y: Int,
        from serverURL: URL,
        layerName: String,
        dynamicLayersJSON: String? = nil,
        layerRestrictions: String? = nil,
        cacheResult: Bool = true
    ) async throws -> Data {
        guard z >= Self.minimumArcGISDynamicZoom else {
            throw TileFetcherError.unsupportedDynamicLayerZoom(z)
        }

        let bbox = tileToBBOX(z: z, x: x, y: y)

        // Keep low-zoom dynamic exports bounded; larger ArcGIS requests can be
        // multi-megabyte images that are immediately downsampled to one tile.
        let scaleFactor = pow(2.0, Double(max(0, 14 - z)))
        let requestedSize = min(Self.maximumArcGISDynamicExportSize, 256 * Int(scaleFactor))
        let targetSize = 256

        var components = URLComponents(
            url: serverURL.appendingPathComponent("export"),
            resolvingAgainstBaseURL: false
        )!
        var queryItems = [
            URLQueryItem(name: "bbox", value: "\(bbox.minX),\(bbox.minY),\(bbox.maxX),\(bbox.maxY)"),
            URLQueryItem(name: "bboxSR", value: "3857"),
            URLQueryItem(name: "imageSR", value: "3857"),
            URLQueryItem(name: "size", value: "\(requestedSize),\(requestedSize)"),
            URLQueryItem(name: "format", value: "png32"),
            URLQueryItem(name: "transparent", value: "true"),
            URLQueryItem(name: "f", value: "image"),
        ]
        if let json = dynamicLayersJSON {
            // Strip formatting, newlines and spaces to avoid URL parsing issues on older/strict servers
            let minified = json.components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .joined()
            queryItems.append(URLQueryItem(name: "dynamicLayers", value: minified))
        }
        if let layers = layerRestrictions {
            queryItems.append(URLQueryItem(name: "layers", value: layers))
        }
        components.queryItems = queryItems

        let (data, response) = try await urlSession.data(from: components.url!)
        try validateImageResponse(data: data, response: response)

        let finalData: Data
        if requestedSize != targetSize {
            if let resized = resizeImage(data: data, to: CGSize(width: targetSize, height: targetSize)) {
                finalData = resized
            } else {
                throw TileFetcherError.invalidImageData
            }
        } else {
            finalData = data
        }

        if cacheResult {
            tileCache?.cacheTile(finalData, z: z, x: x, y: y, layerName: layerName)
        }

        return finalData
    }

    func fetchArcGISMapServiceTile(
        z: Int,
        x: Int,
        y: Int,
        from serverURL: URL,
        layerName: String,
        transparent: Bool,
        cacheResult: Bool = true
    ) async throws -> Data {
        let bbox = tileToBBOX(z: z, x: x, y: y)
        var components = URLComponents(
            url: serverURL.appendingPathComponent("export"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "bbox", value: "\(bbox.minX),\(bbox.minY),\(bbox.maxX),\(bbox.maxY)"),
            URLQueryItem(name: "bboxSR", value: "3857"),
            URLQueryItem(name: "imageSR", value: "3857"),
            URLQueryItem(name: "size", value: "256,256"),
            URLQueryItem(name: "format", value: "png32"),
            URLQueryItem(name: "transparent", value: transparent ? "true" : "false"),
            URLQueryItem(name: "f", value: "image")
        ]

        guard let url = components.url else {
            throw URLError(.badURL)
        }

        let (data, response) = try await urlSession.data(from: url)
        try validateImageResponse(data: data, response: response)

        if cacheResult {
            tileCache?.cacheTile(data, z: z, x: x, y: y, layerName: layerName)
        }

        return data
    }

    private func validateImageResponse(data: Data, response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            guard UIImage(data: data) != nil else {
                throw TileFetcherError.invalidImageData
            }
            return
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw TileFetcherError.invalidHTTPStatus(httpResponse.statusCode)
        }

        let mimeType = httpResponse.mimeType?.lowercased()
        if let mimeType, !mimeType.hasPrefix("image/") {
            throw TileFetcherError.invalidContentType(mimeType)
        }

        guard UIImage(data: data) != nil else {
            throw TileFetcherError.invalidImageData
        }
    }

    private func resizeImage(data: Data, to size: CGSize) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.0
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.pngData { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    private func tileToBBOX(z: Int, x: Int, y: Int) -> (minX: Double, minY: Double, maxX: Double, maxY: Double) {
        let worldExtent = 20_037_508.342789244
        let tileSize = (2 * worldExtent) / pow(2, Double(z))
        let minX = -worldExtent + Double(x) * tileSize
        let maxX = minX + tileSize
        let maxY = worldExtent - Double(y) * tileSize
        let minY = maxY - tileSize
        return (minX, minY, maxX, maxY)
    }
}

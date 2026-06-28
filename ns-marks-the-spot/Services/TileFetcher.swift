import Foundation
import UIKit

final class TileFetcher {
    private let tileCache: TileCache?

    init(tileCache: TileCache? = nil) {
        self.tileCache = tileCache
    }

    func fetchTile(z: Int, x: Int, y: Int, from baseURL: URL, layerName: String) async throws -> Data {
        let url = tileURL(z: z, x: x, y: y, from: baseURL)
        let (data, _) = try await URLSession.shared.data(from: url)
        tileCache?.cacheTile(data, z: z, x: x, y: y, layerName: layerName)
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

    func fetchArcGISDynamicTile(z: Int, x: Int, y: Int, from serverURL: URL, layerName: String, dynamicLayersJSON: String? = nil, layerRestrictions: String? = nil) async throws -> Data {
        let bbox = tileToBBOX(z: z, x: x, y: y)

        // Calculate size to bypass server-side scale limits (e.g. minScale 36,114)
        // Capped at 4096 because it's the server's maximum image dimensions.
        let scaleFactor = pow(2.0, Double(max(0, 14 - z)))
        let requestedSize = min(4096, 256 * Int(scaleFactor))
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

        let (data, _) = try await URLSession.shared.data(from: components.url!)

        let finalData: Data
        if requestedSize != targetSize {
            if let resized = resizeImage(data: data, to: CGSize(width: targetSize, height: targetSize)) {
                finalData = resized
            } else {
                finalData = data
            }
        } else {
            finalData = data
        }

        tileCache?.cacheTile(finalData, z: z, x: x, y: y, layerName: layerName)
        return finalData
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

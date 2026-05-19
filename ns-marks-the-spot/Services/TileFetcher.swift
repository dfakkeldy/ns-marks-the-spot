import Foundation

final class TileFetcher {
    private let tileCache: TileCache?

    init(tileCache: TileCache? = nil) {
        self.tileCache = tileCache
    }

    func fetchTile(z: Int, x: Int, y: Int, from baseURL: URL, layerName: String) async throws -> Data {
        let url = baseURL
            .appendingPathComponent("\(z)")
            .appendingPathComponent("\(x)")
            .appendingPathComponent("\(y).jpg")
        let (data, _) = try await URLSession.shared.data(from: url)
        tileCache?.cacheTile(data, z: z, x: x, y: y, layerName: layerName)
        return data
    }

    func fetchArcGISDynamicTile(z: Int, x: Int, y: Int, from serverURL: URL, layerName: String) async throws -> Data {
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
            URLQueryItem(name: "transparent", value: "true"),
            URLQueryItem(name: "f", value: "image"),
        ]

        let (data, _) = try await URLSession.shared.data(from: components.url!)
        tileCache?.cacheTile(data, z: z, x: x, y: y, layerName: layerName)
        return data
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

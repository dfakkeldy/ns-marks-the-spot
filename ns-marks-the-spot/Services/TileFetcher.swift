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
}

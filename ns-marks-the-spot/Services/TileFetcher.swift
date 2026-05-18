import Foundation

final class TileFetcher {
    func fetchTile(z: Int, x: Int, y: Int, from baseURL: URL) async throws -> Data {
        let url = baseURL
            .appendingPathComponent("\(z)")
            .appendingPathComponent("\(x)")
            .appendingPathComponent("\(y).jpg")
        let (data, _) = try await URLSession.shared.data(from: url)
        return data
    }
}

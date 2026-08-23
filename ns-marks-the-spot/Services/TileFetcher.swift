import Foundation
import UIKit

nonisolated enum TileFetcherError: Error, Equatable {
    case invalidHTTPStatus(Int)
    case invalidContentType(String?)
    case invalidImageData

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
        case .invalidContentType, .invalidImageData:
            return false
        }
    }
}

/// Stateless beyond its two `Sendable` collaborators, so tile fetches can run
/// on MapKit's background tile-loading tasks without hopping to the main actor.
nonisolated final class TileFetcher: Sendable {
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
        let data = try await imageData(from: url)

        if cacheResult {
            tileCache?.cacheTile(data, z: z, x: x, y: y, layerName: layerName)
        }

        return data
    }

    /// Fetches one image and checks it is one, with no caching of its own.
    ///
    /// Takes a finished URL because that is all a `TileRequest` carries, and a
    /// `TileRequest` is the only way a catalogued layer's address is produced —
    /// `TileRequestFactory` checks the Province licence before it assembles
    /// one. Caching is the caller's, because the bytes worth keeping are the
    /// composite of a layer's passes rather than each pass on its own.
    func imageData(from url: URL) async throws -> Data {
        let (data, response) = try await urlSession.data(from: url)
        try validateImageResponse(data: data, response: response)
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
}

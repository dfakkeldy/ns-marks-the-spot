import Foundation

nonisolated enum SavedOfflineAreaState: String, Codable, Equatable, Sendable {
    case draft
    case estimating
    case downloading
    case complete
    case partial
    case failed
}

nonisolated struct SavedOfflineArea: Identifiable, Codable, Equatable, Sendable {
    let id: String
    var name: String
    var bounds: MapBounds
    var minZoom: Int
    var maxZoom: Int
    var createdAt: Date
    var updatedAt: Date
    var estimatedTileCount: Int
    var estimatedBytes: Int
    var downloadedTileCount: Int
    var failedTileCount: Int
    var failedTileCoordinates: [TileCoordinate]?
    var actualBytes: Int
    var state: SavedOfflineAreaState

    init(
        id: String = UUID().uuidString,
        name: String,
        bounds: MapBounds,
        minZoom: Int,
        maxZoom: Int,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        estimatedTileCount: Int = 0,
        estimatedBytes: Int = 0,
        downloadedTileCount: Int = 0,
        failedTileCount: Int = 0,
        failedTileCoordinates: [TileCoordinate] = [],
        actualBytes: Int = 0,
        state: SavedOfflineAreaState = .draft
    ) {
        self.id = id
        self.name = name
        self.bounds = bounds
        self.minZoom = minZoom
        self.maxZoom = maxZoom
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.estimatedTileCount = estimatedTileCount
        self.estimatedBytes = estimatedBytes
        self.downloadedTileCount = downloadedTileCount
        self.failedTileCount = failedTileCount
        self.failedTileCoordinates = failedTileCoordinates
        self.actualBytes = actualBytes
        self.state = state
    }
}

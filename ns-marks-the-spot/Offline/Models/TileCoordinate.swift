import Foundation

nonisolated struct TileCoordinate: Hashable, Codable, Sendable {
    let z: Int
    let x: Int
    let y: Int
}

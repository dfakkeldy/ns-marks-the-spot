import Foundation

/// An ordered set of the user's maps. The first sheet is on top.
public struct DriveCatalogue: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var name: String
    public var createdAt: Date
    public var modifiedAt: Date
    public var sheetIDs: [String]
    public var opacity: Double

    public init(id: String = UUID().uuidString, name: String, createdAt: Date = Date(),
                modifiedAt: Date? = nil, sheetIDs: [String] = [], opacity: Double = 1) {
        self.id = id
        self.name = name
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt ?? createdAt
        self.sheetIDs = sheetIDs
        self.opacity = opacity
    }
}

import Foundation

actor SavedOfflineAreaRepository {
    private let fileURL: URL
    private let fileManager: FileManager
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(
        fileURL: URL? = nil,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager

        if let fileURL {
            self.fileURL = fileURL
        } else {
            let applicationSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            self.fileURL = applicationSupport
                .appendingPathComponent("OfflineAreas", isDirectory: true)
                .appendingPathComponent("saved-areas.json")
        }

        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }

    func load() throws -> [SavedOfflineArea] {
        guard fileManager.fileExists(atPath: fileURL.path) else { return [] }

        let data = try Data(contentsOf: fileURL)
        return try decoder.decode([SavedOfflineArea].self, from: data)
            .sorted(by: Self.sortSavedAreas)
    }

    func save(_ areas: [SavedOfflineArea]) throws {
        try fileManager.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        let data = try encoder.encode(areas.sorted(by: Self.sortSavedAreas))
        try data.write(to: fileURL, options: .atomic)
    }

    private static func sortSavedAreas(_ lhs: SavedOfflineArea, _ rhs: SavedOfflineArea) -> Bool {
        if lhs.updatedAt == rhs.updatedAt {
            return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
        }
        return lhs.updatedAt > rhs.updatedAt
    }
}

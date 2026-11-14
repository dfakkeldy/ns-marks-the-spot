import Foundation
import GeoCore

/// A single actor owns read-modify-write of the catalogue document.
actor DriveCatalogueStore {
    static let shared = DriveCatalogueStore()
    enum Refusal: Error, Equatable { case unreadable, newerVersion(Int) }
    enum Change: Sendable {
        case create(DriveCatalogue)
        case rename(String, String)
        case delete(String)
        case addSheets(String, [String])
        case removeSheet(String, String)
        case removeSheetEverywhere(String)
        case reorder(String, [String])
        case move(String, String, Int)
        case opacity(String, Double)
    }
    private struct Document: Codable {
        var version: Int
        var catalogues: [DriveCatalogue]
        var removedSheetIDs: Set<String>?
    }
    private struct Stamp: Decodable { var version: Int }
    private let url: URL
    private let manager: FileManager
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private static let version = 1

    init(directory: URL? = nil, manager: FileManager = .default) {
        self.manager = manager
        let base = directory ?? manager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.url = base.appendingPathComponent("drive-catalogues.json")
        encoder.outputFormatting = [.sortedKeys]
    }

    func load() throws -> [DriveCatalogue] {
        try readDocument().catalogues
    }

    /// Preserve an unreadable document for recovery. Never move a newer file.
    func setAsideDamagedDocument() throws {
        do { _ = try readDocument(); return }
        catch Refusal.unreadable {
            let backup = url.deletingLastPathComponent().appendingPathComponent("drive-catalogues-damaged-\(UUID().uuidString).json")
            try manager.moveItem(at: url, to: backup)
        }
    }

    private func readDocument() throws -> Document {
        guard manager.fileExists(atPath: url.path) else { return Document(version: Self.version, catalogues: [], removedSheetIDs: []) }
        let data = try Data(contentsOf: url)
        guard let stamp = try? decoder.decode(Stamp.self, from: data), stamp.version >= 1 else { throw Refusal.unreadable }
        guard stamp.version <= Self.version else { throw Refusal.newerVersion(stamp.version) }
        guard let document = try? decoder.decode(Document.self, from: data) else { throw Refusal.unreadable }
        return document
    }

    func apply(_ change: Change, now: Date = Date()) throws -> [DriveCatalogue] {
        var document = try readDocument()
        var items = document.catalogues
        var removed = document.removedSheetIDs ?? []
        switch change {
        case .create(var item):
            guard !items.contains(where: { $0.id == item.id }) else { return items }
            item.sheetIDs.removeAll { removed.contains($0) }
            items.append(item)
        case .rename(let id, let name):
            if let i = items.firstIndex(where: { $0.id == id }) { items[i].name = name; items[i].modifiedAt = now }
        case .delete(let id): items.removeAll { $0.id == id }
        case .addSheets(let id, let ids):
            if let i = items.firstIndex(where: { $0.id == id }) {
                var seen = Set(items[i].sheetIDs)
                items[i].sheetIDs.append(contentsOf: ids.filter { !removed.contains($0) && seen.insert($0).inserted })
                items[i].modifiedAt = now
            }
        case .removeSheetEverywhere(let id):
            removed.insert(id)
            for i in items.indices where items[i].sheetIDs.contains(id) {
                items[i].sheetIDs.removeAll { $0 == id }
                items[i].modifiedAt = now
            }
        case .removeSheet(let catalogueID, let sheetID):
            if let i = items.firstIndex(where: { $0.id == catalogueID }) {
                items[i].sheetIDs.removeAll { $0 == sheetID }; items[i].modifiedAt = now
            }
        case .reorder(let id, let ids):
            if let i = items.firstIndex(where: { $0.id == id }),
               ids.count == items[i].sheetIDs.count, Set(ids) == Set(items[i].sheetIDs) {
                items[i].sheetIDs = ids; items[i].modifiedAt = now
            }
        case .move(let id, let sheetID, let delta):
            if let i = items.firstIndex(where: { $0.id == id }),
               let from = items[i].sheetIDs.firstIndex(of: sheetID),
               items[i].sheetIDs.indices.contains(from + delta), abs(delta) == 1 {
                items[i].sheetIDs.swapAt(from, from + delta); items[i].modifiedAt = now
            }
        case .opacity(let id, let opacity):
            if let i = items.firstIndex(where: { $0.id == id }), opacity.isFinite {
                items[i].opacity = min(1, max(0, opacity)); items[i].modifiedAt = now
            }
        }
        try manager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        document.catalogues = items
        document.removedSheetIDs = removed
        try encoder.encode(document).write(to: url, options: .atomic)
        return items
    }
}

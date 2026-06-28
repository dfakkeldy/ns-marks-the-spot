import Combine
import Foundation

struct OfflineLayerStorageSummary: Identifiable, Equatable {
    let id: String
    let displayName: String
    let rawKey: String?
    let bytes: Int
}

@MainActor
final class OfflineAreasViewModel: ObservableObject {
    @Published private(set) var savedAreas: [SavedOfflineArea] = []
    @Published private(set) var storageSummary = TileStoreSummary(
        totalBytes: 0,
        layerBytes: [:],
        savedAreaBytes: [:]
    )

    private let tileStore: TileStore
    private let tileCache: TileCache
    private let averageTileBytes = 12_000

    var layerStorageSummaries: [OfflineLayerStorageSummary] {
        storageSummary.layerBytes
            .map { key, bytes in
                let (displayName, rawKey) = Self.friendlyLayerLabel(for: key)
                return OfflineLayerStorageSummary(
                    id: key,
                    displayName: displayName,
                    rawKey: rawKey,
                    bytes: bytes
                )
            }
            .sorted {
                if $0.bytes == $1.bytes {
                    return $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending
                }
                return $0.bytes > $1.bytes
            }
    }

    var savedAreaBytes: Int {
        storageSummary.savedAreaBytes.values.reduce(0, +)
    }

    init(tileStore: TileStore, tileCache: TileCache) {
        self.tileStore = tileStore
        self.tileCache = tileCache
    }

    func estimateDraft(
        name: String,
        bounds: MapBounds,
        minZoom: Int,
        maxZoom: Int
    ) -> SavedOfflineArea {
        let estimate = FletcherTilePlanner.estimate(
            bounds: bounds,
            zoomRange: minZoom...maxZoom,
            averageTileBytes: averageTileBytes
        )

        return SavedOfflineArea(
            name: name,
            bounds: bounds,
            minZoom: minZoom,
            maxZoom: maxZoom,
            estimatedTileCount: estimate.tileCount,
            estimatedBytes: estimate.estimatedBytes,
            state: .estimating
        )
    }

    func saveDraft(_ area: SavedOfflineArea) {
        upsertSavedArea(applyingStorageSummary(to: area))
    }

    func retryFailedArea(_ area: SavedOfflineArea) {
        updateSavedArea(id: area.id) { savedArea in
            guard savedArea.failedTileCount > 0 else { return }
            savedArea.state = .queued
            savedArea.updatedAt = .now
        }
    }

    func refreshStorageSummary() async {
        storageSummary = await tileStore.summary()
        synchronizeSavedAreasWithStorageSummary()
    }

    func deleteLayerCache(_ layerID: String) async {
        await tileCache.clearLayer(named: layerID)
        try? await tileStore.deleteLayer(layerID)
        await refreshStorageSummary()
    }

    func deleteSavedArea(_ area: SavedOfflineArea) async {
        do {
            try await tileStore.deleteSavedArea(area.id)
            savedAreas.removeAll { $0.id == area.id }
        } catch {
        }
        await refreshStorageSummary()
    }

    func deleteAllCachedTiles() async {
        await tileCache.clearAllCachedTiles()
        try? await tileStore.deleteAll()
        await refreshStorageSummary()
    }

    private func upsertSavedArea(_ area: SavedOfflineArea) {
        if let existingIndex = savedAreas.firstIndex(where: { $0.id == area.id }) {
            savedAreas[existingIndex] = area
        } else {
            savedAreas.append(area)
        }

        savedAreas.sort { lhs, rhs in
            if lhs.updatedAt == rhs.updatedAt {
                return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
            }
            return lhs.updatedAt > rhs.updatedAt
        }
    }

    private func updateSavedArea(
        id: String,
        mutation: (inout SavedOfflineArea) -> Void
    ) {
        guard let index = savedAreas.firstIndex(where: { $0.id == id }) else { return }
        var savedArea = savedAreas[index]
        mutation(&savedArea)
        savedAreas[index] = applyingStorageSummary(to: savedArea)
    }

    private func synchronizeSavedAreasWithStorageSummary() {
        savedAreas = savedAreas.map(applyingStorageSummary)
    }

    private func applyingStorageSummary(to area: SavedOfflineArea) -> SavedOfflineArea {
        var updatedArea = area
        updatedArea.actualBytes = storageSummary.savedAreaBytes[area.id] ?? 0
        return updatedArea
    }

    private static func friendlyLayerLabel(for key: String) -> (displayName: String, rawKey: String?) {
        let canonicalKey: String
        if key.range(of: "_[0-9a-f]{64}$", options: .regularExpression) != nil,
           let separatorIndex = key.lastIndex(of: "_") {
            canonicalKey = String(key[..<separatorIndex])
        } else {
            canonicalKey = key
        }

        let components = canonicalKey
            .split(whereSeparator: { $0 == "-" || $0 == "_" })
            .map(String.init)

        guard !components.isEmpty else {
            return (key, nil)
        }

        let displayName = components
            .map { component in
                switch component.lowercased() {
                case "ns":
                    return "NS"
                case "poi":
                    return "POI"
                default:
                    return component.localizedCapitalized
                }
            }
            .joined(separator: " ")

        if displayName == key {
            return (displayName, nil)
        }

        return (displayName, key)
    }
}

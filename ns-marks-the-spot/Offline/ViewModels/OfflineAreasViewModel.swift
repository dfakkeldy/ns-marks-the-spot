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
    @Published private(set) var storageErrorMessage: String?

    private let tileStore: TileStore
    private let tileCache: TileCache
    private let tileDownloadManager: TileDownloadManager?
    private let tileLoader: (any TileDataLoading)?
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

    init(
        tileStore: TileStore,
        tileCache: TileCache,
        tileDownloadManager: TileDownloadManager? = nil,
        tileLoader: (any TileDataLoading)? = nil
    ) {
        self.tileStore = tileStore
        self.tileCache = tileCache
        self.tileDownloadManager = tileDownloadManager
        self.tileLoader = tileLoader
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

    func retryFailedArea(_ area: SavedOfflineArea) async {
        guard area.failedTileCount > 0 else { return }
        clearStorageError()

        guard let tileDownloadManager, let tileLoader else {
            storageErrorMessage = "Couldn't retry this offline area right now."
            return
        }

        updateSavedArea(id: area.id) { savedArea in
            savedArea.state = .downloading
            savedArea.updatedAt = .now
        }

        let progress = await tileDownloadManager.download(area: area, loader: tileLoader)
        await refreshStorageSummary()

        updateSavedArea(id: area.id) { savedArea in
            savedArea.downloadedTileCount = progress.succeeded
            savedArea.failedTileCount = progress.failed
            savedArea.state = Self.state(for: progress)
            savedArea.updatedAt = .now
        }
    }

    func refreshStorageSummary() async {
        async let tileStoreSummary = tileStore.summary()
        async let tileCacheSummary = tileCache.diskSummary()

        storageSummary = await Self.mergedStorageSummary(
            tileStore: tileStoreSummary,
            tileCache: tileCacheSummary
        )
        synchronizeSavedAreasWithStorageSummary()
    }

    func deleteLayerCache(_ layerID: String) async {
        clearStorageError()
        do {
            try await tileCache.clearLayer(named: layerID)
            try await tileStore.deleteLayer(layerID)
        } catch {
            storageErrorMessage = "Couldn't delete the \(friendlyLayerName(for: layerID)) cache."
        }
        await refreshStorageSummary()
    }

    func deleteSavedArea(_ area: SavedOfflineArea) async {
        clearStorageError()
        do {
            try await tileStore.deleteSavedArea(area.id)
            savedAreas.removeAll { $0.id == area.id }
        } catch {
            storageErrorMessage = "Couldn't delete \(area.name)."
        }
        await refreshStorageSummary()
    }

    func deleteAllCachedTiles() async {
        clearStorageError()
        do {
            try await tileCache.clearAllCachedTiles()
            try await tileStore.deleteAll()
        } catch {
            storageErrorMessage = "Couldn't delete cached tiles."
        }
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

    private func clearStorageError() {
        storageErrorMessage = nil
    }

    private func friendlyLayerName(for key: String) -> String {
        Self.friendlyLayerLabel(for: key).displayName
    }

    private static func mergedStorageSummary(
        tileStore: TileStoreSummary,
        tileCache: TileCacheDiskSummary
    ) -> TileStoreSummary {
        var layerBytes = tileStore.layerBytes
        for (layerID, bytes) in tileCache.layerBytes {
            layerBytes[layerID, default: 0] += bytes
        }

        return TileStoreSummary(
            totalBytes: tileStore.totalBytes + tileCache.totalBytes,
            layerBytes: layerBytes,
            savedAreaBytes: tileStore.savedAreaBytes
        )
    }

    private static func state(for progress: TileDownloadProgress) -> SavedOfflineAreaState {
        if progress.failed == 0 {
            return .complete
        }
        if progress.succeeded > 0 {
            return .partial
        }
        return .failed
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

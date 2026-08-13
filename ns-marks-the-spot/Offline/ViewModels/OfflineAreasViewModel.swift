import Foundation
import Observation

struct OfflineLayerStorageSummary: Identifiable, Equatable {
    let id: String
    let displayName: String
    let rawKey: String?
    let bytes: Int
}

@MainActor
@Observable
final class OfflineAreasViewModel {
    private(set) var savedAreas: [SavedOfflineArea] = []
    private(set) var storageSummary = TileStoreSummary(
        totalBytes: 0,
        layerBytes: [:],
        savedAreaBytes: [:]
    )
    private(set) var storageErrorMessage: String?
    private(set) var isStorageOperationInProgress = false
    private(set) var activeDownloadAreaID: String?

    static let maximumSavedAreaTileCount = 100_000
    @ObservationIgnored private let tileStore: TileStore
    @ObservationIgnored private let tileCache: TileCache
    @ObservationIgnored private let savedAreaRepository: SavedOfflineAreaRepository
    @ObservationIgnored private let tileDownloadManager: TileDownloadManager?
    @ObservationIgnored private let tileLoader: (any TileDataLoading)?
    @ObservationIgnored private let averageTileBytes = 12_000
    @ObservationIgnored private var hasLoadedSavedAreas = false
    @ObservationIgnored private var activeDownloadTask: Task<Void, Never>?

    var maximumSavedAreaTileCount: Int {
        Self.maximumSavedAreaTileCount
    }

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
        savedAreaRepository: SavedOfflineAreaRepository = SavedOfflineAreaRepository(),
        tileDownloadManager: TileDownloadManager? = nil,
        tileLoader: (any TileDataLoading)? = nil
    ) {
        self.tileStore = tileStore
        self.tileCache = tileCache
        self.savedAreaRepository = savedAreaRepository
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
            state: estimate.tileCount > Self.maximumSavedAreaTileCount ? .failed : .estimating
        )
    }

    func loadSavedAreas() async {
        do {
            savedAreas = try await savedAreaRepository.load()
                .map(applyingStorageSummary)
            hasLoadedSavedAreas = true
        } catch {
            storageErrorMessage = "Couldn't load saved offline areas."
        }
    }

    @discardableResult
    func saveDraft(_ area: SavedOfflineArea) async -> Bool {
        guard beginStorageOperation() else { return false }
        defer { finishStorageOperation() }

        let stagedAreas = upserting(applyingStorageSummary(to: area), into: savedAreas)
        do {
            try await savedAreaRepository.save(stagedAreas)
            savedAreas = stagedAreas
            return true
        } catch {
            storageErrorMessage = "Couldn't save \(area.name)."
            return false
        }
    }

    func downloadArea(_ area: SavedOfflineArea) async {
        await download(area: area, requiresFailures: false)
    }

    func retryFailedArea(_ area: SavedOfflineArea) async {
        await download(area: area, requiresFailures: true)
    }

    func startDownloadArea(_ area: SavedOfflineArea) {
        startDownloadTask(for: area, retryFailures: false)
    }

    func startRetryFailedArea(_ area: SavedOfflineArea) {
        startDownloadTask(for: area, retryFailures: true)
    }

    func cancelActiveDownload() {
        activeDownloadTask?.cancel()
    }

    private func download(area: SavedOfflineArea, requiresFailures: Bool) async {
        if requiresFailures {
            guard area.failedTileCount > 0 else { return }
        }

        guard beginStorageOperation() else { return }
        defer { finishStorageOperation() }

        guard let tileDownloadManager, let tileLoader else {
            storageErrorMessage = "Couldn't download this offline area right now."
            return
        }

        let retryCoordinates = area.failedTileCoordinates ?? []
        let targetCoordinates = requiresFailures && !retryCoordinates.isEmpty ? retryCoordinates : nil
        let startingDownloadedCount = requiresFailures ? area.downloadedTileCount : 0

        do {
            try await updateSavedArea(id: area.id) { savedArea in
                savedArea.state = .downloading
                if !requiresFailures {
                    savedArea.downloadedTileCount = 0
                }
                savedArea.failedTileCount = 0
                savedArea.failedTileCoordinates = []
                savedArea.updatedAt = .now
            }
        } catch {
            storageErrorMessage = "Couldn't update \(area.name)."
            return
        }

        let progress = await tileDownloadManager.download(
            area: area,
            loader: tileLoader,
            targetCoordinates: targetCoordinates
        ) { [weak self] progress in
            await self?.applyDownloadProgress(
                areaID: area.id,
                startingDownloadedCount: startingDownloadedCount,
                progress: progress
            )
        }
        await refreshStorageSummary()

        do {
            try await updateSavedArea(id: area.id) { savedArea in
                let downloadedTileCount = startingDownloadedCount + progress.succeeded
                savedArea.downloadedTileCount = downloadedTileCount
                savedArea.failedTileCount = progress.failed
                savedArea.failedTileCoordinates = progress.failedCoordinates
                savedArea.state = Self.state(
                    downloadedTileCount: downloadedTileCount,
                    failedTileCount: progress.failed,
                    estimatedTileCount: savedArea.estimatedTileCount,
                    wasCancelled: progress.wasCancelled
                )
                savedArea.updatedAt = .now
            }
        } catch {
            storageErrorMessage = "Couldn't save download results for \(area.name)."
        }
    }

    func refreshStorageSummary() async {
        async let tileStoreSummary = tileStore.summary()
        async let tileCacheSummary = tileCache.diskSummary()

        storageSummary = await Self.mergedStorageSummary(
            tileStore: tileStoreSummary,
            tileCache: tileCacheSummary
        )

        if !hasLoadedSavedAreas {
            await loadSavedAreas()
        } else {
            synchronizeSavedAreasWithStorageSummary()
        }
    }

    func deleteLayerCache(_ layerID: String) async {
        guard beginStorageOperation() else { return }
        defer { finishStorageOperation() }

        do {
            try await tileCache.clearLayer(named: layerID)
            try await tileStore.deleteLayer(layerID)
        } catch {
            storageErrorMessage = "Couldn't delete the \(friendlyLayerName(for: layerID)) cache."
        }
        await refreshStorageSummary()
        await persistSavedAreasAfterStorageChange()
    }

    func deleteSavedArea(_ area: SavedOfflineArea) async {
        guard beginStorageOperation() else { return }
        defer { finishStorageOperation() }

        let previousAreas = savedAreas
        let stagedAreas = savedAreas.filter { $0.id != area.id }
        do {
            try await tileStore.deleteSavedArea(area.id)
            try await savedAreaRepository.save(stagedAreas)
            savedAreas = stagedAreas
        } catch {
            savedAreas = previousAreas
            storageErrorMessage = "Couldn't delete \(area.name)."
        }
        await refreshStorageSummary()
    }

    func deleteAllCachedTiles() async {
        guard beginStorageOperation() else { return }
        defer { finishStorageOperation() }

        do {
            try await tileCache.clearAllCachedTiles()
            try await tileStore.deleteAll()
        } catch {
            storageErrorMessage = "Couldn't delete cached tiles."
        }
        await refreshStorageSummary()
        await persistSavedAreasAfterStorageChange()
    }

    private func updateSavedArea(
        id: String,
        mutation: (inout SavedOfflineArea) -> Void
    ) async throws {
        guard let index = savedAreas.firstIndex(where: { $0.id == id }) else { return }
        var stagedAreas = savedAreas
        var savedArea = stagedAreas[index]
        mutation(&savedArea)
        stagedAreas[index] = applyingStorageSummary(to: savedArea)
        stagedAreas = sortedSavedAreas(stagedAreas)
        try await savedAreaRepository.save(stagedAreas)
        savedAreas = stagedAreas
    }

    private func applyDownloadProgress(
        areaID: String,
        startingDownloadedCount: Int,
        progress: TileDownloadProgress
    ) {
        guard let index = savedAreas.firstIndex(where: { $0.id == areaID }) else { return }
        var savedArea = savedAreas[index]
        savedArea.downloadedTileCount = startingDownloadedCount + progress.succeeded
        savedArea.failedTileCount = progress.failed
        savedArea.failedTileCoordinates = progress.failedCoordinates
        savedArea.updatedAt = .now
        savedAreas[index] = applyingStorageSummary(to: savedArea)
        sortSavedAreas()
    }

    private func synchronizeSavedAreasWithStorageSummary() {
        savedAreas = savedAreas.map(applyingStorageSummary)
    }

    private func sortSavedAreas() {
        savedAreas = sortedSavedAreas(savedAreas)
    }

    private func sortedSavedAreas(_ areas: [SavedOfflineArea]) -> [SavedOfflineArea] {
        areas.sorted { lhs, rhs in
            if lhs.updatedAt == rhs.updatedAt {
                return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
            }
            return lhs.updatedAt > rhs.updatedAt
        }
    }

    private func persistSavedAreas() async throws {
        try await savedAreaRepository.save(savedAreas)
    }

    private func persistSavedAreasAfterStorageChange() async {
        do {
            try await persistSavedAreas()
        } catch {
            storageErrorMessage = "Couldn't save offline area changes."
        }
    }

    private func applyingStorageSummary(to area: SavedOfflineArea) -> SavedOfflineArea {
        var updatedArea = area
        updatedArea.actualBytes = storageSummary.savedAreaBytes[area.id] ?? 0
        if updatedArea.actualBytes == 0,
           [.complete, .partial].contains(updatedArea.state) {
            updatedArea.state = .estimating
            updatedArea.downloadedTileCount = 0
            updatedArea.failedTileCount = 0
            updatedArea.failedTileCoordinates = []
        } else if updatedArea.state == .downloading {
            updatedArea.state = updatedArea.actualBytes > 0 ? .partial : .failed
            if updatedArea.failedTileCount == 0 {
                updatedArea.failedTileCount = max(updatedArea.estimatedTileCount - updatedArea.downloadedTileCount, 1)
            }
        }
        return updatedArea
    }

    private func upserting(
        _ area: SavedOfflineArea,
        into areas: [SavedOfflineArea]
    ) -> [SavedOfflineArea] {
        var stagedAreas = areas
        if let existingIndex = stagedAreas.firstIndex(where: { $0.id == area.id }) {
            stagedAreas[existingIndex] = area
        } else {
            stagedAreas.append(area)
        }

        return sortedSavedAreas(stagedAreas)
    }

    private func startDownloadTask(for area: SavedOfflineArea, retryFailures: Bool) {
        guard !isStorageOperationInProgress else {
            storageErrorMessage = "Please wait for the current offline operation to finish."
            return
        }

        activeDownloadTask?.cancel()
        activeDownloadAreaID = area.id
        activeDownloadTask = Task { [weak self] in
            guard let self else { return }
            if retryFailures {
                await self.retryFailedArea(area)
            } else {
                await self.downloadArea(area)
            }
            if self.activeDownloadAreaID == area.id {
                self.activeDownloadAreaID = nil
            }
            self.activeDownloadTask = nil
        }
    }

    private func clearStorageError() {
        storageErrorMessage = nil
    }

    private func beginStorageOperation() -> Bool {
        guard !isStorageOperationInProgress else {
            storageErrorMessage = "Please wait for the current offline operation to finish."
            return false
        }

        isStorageOperationInProgress = true
        clearStorageError()
        return true
    }

    private func finishStorageOperation() {
        isStorageOperationInProgress = false
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

    private static func state(
        downloadedTileCount: Int,
        failedTileCount: Int,
        estimatedTileCount: Int,
        wasCancelled: Bool
    ) -> SavedOfflineAreaState {
        if failedTileCount == 0,
           !wasCancelled,
           downloadedTileCount >= estimatedTileCount {
            return .complete
        }
        if downloadedTileCount > 0 {
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

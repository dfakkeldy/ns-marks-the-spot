import Foundation
import Testing
@testable import ns_marks_the_spot

@MainActor
struct OfflineAreasViewModelTests {
    @Test func estimateDraftSetsTileCountAndBytes() {
        let viewModel = OfflineAreasViewModel(tileStore: TileStore())
        let area = viewModel.estimateDraft(
            name: "Halifax",
            bounds: MapBounds(
                minLatitude: 44.64,
                minLongitude: -63.58,
                maxLatitude: 44.66,
                maxLongitude: -63.56
            ),
            minZoom: 10,
            maxZoom: 11
        )

        #expect(area.name == "Halifax")
        #expect(area.estimatedTileCount > 0)
        #expect(area.estimatedBytes == area.estimatedTileCount * 12_000)
        #expect(area.state == .estimating)
    }

    @Test func deleteAllCachedTilesRefreshesSummary() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = TileStore(rootDirectory: root)
        try await store.store(Data([0x01]), z: 1, x: 1, y: 1, layerID: "fletcher", savedAreaID: nil)
        let viewModel = OfflineAreasViewModel(tileStore: store)

        await viewModel.refreshStorageSummary()
        #expect(viewModel.storageSummary.totalBytes == 1)

        await viewModel.deleteAllCachedTiles()
        #expect(viewModel.storageSummary.totalBytes == 0)
    }
}

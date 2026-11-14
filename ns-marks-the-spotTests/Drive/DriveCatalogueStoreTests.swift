import Foundation
import CoreGraphics
import GeoCore
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import ns_marks_the_spot

@Suite("Drive catalogues")
struct DriveCatalogueStoreTests {
    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func catalogueOperationsRoundTrip() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = DriveCatalogueStore(directory: directory)
        let first = DriveCatalogue(id: "a", name: "Trip", sheetIDs: ["one", "two"])
        let second = DriveCatalogue(id: "b", name: "Other", sheetIDs: ["two"])
        _ = try await store.apply(.create(first))
        _ = try await store.apply(.create(second))
        _ = try await store.apply(.rename("a", "Drive"))
        _ = try await store.apply(.reorder("a", ["two", "one"]))
        _ = try await store.apply(.addSheets("a", ["one", "three"]))
        let reloaded = try await DriveCatalogueStore(directory: directory).load()
        #expect(reloaded[0].name == "Drive")
        #expect(reloaded[0].sheetIDs == ["two", "one", "three"])
        _ = try await store.apply(.removeSheetEverywhere("two"))
        _ = try await store.apply(.create(DriveCatalogue(id: "late", name: "Late batch", sheetIDs: ["two", "four"])))
        let afterRemoval = try await store.load()
        #expect(afterRemoval[0].sheetIDs == ["one", "three"])
        #expect(afterRemoval[1].sheetIDs.isEmpty)
        #expect(afterRemoval[2].sheetIDs == ["four"])
        _ = try await store.apply(.delete("a"))
        let remaining = try await store.load()
        #expect(remaining.map(\.id) == ["b", "late"])
    }

    @Test func newerDocumentIsNeverOverwritten() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("drive-catalogues.json")
        let original = Data("{\"version\":999,\"future\":true}".utf8)
        try original.write(to: url)
        let store = DriveCatalogueStore(directory: directory)
        do {
            _ = try await store.apply(.create(DriveCatalogue(name: "No")))
            Issue.record("A later-version document was overwritten")
        } catch let refusal as DriveCatalogueStore.Refusal {
            #expect(refusal == .newerVersion(999))
        }
        #expect(try Data(contentsOf: url) == original)
    }

    @Test func repeatedMovesUseCurrentStoredOrder() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = DriveCatalogueStore(directory: directory)
        _ = try await store.apply(.create(DriveCatalogue(id: "a", name: "Trip", sheetIDs: ["one", "two", "three"])))
        _ = try await store.apply(.move("a", "three", -1))
        _ = try await store.apply(.move("a", "three", -1))
        let items = try await store.load()
        #expect(items.first?.sheetIDs == ["three", "one", "two"])
    }

    @Test @MainActor func damagedFileIsPreservedAndNewerFileSeals() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let suite = "drive-seal-test-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let url = directory.appendingPathComponent("drive-catalogues.json")
        try Data("bad".utf8).write(to: url)
        let uiStore = DriveUiStateStore(defaults: defaults)
        uiStore.save(DriveUiState(loadedCatalogueID: "old", autoActivate: true, showCoverage: true))
        let vm = DriveCataloguesViewModel(store: DriveCatalogueStore(directory: directory), uiStore: uiStore)
        await vm.load()
        #expect(vm.canEdit)
        #expect(vm.ui.loadedCatalogueID == nil)
        let names = try FileManager.default.contentsOfDirectory(atPath: directory.path)
        let backup = try #require(names.first { $0.hasPrefix("drive-catalogues-damaged-") })
        #expect(try Data(contentsOf: directory.appendingPathComponent(backup)) == Data("bad".utf8))
        try Data("{\"version\":999}".utf8).write(to: url)
        await vm.load()
        #expect(!vm.canEdit)
        #expect(vm.error?.contains("newer") == true)
        vm.beginSheetDeletion("uncertain")
        await vm.retryPendingDeletions(vm.pendingDeletions, confirmedIDs: [])
        #expect(vm.error?.contains("newer") == true)
        #expect(vm.pendingDeletions.isEmpty)
    }

    @Test @MainActor func opacityUpdatesImmediatelyAndSaves() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let suite = "drive-opacity-test-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = DriveCatalogueStore(directory: directory)
        let vm = DriveCataloguesViewModel(store: store, uiStore: DriveUiStateStore(defaults: defaults))
        await vm.load()
        await vm.create(name: "Trip", sheetIDs: [])
        let catalogue = try #require(vm.catalogues.first)
        vm.previewOpacity(0.35, in: catalogue.id)
        #expect(vm.opacity(for: catalogue) == 0.35)
        await vm.finishOpacity(in: catalogue.id)
        let saved = try await store.load()
        #expect(saved.first?.opacity == 0.35)
        vm.previewOpacity(0.2, in: catalogue.id)
        vm.previewOpacity(0.7, in: catalogue.id)
        try await Task.sleep(for: .seconds(1))
        let debounced = try await store.load()
        #expect(debounced.first?.opacity == 0.7)
    }

    @Test @MainActor func loadedCatalogueSurvivesRelaunch() throws {
        let suite = "drive-ui-test-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = DriveUiStateStore(defaults: defaults)
        store.save(DriveUiState(loadedCatalogueID: "a", autoActivate: true, showCoverage: true))
        #expect(DriveUiStateStore(defaults: defaults).load().loadedCatalogueID == "a")
    }

    @Test @MainActor func pendingDeletionSurvivesRelaunchAndRetries() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let suite = "drive-pending-test-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = DriveCatalogueStore(directory: directory)
        _ = try await store.apply(.create(DriveCatalogue(id: "a", name: "Trip", sheetIDs: ["deleted", "kept"])))
        let uiStore = DriveUiStateStore(defaults: defaults)
        let first = DriveCataloguesViewModel(store: store, uiStore: uiStore)
        first.beginSheetDeletion("deleted")
        uiStore.setCommittedDeletions(["deleted"])
        let reopened = DriveCataloguesViewModel(store: store, uiStore: uiStore)
        let pending = reopened.pendingDeletions
        await reopened.load()
        await reopened.retryPendingDeletions(pending, confirmedIDs: ["kept"])
        #expect(reopened.catalogues.first?.sheetIDs == ["kept"])
        #expect(reopened.pendingDeletions.isEmpty)
    }

    @Test @MainActor func pendingDeletionForExistingSheetIsCleared() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let suite = "drive-existing-test-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let uiStore = DriveUiStateStore(defaults: defaults)
        let vm = DriveCataloguesViewModel(store: DriveCatalogueStore(directory: directory), uiStore: uiStore)
        await vm.load()
        vm.beginSheetDeletion("still-there")
        await vm.retryPendingDeletions(vm.pendingDeletions, confirmedIDs: ["still-there"])
        #expect(vm.pendingDeletions.isEmpty)
        await vm.create(name: "Trip", sheetIDs: ["uncertain"])
        vm.beginSheetDeletion("uncertain")
        await vm.retryPendingDeletions(vm.pendingDeletions, confirmedIDs: [])
        #expect(vm.catalogues.first?.sheetIDs == ["uncertain"])
        #expect(vm.pendingDeletions.isEmpty)
        #expect(vm.error?.contains("could not be confirmed") == true)
    }

    @Test @MainActor func unrelatedUncertainDeletionDoesNotWarn() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let suite = "drive-unrelated-test-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let vm = DriveCataloguesViewModel(store: DriveCatalogueStore(directory: directory), uiStore: DriveUiStateStore(defaults: defaults))
        await vm.load()
        vm.beginSheetDeletion("unrelated")
        await vm.retryPendingDeletions(vm.pendingDeletions, confirmedIDs: [])
        #expect(vm.pendingDeletions.isEmpty)
        #expect(vm.error == nil)
    }

    @Test @MainActor func importedSheetsCanCreateAnOrderedCatalogue() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let suite = "drive-import-test-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let context = try #require(CGContext(data: nil, width: 8, height: 8, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        let image = try #require(context.makeImage())
        let bytes = NSMutableData()
        let destination = try #require(CGImageDestinationCreateWithData(bytes, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, nil)
        #expect(CGImageDestinationFinalize(destination))
        let urls = ["03.png", "01.png", "02.png"].map { directory.appendingPathComponent($0) }
        for url in urls { try (bytes as Data).write(to: url) }
        let maps = UserMapsViewModel(store: UserMapStore(directory: directory.appendingPathComponent("maps")), display: UserMapDisplayStore(defaults: defaults))
        let catalogues = DriveCataloguesViewModel(store: DriveCatalogueStore(directory: directory.appendingPathComponent("catalogues")), uiStore: DriveUiStateStore(defaults: defaults))
        await catalogues.load()
        maps.driveCatalogues = catalogues
        let ids = await UserFileImport.loadCatalogueSheets(urls, maps: maps)
        await catalogues.create(name: "Drive", sheetIDs: ids)
        #expect(ids.count == 3)
        #expect(catalogues.catalogues.first?.sheetIDs == ids)
        #expect(maps.rows.map(\.record.name) == ["01", "02", "03"])
        await maps.delete(id: ids[0])
        #expect(catalogues.catalogues.first?.sheetIDs == Array(ids.dropFirst()))
        let catalogueID = try #require(catalogues.catalogues.first?.id)
        await catalogues.delete(catalogueID)
        #expect(maps.rows.map(\.id) == Array(ids.dropFirst()))
        let reloadedMaps = try await UserMapStore(directory: directory.appendingPathComponent("maps")).load()
        #expect(Set(reloadedMaps.map(\.id)) == Set(ids.dropFirst()))
    }
}

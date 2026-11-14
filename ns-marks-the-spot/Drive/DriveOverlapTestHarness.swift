#if DEBUG
import GeoCore
import SwiftUI

@MainActor private final class OverlapTestScreen: ScreenWakeLock { var isHeldAwake = false }

/// A deterministic, isolated surface for the overlap controls' UI-frame test.
struct DriveOverlapTestHarness: View {
    @State private var model = DriveModeModel(screen: ScreenAwakeCoordinator(screen: OverlapTestScreen()))
    @State private var catalogues: DriveCataloguesViewModel
    @State private var rows: [UserMapsViewModel.Row] = []
    @State private var suite: String
    @State private var directory: URL

    init() {
        let suite = "nsmarks-overlap-ui-test"
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("nsmarks-overlap-ui-test")
        UserDefaults.standard.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: directory)
        guard let defaults = UserDefaults(suiteName: suite) else { preconditionFailure("Test defaults unavailable") }
        _suite = State(initialValue: suite)
        _directory = State(initialValue: directory)
        _catalogues = State(initialValue: DriveCataloguesViewModel(store: DriveCatalogueStore(directory: directory), uiStore: DriveUiStateStore(defaults: defaults)))
    }

    var body: some View {
        VStack {
            if let catalogue = catalogues.loaded, model.output.status == .overlap {
                OverlapBarView(model: model, catalogues: catalogues, catalogue: catalogue, rows: rows)
            }
        }
        .padding()
        .onDisappear {
            UserDefaults.standard.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: directory)
        }
        .task {
            let points = [
                SessionControlPoint(id: "1", pixel: .init(x: 0, y: 0), map: .init(lat: 45, lng: -61)),
                SessionControlPoint(id: "2", pixel: .init(x: 100, y: 0), map: .init(lat: 45, lng: -60.99)),
                SessionControlPoint(id: "3", pixel: .init(x: 0, y: 100), map: .init(lat: 44.99, lng: -61)),
            ]
            let records = ["a", "b"].map { UserMapRecord(id: $0, name: $0, pixelSize: .init(width: 100, height: 100), placement: .controlPoints(points, method: .affine)) }
            rows = records.map { .init(record: $0, isVisible: true, opacity: 1, preview: nil) }
            await catalogues.load()
            await catalogues.create(name: "Test", sheetIDs: ["a", "b"])
            if let catalogue = catalogues.loaded {
                let now = Date()
                model.update(catalogue: catalogue, auto: true, records: records,
                             fix: .init(latitude: 44.995, longitude: -60.995, accuracyM: 5, timestamp: now),
                             following: true, now: now)
            }
        }
    }
}
#endif

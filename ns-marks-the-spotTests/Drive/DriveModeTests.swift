import Foundation
import CoreGraphics
import GeoCore
import Testing
@testable import ns_marks_the_spot

@MainActor private final class DriveTestScreen: ScreenWakeLock { var isHeldAwake = false }

@Suite("Drive mode") @MainActor
struct DriveModeTests {
    @Test func screenReasonsAndSceneAreIndependent() {
        let screen = DriveTestScreen()
        let coordinator = ScreenAwakeCoordinator(screen: screen)
        coordinator.sceneBecame(active: false)
        #expect(!screen.isHeldAwake)
        coordinator.set(.recording, active: true)
        #expect(!screen.isHeldAwake)
        coordinator.sceneBecame(active: true)
        #expect(screen.isHeldAwake)
        coordinator.set(.recording, active: false)
        #expect(!screen.isHeldAwake)
        coordinator.set(.driveMode, active: true)
        coordinator.sceneBecame(active: false)
        #expect(!screen.isHeldAwake)
        coordinator.set(.recording, active: true)
        #expect(!screen.isHeldAwake)
        coordinator.sceneBecame(active: true)
        #expect(screen.isHeldAwake)
        coordinator.set(.driveMode, active: false)
        coordinator.set(.recording, active: false)
        #expect(!screen.isHeldAwake)
        coordinator.set(.recording, active: true)
        #expect(screen.isHeldAwake)
        coordinator.set(.driveMode, active: true)
        coordinator.set(.recording, active: false)
        #expect(screen.isHeldAwake)
        coordinator.sceneBecame(active: false)
        #expect(!screen.isHeldAwake)
        coordinator.sceneBecame(active: true)
        #expect(screen.isHeldAwake)
        coordinator.set(.driveMode, active: false)
        #expect(!screen.isHeldAwake)
    }

    @Test func activationHoldsWhenFollowIsOffAndResumesOnNextFix() throws {
        let screen = DriveTestScreen()
        let model = DriveModeModel(screen: ScreenAwakeCoordinator(screen: screen))
        let points = [
            SessionControlPoint(id: "1", pixel: .init(x: 0, y: 0), map: .init(lat: 45, lng: -61)),
            SessionControlPoint(id: "2", pixel: .init(x: 100, y: 0), map: .init(lat: 45, lng: -60.99)),
            SessionControlPoint(id: "3", pixel: .init(x: 0, y: 100), map: .init(lat: 44.99, lng: -61)),
            SessionControlPoint(id: "4", pixel: .init(x: 100, y: 100), map: .init(lat: 44.99, lng: -60.99)),
        ]
        let record = UserMapRecord(id: "a", name: "A", pixelSize: .init(width: 100, height: 100), placement: .controlPoints(points, method: .affine))
        #expect(record.mesh != nil)
        let catalogue = DriveCatalogue(id: "cat", name: "Trip", sheetIDs: ["a"])
        #expect(!model.hasUsableActivation)
        func fix(_ time: Double, lat: Double, lng: Double) -> TrackFix {
            TrackFix(latitude: lat, longitude: lng, accuracyM: 5, timestamp: Date(timeIntervalSince1970: time))
        }
        model.update(catalogue: catalogue, auto: true, records: [record], fix: fix(1, lat: 44.995, lng: -60.995), following: true, now: Date(timeIntervalSince1970: 4))
        #expect(model.output.shown == ["a"])
        #expect(!model.isOn)
        model.setVisible(false, id: "a")
        #expect(model.output.shown.isEmpty)
        model.setVisible(true, id: "a")
        #expect(model.output.shown == ["a"])
        model.setOn(true)
        model.setOn(false)
        #expect(model.output.shown == ["a"])
        model.setOn(true)
        let poor = TrackFix(latitude: 44.995, longitude: -60.995, accuracyM: 150, timestamp: Date(timeIntervalSince1970: 2))
        model.update(catalogue: catalogue, auto: true, records: [record], fix: poor, following: true, now: Date(timeIntervalSince1970: 4))
        model.update(catalogue: catalogue, auto: true, records: [record], fix: poor, following: false, now: Date(timeIntervalSince1970: 4))
        model.update(catalogue: catalogue, auto: true, records: [record], fix: poor, following: true, now: Date(timeIntervalSince1970: 4))
        #expect(model.output.reason == .heldPoorFix)
        #expect(model.output.shown == ["a"])
        model.update(catalogue: catalogue, auto: true, records: [record], fix: fix(2, lat: 44.995, lng: -60.995), following: true, now: Date(timeIntervalSince1970: 4))
        #expect(model.output.reason == .updated)
        #expect(model.output.shown == ["a"])
        model.update(catalogue: catalogue, auto: true, records: [record], fix: fix(2, lat: 44.9, lng: -60.9), following: true, now: Date(timeIntervalSince1970: 100))
        #expect(model.locationUnavailable)
        #expect(model.output.shown == ["a"])
        model.update(catalogue: catalogue, auto: true, records: [record], fix: fix(2, lat: 44.9, lng: -60.9), following: true, signalAvailable: false, now: Date(timeIntervalSince1970: 4))
        #expect(model.output.shown == ["a"])
        model.update(catalogue: catalogue, auto: true, records: [record], fix: fix(2, lat: 44.9, lng: -60.9), following: false, now: Date(timeIntervalSince1970: 4))
        #expect(model.output.shown == ["a"])
        #expect(model.autoPaused)
        model.update(catalogue: catalogue, auto: true, records: [record], fix: fix(2, lat: 44.9, lng: -60.9), following: true, now: Date(timeIntervalSince1970: 4))
        #expect(model.output.shown == ["a"])
        model.update(catalogue: catalogue, auto: true, records: [record], fix: fix(3, lat: 44.9, lng: -60.9), following: true, now: Date(timeIntervalSince1970: 4))
        model.update(catalogue: catalogue, auto: true, records: [record], fix: fix(4, lat: 44.9, lng: -60.9), following: true, now: Date(timeIntervalSince1970: 4))
        #expect(model.output.shown.isEmpty)
        model.setVisible(true, id: "a")
        #expect(model.pinned.contains("a"))
        #expect(model.output.shown == ["a"])
        model.update(catalogue: catalogue, auto: false, records: [record], fix: nil, following: true, now: Date(timeIntervalSince1970: 4))
        #expect(model.pinned.isEmpty)
        model.setOn(false)
        #expect(!screen.isHeldAwake)
    }

    @Test func catalogueOrderChangesWhileLocationIsUnavailable() {
        let model = DriveModeModel(screen: ScreenAwakeCoordinator(screen: DriveTestScreen()))
        let points = [
            SessionControlPoint(id: "1", pixel: .init(x: 0, y: 0), map: .init(lat: 45, lng: -61)),
            SessionControlPoint(id: "2", pixel: .init(x: 100, y: 0), map: .init(lat: 45, lng: -60.99)),
            SessionControlPoint(id: "3", pixel: .init(x: 0, y: 100), map: .init(lat: 44.99, lng: -61)),
        ]
        let records = ["a", "b", "c", "d"].map { UserMapRecord(id: $0, name: $0, pixelSize: .init(width: 100, height: 100), placement: .controlPoints(points, method: .affine)) }
        var catalogue = DriveCatalogue(id: "cat", name: "Trip", sheetIDs: ["a", "b", "c", "d"])
        let fix = TrackFix(latitude: 44.995, longitude: -60.995, accuracyM: 5, timestamp: Date(timeIntervalSince1970: 1))
        model.update(catalogue: catalogue, auto: true, records: records, fix: fix, following: true, now: Date(timeIntervalSince1970: 1))
        #expect(model.output.shown == ["a", "b", "c"])
        catalogue.sheetIDs = ["d", "a", "b", "c"]
        model.update(catalogue: catalogue, auto: true, records: records, fix: fix, following: true, signalAvailable: false, now: Date(timeIntervalSince1970: 1))
        #expect(model.output.shown == ["d", "a", "b"])
        #expect(model.locationUnavailable)

        let pending = DriveModeModel(screen: ScreenAwakeCoordinator(screen: DriveTestScreen()))
        let outside = TrackFix(latitude: 44.9, longitude: -60.9, accuracyM: 5, timestamp: Date(timeIntervalSince1970: 1))
        let inside = TrackFix(latitude: 44.995, longitude: -60.995, accuracyM: 5, timestamp: Date(timeIntervalSince1970: 2))
        pending.update(catalogue: catalogue, auto: true, records: records, fix: outside, following: true, now: Date(timeIntervalSince1970: 2))
        pending.update(catalogue: catalogue, auto: true, records: records, fix: inside, following: true, now: Date(timeIntervalSince1970: 2))
        #expect(pending.output.contained.isEmpty)
        catalogue.sheetIDs = ["a", "b", "c", "d"]
        pending.update(catalogue: catalogue, auto: true, records: records, fix: inside, following: true, signalAvailable: false, now: Date(timeIntervalSince1970: 2))
        #expect(pending.output.contained.isEmpty)
        let next = TrackFix(latitude: inside.latitude, longitude: inside.longitude, accuracyM: 5, timestamp: Date(timeIntervalSince1970: 3))
        pending.update(catalogue: catalogue, auto: true, records: records, fix: next, following: true, now: Date(timeIntervalSince1970: 3))
        #expect(pending.output.contained == ["a", "b", "c", "d"])
    }

    @Test func automaticDrapesRespectShownOrderAndRestoreRowState() throws {
        let context = try #require(CGContext(data: nil, width: 2, height: 2, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        let image = try #require(context.makeImage())
        func row(_ id: String, visible: Bool, alpha: CGFloat) -> UserMapsViewModel.Row {
            let record = UserMapRecord(id: id, name: id, pixelSize: .init(width: 2, height: 2), placement: .controlPoints([], method: .affine))
            return .init(record: record, isVisible: visible, opacity: alpha, preview: image)
        }
        let rows = [row("a", visible: false, alpha: 0.4), row("b", visible: true, alpha: 0.6), row("outside", visible: true, alpha: 0.8)]
        let original = rows.filter(\.isVisible).map { UserMapDrape(record: $0.record, image: image, alpha: $0.opacity) }
        let catalogue = DriveCatalogue(id: "cat", name: "Trip", sheetIDs: ["a", "b"], opacity: 0.7)
        let auto = DriveDrapeSelection.build(maps: original, rows: rows, catalogue: catalogue, auto: true, shown: ["a", "b"], opacity: 0.9)
        #expect(auto.map(\.record.id) == ["outside", "b", "a"])
        #expect(auto.map(\.alpha) == [0.8, 0.9, 0.9])
        let manual = DriveDrapeSelection.build(maps: original, rows: rows, catalogue: catalogue, auto: false, shown: [], opacity: 1)
        #expect(manual == original)
        #expect(!rows[0].isVisible)
    }

    @Test func scriptedSequenceMatchesSharedFirstFixAndExitCase() {
        // Same rectangle, fixes and shown arrays as the shared fixture's
        // "first fix and exit margin" case.
        let model = DriveModeModel(screen: ScreenAwakeCoordinator(screen: DriveTestScreen()))
        let points = [
            SessionControlPoint(id: "1", pixel: .init(x: 0, y: 0), map: .init(lat: 0.01, lng: 0)),
            SessionControlPoint(id: "2", pixel: .init(x: 100, y: 0), map: .init(lat: 0.01, lng: 0.01)),
            SessionControlPoint(id: "3", pixel: .init(x: 0, y: 100), map: .init(lat: 0, lng: 0)),
        ]
        let record = UserMapRecord(id: "a", name: "A", pixelSize: .init(width: 100, height: 100), placement: .controlPoints(points, method: .affine))
        let catalogue = DriveCatalogue(id: "cat", name: "Trip", sheetIDs: ["a"])
        for (index, lng, expected) in [(0, 0.005, ["a"]), (1, 0.012, ["a"]), (2, 0.012, [])] {
            let date = Date(timeIntervalSince1970: Double(index + 1))
            let fix = TrackFix(latitude: 0.005, longitude: lng, accuracyM: 10, timestamp: date)
            model.update(catalogue: catalogue, auto: true, records: [record], fix: fix, following: true, now: date)
            #expect(model.output.shown == expected)
        }
    }
}

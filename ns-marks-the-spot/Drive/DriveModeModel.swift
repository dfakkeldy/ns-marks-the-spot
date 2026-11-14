import Foundation
import GeoCore
import Observation

@MainActor @Observable
final class DriveModeModel {
    private(set) var isOn = false
    private(set) var output = SheetActivationOutput()
    private(set) var pinned: Set<String> = []
    private(set) var dismissed: Set<String> = []
    private(set) var autoPaused = false
    private(set) var locationUnavailable = false
    private(set) var hasUsableActivation = false
    private var manualNoticeID: String?
    private let screen: ScreenAwakeCoordinator
    private var state = SheetActivationState()
    private var activeCatalogueID: String?
    private var firstFix = true
    private var lastTimestamp: Date?
    private var sheets: [SheetActivationSheet] = []
    private var cachedRecords: [UserMapRecord] = []
    private var cachedIDs: [String] = []

    init(screen: ScreenAwakeCoordinator) { self.screen = screen }
    func setOn(_ on: Bool) {
        isOn = on
        screen.set(.driveMode, active: on)
    }
    private func reset() {
        state = SheetActivationState(); output = SheetActivationOutput()
        pinned = []; dismissed = []; activeCatalogueID = nil
        sheets = []; cachedRecords = []; cachedIDs = []
        firstFix = true; lastTimestamp = nil; autoPaused = false; locationUnavailable = false
        hasUsableActivation = false; manualNoticeID = nil
    }
    func update(catalogue: DriveCatalogue?, auto: Bool, records: [UserMapRecord], fix: TrackFix?, following: Bool,
                signalAvailable: Bool = true, now: Date = Date()) {
        guard auto, let catalogue else { reset(); return }
        if activeCatalogueID != catalogue.id {
            reset(); activeCatalogueID = catalogue.id
        }
        if records != cachedRecords || catalogue.sheetIDs != cachedIDs {
            cachedRecords = records; cachedIDs = catalogue.sheetIDs
            let byID = Dictionary(records.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            sheets = catalogue.sheetIDs.compactMap { id in
                guard let mesh = byID[id]?.mesh, let ring = SheetFootprint.ring(fromMesh: mesh) else { return nil }
                return SheetActivationSheet(id: id, ring: ring)
            }
        }
        guard following else {
            autoPaused = true; firstFix = true
            if let fix, fix.accuracyM.isFinite, fix.accuracyM > 0,
               fix.accuracyM <= SheetActivationConfig.maxAccuracyM,
               lastTimestamp.map({ fix.timestamp > $0 }) ?? true { lastTimestamp = fix.timestamp }
            let reason: SheetActivationOutput.Reason = fix.map {
                !$0.accuracyM.isFinite || $0.accuracyM <= 0 || $0.accuracyM > SheetActivationConfig.maxAccuracyM
                    ? .heldPoorFix : .updated
            } ?? output.reason
            output = SheetActivation.output(state: state, sheets: sheets, pinned: pinned, dismissed: dismissed)
            output.reason = reason
            clearResolvedNotice()
            return
        }
        if autoPaused { autoPaused = false; firstFix = true }
        guard signalAvailable, let fix,
              now.timeIntervalSince(fix.timestamp) >= -MapController.locateClockTolerance,
              now.timeIntervalSince(fix.timestamp) <= MapController.locateMaxFixAge else {
            locationUnavailable = true
            let reason = output.reason
            output = SheetActivation.output(state: state, sheets: sheets, pinned: pinned, dismissed: dismissed)
            output.reason = reason
            clearResolvedNotice()
            return
        }
        locationUnavailable = false
        if !fix.accuracyM.isFinite || fix.accuracyM <= 0 || fix.accuracyM > SheetActivationConfig.maxAccuracyM {
            let held = SheetActivation.step(state: state, sheets: sheets,
                fix: .init(point: .init(lat: fix.latitude, lng: fix.longitude), accuracyM: fix.accuracyM),
                pinned: pinned, dismissed: dismissed, isFirstFix: firstFix)
            output = held.output
            clearResolvedNotice()
            return
        }
        guard lastTimestamp.map({ fix.timestamp > $0 }) ?? true else {
            let reason = output.reason
            output = SheetActivation.output(state: state, sheets: sheets, pinned: pinned, dismissed: dismissed)
            output.reason = reason
            clearResolvedNotice()
            return
        }
        let result = SheetActivation.step(state: state, sheets: sheets,
            fix: .init(point: .init(lat: fix.latitude, lng: fix.longitude), accuracyM: fix.accuracyM),
            pinned: pinned, dismissed: dismissed, isFirstFix: firstFix)
        state = result.state; output = result.output
        clearResolvedNotice()
        if output.reason == .updated { firstFix = false; lastTimestamp = fix.timestamp; hasUsableActivation = true }
        for id in output.clearedDismissals { dismissed.remove(id) }
    }
    func setVisible(_ visible: Bool, id: String) {
        if visible {
            dismissed.remove(id)
            if !output.contained.contains(id) { pinned.insert(id) }
        } else {
            pinned.remove(id)
            if output.contained.contains(id) { dismissed.insert(id) }
        }
        let reason = output.reason
        output = SheetActivation.output(state: state, sheets: sheets, pinned: pinned, dismissed: dismissed)
        output.reason = reason
        manualNoticeID = visible && !output.shown.contains(id) ? id : nil
    }

    var manualNotice: String? {
        guard let id = manualNoticeID else { return nil }
        let name = cachedRecords.first(where: { $0.id == id })?.name ?? "Sheet"
        if !sheets.contains(where: { $0.id == id }) { return "\(name) is not placed on the map." }
        return "\(name) is outside the three-sheet limit. Change catalogue order to show it."
    }

    private func clearResolvedNotice() {
        if let id = manualNoticeID, output.shown.contains(id) { manualNoticeID = nil }
    }

    var topShownHere: String? {
        output.shown.first { state.sheets[$0]?.entered == true && state.sheets[$0]?.insideNow == true }
    }
    var topShownContained: String? { output.shown.first { output.contained.contains($0) } }
    func isInsideNow(_ id: String) -> Bool { state.sheets[id]?.insideNow == true }

    var insideCount: Int {
        sheets.filter { state.sheets[$0.id]?.entered == true && state.sheets[$0.id]?.insideNow == true }.count
    }
}

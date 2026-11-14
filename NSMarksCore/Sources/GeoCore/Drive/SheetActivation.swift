import Foundation

public enum SheetActivationConfig {
    public static let enterFixes = 2
    public static let exitMarginM = 60.0
    public static let exitFixes = 2
    public static let maxAccuracyM = 100.0
    public static let maxShown = 3
    public static let boundaryToleranceM = 0.000_001
}

public struct SheetActivationSheet: Sendable {
    public var id: String
    public var ring: [GeoPoint]
    public init(id: String, ring: [GeoPoint]) { self.id = id; self.ring = ring }
}

public struct SheetActivationFix: Sendable {
    public var point: GeoPoint
    public var accuracyM: Double
    public init(point: GeoPoint, accuracyM: Double) { self.point = point; self.accuracyM = accuracyM }
}

public struct SheetActivationOutput: Equatable, Sendable {
    public enum Status: String, Sendable { case overlap, onSheet, offSheets }
    public enum Reason: String, Sendable { case updated, heldPoorFix }
    public struct Nearest: Equatable, Sendable {
        public var id: String
        public var distanceM: Double
        public var bearingDegrees: Double?
    }
    public var shown: [String] = []
    public var contained: [String] = []
    public var status: Status = .offSheets
    public var nearest: Nearest?
    public var notDrawn = 0
    public var clearedDismissals: [String] = []
    public var reason: Reason = .updated
    public init() {}
}

public struct SheetActivationState: Sendable {
    public struct Sheet: Sendable {
        public var entered = false
        public var insideCount = 0
        public var outsideCount = 0
        public var insideNow = false
        public var distanceM: Double?
        public var nearest: SheetActivationOutput.Nearest?
        public init() {}
    }
    public var sheets: [String: Sheet] = [:]
    public var output = SheetActivationOutput()
    public init() {}
}

public enum SheetActivation {
    public static func step(
        state: SheetActivationState, sheets: [SheetActivationSheet], fix: SheetActivationFix,
        pinned: Set<String>, dismissed: Set<String>, isFirstFix: Bool
    ) -> (state: SheetActivationState, output: SheetActivationOutput) {
        guard fix.accuracyM.isFinite, fix.accuracyM > 0,
              fix.accuracyM <= SheetActivationConfig.maxAccuracyM,
              fix.point.lat.isFinite, fix.point.lng.isFinite else {
            var held = output(state: state, sheets: sheets, pinned: pinned, dismissed: dismissed)
            held.reason = .heldPoorFix
            held.clearedDismissals = []
            return (state, held)
        }
        var next = state
        let ids = Set(sheets.map(\.id))
        next.sheets = next.sheets.filter { ids.contains($0.key) }
        var cleared: [String] = []
        for sheet in sheets {
            guard let measurement = SheetFootprint.measure(from: fix.point, toRing: sheet.ring) else {
                next.sheets.removeValue(forKey: sheet.id)
                continue
            }
            let distance = measurement.distance
            var item = next.sheets[sheet.id] ?? .init()
            item.distanceM = distance
            let distanceToSheet = max(0, distance)
            item.nearest = .init(id: sheet.id, distanceM: distanceToSheet,
                                 bearingDegrees: distance <= 0 ? nil : Geodesy.initialBearingDegrees(from: fix.point, to: measurement.nearest))
            item.insideNow = distance <= 0
            if item.entered {
                if distance > max(SheetActivationConfig.exitMarginM, fix.accuracyM) {
                    item.outsideCount += 1
                } else {
                    item.outsideCount = 0
                }
                if item.outsideCount >= SheetActivationConfig.exitFixes {
                    item.entered = false
                    item.insideCount = 0
                    item.outsideCount = 0
                    if dismissed.contains(sheet.id) { cleared.append(sheet.id) }
                }
            } else {
                item.insideCount = item.insideNow ? item.insideCount + 1 : 0
                if item.insideCount >= (isFirstFix ? 1 : SheetActivationConfig.enterFixes) {
                    item.entered = true
                    item.outsideCount = 0
                }
            }
            next.sheets[sheet.id] = item
        }
        var result = output(state: next, sheets: sheets, pinned: pinned, dismissed: dismissed.subtracting(cleared))
        result.clearedDismissals = cleared
        next.output = result
        return (next, result)
    }

    /// Rebuild the presentation after a manual action without consuming a fix.
    public static func output(
        state: SheetActivationState, sheets: [SheetActivationSheet],
        pinned: Set<String>, dismissed: Set<String>
    ) -> SheetActivationOutput {
        let contained = sheets.filter { state.sheets[$0.id]?.entered == true }.map(\.id)
        let visible = sheets.filter {
            (pinned.contains($0.id) || state.sheets[$0.id]?.entered == true)
                && !dismissed.contains($0.id)
        }.map(\.id)
        var result = SheetActivationOutput()
        result.contained = contained
        result.shown = Array(visible.prefix(SheetActivationConfig.maxShown))
        result.notDrawn = max(0, visible.count - result.shown.count)
        let inside = sheets.filter {
            guard let item = state.sheets[$0.id] else { return false }
            return item.entered && item.insideNow
        }
        let overlapping = inside.count >= 2 && inside.contains { (state.sheets[$0.id]?.distanceM ?? 0) < 0 }
        result.status = overlapping ? .overlap : (contained.isEmpty ? .offSheets : .onSheet)
        if contained.isEmpty {
            let nearest = sheets.compactMap { state.sheets[$0.id]?.nearest }.min { $0.distanceM < $1.distanceM }
            result.nearest = nearest
        }
        return result
    }
}

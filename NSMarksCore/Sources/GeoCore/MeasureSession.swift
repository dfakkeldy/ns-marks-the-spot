import Foundation

/// A distance or area the user is measuring by tapping the map.
///
/// A port of the web's `MeasureTool`, minus the parts that are a mouse. The web
/// captures a hover to rubber-band the next segment and a double-click to
/// finish; a finger does neither, so on this surface the shape is only ever the
/// points actually placed, and finishing is a button.
///
/// Measurements are deliberately not saved. They are a question about the map,
/// asked and answered — not evidence, not a layer, and not something to carry
/// between launches. A measured distance is what this app's own geometry says,
/// which is not a survey and must not be read as one.
public struct MeasureSession: Equatable, Sendable {
    public enum Mode: String, Hashable, Sendable, CaseIterable {
        case distance, area
    }

    public private(set) var mode: Mode
    public private(set) var points: [GeoPoint]
    /// Whether the user has said the shape is complete.
    ///
    /// Only the wording changes, not the number: a distance across two points
    /// is the same distance before and after it is called finished. What it
    /// buys is the next tap — which starts a new measurement rather than
    /// extending one the user considers done.
    public private(set) var isFinished: Bool

    public init(mode: Mode) {
        self.mode = mode
        self.points = []
        self.isFinished = false
    }

    /// How many points this mode needs before there is anything to report.
    /// Three for an area, as in a ring: the closing point is the first one, and
    /// asking for it again would be asking the user to place the same corner
    /// twice.
    public var requiredPoints: Int {
        switch mode {
        case .distance: return 2
        case .area: return 3
        }
    }

    public var canFinish: Bool { points.count >= requiredPoints }
    public var isEmpty: Bool { points.isEmpty }

    public mutating func add(_ point: GeoPoint) {
        if isFinished {
            points = [point]
            isFinished = false
        } else {
            points.append(point)
        }
    }

    public mutating func undoLastPoint() {
        guard !points.isEmpty else { return }
        points.removeLast()
        // Undo reopens even a shape with enough points to finish, so the next
        // tap extends it instead of discarding it and starting over.
        isFinished = false
    }

    public mutating func clear() {
        points = []
        isFinished = false
    }

    public mutating func finish() {
        guard canFinish else { return }
        isFinished = true
    }

    /// The measurement in metres, or in square metres for an area. Zero until
    /// the shape has enough points to have a size at all.
    public var value: Double {
        switch mode {
        case .distance: return Geodesy.pathDistanceMetres(points)
        case .area: return Geodesy.polygonAreaSquareMetres(points)
        }
    }

    /// What the readout says — the same two sentences and the same formatting
    /// the web uses, so the two surfaces report one measurement in one wording.
    public var readout: String {
        guard canFinish else {
            switch mode {
            case .distance: return "Tap the map to measure distance"
            case .area: return "Tap the map to outline an area"
            }
        }
        switch mode {
        case .distance: return Geodesy.formatDistance(value)
        case .area: return Geodesy.formatArea(value)
        }
    }
}

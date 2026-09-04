import Foundation

/// The recording state machine: segments, raw-fix retention, live stats.
/// Ported from `web/src/location/trackRecorder.ts`; pure, with the clock
/// passed in, so tests script it fix by fix. Pause closes the current segment
/// and resume opens a new one with fresh filter state — no connector is drawn
/// or stored across a gap, and smoothing never drags across time the user
/// wasn't recording. When a segment closes, the last accepted fix is appended
/// if spacing had suppressed it, so the track ends where the user actually
/// stopped (the contract's final-fix rule).
public struct TrackRecording: Sendable {
    public enum Status: String, Sendable {
        case idle, recording, paused
    }

    public struct StopResult: Sendable {
        public var startedAt: Date
        public var endedAt: Date
        /// Filtered, smoothed vertices per recording segment.
        public var segments: [[TrackPoint]]
        /// Every fix received while recording, kept and dropped alike.
        public var rawSegments: [[TrackFix]]
        public var rawFixCount: Int
        public var acceptedFixCount: Int
        public var distanceM: Double
        public var recordingSeconds: Double

    }

    public struct Stats: Sendable {
        public var status: Status
        public var elapsedSeconds: Double
        public var distanceM: Double
        public var keptVertexCount: Int
    }

    public private(set) var status: Status = .idle
    private var startedAt = Date.distantPast
    private var recordingSeconds = 0.0
    private var resumedAt = Date.distantPast
    private var distanceM = 0.0
    private var keptCount = 0
    private var acceptedCount = 0
    private var rawCount = 0
    private var filter = TrackFilterState()
    private var segments: [[TrackPoint]] = []
    private var rawSegments: [[TrackFix]] = []

    public init() {}

    private mutating func openSegment() {
        segments.append([])
        rawSegments.append([])
        filter = TrackFilterState()
    }

    private mutating func closeSegment() {
        guard let last = filter.lastAccepted, var segment = segments.last,
              segment.last != last
        else { return }
        if let previous = segment.last {
            distanceM += Geodesy.distanceMetres(
                from: GeoPoint(lat: previous.lat, lng: previous.lng),
                to: GeoPoint(lat: last.lat, lng: last.lng)
            )
        }
        segment.append(last)
        segments[segments.count - 1] = segment
        keptCount += 1
    }

    public mutating func start(now: Date) {
        guard status == .idle else { return }
        status = .recording
        startedAt = now
        resumedAt = now
        openSegment()
    }

    public mutating func pause(now: Date) {
        guard status == .recording else { return }
        closeSegment()
        recordingSeconds += now.timeIntervalSince(resumedAt)
        status = .paused
    }

    public mutating func resume(now: Date) {
        guard status == .paused else { return }
        status = .recording
        resumedAt = now
        openSegment()
    }

    public mutating func stop(now: Date) -> StopResult? {
        guard status != .idle else { return nil }
        if status == .recording {
            closeSegment()
            recordingSeconds += now.timeIntervalSince(resumedAt)
        }
        status = .idle
        return StopResult(
            startedAt: startedAt,
            endedAt: now,
            segments: segments,
            rawSegments: rawSegments,
            rawFixCount: rawCount,
            acceptedFixCount: acceptedCount,
            distanceM: distanceM,
            recordingSeconds: recordingSeconds
        )
    }

    /// Feeds one fix through the contract filter. Returns whether it became
    /// a vertex.
    @discardableResult
    public mutating func addFix(_ fix: TrackFix) -> Bool {
        guard status == .recording else { return false }
        rawSegments[rawSegments.count - 1].append(fix)
        rawCount += 1
        let result = TrackFilter.applyFix(filter, fix: fix)
        filter = result.next
        if result.accepted != nil {
            acceptedCount += 1
        }
        if let accepted = result.accepted, result.kept {
            if let previous = segments[segments.count - 1].last {
                distanceM += Geodesy.distanceMetres(
                    from: GeoPoint(lat: previous.lat, lng: previous.lng),
                    to: GeoPoint(lat: accepted.lat, lng: accepted.lng)
                )
            }
            segments[segments.count - 1].append(accepted)
            keptCount += 1
        }
        return result.kept
    }

    /// Whether the last fix offered was turned away by the filter — the HUD's
    /// red state.
    ///
    /// Not the accuracy gate alone: a fix that arrives before the last one it
    /// is measured against, or implies a speed nobody walks, is refused too,
    /// and the HUD must not tell the reader their position is too rough when
    /// it was the clock or the jump that failed.
    public var lastFixGated: Bool {
        guard let lastRaw = rawSegments.last?.last else { return false }
        return lastRaw != filter.lastAcceptedRaw
    }

    public func stats(now: Date) -> Stats {
        Stats(
            status: status,
            elapsedSeconds: status == .recording
                ? recordingSeconds + now.timeIntervalSince(resumedAt)
                : recordingSeconds,
            distanceM: distanceM,
            keptVertexCount: keptCount
        )
    }

    /// Current vertices for the live trace, one array per segment.
    public var liveSegments: [[GeoJsonPosition]] {
        segments.map { segment in
            segment.map { GeoJsonPosition(lng: $0.lng, lat: $0.lat) }
        }
    }

    /// The most recent accepted fix's reported accuracy, for the HUD's
    /// quality dot. Nil before the first accepted fix of the segment.
    public var lastAcceptedAccuracyM: Double? {
        filter.lastAccepted?.accuracyM
    }

    /// What the recording can honestly say about its fixes.
    ///
    /// Four states rather than a colour, kept apart because they mean
    /// different things to someone walking a line: nothing has been offered
    /// yet, the last position was turned away and the track did not grow, or
    /// a position was taken at the radius the device reported for it. None of
    /// them says anything about the receiver. The recording knows only what it
    /// was handed and what it did with it, so it never claims a signal is
    /// present, weak or lost.
    public enum FixQuality: Equatable, Sendable {
        /// Nothing has been started. Not the same as paused: a walk that never
        /// began was not interrupted, and telling a reader it is paused is the
        /// conflation this type exists to remove one case further down.
        case idle
        case paused
        case waiting
        case rejected
        case accepted(accuracyM: Double)

        /// The state in words, for the HUD to show beside the dot.
        public var summary: String {
            switch self {
            case .idle: "Not recording."
            case .paused: "Paused; no positions are being taken."
            case .waiting: "Waiting for a position; nothing has been added yet."
            case .rejected: "Last position rejected; the track is not growing."
            case .accepted(let accuracyM):
                // The same rounding rule as every other radius the app puts on
                // screen, so the HUD cannot flatter a fix the callouts would
                // report a metre wider.
                "Last position accepted, ±\(VectorFeatureCallout.accuracyLabel(accuracyM)) m."
            }
        }
    }

    /// The current state of the fixes, for the HUD.
    ///
    /// Read per segment. Resume opens a fresh filter, so the accuracy from
    /// before a gap says nothing about the ground being walked now, and the
    /// HUD waits again rather than showing a number it no longer holds.
    /// Idle, paused and recording are three answers, not two. A walk that
    /// never began was not interrupted.
    public var fixQuality: FixQuality {
        switch status {
        case .idle: return .idle
        case .paused: return .paused
        case .recording: break
        }
        if lastFixGated { return .rejected }
        guard let accuracyM = lastAcceptedAccuracyM else { return .waiting }
        return .accepted(accuracyM: accuracyM)
    }
}

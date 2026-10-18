import Foundation

/// A recording written down while it happens, so that a walk survives the
/// process that was walking it.
///
/// **What is stored is the recorder's input, never its output.** The fixes as
/// they arrived, and the instants the reader started, paused, resumed and
/// stopped — nothing else. Replaying those through `TrackRecording` rebuilds
/// the same walk it would have held in memory: the same segments, the same
/// smoothing, the same distance, the same counters. So there is no second
/// implementation of the arithmetic to fall out of step with the first, and no
/// derived number is ever read back as though it had been recorded.
///
/// **Append-only, one JSON object per line.** Fixes arrive about once a second
/// and a walk can run for hours. Rewriting the whole recording per fix would
/// cost a quadratic number of bytes over a walk, and — worse — would leave the
/// only copy of it half-written for the length of every rewrite. A line is
/// appended to the end and nothing already on disk is touched.
///
/// The format is written out by hand rather than synthesized. This is a file
/// on a reader's phone that a later build has to read: the discriminator, the
/// key names and the absence of an altitude are decisions, not whatever the
/// compiler happened to emit for an enum this month.
public enum TrackJournal {
    /// One thing that happened to a recording.
    public enum Entry: Hashable, Sendable {
        case started(id: UUID, at: Date)
        case fix(TrackFix)
        case paused(at: Date)
        case resumed(at: Date)
        /// The reader stopped the walk. The journal stays on disk after this:
        /// a stopped walk that has not been saved is still the only copy of
        /// it.
        case stopped(at: Date)

        /// When it happened, for closing a walk the journal ran out on.
        var at: Date {
            switch self {
            case .started(_, let at), .paused(let at), .resumed(let at), .stopped(let at):
                at
            case .fix(let fix):
                fix.timestamp
            }
        }
    }

    // MARK: - The format

    private enum Key: String, CodingKey {
        case kind, id, at, lat, lng, alt, acc
    }

    private enum Kind: String, Codable {
        case start, fix, pause, resume, stop
    }

    /// The bytes for one entry, newline-terminated, ready to append.
    ///
    /// Returns nil only if the entry cannot be encoded at all, which for plain
    /// numbers and a UUID it cannot — but the caller is handed the choice
    /// rather than a crash, because this runs on every fix of every walk.
    public static func line(for entry: Entry) -> Data? {
        let encoder = JSONEncoder()
        // Deterministic output. Without it the key order of a JSON object is
        // unspecified and varies between calls, so the same fix written twice
        // is two different lines — which makes the file impossible to diff, and
        // makes "this append changed nothing before it" impossible to check.
        encoder.outputFormatting = .sortedKeys
        guard var data = try? encoder.encode(Line(entry: entry)) else { return nil }
        data.append(0x0A)
        return data
    }

    /// A whole journal's bytes, for a test or a first write.
    public static func encode(_ entries: [Entry]) -> Data {
        entries.reduce(into: Data()) { bytes, entry in
            if let line = line(for: entry) { bytes.append(line) }
        }
    }

    /// Reads a journal back, stopping at the first line that does not decode.
    ///
    /// A process killed in the middle of an append leaves a partial last line.
    /// Everything before it was written whole and is the walk; the fragment is
    /// not a fix and is not guessed at. Stopping rather than skipping is
    /// deliberate — a journal is a sequence, and a line that cannot be read is
    /// a gap the lines after it cannot be placed across.
    public static func decode(_ data: Data) -> [Entry] {
        let decoder = JSONDecoder()
        var entries: [Entry] = []
        for line in data.split(separator: 0x0A, omittingEmptySubsequences: true) {
            guard let decoded = try? decoder.decode(Line.self, from: Data(line)) else {
                return entries
            }
            entries.append(decoded.entry)
        }
        return entries
    }

    /// One line, and the whole of the on-disk shape.
    private struct Line: Codable {
        let entry: Entry

        init(entry: Entry) { self.entry = entry }

        func encode(to encoder: any Encoder) throws {
            var container = encoder.container(keyedBy: Key.self)
            switch entry {
            case .started(let id, let at):
                try container.encode(Kind.start, forKey: .kind)
                try container.encode(id, forKey: .id)
                try container.encode(at.timeIntervalSince1970, forKey: .at)
            case .fix(let fix):
                try container.encode(Kind.fix, forKey: .kind)
                try container.encode(fix.latitude, forKey: .lat)
                try container.encode(fix.longitude, forKey: .lng)
                // Omitted when the fix carried none, never written as zero:
                // an altitude of zero metres is a claim about the ground.
                try container.encodeIfPresent(fix.altitudeM, forKey: .alt)
                try container.encode(fix.accuracyM, forKey: .acc)
                try container.encode(fix.timestamp.timeIntervalSince1970, forKey: .at)
            case .paused(let at):
                try container.encode(Kind.pause, forKey: .kind)
                try container.encode(at.timeIntervalSince1970, forKey: .at)
            case .resumed(let at):
                try container.encode(Kind.resume, forKey: .kind)
                try container.encode(at.timeIntervalSince1970, forKey: .at)
            case .stopped(let at):
                try container.encode(Kind.stop, forKey: .kind)
                try container.encode(at.timeIntervalSince1970, forKey: .at)
            }
        }

        init(from decoder: any Decoder) throws {
            let container = try decoder.container(keyedBy: Key.self)
            let kind = try container.decode(Kind.self, forKey: .kind)
            let at = Date(
                timeIntervalSince1970: try container.decode(Double.self, forKey: .at)
            )
            switch kind {
            case .start:
                entry = .started(id: try container.decode(UUID.self, forKey: .id), at: at)
            case .fix:
                entry = .fix(
                    TrackFix(
                        latitude: try container.decode(Double.self, forKey: .lat),
                        longitude: try container.decode(Double.self, forKey: .lng),
                        altitudeM: try container.decodeIfPresent(Double.self, forKey: .alt),
                        accuracyM: try container.decode(Double.self, forKey: .acc),
                        timestamp: at
                    )
                )
            case .pause:
                entry = .paused(at: at)
            case .resume:
                entry = .resumed(at: at)
            case .stop:
                entry = .stopped(at: at)
            }
        }
    }

    // MARK: - Reading a walk back

    /// A walk rebuilt from its journal, and what happened to it.
    public struct Restored: Sendable {
        /// The walk's own identifier, minted when it started and carried
        /// through to the layer it is saved as — so a save that completed and
        /// was interrupted before the journal could be cleared cannot write a
        /// second layer for the same walk.
        public var id: UUID
        public var result: TrackRecording.StopResult
        /// True when the journal ran out with the walk still going: the
        /// process was ended under it. False when the reader stopped the walk
        /// and it was never saved. Two different things to tell someone, and
        /// only one of them says fixes stopped arriving without anyone asking.
        public var wasInterrupted: Bool

        public init(id: UUID, result: TrackRecording.StopResult, wasInterrupted: Bool) {
            self.id = id
            self.result = result
            self.wasInterrupted = wasInterrupted
        }
    }

    /// Rebuilds the walk by feeding the journal back through the same state
    /// machine that produced it.
    ///
    /// Nil when the entries are not a walk — nothing was written, or the first
    /// line is not a start. Not the same as a walk with no fixes in it, which
    /// is a real recording that collected nothing and is returned as one.
    ///
    /// An interrupted walk is closed at **the last thing the journal saw**,
    /// never at the current time. An app terminated at ten in the morning and
    /// reopened at six in the evening did not record for eight hours, and a
    /// walk that says it did is a fabricated measurement.
    public static func replay(_ entries: [Entry]) -> Restored? {
        guard case .started(let id, let startedAt)? = entries.first else { return nil }
        var recording = TrackRecording()
        recording.start(now: startedAt)
        // Monotonic on purpose. A fix carries the device's timestamp for it and
        // a pause carries the wall clock, so the two can cross by a moment;
        // closing a walk at an instant before it resumed would bank negative
        // seconds.
        var lastSeen = startedAt
        for entry in entries.dropFirst() {
            lastSeen = max(lastSeen, entry.at)
            switch entry {
            case .fix(let fix):
                recording.addFix(fix)
            case .paused:
                recording.pause(now: lastSeen)
            case .resumed:
                recording.resume(now: lastSeen)
            case .stopped:
                guard let result = recording.stop(now: lastSeen) else { return nil }
                return Restored(id: id, result: result, wasInterrupted: false)
            case .started:
                // A second start in one file is not a walk this can read. The
                // journal holds one recording; two would mean the file was
                // reused without being cleared, and guessing which one the
                // reader meant is not something to do with the only copy.
                return nil
            }
        }
        guard let result = recording.stop(now: lastSeen) else { return nil }
        return Restored(id: id, result: result, wasInterrupted: true)
    }
}

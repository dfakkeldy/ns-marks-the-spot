import Foundation
import GeoCore

/// A walk that has been stopped and not yet saved, held on disk.
///
/// Stop from the Lock Screen created a way to lose a walk that the map's own
/// Stop never had. On the map, Stop opens the save sheet immediately and the
/// reader is looking at it. On a locked phone the sheet cannot be shown, so the
/// stopped walk waited in memory for the app to be opened — and iOS terminates
/// backgrounded apps. The walk would have been gone with no trace and no
/// message: the reader pressed Stop, was told nothing was wrong, and found
/// nothing when they looked.
///
/// So it is written down before the recorder is cleared, and deleted only when
/// the reader has saved it or said to discard it. One file, replaced whole; a
/// walk is the only thing that can be pending, and a newer one supersedes an
/// older one rather than queueing behind it.
@MainActor
final class PendingTrackSaveStore {
    /// What was stopped, and the one thing the save sheet needs to know about
    /// how it ended.
    struct Pending: Codable {
        var result: TrackRecording.StopResult
        var stoppedWhileRefused: Bool
    }

    private let file: URL

    init(directory: URL) {
        file = directory.appendingPathComponent("pending-track-save.json")
    }

    /// The app's own support directory, made if it is not there.
    static func inApplicationSupport() -> PendingTrackSaveStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first ?? FileManager.default.temporaryDirectory
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return PendingTrackSaveStore(directory: base)
    }

    /// Reads what is waiting, or nil.
    ///
    /// A file that cannot be decoded is not a walk, and is removed rather than
    /// left to fail again at every launch. That loses nothing a reader could
    /// have had: an undecodable walk cannot be saved either.
    /// What is waiting, or why nothing is.
    ///
    /// Three answers rather than one, because "there is no walk" and "there is
    /// a walk this app could not read" are different facts and the second one
    /// is a walk. Merging them would have told a reader whose file was
    /// momentarily unreadable — a protected file at a locked screen, an I/O
    /// error, a truncation — that their walk had never existed.
    enum Reading {
        case none
        case pending(Pending)
        /// The bytes are there and could not be turned into a walk. **Kept**:
        /// deleting them is a discard the reader never asked for, and the file
        /// may be readable later or recoverable by hand.
        case unreadable
    }

    func read() -> Reading {
        guard FileManager.default.fileExists(atPath: file.path) else { return .none }
        guard let data = try? Data(contentsOf: file) else { return .unreadable }
        guard let pending = try? JSONDecoder().decode(Pending.self, from: data) else {
            return .unreadable
        }
        return .pending(pending)
    }

    /// Written before the recorder is cleared, so a termination between the
    /// two loses nothing.
    @discardableResult
    func write(_ pending: Pending) -> Bool {
        guard let data = try? JSONEncoder().encode(pending) else { return false }
        do {
            try data.write(to: file, options: .atomic)
            // Out of backups, every time: an atomic write replaces the file,
            // and a replaced file does not keep the flag. This holds raw
            // fixes with their timestamps and accuracies, and both the HUD and
            // the Info.plist tell the reader that stays on this device — a
            // temporary recovery copy riding into an iCloud backup would make
            // that untrue without anyone exporting anything.
            var url = file
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? url.setResourceValues(values)
            return true
        } catch {
            return false
        }
    }

    /// Only after the reader has saved the walk or said to throw it away.
    func clear() {
        try? FileManager.default.removeItem(at: file)
    }
}

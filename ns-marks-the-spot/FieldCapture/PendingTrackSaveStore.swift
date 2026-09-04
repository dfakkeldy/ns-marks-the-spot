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
    func read() -> Pending? {
        guard let data = try? Data(contentsOf: file) else { return nil }
        guard let pending = try? JSONDecoder().decode(Pending.self, from: data) else {
            clear()
            return nil
        }
        return pending
    }

    /// Written before the recorder is cleared, so a termination between the
    /// two loses nothing.
    @discardableResult
    func write(_ pending: Pending) -> Bool {
        guard let data = try? JSONEncoder().encode(pending) else { return false }
        do {
            try data.write(to: file, options: .atomic)
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

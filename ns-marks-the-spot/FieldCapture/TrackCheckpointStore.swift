import Foundation
import GeoCore

/// Where a walk in progress is written down.
///
/// An in-progress recording used to live only in `TrackRecorder.recording`.
/// While recording was foreground-only that was survivable — the reader was
/// looking at the phone, so a termination was something they would witness.
/// Since the walk continues in a pocket it is not: iOS ends backgrounded
/// processes whenever it likes, and the reader would have found forty minutes
/// of walking gone with no message and nothing to look at.
///
/// So every fix and every segment boundary is appended to a file as it
/// happens, and the file is cleared only when the reader has saved the walk or
/// said to throw it away. `TrackJournal` owns the format and the replay; this
/// owns the disk.
///
/// **The bytes are never thrown away on this side.** A file that cannot be
/// read as a walk is moved aside rather than deleted: it is the only copy of
/// something, and "unreadable by this build" is not the same as "worthless".
@MainActor
final class TrackCheckpointStore {
    /// What was on disk when the app launched.
    enum Found {
        /// Nothing was written down. No walk was interrupted.
        case none
        /// A walk, and what happened to it.
        case walk(TrackJournal.Restored)
        /// Something was there and this build could not read a walk out of it
        /// — empty, or damaged past its first line. Reported rather than
        /// swallowed: an unreadable checkpoint is a walk that may have existed,
        /// and saying "no walk" to that is the one answer that is certainly
        /// wrong. `keptAt` is where the bytes went.
        case unreadable(keptAt: URL?)
    }

    private let directory: URL
    private let fileManager: FileManager
    private var handle: FileHandle?

    /// Whether the walk in progress is actually reaching the disk.
    ///
    /// False after an append fails — a full disk is the case, and it will fail
    /// again — so the reader can be told that the walk is no longer being
    /// written down. A recorder that has quietly stopped checkpointing while
    /// the HUD says "Recording" is the same merge of *blocked* into *working*
    /// that the background notice exists to prevent.
    private(set) var isWritingDown = true

    var file: URL { directory.appendingPathComponent("recording.jsonl") }

    init(directory: URL) {
        self.directory = directory
        fileManager = .default
        Self.ensureDirectory(directory, fileManager)
    }

    /// The app's own checkpoint directory, made if it is not there.
    ///
    /// Its own directory rather than a file loose in Application Support,
    /// because the backup exclusion below lives on a directory.
    static func inApplicationSupport() -> TrackCheckpointStore {
        let manager = FileManager.default
        let base = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? manager.temporaryDirectory
        return TrackCheckpointStore(
            directory: base.appendingPathComponent("TrackCheckpoint", isDirectory: true)
        )
    }

    /// Creates the directory and keeps it out of backups.
    ///
    /// Excluded because this is machine state, not the reader's library. A
    /// walk restored from a backup onto another phone would be a recording
    /// offered to someone whose phone never took it — and the saved layers,
    /// which *are* the library, are backed up as they always were.
    private static func ensureDirectory(_ directory: URL, _ fileManager: FileManager) {
        guard !fileManager.fileExists(atPath: directory.path) else { return }
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        var url = directory
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
    }

    // MARK: - Writing

    /// Starts a journal for a new walk. Answers whether the walk is being
    /// written down.
    ///
    /// A file already there is moved aside rather than overwritten. It can only
    /// be a walk nobody has saved or discarded, and the first thing a new
    /// recording would otherwise do is destroy it.
    @discardableResult
    func begin(id: UUID, startedAt: Date) -> Bool {
        close()
        if fileManager.fileExists(atPath: file.path) { setAside() }
        Self.ensureDirectory(directory, fileManager)
        isWritingDown = fileManager.createFile(
            atPath: file.path,
            contents: nil,
            // The phone is in a pocket and may be locked when the next fix
            // arrives. This class is writable from first unlock onward, which
            // is what a walk that continues off screen needs; `.complete`
            // would fail every append made behind a lock screen.
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
        guard isWritingDown else { return false }
        handle = try? FileHandle(forWritingTo: file)
        isWritingDown = handle != nil
        return append(.started(id: id, at: startedAt))
    }

    /// Appends one thing that happened. Answers whether it landed.
    @discardableResult
    func append(_ entry: TrackJournal.Entry) -> Bool {
        guard isWritingDown, let handle, let line = TrackJournal.line(for: entry) else {
            return false
        }
        do {
            try handle.write(contentsOf: line)
        } catch {
            // The disk filled, or the file went away underneath us. Stop
            // trying — every following fix would fail the same way — and let
            // the recorder say so.
            isWritingDown = false
            close()
            return false
        }
        return true
    }

    /// Gives up the file handle without touching the bytes. The stopped walk
    /// stays on disk until it is saved or discarded.
    func close() {
        try? handle?.close()
        handle = nil
    }

    /// The walk has been saved to a layer, or the reader threw it away. This
    /// is the only thing that removes a checkpoint.
    func clear() {
        close()
        try? fileManager.removeItem(at: file)
        isWritingDown = true
    }

    // MARK: - Reading

    /// What is waiting, if anything.
    ///
    /// Read once at launch, before anything can record over it. It deliberately
    /// does not touch the write handle: a read that closed one would silently
    /// stop a walk being written down, which is a worse outcome than reading a
    /// journal that is still growing.
    func read() -> Found {
        guard let data = try? Data(contentsOf: file) else {
            // Nothing there. Distinct from a file that is there and says
            // nothing, which is the case below.
            return .none
        }
        guard let restored = TrackJournal.replay(TrackJournal.decode(data)) else {
            return .unreadable(keptAt: setAside())
        }
        return .walk(restored)
    }

    /// Moves the current file out of the way, keeping it, and answers where it
    /// went — or nil if it could not be moved, in which case it is still
    /// exactly where it was.
    ///
    /// Nothing sweeps these. They are only made when a checkpoint could not be
    /// read as a walk, which should not happen at all, and deleting the one
    /// copy of a recording to save a few hundred kilobytes is the wrong trade.
    @discardableResult
    private func setAside() -> URL? {
        let destination = directory.appendingPathComponent(
            "recording-kept-\(UUID().uuidString).jsonl"
        )
        do {
            try fileManager.moveItem(at: file, to: destination)
            return destination
        } catch {
            return nil
        }
    }
}

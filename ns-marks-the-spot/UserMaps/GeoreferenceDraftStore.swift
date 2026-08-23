import Foundation
import GeoCore

/// Where a half-finished placement lives between the moment it is made and the
/// moment it is saved.
///
/// The session inside the georeferencer is view state. A user who places forty
/// points over an hour and is then jetsammed — which a large scan under MapKit
/// invites — loses every one of them, and nothing on the device ever knew they
/// existed. The browser guards the same work by writing periodic points files;
/// this is the same guarantee where iOS actually allows it, in the app's own
/// container.
///
/// The file is the points file, not a private encoding. A draft that outlives
/// the build that wrote it is still readable by the importer, and by the
/// browser, and by the Python tooling.
struct GeoreferenceDraftStore {
    /// A draft as found on disk, with the moment it was written.
    struct Draft {
        var controls: [SessionControlPoint]
        var checks: [GroundControlPoint]
        var checkLabels: [String]
        var savedAt: Date
    }

    private let directory: URL
    private let fileManager: FileManager

    init(directory: URL? = nil, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        if let directory {
            self.directory = directory
        } else {
            let applicationSupport = fileManager.urls(
                for: .applicationSupportDirectory, in: .userDomainMask
            )[0]
            self.directory = applicationSupport.appendingPathComponent(
                "GeoreferenceDrafts", isDirectory: true
            )
        }
    }

    /// The id is a UUID string this app minted, never a name the user typed,
    /// so it cannot walk out of this directory. Checked anyway, because the
    /// day someone lets a filename in through here is the day this comment
    /// stops being true.
    private func url(for identifier: String) -> URL? {
        guard !identifier.isEmpty, !identifier.contains("/"), identifier != ".",
              identifier != ".."
        else { return nil }
        return directory.appendingPathComponent("\(identifier).csv", isDirectory: false)
    }

    /// Writes the working points, or removes the draft when there are none.
    ///
    /// Failures are swallowed on purpose. This runs on every change to a live
    /// editing session, and a disk that is full, or a container that is locked
    /// while the phone is, is not something to interrupt a placement over.
    /// The placement itself is unharmed, and Save still works.
    func write(
        identifier: String,
        name: String,
        controls: [SessionControlPoint],
        checks: [GroundControlPoint],
        checkLabels: [String],
        at date: Date = Date()
    ) {
        guard let url = url(for: identifier) else { return }
        guard !controls.isEmpty else {
            discard(identifier: identifier)
            return
        }
        let text = FletcherGcpFile.snapshot(
            name: name, controls: controls, checks: checks,
            checkLabels: checkLabels, at: date
        )
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try? Data(text.utf8).write(to: url, options: .atomic)
    }

    /// The draft for a scan, if there is one that still reads.
    ///
    /// An unreadable draft is treated as no draft rather than as an error.
    /// Offering to restore something that cannot be parsed would put a failure
    /// in front of a user who has done nothing wrong, and the placement they
    /// are opening is unaffected either way.
    func draft(identifier: String) -> Draft? {
        guard let url = url(for: identifier),
              let text = try? String(contentsOf: url, encoding: .utf8),
              let parsed = try? FletcherGcpFile.parse(text)
        else { return nil }
        let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?
            .contentModificationDate
        return Draft(
            controls: parsed.controls,
            checks: parsed.checks,
            checkLabels: parsed.rows.filter { $0.role == .check }.map(\.id),
            savedAt: modified ?? Date()
        )
    }

    func discard(identifier: String) {
        guard let url = url(for: identifier) else { return }
        try? fileManager.removeItem(at: url)
    }

    /// Drops the drafts whose map the library no longer lists.
    ///
    /// A draft is named by the row it belongs to and by nothing else. Stop the
    /// app between deleting a map and discarding its draft, or have the removal
    /// itself fail, and the points file is left behind for a map that does not
    /// exist: forty places the user has stood, unreachable, kept for the life
    /// of the install. Deleting the app is the only thing that clears it.
    ///
    /// `identifiers` must come from a library read that succeeded. "No maps"
    /// and "the maps could not be read" are not the same statement, and
    /// sweeping against the second takes every draft on the device.
    func sweepOrphans(keeping identifiers: Set<String>) {
        guard let files = try? fileManager.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        ) else { return }
        for file in files where file.pathExtension == "csv" {
            let identifier = file.deletingPathExtension().lastPathComponent
            guard !identifiers.contains(identifier) else { continue }
            try? fileManager.removeItem(at: file)
        }
    }
}

import CoreGraphics
import Foundation
import GeoCore
import ImageIO
import NSDataServices
import Testing
import UniformTypeIdentifiers

@testable import ns_marks_the_spot

/// A directory of its own for each test, removed afterwards.
///
/// The real store writes to Application Support, which is one directory shared
/// by every test in the process — and what ends up in a file is the thing being
/// tested here.
private func withLibraryDirectory(
    _ body: (URL) async throws -> Void
) async throws {
    let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer {
        // Permissions are put back first: a test that made the directory
        // read-only to force a write failure leaves one that cannot be removed.
        try? FileManager.default.setAttributes(
            [.posixPermissions: 0o755], ofItemAtPath: directory.path
        )
        try? FileManager.default.removeItem(at: directory)
    }
    try await body(directory)
}

/// A small image, as a file of the given type.
///
/// `marked` blacks out the quarter in the stored raster's top-left, which is
/// what makes a turn measurable. A solid colour proves only that the decode
/// swapped the dimensions: rotating the wrong way, or mirroring the pixels,
/// leaves a plain rectangle looking exactly the same.
private func image(
    width: Int = 40, height: Int = 40, type: UTType = .png, orientation: Int? = nil,
    marked: Bool = false
) throws -> Data {
    let context = try #require(
        CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
    )
    context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    if marked {
        context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
        // A bitmap context counts upwards from the bottom, so the top-left
        // quarter of the stored rows is drawn at the high end of y.
        context.fill(
            CGRect(
                x: 0, y: Double(height) / 2,
                width: Double(width) / 2, height: Double(height) / 2
            )
        )
    } else {
        context.setFillColor(CGColor(red: 0.4, green: 0.6, blue: 0.4, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    }
    let bitmap = try #require(context.makeImage())
    let out = NSMutableData()
    let destination = try #require(
        CGImageDestinationCreateWithData(out, type.identifier as CFString, 1, nil)
    )
    let properties = orientation.map { [kCGImagePropertyOrientation: $0] as CFDictionary }
    CGImageDestinationAddImage(destination, bitmap, properties)
    #expect(CGImageDestinationFinalize(destination))
    return out as Data
}

/// Where the dark ink in an image sits, as fractions across and down.
///
/// Read out of the pixels rather than reasoned about. A rectangle's corners
/// survive being mirrored, so extents and dimensions cannot tell an upright
/// picture from a turned one. Ink can.
private func inkCentre(of image: CGImage) throws -> (across: Double, down: Double) {
    let width = image.width
    let height = image.height
    // CoreGraphics owns the buffer. Lending it an array's storage would mean
    // reading through a pointer that escaped the array's lifetime.
    let context = try #require(
        CGContext(
            data: nil, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
    )
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    let drawn = try #require(context.data).assumingMemoryBound(to: UInt8.self)
    var sumX = 0.0
    var sumY = 0.0
    var count = 0.0
    for row in 0..<height {
        for column in 0..<width {
            let offset = (row * width + column) * 4
            let luma = Double(drawn[offset]) + Double(drawn[offset + 1])
                + Double(drawn[offset + 2])
            guard luma < 240 else { continue }
            sumX += Double(column)
            sumY += Double(row)
            count += 1
        }
    }
    try #require(count > 0, "the image has no dark ink in it at all")
    return (sumX / count / Double(width), sumY / count / Double(height))
}

/// The library file, as bytes, or nil when there is none.
private func libraryBytes(in directory: URL) -> Data? {
    try? Data(contentsOf: directory.appendingPathComponent("library.json"))
}

@Suite("The user's own maps, and what reaches the disk")
@MainActor
struct UserMapsLibraryTests {
    @Test("A library this build cannot read is never written over")
    func aSealedLibraryIsLeftAlone() async throws {
        try await withLibraryDirectory { directory in
            // A document from a later build. The user's maps are in it; this
            // build cannot decode them, and the panel shows no rows. The next
            // import is the dangerous moment: a library rebuilt from the rows
            // this session happens to hold is an empty one plus the new map,
            // and writing it destroys everything the file held.
            let existing = Data(#"{"version":999,"maps":[]}"#.utf8)
            try existing.write(to: directory.appendingPathComponent("library.json"))

            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()
            #expect(viewModel.isLibrarySealed)
            #expect(viewModel.rows.isEmpty)

            await viewModel.importMap(data: try image(), name: "New scan")
            #expect(viewModel.rows.isEmpty)
            #expect(libraryBytes(in: directory) == existing)
            #expect(viewModel.notices.count == 1)
            #expect(viewModel.notices.first?.isRefusal == true)
        }
    }

    /// One paragraph, and every file it turned away named in it. A batch of
    /// three scans that produced one message reading "Your maps" leaves the
    /// reader to work out whether any of the three landed.
    @Test("A sealed library names every file it turned away")
    func aSealedLibraryNamesEveryFileItTurnedAway() async throws {
        try await withLibraryDirectory { directory in
            let existing = Data(#"{"version":999,"maps":[]}"#.utf8)
            try existing.write(to: directory.appendingPathComponent("library.json"))
            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()
            #expect(viewModel.isLibrarySealed)

            viewModel.beginImports()
            for name in ["north", "south", "east"] {
                await viewModel.importMap(
                    data: try image(), name: name, filename: "\(name).png"
                )
            }

            #expect(viewModel.rows.isEmpty)
            #expect(libraryBytes(in: directory) == existing)
            #expect(viewModel.notices.count == 1)
            #expect(viewModel.notices.first?.name == "north.png, south.png, east.png")
        }
    }

    @Test("An ordinary empty library is not sealed")
    func aFirstRunIsNotAFailure() async throws {
        try await withLibraryDirectory { directory in
            // No file at all is a device that has never imported a map, not one
            // whose library could not be read. Sealing here would leave a new
            // user unable to import anything at all.
            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()
            #expect(!viewModel.isLibrarySealed)

            await viewModel.importMap(data: try image(), name: "First scan")
            #expect(viewModel.rows.count == 1)
        }
    }

    /// The browser's promise, and now this app's: a save failure never
    /// discards a map that was read. Taking the row away instead sends the
    /// reader off to find and re-export a file that was never the problem,
    /// when what they need is to clear some space before they close the app.
    @Test("A map the device will not keep is still on the map")
    func aRefusedLibraryWriteKeepsTheImportedMap() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()

            // A library document that cannot be written, in a directory that
            // can: a directory standing where the file goes. Making the whole
            // directory read-only would stop the preview first, which is a
            // different failure with a different answer — no pixels, so no row
            // to keep.
            try FileManager.default.createDirectory(
                at: directory.appendingPathComponent("library.json"),
                withIntermediateDirectories: true
            )
            await viewModel.importMap(data: try image(), name: "Scan")

            #expect(viewModel.rows.count == 1)
            #expect(viewModel.rows.first?.preview != nil)
            let notice = try #require(viewModel.notices.first)
            // Not a refusal. The map is on the map.
            #expect(notice.isRefusal == false)
            #expect(notice.message.contains("until you close the app"))
        }
    }

    @Test("Placement the device will not keep is undone rather than shown")
    func aRejectedSaveIsRolledBack() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Scan")
            let id = try #require(viewModel.rows.first?.id)

            // The disk stops accepting writes, as a full or restricted device
            // does. Everything already imported is still there.
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o555], ofItemAtPath: directory.path
            )
            let points = [
                SessionControlPoint(
                    id: "a", pixel: PixelPoint(x: 0, y: 0),
                    map: GeoPoint(lat: 44.6, lng: -63.7)
                ),
                SessionControlPoint(
                    id: "b", pixel: PixelPoint(x: 40, y: 0),
                    map: GeoPoint(lat: 44.6, lng: -63.5)
                ),
                SessionControlPoint(
                    id: "c", pixel: PixelPoint(x: 0, y: 40),
                    map: GeoPoint(lat: 44.7, lng: -63.7)
                ),
            ]
            await viewModel.place(id: id, controlPoints: points, method: .affine)

            // The georeferencer has closed by now. Left as it looked, the map
            // would be drawn placed for the rest of the session and unplaced
            // after the next launch, with nothing having reported a problem.
            #expect(viewModel.rows.first?.needsGeoreferencing == true)
            #expect(viewModel.notices.first?.isRefusal == true)
            #expect(viewModel.notices.first?.message.contains("undone") == true)
        }
    }

    @Test("Two edits refused together both come back to what was saved")
    func overlappingRefusedSavesDoNotStrandAnUnsavedVersion() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Sheet")
            let id = try #require(viewModel.rows.first?.id)

            func points(_ latitude: Double) -> [SessionControlPoint] {
                [
                    SessionControlPoint(
                        id: "a", pixel: PixelPoint(x: 0, y: 0),
                        map: GeoPoint(lat: latitude, lng: -63.7)
                    ),
                    SessionControlPoint(
                        id: "b", pixel: PixelPoint(x: 40, y: 0),
                        map: GeoPoint(lat: latitude, lng: -63.5)
                    ),
                    SessionControlPoint(
                        id: "c", pixel: PixelPoint(x: 0, y: 40),
                        map: GeoPoint(lat: latitude - 0.1, lng: -63.7)
                    ),
                ]
            }
            @MainActor func latitude() -> Double? {
                guard case .controlPoints(let existing, _) =
                    viewModel.rows.first?.record.placement
                else { return nil }
                return existing.first?.map.lat
            }

            // A placement that does reach the disk, so there is a saved state
            // for the refused ones to come back to.
            await viewModel.place(id: id, controlPoints: points(44.70), method: .affine)
            let onDisk = try #require(libraryBytes(in: directory))

            try FileManager.default.setAttributes(
                [.posixPermissions: 0o555], ofItemAtPath: directory.path
            )
            // Both edits are in flight before either write comes back, which is
            // what makes the second one find the first one's work rather than
            // the disk's. Undoing each to what it personally found leaves the
            // sheet on 44.80, a placement that never reached the file, while
            // the panel says the change was undone.
            //
            // `async let` orders nothing by itself, so whether this reaches the
            // interleaving is a question about the runtime rather than about
            // the code. Measured, not assumed: with the per-edit undo this
            // replaced, the run below ends on 44.80 every time, four times out
            // of four. If a later runtime schedules these two differently the
            // test stops proving what it says, and the way that shows is this
            // comment no longer matching a rerun of that comparison.
            async let first: Bool = viewModel.place(
                id: id, controlPoints: points(44.80), method: .affine
            )
            async let second: Bool = viewModel.place(
                id: id, controlPoints: points(44.90), method: .affine
            )
            _ = await (first, second)

            #expect(latitude() == 44.70)
            #expect(libraryBytes(in: directory) == onDisk)
            #expect(viewModel.notices.first?.message.contains("undone") == true)
        }
    }

    @Test("A preview left with no record is swept up on the next launch")
    func orphanedPixelsDoNotAccumulate() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Scan")

            // A preview whose record never made it into the library — an import
            // whose write was refused, or a crash between the two writes. It is
            // tens of megabytes of a map the user cannot see and cannot delete.
            let orphan = directory.appendingPathComponent("orphan.png")
            try Data("not really a png".utf8).write(to: orphan)

            let reopened = UserMapsViewModel(store: UserMapStore(directory: directory))
            await reopened.load()
            #expect(!FileManager.default.fileExists(atPath: orphan.path))
            #expect(reopened.rows.count == 1)
        }
    }

    @Test("Two imports started at once both reach the disk")
    func concurrentImportsDoNotOverwriteEachOther() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()

            // Two batches overlapping — a second selection made while the first
            // is still decoding. Each save rebuilds the whole library, so
            // without ordering the two documents are computed from the same
            // starting point and one map ends up on screen but not in the file.
            async let first: Void = viewModel.importMap(data: try image(), name: "One")
            async let second: Void = viewModel.importMap(
                data: try image(width: 30, height: 30), name: "Two"
            )
            _ = try await (first, second)
            #expect(viewModel.rows.count == 2)

            let reopened = UserMapsViewModel(store: UserMapStore(directory: directory))
            await reopened.load()
            #expect(Set(reopened.rows.map(\.record.name)) == ["One", "Two"])
        }
    }
}

@Suite("A library this build cannot decode")
@MainActor
struct DamagedLibraryTests {
    /// Removes whatever the recovery left beside the test's own directory.
    private func removeSetAside(beside directory: URL) {
        let parent = directory.deletingLastPathComponent()
        let stem = "\(directory.lastPathComponent)-damaged"
        for name in [stem, "\(stem)-2"] {
            try? FileManager.default.removeItem(
                at: parent.appendingPathComponent(name, isDirectory: true)
            )
        }
    }

    @Test("A damaged library is set aside rather than sealed for good")
    func aDamagedLibraryDoesNotLockTheUserOut() async throws {
        try await withLibraryDirectory { directory in
            defer { removeSetAside(beside: directory) }
            // Version 1 is this build's own, so there is no later build coming
            // to read this file. The records inside it are not records. Sealing
            // here would refuse every import for the life of the install, with
            // no button anywhere to clear it: reinstalling the app would be the
            // only way back, and that takes the maps with it.
            let damaged = Data(#"{"version":1,"maps":[{"nonsense":true}]}"#.utf8)
            try damaged.write(to: directory.appendingPathComponent("library.json"))

            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()
            #expect(!viewModel.isLibrarySealed)
            #expect(viewModel.notices.count == 1)

            // Set aside, not deleted. What the user placed by hand is the part
            // that cannot be got again from the file they imported.
            let setAside = directory.deletingLastPathComponent()
                .appendingPathComponent("\(directory.lastPathComponent)-damaged")
            #expect(
                FileManager.default.fileExists(
                    atPath: setAside.appendingPathComponent("library.json").path
                )
            )

            // And the panel works again.
            await viewModel.importMap(data: try image(), name: "Fresh start")
            #expect(viewModel.rows.count == 1)
            let written = try #require(libraryBytes(in: directory))
            #expect(String(decoding: written, as: UTF8.self).contains("Fresh start"))
        }
    }

    /// Recovery moves the library aside as a directory, so the maps and their
    /// previews travel with it. The half-finished placements live somewhere
    /// else and do not, which left them naming ids no library held any more —
    /// for the orphan sweep to collect the next time the app opened. The
    /// notice says nothing was deleted.
    @Test("Recovering a damaged library does not cost the user their drafts")
    func aRecoveredLibraryKeepsTheDraftsOnDisk() async throws {
        try await withLibraryDirectory { directory in
            defer { removeSetAside(beside: directory) }
            let draftRoot = directory.deletingLastPathComponent()
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
            defer {
                for name in [
                    draftRoot.lastPathComponent, "\(draftRoot.lastPathComponent)-damaged",
                ] {
                    try? FileManager.default.removeItem(
                        at: draftRoot.deletingLastPathComponent()
                            .appendingPathComponent(name, isDirectory: true)
                    )
                }
            }
            let drafts = GeoreferenceDraftStore(directory: draftRoot)
            drafts.write(
                identifier: "a-map-in-the-damaged-library",
                name: "Scan",
                controls: [
                    SessionControlPoint(
                        id: "1", pixel: PixelPoint(x: 10, y: 20),
                        map: GeoPoint(lat: 44.65, lng: -63.6)
                    )
                ],
                checks: [],
                checkLabels: []
            )

            let damaged = Data(#"{"version":1,"maps":[{"nonsense":true}]}"#.utf8)
            try damaged.write(to: directory.appendingPathComponent("library.json"))
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: throwawayDisplay(),
                drafts: drafts
            )
            await viewModel.load()
            #expect(!viewModel.isLibrarySealed)

            // Out of play, and still on the device: the file is beside the
            // library it belonged to, under the same name the store uses.
            #expect(drafts.draft(identifier: "a-map-in-the-damaged-library") == nil)
            let setAside = draftRoot.deletingLastPathComponent()
                .appendingPathComponent("\(draftRoot.lastPathComponent)-damaged")
            #expect(
                FileManager.default.fileExists(
                    atPath: setAside
                        .appendingPathComponent("a-map-in-the-damaged-library.csv").path
                )
            )

            // And the sweep on the next load has nothing of theirs to take.
            await viewModel.importMap(data: try image(), name: "Fresh start")
            await viewModel.load()
            #expect(
                FileManager.default.fileExists(
                    atPath: setAside
                        .appendingPathComponent("a-map-in-the-damaged-library.csv").path
                )
            )
        }
    }

    @Test(
        "A version below the first is damage, not a document from the future",
        arguments: [0, -1]
    )
    func aVersionBelowTheFirstIsSetAside(version: Int) async throws {
        try await withLibraryDirectory { directory in
            defer { removeSetAside(beside: directory) }
            // Zero and negative numbers are not versions this app or any later
            // one writes. Read as "later than I can handle" they seal the panel
            // for the life of the install over what is only a corrupt field,
            // and no later build is ever coming to unseal it.
            let damaged = Data(#"{"version":\#(version),"maps":[]}"#.utf8)
            try damaged.write(to: directory.appendingPathComponent("library.json"))

            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()
            #expect(!viewModel.isLibrarySealed)

            await viewModel.importMap(data: try image(), name: "Fresh start")
            #expect(viewModel.rows.count == 1)
        }
    }

    /// Two loads can read the same damaged document before either recovers.
    @Test("Setting a damaged library aside twice is not a failure the second time")
    func recoveringTwiceLeavesTheLibraryUsable() async throws {
        try await withLibraryDirectory { directory in
            defer { removeSetAside(beside: directory) }
            let damaged = Data(#"{"version":1,"maps":[{"nonsense":true}]}"#.utf8)
            try damaged.write(to: directory.appendingPathComponent("library.json"))

            let store = UserMapStore(directory: directory)
            #expect(try await store.setAsideDamagedLibrary())
            // The source is gone, which is the outcome asked for. Reported as a
            // failure it seals a library that has just been replaced.
            #expect(try await store.setAsideDamagedLibrary())
        }
    }

    /// A reload can overlap an import, and what it read is then already out of
    /// date.
    ///
    /// The damage is not only the row that disappears from the panel. The
    /// orphan sweep that follows a successful load deletes preview files no
    /// record claims, and the arriving map's pixels are on disk before its
    /// record is: swept against a list read before the import, they are the
    /// orphan. The app keeps no copy of the file the user imported, so those
    /// pixels do not come back.
    @Test("A reload that overlaps an import keeps the arriving map and its pixels")
    func aReloadDoesNotSweepAnArrivingMap() async throws {
        try await withLibraryDirectory { directory in
            let pixels = try image()
            let opening = UserMapsViewModel(store: UserMapStore(directory: directory))
            await opening.load()
            await opening.importMap(data: pixels, name: "Already there")

            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()
            async let importing: Void = viewModel.importMap(data: pixels, name: "Arriving")
            async let reloading: Void = viewModel.load()
            _ = await (importing, reloading)

            let written = String(
                decoding: try #require(libraryBytes(in: directory)), as: UTF8.self
            )
            #expect(written.contains("Already there"))
            #expect(written.contains("Arriving"))
            #expect(viewModel.rows.count == 2)

            let previews = try FileManager.default.contentsOfDirectory(
                at: directory, includingPropertiesForKeys: nil
            ).filter { $0.pathExtension == "png" }
            #expect(previews.count == 2)
        }
    }

    /// The same window, driven through the panel rather than the store.
    ///
    /// Measured, not assumed: with the store's refusal taken out this fails on
    /// every run, and the file ends up holding the one imported map in place of
    /// the newer build's library.
    @Test("An import already under way never overwrites a later build's library")
    func aRacingImportLosesToTheSeal() async throws {
        try await withLibraryDirectory { directory in
            let later = Data(#"{"version":999,"maps":[]}"#.utf8)
            try later.write(to: directory.appendingPathComponent("library.json"))

            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            let pixels = try image()
            async let importing: Void = viewModel.importMap(data: pixels, name: "Racing")
            async let loading: Void = viewModel.load()
            _ = await (importing, loading)

            #expect(libraryBytes(in: directory) == later)
            #expect(viewModel.isLibrarySealed)
        }
    }

    /// The window the view model's own seal cannot close.
    ///
    /// `load` learns of a later version across an await. An import that started
    /// before that await passes its check while the answer is still in flight,
    /// and resumes afterwards to write. Only the store sees both calls, and an
    /// actor runs them in the order they arrived, so this is where the refusal
    /// has to be for the newer build's library to survive.
    @Test("A save is refused after the store has read a later build's library")
    func theStoreItselfRefusesToWriteOverALaterVersion() async throws {
        try await withLibraryDirectory { directory in
            let later = Data(#"{"version":999,"maps":[]}"#.utf8)
            try later.write(to: directory.appendingPathComponent("library.json"))

            let store = UserMapStore(directory: directory)
            await #expect(throws: UserMapStore.StoreRefusal.fromALaterVersion(999)) {
                try await store.load()
            }
            await #expect(throws: UserMapStore.StoreRefusal.fromALaterVersion(999)) {
                try await store.save([])
            }
            #expect(libraryBytes(in: directory) == later)
        }
    }

    @Test("A later build's library is sealed even when its records will not decode")
    func aLaterVersionIsNeverSetAside() async throws {
        try await withLibraryDirectory { directory in
            defer { removeSetAside(beside: directory) }
            // The case the version has to be read for. A newer build is free to
            // change what a record looks like, and then this build's decode
            // fails on the records rather than on the version. Told apart only
            // by reading the version on its own first: mistaken for damage,
            // this file would be moved out from under the build that wrote it.
            let later = Data(#"{"version":999,"maps":[{"shapeThisBuildHasNeverSeen":1}]}"#.utf8)
            try later.write(to: directory.appendingPathComponent("library.json"))

            let viewModel = UserMapsViewModel(store: UserMapStore(directory: directory))
            await viewModel.load()
            #expect(viewModel.isLibrarySealed)
            #expect(libraryBytes(in: directory) == later)
            #expect(
                !FileManager.default.fileExists(
                    atPath: directory.deletingLastPathComponent()
                        .appendingPathComponent("\(directory.lastPathComponent)-damaged").path
                )
            )
        }
    }
}

@Suite("What a file's orientation tag is allowed to do")
struct UserMapOrientationTests {
    @Test("Imported previews preserve small images and cap large images", arguments: [
        (640, 480, 640, 480),
        (8192, 1024, 4096, 512),
    ])
    func previewDimensionsFollowTheActualDecoder(
        width: Int, height: Int, previewWidth: Int, previewHeight: Int
    ) throws {
        let imported = try UserMapImporter.import(
            data: try image(width: width, height: height, type: .png),
            id: "preview-size", name: "Sheet"
        )
        #expect(imported.record.pixelSize == PixelSize(width: Double(width), height: Double(height)))
        #expect(imported.preview.width == previewWidth)
        #expect(imported.preview.height == previewHeight)
    }

    @Test("The mark reads back in the corner it was painted in")
    func theMeasurementFindsTheMarkWhereItWasPut() throws {
        // The check on the check. Every assertion below is a claim about where
        // ink sits in a decoded image, and it is worth nothing if the reading
        // is upside down: a helper that reported rows from the bottom would
        // make a correctly uprighted picture look mirrored and a mirrored one
        // look right. With no orientation tag nothing is turned, so the mark
        // must come back where it was put, in the top-left.
        let imported = try UserMapImporter.import(
            data: try image(width: 400, height: 200, type: .png, marked: true),
            id: "plain", name: "Sheet"
        )
        let centre = try inkCentre(of: imported.preview)
        #expect(centre.across < 0.5)
        #expect(centre.down < 0.5)
    }

    @Test("A sideways photograph is turned upright, dimensions and all")
    func anOrientedScanIsUprightedWholesale() throws {
        // Orientation 6 is a quarter turn: the stored raster is 400 by 200 and
        // the picture it holds is 200 by 400. A record keeping the stored pair
        // would scale every control point the user places through a size the
        // picture in front of them does not have.
        //
        // The other half of this rule — that a georeferenced file is decoded
        // in its raster's own rows — is the test below, on bytes laid out by
        // hand: Image I/O writes TIFFs and offers no way to write geo tags.
        let imported = try UserMapImporter.import(
            data: try image(width: 400, height: 200, type: .jpeg, orientation: 6),
            id: "sideways", name: "Photo"
        )
        #expect(imported.record.pixelSize == PixelSize(width: 200, height: 400))
        #expect(imported.preview.height > imported.preview.width)

        // Which quarter turn, and which way round. Orientation 6 asks for a
        // turn of 90° clockwise, so the corner stored top-left is displayed
        // top-right. Swapped dimensions alone would be just as true of
        // orientation 8, of a turn made the wrong way, or of a picture that
        // came back mirrored, and a map placed on mirrored pixels is a map
        // whose every control point is wrong while nothing looks broken.
        let turned = try UserMapImporter.import(
            data: try image(width: 400, height: 200, type: .jpeg, orientation: 6, marked: true),
            id: "sideways-marked", name: "Photo"
        )
        let centre = try inkCentre(of: turned.preview)
        #expect(centre.across > 0.5)
        #expect(centre.down < 0.5)
    }

    @Test("A file that says nothing about orientation is left as it is")
    func anUnorientedScanKeepsItsOwnShape() throws {
        let imported = try UserMapImporter.import(
            data: try image(width: 400, height: 200, type: .jpeg),
            id: "flat", name: "Photo"
        )
        #expect(imported.record.pixelSize == PixelSize(width: 400, height: 200))
        #expect(imported.preview.width > imported.preview.height)
    }

    /// The other half of that rule: a file carrying its own georeferencing is
    /// decoded in its raster's own rows, because that is the space its
    /// geotransform is written in.
    @Test("A sheet that placed itself is not turned by an orientation tag")
    func aPlacedSheetKeepsItsRasterRowsDespiteAnOrientationTag() throws {
        // Orientation 6 on both files. The georeferenced one must ignore it:
        // rotate those pixels and the sheet is drawn quarter-turned over
        // ground it describes perfectly correctly, with every number in the
        // file still checking out.
        let placed = try UserMapImporter.import(
            data: GeoTiffFixture.sheet(
                width: 16, height: 8,
                doubles: GeoTiffFixture.placement(
                    eastingMetres: 452_000, northingMetres: 4_944_000
                ),
                shorts: GeoTiffFixture.projectedSystem(epsg: 26_920).merging(
                    [274: [6]], uniquingKeysWith: { first, _ in first }
                )
            ),
            id: "placed", name: "Sheet"
        )
        #expect(placed.needsGeoreferencing == false)
        #expect(placed.record.pixelSize == PixelSize(width: 16, height: 8))
        #expect(placed.preview.width > placed.preview.height)

        // The same tag on the same builder's output, minus the geo tags. This
        // is what stops the assertion above from being vacuous: if Image I/O
        // ignored a TIFF's orientation tag entirely, the check that the placed
        // sheet was left alone would pass without proving anything.
        let scan = try UserMapImporter.import(
            data: GeoTiffFixture.sheet(width: 16, height: 8, shorts: [274: [6]]),
            id: "scan", name: "Photo"
        )
        #expect(scan.needsGeoreferencing == true)
        #expect(scan.record.pixelSize == PixelSize(width: 8, height: 16))
        #expect(scan.preview.height > scan.preview.width)
    }
}

/// Files that say where they belong in terms this app cannot use.
///
/// Every test here drives `UserMapImporter.import` over real GeoTIFF bytes
/// rather than calling the tag parser directly, because what is being tested
/// is the importer's decision to keep the file: checks that stopped at the
/// parser went on passing with the importer's recovery deleted.
@Suite("A placement the file states and this app cannot read")
@MainActor
struct UnreadableGeoreferencingTests {
    /// EPSG:32620 is WGS 84 / UTM zone 20N: the right zone for Nova Scotia in
    /// the wrong datum, and a plausible export from software set to WGS 84.
    /// The app reads NAD83 and its CSRS realisations, so this one is refused
    /// by code rather than by any doubt about the file.
    private static func inAnUnreadSystem() -> Data {
        GeoTiffFixture.sheet(
            doubles: GeoTiffFixture.placement(),
            shorts: GeoTiffFixture.projectedSystem(epsg: 32_620)
        )
    }

    @Test("A system this app cannot read keeps the map and drops the placement")
    func anUnreadableSystemIsKeptForHandPlacement() throws {
        let imported = try UserMapImporter.import(
            data: Self.inAnUnreadSystem(), id: "utm20-wgs84", name: "Ortho"
        )

        // Kept, and unplaced. An empty control-point list rather than a
        // placeholder transform is what stops the sheet being drawn anywhere
        // at all until the reader places it.
        #expect(imported.needsGeoreferencing == true)
        guard case .controlPoints(let points, let method) = imported.record.placement else {
            Issue.record("a map that could not place itself should be waiting for points")
            return
        }
        #expect(points.isEmpty)
        #expect(method == .affine)
        #expect(imported.record.pixelSize == PixelSize(width: 8, height: 8))

        let unread = try #require(imported.unreadGeoreferencing)
        #expect(unread.contains("EPSG:32620"))
        #expect(unread.contains("ready to place by hand"))
    }

    @Test("A system named in prose is quoted back rather than guessed at")
    func aCitedSystemIsQuotedBack() throws {
        // 32767 is "user-defined": the file says its system is described
        // elsewhere in its own tags, in words. Nothing here can turn prose
        // into a projection, so the words are repeated to the reader.
        let (directory, ascii) = GeoTiffFixture.citedSystem("Lambert Conformal Conic (custom)")
        let imported = try UserMapImporter.import(
            data: GeoTiffFixture.sheet(
                doubles: GeoTiffFixture.placement(), shorts: directory, strings: ascii
            ),
            id: "cited", name: "Sheet"
        )

        #expect(imported.needsGeoreferencing == true)
        let unread = try #require(imported.unreadGeoreferencing)
        #expect(unread.contains("Lambert Conformal Conic (custom)"))
        #expect(unread.contains("ready to place by hand"))
        #expect(unread.contains("EPSG code"))
    }

    @Test("A system this app does read still places the sheet itself")
    func aReadableSystemStillPlacesItself() throws {
        // The control on the two above. Without it, a fixture builder with a
        // mistake in its tags would make every file look unplaceable and both
        // refusal tests would pass for the wrong reason.
        let imported = try UserMapImporter.import(
            data: GeoTiffFixture.sheet(
                width: 16, height: 8,
                doubles: GeoTiffFixture.placement(
                    eastingMetres: 452_000, northingMetres: 4_944_000
                ),
                shorts: GeoTiffFixture.projectedSystem(epsg: 26_920)
            ),
            id: "utm20-nad83", name: "Ortho"
        )

        #expect(imported.needsGeoreferencing == false)
        #expect(imported.unreadGeoreferencing == nil)
        guard case .embedded(let georeference) = imported.record.placement else {
            Issue.record("a map in a system this app reads should have placed itself")
            return
        }
        #expect(georeference.crs == "EPSG:26920")
    }

    @Test("The library keeps the map, and says what went unread")
    func theLibraryKeepsItAndSaysWhy() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: throwawayDisplay()
            )
            await viewModel.load()
            await viewModel.importMap(
                data: Self.inAnUnreadSystem(), name: "Ortho", filename: "ortho.tif"
            )

            // The row is there. A refusal would have left the reader with the
            // advice to place it by hand and no map to place.
            #expect(viewModel.rows.count == 1)
            #expect(viewModel.rows.first?.needsGeoreferencing == true)

            let notice = try #require(viewModel.notices.first)
            // Not a refusal: the picture came in, and only its claim about
            // where it belongs was dropped. A message flagged as a refusal
            // reads as "your file was turned away".
            #expect(notice.isRefusal == false)
            #expect(notice.name == "ortho.tif")
            #expect(notice.message.contains("EPSG:32620"))

            // Nowhere to fly to. Sending the map to a placement the app just
            // declined to trust is the one thing this path must not do.
            #expect(viewModel.pendingFit == nil)
        }
    }
}

/// A defaults suite of its own, so one test's answer is not the next test's
/// starting point. The app writes to `UserDefaults.standard`.
@MainActor
private func throwawayDisplay() -> UserMapDisplayStore {
    UserMapDisplayStore(
        defaults: UserDefaults(suiteName: "user-maps-\(UUID().uuidString)") ?? .standard
    )
}

@Suite("Which of the user's maps are drawn, and how strongly")
@MainActor
struct UserMapDisplayTests {
    @Test("A map arrives at the strength the browser imports it at")
    func anImportedMapArrivesTranslucent() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: throwawayDisplay()
            )
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Scan")

            let row = try #require(viewModel.rows.first)
            // Drawn straight away, because the user just chose the file and
            // nothing else would explain the panel. At 70%, because a scan laid
            // over the map at full strength hides the ground it is there to be
            // compared against.
            #expect(row.isVisible)
            #expect(abs(row.opacity - 0.7) < 0.0001)
        }
    }

    @Test("What the reader switched off comes back switched off")
    func visibilityAndStrengthSurviveARelaunch() async throws {
        try await withLibraryDirectory { directory in
            let display = throwawayDisplay()
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: display
            )
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "North")
            await viewModel.importMap(data: try image(), name: "South")
            let north = try #require(viewModel.rows.first { $0.record.name == "North" })
            let south = try #require(viewModel.rows.first { $0.record.name == "South" })
            viewModel.setVisible(false, id: north.id)
            viewModel.setOpacity(0.35, id: south.id)

            let relaunched = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: display
            )
            await relaunched.load()

            let reopenedNorth = try #require(relaunched.rows.first { $0.id == north.id })
            let reopenedSouth = try #require(relaunched.rows.first { $0.id == south.id })
            #expect(!reopenedNorth.isVisible)
            #expect(reopenedSouth.isVisible)
            #expect(abs(reopenedSouth.opacity - 0.35) < 0.0001)
        }
    }

    @Test("A map nothing is remembered about opens hidden")
    func aMapWithNothingRememberedOpensHidden() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: throwawayDisplay()
            )
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Scan")

            // The library survives, the display state does not — a device
            // restored from a backup that carried the documents, or a build
            // that stored nothing here. Opening every stored scan over the
            // province is not a state anybody asked for.
            let relaunched = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: throwawayDisplay()
            )
            await relaunched.load()

            let row = try #require(relaunched.rows.first)
            #expect(!row.isVisible)
            #expect(abs(row.opacity - 0.7) < 0.0001)
        }
    }

    @Test("A deleted map takes its remembered state with it")
    func deletingAMapDropsWhatWasRememberedAboutIt() async throws {
        try await withLibraryDirectory { directory in
            let display = throwawayDisplay()
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: display
            )
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Scan")
            let id = try #require(viewModel.rows.first?.id)
            #expect(display.load()[id] != nil)

            await viewModel.delete(id: id)
            #expect(display.load()[id] == nil)
        }
    }

    /// A placement in progress is written outside the library, keyed by the
    /// map's id. Deleting the map used to leave that file behind: points a
    /// user pinned on ground they care about, under an id no row names any
    /// more, kept until the app is deleted.
    @Test("A deleted map takes its half-finished placement with it")
    func deletingAMapDiscardsItsGeoreferenceDraft() async throws {
        try await withLibraryDirectory { directory in
            let draftRoot = directory.appendingPathComponent("drafts", isDirectory: true)
            let drafts = GeoreferenceDraftStore(directory: draftRoot)
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: throwawayDisplay(),
                drafts: drafts
            )
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Scan")
            let id = try #require(viewModel.rows.first?.id)

            drafts.write(
                identifier: id,
                name: "Scan",
                controls: [
                    SessionControlPoint(
                        id: "1", pixel: PixelPoint(x: 10, y: 20),
                        map: GeoPoint(lat: 44.65, lng: -63.6)
                    )
                ],
                checks: [],
                checkLabels: []
            )
            #expect(drafts.draft(identifier: id) != nil)

            await viewModel.delete(id: id)
            #expect(drafts.draft(identifier: id) == nil)
        }
    }

    /// The delete above is two steps, and only one of them is the library's.
    /// Stop the app between them, or have the file refuse to go, and the draft
    /// outlives every trace of the map it belongs to. Nothing would ever look
    /// at it again, and nothing would ever remove it.
    @Test("A draft whose map is gone is swept on the next load")
    func aDraftWithNoMapIsSweptOnLoad() async throws {
        try await withLibraryDirectory { directory in
            let draftRoot = directory.appendingPathComponent("drafts", isDirectory: true)
            let drafts = GeoreferenceDraftStore(directory: draftRoot)
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: throwawayDisplay(),
                drafts: drafts
            )
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Scan")
            let kept = try #require(viewModel.rows.first?.id)

            for identifier in [kept, "a-map-that-was-deleted"] {
                drafts.write(
                    identifier: identifier,
                    name: "Scan",
                    controls: [
                        SessionControlPoint(
                            id: "1", pixel: PixelPoint(x: 10, y: 20),
                            map: GeoPoint(lat: 44.65, lng: -63.6)
                        )
                    ],
                    checks: [],
                    checkLabels: []
                )
            }

            await viewModel.load()

            // The orphan goes; the placement the user is part way through on a
            // map they still have does not.
            #expect(drafts.draft(identifier: "a-map-that-was-deleted") == nil)
            #expect(drafts.draft(identifier: kept) != nil)
        }
    }

    /// A library this build must not write to answers "no" rather than
    /// silently doing nothing. The sheet discards the draft on the strength of
    /// that answer, so a placement reported as saved and not saved is an hour
    /// of pinning gone.
    @Test("A placement the library refuses is reported as refused")
    func aRefusedPlacementSaysSo() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: throwawayDisplay()
            )
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Scan")
            let id = try #require(viewModel.rows.first?.id)

            #expect(
                await viewModel.place(
                    id: id,
                    controlPoints: [
                        SessionControlPoint(
                            id: "1", pixel: PixelPoint(x: 10, y: 20),
                            map: GeoPoint(lat: 44.65, lng: -63.6)
                        ),
                        SessionControlPoint(
                            id: "2", pixel: PixelPoint(x: 90, y: 80),
                            map: GeoPoint(lat: 44.7, lng: -63.5)
                        ),
                    ],
                    method: .affine
                ) == true
            )

            // The same call against a map that is not in the library.
            #expect(
                await viewModel.place(
                    id: "no-such-map", controlPoints: [], method: .affine
                ) == false
            )
        }
    }

    /// The window between an import starting and the seal going up.
    ///
    /// `load` learns of a later version across an await, so an import that
    /// started first passes the seal check and reaches the library write. The
    /// store refuses it. What must not happen is the refused map's entry
    /// replacing the whole remembered set on its way through — the entries it
    /// would replace belong to the maps this build cannot read.
    ///
    /// Measured, not assumed: with the remembering moved back above the write
    /// this fails, and the kept entry is gone.
    @Test("A map the library refused is not remembered as drawn")
    func aRefusedImportLeavesTheRememberedStateAlone() async throws {
        try await withLibraryDirectory { directory in
            let display = throwawayDisplay()
            let kept = UserMapDisplayStore.Display(isVisible: true, opacity: 0.4)
            display.save(["kept": kept])
            try Data(#"{"version":999,"maps":[]}"#.utf8)
                .write(to: directory.appendingPathComponent("library.json"))

            // The store has read the later version and the panel has not been
            // told yet, which is the window an import that started first
            // resumes into. Driven through the store rather than through two
            // racing tasks so the window is open every run.
            let store = UserMapStore(directory: directory)
            _ = try? await store.load()
            let viewModel = UserMapsViewModel(store: store, display: display)
            await viewModel.importMap(data: try image(), name: "Racing")

            #expect(viewModel.rows.isEmpty)
            #expect(display.load() == ["kept": kept])
        }
    }

    @Test("A sealed library does not take the display state with it")
    func aSealedLibraryLeavesTheRememberedStateAlone() async throws {
        try await withLibraryDirectory { directory in
            let display = throwawayDisplay()
            let kept = UserMapDisplayStore.Display(isVisible: true, opacity: 0.4)
            display.save(["kept": kept])

            // A document from a later build. The rows are empty because this
            // build cannot read them, and writing the empty set back would
            // throw away what the later build's maps were showing.
            try Data(#"{"version":999,"maps":[]}"#.utf8)
                .write(to: directory.appendingPathComponent("library.json"))
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: display
            )
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Scan")

            #expect(viewModel.isLibrarySealed)
            #expect(display.load()["kept"] == kept)
        }
    }
}

@Suite("Where the map goes when a file places itself")
@MainActor
struct UserMapFitTests {
    /// The app's own export, which imports placed. Its bounds are known, so
    /// what the map is asked to frame can be checked against ground rather
    /// than against whatever the importer happened to produce.
    private static let exportBounds = GeoBoundingBox(
        south: 44.60, west: -63.70, north: 44.70, east: -63.50
    )

    private static func placedPdf() -> Data {
        let template = PdfTemplate.template(.portrait)
        return PdfComposer.compose(
            PdfComposer.Input(
                template: template,
                bounds: exportBounds,
                mapImage: PdfComposer.MapImage(jpegBytes: Data(), widthPx: 1, heightPx: 1),
                fields: PdfComposer.Fields(title: "Placed"),
                legend: nil,
                disclosures: [],
                attributionLines: [],
                scaleBar: PrintScaleBar.build(
                    bounds: exportBounds,
                    mapFrame: template.mapFrame,
                    maxWidthPoints: template.scaleBar.maxWidth
                ),
                shareURLText: nil,
                qrModules: nil,
                appendix: [],
                generatedAt: Date(timeIntervalSince1970: 0)
            )
        )
    }

    @Test("A sheet that arrived placed brings the map to it")
    func aPlacedImportAsksTheMapToCome() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: throwawayDisplay()
            )
            await viewModel.load()
            await viewModel.importMap(data: Self.placedPdf(), name: "Placed")

            let box = try #require(viewModel.pendingFit)
            // The ground the sheet covers, not the page it came on. A quarter
            // of a degree of slack: the frame is the map area of the export,
            // which is inset from the page, and the check that matters is that
            // the map is sent to Halifax rather than to the origin.
            #expect(abs(box.south - Self.exportBounds.south) < 0.25)
            #expect(abs(box.north - Self.exportBounds.north) < 0.25)
            #expect(abs(box.west - Self.exportBounds.west) < 0.25)
            #expect(abs(box.east - Self.exportBounds.east) < 0.25)

            // Taken once. A visibility toggle or a reload afterwards must not
            // fly the reader back to a sheet they have since navigated away
            // from.
            #expect(viewModel.takePendingFit() != nil)
            #expect(viewModel.pendingFit == nil)
            #expect(viewModel.takePendingFit() == nil)
        }
    }

    @Test("A scan with no georeferencing has nowhere to send the map")
    func anUnplacedImportLeavesTheMapWhereItIs() async throws {
        try await withLibraryDirectory { directory in
            let viewModel = UserMapsViewModel(
                store: UserMapStore(directory: directory), display: throwawayDisplay()
            )
            await viewModel.load()
            await viewModel.importMap(data: try image(), name: "Scan")

            #expect(viewModel.rows.first?.needsGeoreferencing == true)
            #expect(viewModel.pendingFit == nil)
        }
    }
}

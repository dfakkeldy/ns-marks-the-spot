import CoreGraphics
import Foundation
import GeoCore
import ImageIO
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
            // sheet on 44.80 — a placement that never reached the file — while
            // the panel says the change was undone.
            async let first: Void = viewModel.place(
                id: id, controlPoints: points(44.80), method: .affine
            )
            async let second: Void = viewModel.place(
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
        // The other half of this rule — that a file carrying its own
        // georeferencing is decoded in its raster's own rows, because that is
        // the space its geotransform is written in — has no test here: a TIFF
        // with real pixels, real geo tags and an orientation tag cannot be
        // built through Image I/O, which offers no way to write the geo tags.
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
}

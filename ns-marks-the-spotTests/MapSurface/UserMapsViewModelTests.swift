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

/// A small solid-colour image, as a file of the given type.
private func image(
    width: Int = 40, height: Int = 40, type: UTType = .png, orientation: Int? = nil
) throws -> Data {
    let context = try #require(
        CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
    )
    context.setFillColor(CGColor(red: 0.4, green: 0.6, blue: 0.4, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
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

@Suite("What a file's orientation tag is allowed to do")
struct UserMapOrientationTests {
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

import Foundation
import Testing

@testable import GeoCore

@Suite("Saving the user's own maps")
struct UserMapLibraryTests {
    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    private static let embedded = UserMapRecord(
        id: "a1", name: "Grant index sheet 34",
        pixelSize: PixelSize(width: 4000, height: 3000),
        placement: .embedded(
            RasterProjection.EmbeddedGeoreference(
                crs: "EPSG:26920", geotransform: [400_000, 10, 0, 5_040_000, 0, -10]
            )
        )
    )

    private static let byHand = UserMapRecord(
        id: "b2", name: "Church map, Kings",
        pixelSize: PixelSize(width: 9000, height: 7000),
        sourceRect: PixelRect(x: 100, y: 50, width: 8000, height: 6000),
        placement: .controlPoints(
            [
                SessionControlPoint(
                    id: "p1", pixel: PixelPoint(x: 120, y: 240),
                    map: GeoPoint(lat: 45.08, lng: -64.37)
                ),
                SessionControlPoint(
                    id: "p2", pixel: PixelPoint(x: 7800, y: 260),
                    map: GeoPoint(lat: 45.09, lng: -64.11)
                ),
                SessionControlPoint(
                    id: "p3", pixel: PixelPoint(x: 300, y: 5900),
                    map: GeoPoint(lat: 44.91, lng: -64.35)
                ),
            ],
            method: .spline
        )
    )

    @Test func aLibraryComesBackTheWayItWentIn() throws {
        let library = UserMapLibrary(maps: [Self.embedded, Self.byHand])
        let data = try Self.encoder.encode(library)
        #expect(try JSONDecoder().decode(UserMapLibrary.self, from: data) == library)
    }

    /// The control points are the user's own work — the part of a hand-placed
    /// sheet that took the time — so a round trip that lost or reordered them
    /// would cost exactly that. Checked through the placement rather than
    /// through the mesh, because a mesh recomputed from *different* points can
    /// still look plausible.
    @Test func theControlPointsSurviveInOrder() throws {
        let data = try Self.encoder.encode(UserMapLibrary(maps: [Self.byHand]))
        let decoded = try JSONDecoder().decode(UserMapLibrary.self, from: data)
        guard case .controlPoints(let points, let method) = decoded.maps[0].placement else {
            Issue.record("the placement changed kind on the way through")
            return
        }
        #expect(points.map(\.id) == ["p1", "p2", "p3"])
        #expect(points[1].pixel == PixelPoint(x: 7800, y: 260))
        #expect(method == .spline)
        // And the sheet still draws where it drew before it was saved.
        #expect(decoded.maps[0].mesh == Self.byHand.mesh)
    }

    /// The names in the file are pinned, because they are a format. Renaming a
    /// property in GeoCore is free until somebody's phone has last month's
    /// document on it; this test is what turns that into a decision.
    @Test func theShapeOnDiskIsPinned() throws {
        let json = try #require(
            String(data: Self.encoder.encode(UserMapLibrary(maps: [Self.embedded])), encoding: .utf8)
        )
        #expect(json == """
            {"maps":[{"id":"a1","name":"Grant index sheet 34",\
            "pixelSize":{"height":3000,"width":4000},\
            "placement":{"georeference":{"crs":"EPSG:26920",\
            "geotransform":[400000,10,0,5040000,0,-10]},"kind":"embedded"}}],\
            "version":1}
            """)
    }

    /// A crop is optional and stays absent rather than being written as null,
    /// so an uncropped sheet reads the same as one saved before crops existed.
    @Test func anUncroppedSheetWritesNoCrop() throws {
        let json = try #require(
            String(data: Self.encoder.encode(Self.embedded), encoding: .utf8)
        )
        #expect(!json.contains("sourceRect"))
    }

    /// A document written by a later build is refused, not read and not
    /// rewritten. Reading it would mean guessing at fields this build does not
    /// know, and rewriting it would delete the maps that build saved — on a
    /// downgrade, which is exactly when the user is least expecting to lose
    /// anything.
    @Test func aDocumentFromTheFutureIsNotRead() throws {
        let future = UserMapLibrary(version: UserMapLibrary.currentVersion + 1, maps: [])
        #expect(!future.isReadable)
        #expect(UserMapLibrary(maps: []).isReadable)
        #expect(!UserMapLibrary(version: 0, maps: []).isReadable)

        // And it still decodes, so the caller can see the version it refused
        // rather than being told the file is corrupt.
        let data = try Self.encoder.encode(future)
        let decoded = try JSONDecoder().decode(UserMapLibrary.self, from: data)
        #expect(decoded.version == UserMapLibrary.currentVersion + 1)
    }

    /// The kind tag is what tells the two placements apart, and a document
    /// missing it is not a placement at all. Decoded as a refusal rather than
    /// as an empty control-point list, which would present as a sheet the user
    /// simply has to re-place.
    @Test func aPlacementWithNoKindIsNotDecoded() {
        let json = Data("""
            {"version":1,"maps":[{"id":"a1","name":"x",
            "pixelSize":{"width":10,"height":10},"placement":{"controlPoints":[]}}]}
            """.utf8)
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(UserMapLibrary.self, from: json)
        }
    }
}

/// A PDF import, once it is a file on somebody's phone.
///
/// The registration is the only part of a record that says what the *app*
/// decided rather than what the user did, so it is the part that has to survive
/// a relaunch unchanged: a chosen frame that came back as "choose a frame"
/// would ask the user to place a sheet they already placed, and an embedded
/// frame that came back as manual would quietly unplace a map that was right.
@Suite("Saving what a PDF import came to")
struct UserMapPdfRecordTests {
    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    private static let candidates = [
        PdfMapRegistration.Candidate(
            id: "measure-direct-0",
            flavour: .measure,
            label: "Main sheet",
            sourceRect: PixelRect(x: 0, y: 0, width: 2000, height: 1600),
            gcps: [
                GroundControlPoint(
                    pixel: PixelPoint(x: 0, y: 0), map: GeoPoint(lat: 45.1, lng: -64.4)
                ),
                GroundControlPoint(
                    pixel: PixelPoint(x: 2000, y: 1600),
                    map: GeoPoint(lat: 45.0, lng: -64.2)
                ),
            ]
        ),
        PdfMapRegistration.Candidate(
            id: "lgiDict-direct-1",
            flavour: .lgiDict,
            label: nil,
            sourceRect: PixelRect(x: 1500, y: 1200, width: 400, height: 300),
            gcps: []
        ),
    ]

    private static func record(_ registration: PdfImportMetadata.Registration) -> UserMapRecord {
        UserMapRecord(
            id: "pdf-1", name: "County sheet",
            pixelSize: PixelSize(width: 2000, height: 1600),
            placement: .controlPoints([], method: .affine),
            pdf: PdfImportMetadata(pageCount: 12, registration: registration)
        )
    }

    @Test("Every registration state comes back as the state it was")
    func eachStateRoundTrips() throws {
        for registration in [
            PdfImportMetadata.Registration.embedded(
                PdfImportMetadata.Embedded(
                    flavour: .measure,
                    selection: .user,
                    frameID: "measure-direct-0",
                    label: "Main sheet",
                    candidates: Self.candidates,
                    adjusted: true
                )
            ),
            .selectionRequired(Self.candidates),
            .manual(reason: .unsupportedCrs, adjusted: false),
        ] {
            let saved = Self.record(registration)
            let data = try Self.encoder.encode(UserMapLibrary(maps: [saved]))
            let decoded = try JSONDecoder().decode(UserMapLibrary.self, from: data)
            #expect(decoded.maps == [saved])
        }
    }

    @Test("The states are named on disk, so renaming a case has to be deliberate")
    func theFormatIsPinned() throws {
        let json = try #require(
            String(
                data: Self.encoder.encode(
                    Self.record(.manual(reason: .unsupportedCrs, adjusted: false)).pdf
                ),
                encoding: .utf8
            )
        )
        #expect(json.contains("\"kind\":\"manual\""))
        #expect(json.contains("\"reason\":\"unsupported-crs\""))
    }

    @Test("A library saved before PDFs could be imported still opens")
    func anOlderLibraryStillOpens() throws {
        // The field was added to a format that was already on phones. A record
        // written without it has to decode, or the panel comes up empty and the
        // user's maps read as thrown away.
        let json = Data(
            """
            {"version":1,"maps":[{"id":"a1","name":"Scan","pixelSize":\
            {"width":100,"height":80},"placement":{"kind":"controlPoints",\
            "controlPoints":[],"method":"affine"}}]}
            """.utf8
        )
        let library = try JSONDecoder().decode(UserMapLibrary.self, from: json)
        #expect(library.maps.count == 1)
        #expect(library.maps[0].pdf == nil)
    }
}

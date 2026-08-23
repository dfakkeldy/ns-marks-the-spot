import Foundation
import GeoCore
import Testing

@testable import ns_marks_the_spot

/// What the panel does with a layer after it has arrived: bringing it into
/// view, naming it, and saying that it is no longer the file it came from.
@Suite("Editing a user's vector layer")
@MainActor
struct UserVectorEditingTests {
    /// The phone's layer panel covers the map, so an import that changed
    /// nothing on screen is indistinguishable from one the app refused.
    @Test("An import brings the map to what was imported")
    func anImportBringsTheMapToWhatWasImported() async throws {
        try await withViewModel { viewModel in
            await viewModel.importFile(data: Self.geoJson(), filename: "lots.geojson")
            let box = try #require(viewModel.pendingFit)
            #expect(abs(box.south - 44.6) < 0.0001)
            #expect(abs(box.west - (-63.5)) < 0.0001)

            // Taken, not read: a layer toggled off and on later must not send
            // the map back to where the import left it.
            #expect(viewModel.takePendingFit() != nil)
            #expect(viewModel.pendingFit == nil)
            #expect(viewModel.takePendingFit() == nil)
        }
    }

    /// A file the app would not read must not move the map either. Framing an
    /// empty import would be the app claiming something arrived.
    @Test("A refused file leaves the map where it was")
    func aRefusedFileLeavesTheMapWhereItWas() async throws {
        try await withViewModel { viewModel in
            viewModel.beginImports()
            await viewModel.importFile(data: Data("<kml></kml>".utf8), filename: "empty.kml")
            #expect(viewModel.rows.isEmpty)
            #expect(viewModel.pendingFit == nil)
        }
    }

    /// Typing is not submitting. The name has to reach the disk without the
    /// user pressing Return, because on the description field beside it Return
    /// types a newline and nothing is ever submitted at all.
    @Test("A layer name typed and not submitted still lands")
    func aLayerNameTypedAndNotSubmittedStillLands() async throws {
        try await withViewModel { viewModel in
            await viewModel.importFile(data: Self.geoJson(), filename: "lots.geojson")
            let row = try #require(viewModel.rows.first)
            let session = VectorEditSession(
                viewModel: viewModel, persistDelay: .milliseconds(10)
            )
            session.begin(row)

            // As typed, one keystroke at a time.
            for name in ["W", "Wo", "Woo", "Woodlot"] {
                session.setLayerName(name)
            }
            await session.flush()

            #expect(viewModel.rows.first?.record.name == "Woodlot")
        }
    }

    /// The row and the callout keep saying "From your file parcels.kml" over
    /// geometry the file never held, unless the edit is stated.
    @Test("An edited layer stops presenting itself as the file it came from")
    func anEditedLayerStopsPresentingItselfAsTheFileItCameFrom() throws {
        let imported = UserVectorLayerRecord(
            id: "layer-1",
            name: "Lots",
            source: .geoJson,
            origin: .imported(
                filename: "parcels.kml", importedAt: Date(timeIntervalSince1970: 0)
            ),
            createdAt: Date(timeIntervalSince1970: 0),
            colorHex: "#0072b2",
            featureCount: 1,
            bbox: nil
        )
        #expect(imported.provenanceText == "From your file parcels.kml")

        var edited = imported
        edited.modifiedAt = Date(timeIntervalSince1970: 1_700_000_000)
        #expect(edited.provenanceText.hasPrefix("From your file parcels.kml · edited "))
    }

    /// Someone marking culverts along a road marks several. The browser draws
    /// with `continueDrawing`, so the tool stays down until it is put down.
    @Test("The drawing tool stays armed after a shape is committed")
    func theDrawingToolStaysArmedAfterAShapeIsCommitted() async throws {
        try await withViewModel { viewModel in
            await viewModel.importFile(data: Self.geoJson(), filename: "lots.geojson")
            let row = try #require(viewModel.rows.first)
            let session = VectorEditSession(
                viewModel: viewModel, persistDelay: .milliseconds(10)
            )
            session.begin(row)
            let before = try #require(session.parsed?.features.count)

            session.startDrawing(.point)
            session.handleTap(latitude: 44.61, longitude: -63.51)

            // A point commits on placement, and the tool is still down.
            #expect(session.parsed?.features.count == before + 1)
            #expect(session.tool == .drawing(.point))
            // Named while the user still knows what it is.
            #expect(session.selectedFeatureID != nil)

            // The second one needs no trip back to the toolbar, and placing it
            // lets go of the first so its name field is not left under the new
            // shape's vertices.
            session.handleTap(latitude: 44.62, longitude: -63.52)
            #expect(session.parsed?.features.count == before + 2)
            #expect(session.tool == .drawing(.point))

            // Tapping the tool again is what puts it down.
            session.cancelDrawing()
            #expect(session.tool == .selecting)
        }
    }

    /// Clearing a scratch layer of ten marks should not be ten alerts. The
    /// browser arms a removal mode and deletes on click; the phone arms the
    /// same mode and keeps every erase undoable while it is up.
    @Test("The eraser takes features off one tap at a time, and gives them back")
    func theEraserTakesFeaturesOffOneTapAtATime() async throws {
        try await withViewModel { viewModel in
            await viewModel.importFile(data: Self.geoJson(), filename: "lots.geojson")
            let row = try #require(viewModel.rows.first)
            let session = VectorEditSession(
                viewModel: viewModel, persistDelay: .milliseconds(10)
            )
            session.begin(row)

            session.startDrawing(.point)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.62, longitude: -63.52)
            let drawn = try #require(session.parsed?.features.count)
            #expect(drawn == 3)

            session.startErasing()
            #expect(session.tool == .erasing)
            // The eraser lets go of whatever was selected, so the panel is not
            // offering a name field for a feature about to be taken off.
            #expect(session.selectedFeatureID == nil)
            #expect(session.erasedCount == 0)

            let first = try #require(session.parsed?.features.first?.id)
            session.erase(featureID: first)
            #expect(session.parsed?.features.count == drawn - 1)
            #expect(session.erasedCount == 1)

            // Still armed: the next tap erases without a trip back to the
            // toolbar.
            let second = try #require(session.parsed?.features.first?.id)
            session.erase(featureID: second)
            #expect(session.parsed?.features.count == drawn - 2)
            #expect(session.tool == .erasing)

            // Undo puts the feature back where it was, with its own id.
            session.undoLastErase()
            #expect(session.parsed?.features.count == drawn - 1)
            #expect(session.parsed?.features.contains { $0.id == second } == true)
            #expect(session.erasedCount == 1)

            // Putting the eraser down ends the run. What is gone is gone.
            session.stopErasing()
            #expect(session.tool == .selecting)
            #expect(session.erasedCount == 0)
            session.undoLastErase()
            #expect(session.parsed?.features.count == drawn - 1)

            await session.flush()
            #expect(viewModel.rows.first?.record.featureCount == drawn - 1)
        }
    }

    // MARK: - Fixtures

    private func withViewModel(
        _ body: (UserVectorsViewModel) async throws -> Void
    ) async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try await body(UserVectorsViewModel(store: UserVectorStore(directory: root)))
    }

    private static func geoJson() -> Data {
        Data(
            """
            {"type":"FeatureCollection","features":[{"type":"Feature","properties":{},\
            "geometry":{"type":"Point","coordinates":[-63.5,44.6]}}]}
            """.utf8
        )
    }
}

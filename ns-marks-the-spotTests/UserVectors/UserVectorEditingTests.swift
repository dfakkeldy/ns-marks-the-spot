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

    /// A device that cannot store a layer never takes it off the map. The
    /// browser keeps each parsed layer for the session and says so, and a
    /// reader told their import was refused would go looking for a file that
    /// is already drawn in front of them.
    @Test("A layer the device will not keep is still drawn")
    func aRefusedLibraryWriteKeepsTheImportedLayer() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        // A library document that cannot be written: a directory standing where
        // the file goes.
        try FileManager.default.createDirectory(
            at: root.appendingPathComponent("library.json"), withIntermediateDirectories: true
        )
        let viewModel = UserVectorsViewModel(store: UserVectorStore(directory: root))

        await viewModel.importFile(data: Self.geoJson(), filename: "lots.geojson")

        #expect(viewModel.rows.count == 1)
        #expect(viewModel.rows.first?.parsed?.featureCount == 1)
        #expect(viewModel.rows.first?.isVisible == true)
        // And the map still comes to it. A layer that arrived behind a panel
        // and moved nothing reads as a file the app quietly refused.
        #expect(viewModel.pendingFit != nil)
        let notice = try #require(viewModel.importNotices.first)
        #expect(notice.isRefusal == false)
        #expect(notice.message.contains("until you close the app"))
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

            // Undo puts the feature back at the index it came from, not on
            // the end: position is draw order, and a tap answers with the
            // feature on top.
            session.undoLastErase()
            #expect(session.parsed?.features.count == drawn - 1)
            #expect(session.parsed?.features.first?.id == second)
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

    /// A write suspends on storage, and the main actor is free while it does.
    /// An undo landing on top of the erase being written must not be cleared
    /// by that write finishing: the timer that would have saved the undo was
    /// cancelled by the commit that made it.
    ///
    /// The interleave is arranged rather than forced. If the runtime happens
    /// to order the two differently the test still passes, so it is weak
    /// rather than flaky.
    @Test("An undo committed mid-write is not lost when the write returns")
    func anUndoCommittedMidWriteSurvives() async throws {
        try await withViewModel { viewModel in
            await viewModel.importFile(data: Self.geoJson(), filename: "lots.geojson")
            let row = try #require(viewModel.rows.first)
            let session = VectorEditSession(
                viewModel: viewModel, persistDelay: .milliseconds(10)
            )
            session.begin(row)
            session.startDrawing(.point)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            await session.flush()

            session.startErasing()
            let doomed = try #require(session.parsed?.features.last?.id)
            session.erase(featureID: doomed)

            // The flush starts, reaches the store, and suspends there; the
            // yield hands the actor back to this body while it is in flight.
            let writing = Task { @MainActor in await session.flush() }
            await Task.yield()
            session.undoLastErase()
            #expect(await writing.value)

            // What the library holds, not what the session is showing.
            #expect(viewModel.rows.first?.parsed?.features.count == 2)
            #expect(
                viewModel.rows.first?.parsed?.features.contains { $0.id == doomed } == true
            )
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

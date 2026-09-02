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
        // A store that cannot take the layer: a directory standing where the
        // library document goes, so the read inside `add` fails before its
        // write does. Which of the two fails is not the point — what the panel
        // does with a layer the store would not take is.
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

    /// Deleting one layer must not take the others with it. The panel is
    /// reconciled against the library after a delete, and layers the device
    /// never took are not in the library — so before this they were swept off
    /// the map by somebody deleting something else entirely.
    @Test("Deleting one session-only layer leaves the rest")
    func deletingOneUnstoredLayerLeavesTheOthers() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let refusing = root.appendingPathComponent("library.json")
        try FileManager.default.createDirectory(at: refusing, withIntermediateDirectories: true)
        let viewModel = UserVectorsViewModel(store: UserVectorStore(directory: root))

        await viewModel.importFile(data: Self.geoJson(), filename: "a.geojson")
        await viewModel.importFile(data: Self.geoJson(), filename: "b.geojson")
        #expect(viewModel.rows.count == 2)

        // The device starts taking writes again, which is what makes the
        // reconciliation below succeed and have something to say.
        try FileManager.default.removeItem(at: refusing)
        let first = try #require(viewModel.rows.first?.id)
        await viewModel.delete(id: first)

        #expect(viewModel.rows.count == 1)
        #expect(viewModel.rows.first?.id != first)
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
            // Under parallel test scheduling the undo can land a moment after
            // the in-flight write returned instead of during it; then it is
            // pending, not lost, and the durability invariant this test pins
            // is that a second flush finds it. When the undo did land
            // mid-flight, this flush has nothing to do.
            #expect(await session.flush())

            // What the library holds, not what the session is showing.
            #expect(viewModel.rows.first?.parsed?.features.count == 2)
            #expect(
                viewModel.rows.first?.parsed?.features.contains { $0.id == doomed } == true
            )
        }
    }

    // MARK: - Drafts are kept

    /// The scene leaving the foreground shuts the gate at once, and only the
    /// scene coming back opens it: a mark whose task runs after the drain
    /// finds it shut.
    @Test("A suspended session takes no new work until the scene is back")
    func aSuspendedSessionTakesNoNewWork() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.beginSuspension()
            #expect(session.beginOperation() == nil)
            #expect(await session.prepareForSuspension(settlingDraft: true))
            // Returning is not resuming.
            #expect(session.beginOperation() == nil)
            session.endSuspension()
            let operation = try #require(session.beginOperation())
            session.endOperation(operation)
        }
    }

    /// Closing an area by tapping its first corner adds no vertex, so a snap
    /// on that tap records nothing: an unsnapped triangle stays untraced.
    @Test("Closing an area through a parcel snap does not invent a trace")
    func closingAnAreaThroughASnapDoesNotInventATrace() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.area)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.62, longitude: -63.52)
            session.handleTap(latitude: 44.61, longitude: -63.53)
            session.handleTap(latitude: 44.61, longitude: -63.51, parcelSnap: true)
            let area = try #require(session.parsed?.features.first)
            #expect(area.properties[CaptureSpec.tracedKey] == nil)
        }
    }

    /// A mark whose operation Done is waiting for is still this session's:
    /// it lands, and Done flushes it, rather than "the layer changed".
    @Test("A mark holding an operation lands while Done waits for it")
    func aMarkHoldingAnOperationLandsWhileDoneWaits() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            let operation = try #require(session.beginOperation())
            async let ended = session.end()
            await settles("Done to begin") { session.isEnding }
            let mark = MarkFeature.buildGpsMarkFeature(
                TrackFix(latitude: 44.61, longitude: -63.51, accuracyM: 5, timestamp: Date())
            )
            #expect(session.appendMark(mark, holding: operation))
            #expect(!session.appendMark(mark))
            #expect(await session.flush())
            session.endOperation(operation)
            #expect(await ended)
            let stored = try #require(viewModel.rows.first { $0.id == row.id })
            #expect(stored.parsed?.features.count == 1)
        }
    }

    /// A photo removal is the session's operation from the tap: registered
    /// before its first await, so Done waits for it rather than closing over
    /// the file delete.
    @Test("A photo removal is registered before it waits")
    func aPhotoRemovalIsRegisteredBeforeItWaits() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.requestRemovePhoto(featureID: "nobody", photoID: "nothing")
            #expect(session.hasOperationInFlight)
            await settles("the removal to finish") { !session.hasOperationInFlight }
        }
    }

    /// A photo file written ahead of the feature that will reference it is
    /// kept through a write of the older working copy, and swept once the
    /// reservation is let go.
    @Test("A reserved photo file survives the orphan sweep")
    func aReservedPhotoFileSurvivesTheSweep() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let empty = ParsedVector(features: [], bbox: nil)
            await viewModel.reservePhotoID("pending")
            #expect(
                await viewModel.addPhotoFile(
                    layerID: row.id, photoID: "pending", full: Data([1]), thumb: Data([2])
                )
            )
            #expect(
                await viewModel.addPhotoFile(
                    layerID: row.id, photoID: "orphan", full: Data([1]), thumb: Data([2])
                )
            )

            #expect(await viewModel.replaceGeometry(id: row.id, with: empty))
            #expect(await viewModel.photoCount(layerID: row.id) == 1)

            await viewModel.releasePhotoID("pending")
            #expect(await viewModel.replaceGeometry(id: row.id, with: empty))
            #expect(await viewModel.photoCount(layerID: row.id) == 0)
        }
    }

    /// A photo's location says nothing about height: accepting it moves the
    /// point and leaves an imported elevation behind, rather than carrying
    /// it to a spot it was never measured at.
    @Test("A photo's location does not carry the point's altitude with it")
    func acceptingAPhotoLocationLeavesTheAltitudeBehind() async throws {
        try await withViewModel { viewModel in
            let geoJson = Data(
                """
                {"type":"FeatureCollection","features":[{"type":"Feature","id":"p1",\
                "geometry":{"type":"Point","coordinates":[-63.5,44.6,120.5]},\
                "properties":{"name":"Cairn","nsmts:altitudeM":120.5}}]}
                """.utf8
            )
            await viewModel.importFile(data: geoJson, filename: "cairn.geojson")
            let imported = try #require(viewModel.rows.first)
            let row = try #require(await viewModel.loadedRow(id: imported.id))
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            let featureID = try #require(session.parsed?.features.first?.id)
            #expect(
                session.parsed?.features.first?.geometry
                    == .point(GeoJsonPosition(lng: -63.5, lat: 44.6, altitude: 120.5))
            )

            session.offerPhotoLocation(
                VectorEditSession.PhotoLocationOffer(
                    featureID: featureID,
                    position: GeoJsonPosition(lng: -63.4, lat: 44.7),
                    distanceM: 13_000
                )
            )
            session.acceptPhotoLocationOffer()

            let moved = try #require(session.parsed?.features.first)
            #expect(moved.geometry == .point(GeoJsonPosition(lng: -63.4, lat: 44.7)))
            // The stored altitude property goes too; the name stays.
            #expect(moved.properties[CaptureSpec.altitudeKey] == nil)
            #expect(moved.properties["name"]?.stringValue == "Cairn")
            #expect(session.photoLocationOffer == nil)
        }
    }

    /// The reported disappearance: two taps of a line, then Done, as anywhere
    /// else in iOS. The line is a shape, so Done keeps it.
    @Test("Done finishes a draft that is already a shape")
    func doneFinishesAFinishableDraft() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.line)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.62, longitude: -63.52)
            #expect(session.parsed?.features.isEmpty == true)

            #expect(await session.end())

            let stored = try #require(viewModel.rows.first { $0.id == row.id })
            #expect(stored.record.featureCount == 1)
            #expect(stored.parsed?.features.count == 1)
        }
    }

    @Test("Switching tools finishes a draft that is already a shape")
    func aToolSwitchFinishesAFinishableDraft() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.line)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.62, longitude: -63.52)

            session.startDrawing(.area)

            #expect(session.parsed?.features.count == 1)
            #expect(session.tool == .drawing(.area))
            #expect(session.draft?.vertices.isEmpty == true)
        }
    }

    @Test("Re-tapping the lit tool finishes the shape and puts the tool down")
    func reTappingTheToolFinishesAFinishableDraft() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.area)
            for (lat, lng) in [(44.61, -63.51), (44.62, -63.52), (44.63, -63.51)] {
                session.handleTap(latitude: lat, longitude: lng)
            }

            session.cancelDrawing()

            #expect(session.parsed?.features.count == 1)
            #expect(session.tool == .selecting)
            #expect(session.draft == nil)
        }
    }

    @Test("Arming the eraser finishes a shape rather than erasing it by implication")
    func armingTheEraserFinishesAFinishableDraft() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.line)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.62, longitude: -63.52)

            session.startErasing()

            #expect(session.parsed?.features.count == 1)
            #expect(session.tool == .erasing)
        }
    }

    /// Two taps is not an area. The draft is neither committed nor thrown
    /// away on its own: it is left in place and the panel asks.
    @Test("A partial draft is kept for the reader to decide about")
    func aPartialDraftIsKeptForTheReaderToDecide() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.area)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.62, longitude: -63.52)

            #expect(session.settleDraft() == .needsConfirmation)
            #expect(session.draft?.vertices.count == 2)
            #expect(session.parsed?.features.isEmpty == true)

            // The reader chose to let it go.
            session.discardDraft()
            #expect(session.draft == nil)
            #expect(session.parsed?.features.isEmpty == true)
        }
    }

    @Test("An empty draft is nothing to ask about")
    func anEmptyDraftIsNothingToAskAbout() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.line)

            #expect(session.settleDraft() == .cleared)
            #expect(session.parsed?.features.isEmpty == true)
        }
    }

    /// Finish is an explicit end. With the tool still up, a tap near a corner
    /// of the new line placed a fresh vertex instead of selecting the line to
    /// drag it; points keep their tool, as the test above pins.
    @Test("Finishing a line or area puts the tool down")
    func finishingALineOrAreaPutsTheToolDown() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.line)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.62, longitude: -63.52)

            session.finishDrawing()

            #expect(session.parsed?.features.count == 1)
            #expect(session.tool == .selecting)
            // Selected, so its corners grow handles at once.
            #expect(session.selectedFeatureID != nil)
        }
    }

    /// A mark moved by hand is no longer where the fix put it. Its GPS claim
    /// goes with the move, or the callout would read "Marked from GPS (±5 m)"
    /// over a point somebody dragged; the name and the creation stamp stay.
    @Test("Moving a GPS mark by hand takes its GPS provenance with it")
    func movingAMarkByHandDropsItsGpsProvenance() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            let fix = TrackFix(
                latitude: 45.80849, longitude: -61.47137, altitudeM: 12, accuracyM: 5,
                timestamp: Date()
            )
            session.appendMark(MarkFeature.buildGpsMarkFeature(fix))
            let marked = try #require(session.parsed?.features.last)
            let id = try #require(marked.id)
            #expect(marked.properties[CaptureSpec.accuracyKey] != nil)
            #expect(marked.properties[CaptureSpec.capturedAtKey] != nil)
            session.updateSelectedFeature(name: "Culvert", description: nil)

            session.moveVertex(featureID: id, ring: 0, vertex: 0, latitude: 45.809, longitude: -61.472)

            let dragged = try #require(session.parsed?.features.last)
            #expect(dragged.properties[CaptureSpec.accuracyKey] == nil)
            #expect(dragged.properties[CaptureSpec.capturedAtKey] == nil)
            #expect(dragged.properties[CaptureSpec.altitudeKey] == nil)
            // The fix's altitude was measured where the fix was.
            if case .point(let at)? = dragged.geometry { #expect(at.altitude == nil) }
            // What the reader wrote is still true of the point.
            #expect(dragged.properties["name"]?.stringValue == "Culvert")
            #expect(VectorFeatureCallout(feature: dragged, record: row.record).gpsProvenance == nil)

            // Carrying the whole feature is a move too.
            session.appendMark(MarkFeature.buildGpsMarkFeature(fix))
            let second = try #require(session.parsed?.features.last?.id)
            session.moveFeature(featureID: second, latitudeDelta: 0.001, longitudeDelta: 0)
            let carried = try #require(session.parsed?.features.last)
            #expect(carried.properties[CaptureSpec.accuracyKey] == nil)
            #expect(carried.properties[CaptureSpec.capturedAtKey] == nil)

            // A move that moved nothing is not an edit and keeps the claim.
            session.appendMark(MarkFeature.buildGpsMarkFeature(fix))
            let still = try #require(session.parsed?.features.last?.id)
            session.moveFeature(featureID: still, latitudeDelta: 0, longitudeDelta: 0)
            session.moveVertex(featureID: still, ring: 0, vertex: 0, latitude: 45.80849, longitude: -61.47137)
            session.moveVertex(featureID: still, ring: 3, vertex: 9, latitude: 45.9, longitude: -61.5)
            let unmoved = try #require(session.parsed?.features.last)
            #expect(unmoved.properties[CaptureSpec.accuracyKey] != nil)

            // And so is taking a photo's own position: the point then sits
            // where the photo says, not where the fix put it.
            session.appendMark(MarkFeature.buildGpsMarkFeature(fix))
            let third = try #require(session.parsed?.features.last?.id)
            session.select(featureID: third)
            session.offerPhotoLocationForTesting(
                featureID: third, position: GeoJsonPosition(lng: -61.470, lat: 45.810)
            )
            session.acceptPhotoLocationOffer()
            let relocated = try #require(session.parsed?.features.last)
            #expect(relocated.properties[CaptureSpec.accuracyKey] == nil)
            #expect(relocated.properties[CaptureSpec.capturedAtKey] == nil)
            guard case .point(let at)? = relocated.geometry else {
                Issue.record("expected a point")
                return
            }
            #expect(abs(at.lat - 45.810) < 0.000001)
        }
    }

    /// A file's elevations are the file's: a corner moved on the map keeps
    /// its third coordinate, one corner at a time or the whole shape at once.
    @Test("Moving an imported point keeps its elevation")
    func movingAnImportedPointKeepsItsElevation() async throws {
        try await withViewModel { viewModel in
            let data = Data(
                """
                {"type":"FeatureCollection","features":[{"type":"Feature","properties":{},\
                "geometry":{"type":"LineString","coordinates":[[-63.5,44.6,120.5],[-63.4,44.7,131]]}}]}
                """.utf8
            )
            await viewModel.importFile(data: data, filename: "ridge.geojson")
            let row = try #require(viewModel.rows.first)
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            let id = try #require(session.parsed?.features.first?.id)

            #expect(session.moveVertex(featureID: id, ring: 0, vertex: 0, latitude: 44.61, longitude: -63.51) == .moved)
            guard case .lineString(let line)? = session.parsed?.features.first?.geometry else {
                Issue.record("expected a line")
                return
            }
            #expect(line[0].altitude == 120.5)
            #expect(line[1].altitude == 131)

            #expect(session.moveFeature(featureID: id, latitudeDelta: 0.01, longitudeDelta: 0) == .moved)
            guard case .lineString(let carried)? = session.parsed?.features.first?.geometry else {
                Issue.record("expected a line")
                return
            }
            #expect(carried.map(\.altitude) == [120.5, 131])
        }
    }

    /// A photo point's top-level capture time says when this position was
    /// captured. Moved by hand, the position no longer is, so the key goes;
    /// the photo's own date lives on its descriptor and is untouched.
    @Test("Moving a photo point drops the position's capture time")
    func movingAPhotoPointDropsThePositionsCaptureTime() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            let photo = GeoJsonFeature(
                id: "photo-1",
                geometry: .point(GeoJsonPosition(lng: -61.47, lat: 45.80)),
                properties: [CaptureSpec.capturedAtKey: .string("2026-09-02T10:00:00.000Z")]
            )
            session.appendMark(photo)
            #expect(!VectorEditSession.isGpsMark(photo))

            #expect(session.moveVertex(featureID: "photo-1", ring: 0, vertex: 0, latitude: 45.81, longitude: -61.48) == .moved)
            let moved = try #require(session.parsed?.features.last)
            #expect(moved.properties[CaptureSpec.capturedAtKey] == nil)

            let again = GeoJsonFeature(
                id: "photo-2",
                geometry: .point(GeoJsonPosition(lng: -61.47, lat: 45.80)),
                properties: [CaptureSpec.capturedAtKey: .string("2026-09-02T10:00:00.000Z")]
            )
            session.appendMark(again)
            session.moveFeature(featureID: "photo-2", latitudeDelta: 0.001, longitudeDelta: 0)
            let carried = try #require(session.parsed?.features.last)
            #expect(carried.properties[CaptureSpec.capturedAtKey] == nil)
        }
    }

    /// The GPS-mark test is the callout's: a Point with a capture time and a
    /// finite accuracy. Anything less is not a claim the app makes, and
    /// nothing is deleted from it.
    @Test("Only a real GPS mark is one")
    func onlyARealGpsMarkIsOne() {
        let point = GeoJsonGeometry.point(GeoJsonPosition(lng: -63.5, lat: 44.6, altitude: 120.5))
        func feature(_ properties: [String: JSONValue], geometry: GeoJsonGeometry = point) -> GeoJsonFeature {
            GeoJsonFeature(id: "f", geometry: geometry, properties: properties)
        }
        let when = JSONValue.string("2026-09-02T10:00:00.000Z")
        #expect(VectorEditSession.isGpsMark(feature([CaptureSpec.capturedAtKey: when, CaptureSpec.accuracyKey: .number(6.7)])))
        #expect(!VectorEditSession.isGpsMark(feature([CaptureSpec.accuracyKey: .number(6.7)])))
        #expect(!VectorEditSession.isGpsMark(feature([CaptureSpec.capturedAtKey: when, CaptureSpec.accuracyKey: .null])))
        #expect(!VectorEditSession.isGpsMark(feature([CaptureSpec.capturedAtKey: when, CaptureSpec.accuracyKey: .string("6.7")])))
        #expect(!VectorEditSession.isGpsMark(feature([CaptureSpec.capturedAtKey: when])))
        // A blank capture time is no capture time, on either surface.
        #expect(!VectorEditSession.isGpsMark(feature([CaptureSpec.capturedAtKey: .string("   "), CaptureSpec.accuracyKey: .number(6.7)])))
        #expect(!VectorEditSession.isGpsMark(feature(
            [CaptureSpec.capturedAtKey: when, CaptureSpec.accuracyKey: .number(6.7)],
            geometry: .lineString([GeoJsonPosition(lng: -63.5, lat: 44.6), GeoJsonPosition(lng: -63.4, lat: 44.7)])
        )))
    }

    /// An imported point with an accuracy attribute and no capture time is
    /// not a GPS mark: moving it keeps its elevation and its attribute.
    @Test("Moving an accuracy-only point keeps its elevation")
    func movingAnAccuracyOnlyPointKeepsItsElevation() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.appendMark(
                GeoJsonFeature(
                    id: "imported",
                    geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6, altitude: 120.5)),
                    properties: [CaptureSpec.accuracyKey: .number(6.7)]
                )
            )

            #expect(session.moveVertex(featureID: "imported", ring: 0, vertex: 0, latitude: 44.61, longitude: -63.51) == .moved)

            let moved = try #require(session.parsed?.features.last)
            #expect(moved.properties[CaptureSpec.accuracyKey]?.doubleValue == 6.7)
            guard case .point(let at)? = moved.geometry else {
                Issue.record("expected a point")
                return
            }
            #expect(at.altitude == 120.5)
        }
    }

    /// `nsmts:traced` is event-time provenance, by the field-capture
    /// contract: a feature that ever took a corner from a parcel snap keeps
    /// the stamp — and the Province's attribution and the not-a-survey
    /// caveat — through later moves, point or line alike. The web does the
    /// same; conservative over-labelling is acceptable, silent under-labelling
    /// is not.
    @Test("A traced feature keeps its stamp when moved")
    func aTracedFeatureKeepsItsStampWhenMoved() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.point)
            session.handleTap(latitude: 45.80, longitude: -61.47, parcelSnap: true)
            let point = try #require(session.selectedFeatureID)
            #expect(VectorEditSession.isTraced(try #require(session.parsed?.features.last)))

            #expect(session.moveVertex(featureID: point, ring: 0, vertex: 0, latitude: 45.81, longitude: -61.48) == .moved)
            #expect(VectorEditSession.isTraced(try #require(session.parsed?.features.last)))
            #expect(session.moveFeature(featureID: point, latitudeDelta: 0.001, longitudeDelta: 0) == .moved)
            #expect(VectorEditSession.isTraced(try #require(session.parsed?.features.last)))

            session.startDrawing(.line)
            session.handleTap(latitude: 45.82, longitude: -61.49, parcelSnap: true)
            session.handleTap(latitude: 45.83, longitude: -61.50)
            session.finishDrawing()
            let line = try #require(session.selectedFeatureID)
            // The only snapped corner moved away: the stamp stays, as the
            // contract says it must.
            #expect(session.moveVertex(featureID: line, ring: 0, vertex: 0, latitude: 45.84, longitude: -61.51) == .moved)
            #expect(VectorEditSession.isTraced(try #require(session.parsed?.features.last)))
        }
    }

    /// A drag that snaps back onto the coordinate the vertex already had is
    /// not a move — but it was a parcel snap, and the trace is recorded.
    @Test("An exact snap back still records the parcel trace")
    func anExactSnapBackStillRecordsTheParcelTrace() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.point)
            session.handleTap(latitude: 45.80, longitude: -61.47)
            let id = try #require(session.selectedFeatureID)
            #expect(session.parsed?.features.last?.properties[CaptureSpec.tracedKey] == nil)

            let outcome = session.moveVertex(
                featureID: id, ring: 0, vertex: 0, latitude: 45.80, longitude: -61.47, parcelSnap: true
            )

            #expect(outcome == .unchanged)
            let traced = try #require(session.parsed?.features.last)
            #expect(traced.properties[CaptureSpec.tracedKey]?.stringValue == CaptureSpec.tracedParcelValue)
        }
    }

    /// Once Done has begun, a handle that is still on screen moves nothing:
    /// a move committed after the final flush would be lost with the session.
    @Test("Moves are refused once Done has begun")
    func movesAreRefusedOnceDoneHasBegun() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.point)
            session.handleTap(latitude: 45.80, longitude: -61.47)
            let id = try #require(session.selectedFeatureID)
            let gate = Gate()
            session.beginAttachment { await gate.wait() }

            async let ended = session.end()
            // Until Done has begun, not one turn of the run loop: the child
            // task's first suspension is not guaranteed after a single yield.
            await settles("Done to begin") { session.isEnding }
            #expect(session.isEnding)
            #expect(session.moveVertex(featureID: id, ring: 0, vertex: 0, latitude: 45.9, longitude: -61.5) == .refused)
            #expect(session.moveFeature(featureID: id, latitudeDelta: 0.1, longitudeDelta: 0) == .refused)
            gate.open()
            #expect(await ended)

            let stored = try #require(viewModel.rows.first { $0.id == row.id })
            guard case .point(let at)? = stored.parsed?.features.first?.geometry else {
                Issue.record("expected a point")
                return
            }
            #expect(abs(at.lat - 45.80) < 0.000001)
        }
    }

    /// A point placed with the crosshair or a press-and-hold is a drawn point,
    /// not a fix: it goes through the same tap handler and carries only its
    /// creation stamp, never `nsmts:capturedAt` or `nsmts:accuracyM`.
    @Test("A reticle-placed point carries no GPS provenance")
    func aReticlePlacedPointCarriesNoGpsProvenance() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.point)

            session.handleTap(latitude: 45.80849, longitude: -61.47137)

            let placed = try #require(session.parsed?.features.last)
            #expect(placed.properties[CaptureSpec.createdAtKey] != nil)
            #expect(placed.properties[CaptureSpec.capturedAtKey] == nil)
            #expect(placed.properties[CaptureSpec.accuracyKey] == nil)
            #expect(placed.properties[CaptureSpec.altitudeKey] == nil)
            #expect(VectorFeatureCallout(feature: placed, record: row.record).gpsProvenance == nil)
        }
    }

    /// Numbers that are not a place on Earth never reach the layer, whatever
    /// path offers them.
    @Test("An invalid coordinate is never placed or moved to")
    func anInvalidCoordinateIsNeverPlaced() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.point)
            session.handleTap(latitude: .nan, longitude: -63.5)
            session.handleTap(latitude: 91, longitude: -63.5)
            session.handleTap(latitude: 44.6, longitude: .infinity)
            #expect(session.parsed?.features.isEmpty == true)

            session.handleTap(latitude: 44.6, longitude: -63.5)
            let id = try #require(session.selectedFeatureID)
            #expect(session.moveVertex(featureID: id, ring: 0, vertex: 0, latitude: .nan, longitude: -63.4) == .unchanged)
            #expect(!VectorEditSession.isPlaceable(latitude: 44.6, longitude: 181))
        }
    }

    // MARK: - Points snap to lines, not to other points

    /// With the Point tool up, an existing point is not a snap target; a
    /// point snapped onto it would be an invisible duplicate. Lines stay
    /// targets, and every other tool keeps every target.
    @Test("The Point tool does not snap to the layer's own points")
    func thePointToolDoesNotSnapToOwnPoints() {
        let point = GeoJsonGeometry.point(GeoJsonPosition(lng: -63.5, lat: 44.6))
        let line = GeoJsonGeometry.lineString([
            GeoJsonPosition(lng: -63.5, lat: 44.6), GeoJsonPosition(lng: -63.4, lat: 44.7),
        ])
        let pointTool = VectorEditSession.Tool.drawing(.point)
        #expect(VectorEditSession.snapTargetGeometry(point, tool: pointTool) == nil)
        #expect(VectorEditSession.snapTargetGeometry(.multiPoint([]), tool: pointTool) == nil)
        // A KML MultiGeometry with a point and a line keeps its line.
        #expect(
            VectorEditSession.snapTargetGeometry(.collection([line, point]), tool: pointTool)
                == .collection([line])
        )
        #expect(VectorEditSession.snapTargetGeometry(.collection([point]), tool: pointTool) == nil)
        #expect(VectorEditSession.snapTargetGeometry(line, tool: pointTool) == line)
        #expect(VectorEditSession.snapTargetGeometry(point, tool: .drawing(.line)) == point)
        #expect(VectorEditSession.snapTargetGeometry(point, tool: .drawing(.area)) == point)
        #expect(VectorEditSession.snapTargetGeometry(point, tool: .selecting) == point)
    }

    /// A snap onto the corner just placed would add the same position twice:
    /// a zero-length segment that counts as a line and draws nothing.
    @Test("The same spot twice in a row is one corner, and says so")
    func theSameSpotTwiceIsOneCorner() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.line)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.61, longitude: -63.51)

            #expect(session.draft?.vertices.count == 1)
            #expect(session.snapNotice == "Already a corner here.")
            // Not a shape yet, so Done would ask rather than store [A, A].
            #expect(session.settleDraft() == .needsConfirmation)
        }
    }

    /// A, B, A is two corners, not an area; A, B, C, A is the classic close.
    @Test("Tapping the first corner again closes an area, and never fakes one")
    func tappingTheFirstCornerClosesAnAreaOrIsRefused() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.area)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.62, longitude: -63.52)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            #expect(session.draft?.vertices.count == 2)
            #expect(session.snapNotice == "Already a corner here.")
            #expect(session.settleDraft() == .needsConfirmation)

            session.handleTap(latitude: 44.63, longitude: -63.51)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            #expect(session.parsed?.features.count == 1)
            #expect(session.draft == nil)
            guard case .polygon(let rings)? = session.parsed?.features.first?.geometry else {
                Issue.record("expected a polygon")
                return
            }
            #expect(rings.first?.count == 4)
            #expect(rings.first?.first == rings.first?.last)
        }
    }

    @Test("A snap is said in words, by what it snapped to")
    func aSnapIsSaidInWords() {
        #expect(
            VectorEditSession.snapNoticeText(source: .ownFeature, kind: .vertex)
                == "Snapped to an existing point."
        )
        #expect(
            VectorEditSession.snapNoticeText(source: .ownFeature, kind: .edge)
                == "Snapped to an existing edge."
        )
        #expect(
            VectorEditSession.snapNoticeText(source: .parcel, kind: .edge)
                == "Snapped to a parcel boundary."
        )
        #expect(
            VectorEditSession.snapNoticeText(source: .parcel, kind: .vertex)
                == "Snapped to a parcel boundary."
        )
        // With the Point tool armed a vertex can only be a line or area corner.
        #expect(
            VectorEditSession.snapNoticeText(source: .ownFeature, kind: .vertex, pointToolArmed: true)
                == "Snapped to an existing corner."
        )
    }

    // MARK: - A hidden layer does not swallow the work

    @Test("Editing a hidden layer says so, and Done switches it on")
    func editingAHiddenLayerSwitchesItOnAtDone() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            viewModel.setVisible(false, id: row.id)
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            #expect(session.layerIsHidden)

            session.startDrawing(.point)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            #expect(await session.end())

            #expect(viewModel.rows.first { $0.id == row.id }?.isVisible == true)
        }
    }

    /// A session that only looked changed nothing, and leaves the switch
    /// where the reader put it.
    @Test("A hidden layer that was only looked at stays hidden")
    func aHiddenLayerOnlyLookedAtStaysHidden() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            viewModel.setVisible(false, id: row.id)
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)

            #expect(await session.end())

            #expect(viewModel.rows.first { $0.id == row.id }?.isVisible == false)
        }
    }

    @Test("Show now switches the layer on at once")
    func showNowSwitchesTheLayerOn() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            viewModel.setVisible(false, id: row.id)
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)

            await session.showLayer()

            #expect(session.layerIsHidden == false)
        }
    }

    // MARK: - The just-committed point is seen

    @Test("A committed feature is highlighted for a moment, then not")
    func aCommittedFeatureIsHighlightedForAMoment() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.commitHighlightLifetime = .milliseconds(20)
            session.begin(row)
            session.startDrawing(.point)

            session.handleTap(latitude: 44.61, longitude: -63.51)

            let committed = try #require(session.selectedFeatureID)
            #expect(session.recentlyCommittedFeatureID == committed)
            await settles("the highlight coming off") {
                session.recentlyCommittedFeatureID == nil
            }
        }
    }

    // MARK: - Round-four refutations

    /// An out-and-back track comes back to an earlier corner. Only the corner
    /// just placed is a zero-length segment.
    @Test("A line may return to an earlier corner")
    func aLineMayReturnToAnEarlierCorner() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.line)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.62, longitude: -63.52)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            #expect(session.draft?.vertices.count == 3)

            // The same corner twice in a row is still refused.
            session.handleTap(latitude: 44.61, longitude: -63.51)
            #expect(session.draft?.vertices.count == 3)
        }
    }

    /// The first corner snapped to a parcel and was undone; the line that was
    /// finished has no coordinate from NSPRD and must not claim one.
    @Test("Undoing a snapped corner takes its provenance with it")
    func undoingASnappedCornerTakesItsProvenanceWithIt() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.line)
            session.handleTap(latitude: 44.60, longitude: -63.50, parcelSnap: true)
            #expect(session.draftSnappedToParcel)
            session.undoLastVertex()
            #expect(!session.draftSnappedToParcel)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            session.handleTap(latitude: 44.62, longitude: -63.52)
            session.finishDrawing()

            let line = try #require(session.parsed?.features.last)
            #expect(line.properties[CaptureSpec.tracedKey] == nil)

            // And a snapped corner that survives does stamp the shape.
            session.startDrawing(.line)
            session.handleTap(latitude: 44.63, longitude: -63.53, parcelSnap: true)
            session.handleTap(latitude: 44.64, longitude: -63.54)
            session.finishDrawing()
            let traced = try #require(session.parsed?.features.last)
            #expect(traced.properties[CaptureSpec.tracedKey]?.stringValue == CaptureSpec.tracedParcelValue)
        }
    }

    /// Holds an attachment open until the test lets it finish.
    nonisolated final class Gate: @unchecked Sendable {
        private let lock = NSLock()
        private var waiter: CheckedContinuation<Void, Never>?
        private var opened = false
        private(set) var finished = false

        func wait() async {
            await withCheckedContinuation { continuation in
                lock.lock()
                if opened {
                    lock.unlock()
                    continuation.resume()
                    return
                }
                waiter = continuation
                lock.unlock()
            }
        }

        func open() {
            lock.lock()
            opened = true
            let pending = waiter
            waiter = nil
            lock.unlock()
            pending?.resume()
        }

        func markFinished() {
            lock.lock()
            finished = true
            lock.unlock()
        }
    }

    /// A photo picked a moment before Done: Done waits for it, and a mark
    /// arriving meanwhile is refused rather than written into the closing
    /// session.
    @Test("Done waits for an attachment in flight and refuses a late mark")
    func doneWaitsForAnAttachmentInFlight() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.point)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            let featureID = try #require(session.selectedFeatureID)
            let gate = Gate()
            session.beginAttachment {
                await gate.wait()
                session.updateFeatureProperties(featureID: featureID, patch: ["note": .string("late")])
                gate.markFinished()
            }
            #expect(session.hasAttachmentInFlight)

            async let ended = session.end()
            // Until Done has begun, not one turn of the run loop: the child
            // task's first suspension is not guaranteed after a single yield.
            await settles("Done to begin") { session.isEnding }
            #expect(session.isEnding)
            #expect(!gate.finished)
            let mark = GeoJsonFeature(
                id: "mark", geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6)), properties: [:]
            )
            #expect(!session.appendMark(mark))

            gate.open()
            #expect(await ended)
            #expect(gate.finished)
            #expect(!session.hasAttachmentInFlight)
            let stored = try #require(viewModel.rows.first { $0.id == row.id })
            #expect(stored.parsed?.features.count == 1)
            #expect(stored.parsed?.features.first?.properties["note"]?.stringValue == "late")
        }
    }

    /// A mark being written, or a Show now in flight, is an operation the
    /// session outlives: Done waits for it.
    @Test("Done waits for an operation in flight")
    func doneWaitsForAnOperationInFlight() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            let operation = try #require(session.beginOperation())
            #expect(session.hasOperationInFlight)

            async let ended = session.end()
            // Until Done has begun, not one turn of the run loop: the child
            // task's first suspension is not guaranteed after a single yield.
            await settles("Done to begin") { session.isEnding }
            #expect(session.isEnding)
            #expect(session.isEditing)

            session.endOperation(operation)
            #expect(await ended)
            #expect(!session.isEditing)
        }
    }

    /// Work cannot register once Done has begun: it would slip past the
    /// drain. And the app being put away waits for what Done would wait for.
    @Test("Late operations are refused and suspension drains the rest")
    func lateOperationsAreRefusedAndSuspensionDrains() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.point)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            let featureID = try #require(session.selectedFeatureID)

            let gate = Gate()
            session.beginAttachment {
                await gate.wait()
                session.updateFeatureProperties(featureID: featureID, patch: ["note": .string("kept")])
                gate.markFinished()
            }
            async let suspended = session.prepareForSuspension(settlingDraft: true)
            await settles("the drain to begin") { session.hasAttachmentInFlight }
            #expect(!gate.finished)
            gate.open()
            #expect(await suspended)
            #expect(gate.finished)
            let stored = try #require(viewModel.rows.first { $0.id == row.id })
            #expect(stored.parsed?.features.first?.properties["note"]?.stringValue == "kept")
            // The session is still open: suspension is not Done. It takes no
            // new work until the scene comes back, though — that is what the
            // gate is for — so the rest of this stands after the return.
            #expect(session.isEditing)
            #expect(session.beginOperation() == nil)
            session.endSuspension()

            let late = Gate()
            session.beginAttachment { await late.wait() }
            async let ended = session.end()
            await settles("Done to begin") { session.isEnding }
            #expect(session.beginOperation() == nil)
            late.open()
            #expect(await ended)
        }
    }

    /// A picker that could not load some of what was chosen says so; the
    /// message names the count.
    @Test("Photos that could not be loaded are counted out loud")
    func photosThatCouldNotBeLoadedAreCounted() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.point)
            session.handleTap(latitude: 44.61, longitude: -63.51)
            let id = try #require(session.selectedFeatureID)

            await session.attachPhotos([], to: id, failedLoads: 2)

            #expect(session.photoMessages == ["2 selected photos could not be loaded from your library."])
        }
    }

    /// A rename is a change: the panel promised any change would switch a
    /// hidden layer on.
    @Test("A rename counts as an edit of a hidden layer")
    func aRenameCountsAsAnEdit() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            viewModel.setVisible(false, id: row.id)
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            #expect(session.layerIsHidden)

            await session.renameLayer("Culverts")
            #expect(await session.end())

            let stored = try #require(viewModel.rows.first { $0.id == row.id })
            #expect(stored.record.name == "Culverts")
            #expect(stored.isVisible)
        }
    }

    /// The same words twice are two events to VoiceOver.
    @Test("A repeated notice is a new event")
    func aRepeatedNoticeIsANewEvent() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            let before = session.snapNoticeGeneration
            session.noteEraseMiss()
            session.noteEraseMiss()
            #expect(session.snapNoticeGeneration == before + 2)
            #expect(session.snapNotice == "No feature here.")
        }
    }

    /// Show now that works after one that did not: the earlier failure comes
    /// down.
    @Test("A successful Show now clears the earlier failure")
    func aSuccessfulShowNowClearsTheEarlierFailure() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            viewModel.setVisible(false, id: row.id)
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            #expect(session.layerIsHidden)
            #expect(await session.showLayer())
            #expect(session.storageError == nil)
            #expect(!session.layerIsHidden)
        }
    }

    // MARK: - Clusters in the reader's own photo layers

    /// Two photos taken from one spot cluster for good; the card shows both
    /// rather than the first alone.
    @Test("A cluster in a photo layer opens as one card with every photo")
    func aClusterInAPhotoLayerOpensAsOneCard() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            func photoPoint(_ id: String, photo: String, at: String) -> GeoJsonFeature {
                GeoJsonFeature(
                    id: id,
                    geometry: .point(GeoJsonPosition(lng: -61.47, lat: 45.80)),
                    properties: [
                        CaptureSpec.photosKey: PhotoDescriptor.propertyValue(
                            internalForm: [PhotoDescriptor(id: photo, capturedAt: at)]
                        ),
                        CaptureSpec.capturedAtKey: .string(at),
                    ]
                )
            }
            #expect(await viewModel.appendFeature(photoPoint("p1", photo: "one", at: "2026-09-02T10:00:00.000Z"), to: row.id))
            #expect(await viewModel.appendFeature(photoPoint("p2", photo: "two", at: "2026-09-02T10:05:00.000Z"), to: row.id))

            let card = try #require(
                viewModel.callout(clusterMemberIDs: ["\(row.id)/p1", "\(row.id)/p2"])
            )
            #expect(card.photos.map(\.id) == ["one", "two"])
            #expect(card.callout.title == "2 photos here")
            #expect(card.layerID == row.id)
            // One member is that member's own card.
            #expect(viewModel.callout(clusterMemberIDs: ["\(row.id)/p1"])?.photos.map(\.id) == ["one"])
            // Members from two layers are not one card.
            #expect(viewModel.callout(clusterMemberIDs: ["\(row.id)/p1", "other/p2"]) == nil)
        }
    }

    // MARK: - A library this build cannot read

    /// A library written by a newer build is left alone and named: the panel
    /// says why the list is empty, and a write is refused in the library's
    /// words rather than "free some space".
    @Test("A newer-version library is sealed and says so")
    func aNewerVersionLibraryIsSealedAndSaysSo() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data(#"{"version": 999, "layers": []}"#.utf8)
            .write(to: root.appendingPathComponent("library.json"))
        let viewModel = UserVectorsViewModel(store: UserVectorStore(directory: root))

        await viewModel.load()

        #expect(viewModel.isLibrarySealed)
        #expect(viewModel.sealedMessage?.contains("newer version") == true)
        #expect(viewModel.rows.isEmpty)

        let row = await viewModel.newDrawingLayer()
        #expect(row == nil)
        #expect(viewModel.lastRefusal?.userMessage.contains("newer version") == true)
        #expect(viewModel.lastRefusal?.userMessage.contains("space") == false)
        #expect(viewModel.sealedReason == .laterVersion)

        // An import is refused in the same words, and nothing is written.
        await viewModel.importFile(data: Self.geoJson(), filename: "lots.geojson")
        #expect(viewModel.lastRefusal?.userMessage.contains("newer version") == true)
        #expect(viewModel.importNotices.last?.message.contains("newer version") == true)
        #expect(viewModel.rows.isEmpty)
        // Not a newer build's document to set aside.
        #expect(await viewModel.setAsideDamagedLibrary() == false)

        // And the directory holds exactly what it did: the library, alone.
        let contents = try FileManager.default.contentsOfDirectory(atPath: root.path)
        #expect(contents == ["library.json"])
        let kept = try String(contentsOf: root.appendingPathComponent("library.json"), encoding: .utf8)
        #expect(kept.contains("999"))
    }

    /// An import that arrives before the library has been read: the store's
    /// refusal seals the library on the spot, in its words, and nothing of the
    /// file is kept as a session-only row.
    @Test("An import racing the first load is refused in the library's words")
    func anImportRacingTheFirstLoadIsRefusedInTheLibrarysWords() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data(#"{"version": 999, "layers": []}"#.utf8)
            .write(to: root.appendingPathComponent("library.json"))
        let viewModel = UserVectorsViewModel(store: UserVectorStore(directory: root))
        #expect(!viewModel.isLibrarySealed)

        await viewModel.importFile(data: Self.geoJson(), filename: "lots.geojson")

        #expect(viewModel.isLibrarySealed)
        #expect(viewModel.sealedReason == .laterVersion)
        #expect(viewModel.rows.isEmpty)
        #expect(viewModel.importNotices.last?.message.contains("newer version") == true)
        #expect(viewModel.importNotices.last?.message.contains("space") == false)
        #expect(try FileManager.default.contentsOfDirectory(atPath: root.path) == ["library.json"])
    }

    /// A library damaged at this build's own version can be set aside — moved,
    /// never deleted — and a new one begun.
    @Test("A damaged library can be set aside and a new one started")
    func aDamagedLibraryCanBeSetAside() async throws {
        let parent = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let root = parent.appendingPathComponent("UserVectors", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: parent) }
        try Data(#"{"version":3,"layers":[}"#.utf8).write(to: root.appendingPathComponent("library.json"))
        let viewModel = UserVectorsViewModel(store: UserVectorStore(directory: root))

        await viewModel.load()
        #expect(viewModel.isLibrarySealed)
        #expect(viewModel.sealedReason == .unreadable)

        #expect(await viewModel.setAsideDamagedLibrary())

        #expect(!viewModel.isLibrarySealed)
        #expect(viewModel.recoveryNotice?.contains("Nothing was deleted") == true)
        let setAside = parent.appendingPathComponent("UserVectors-damaged", isDirectory: true)
        #expect(FileManager.default.fileExists(atPath: setAside.appendingPathComponent("library.json").path))
        // And the new library takes a layer.
        #expect(await viewModel.newDrawingLayer() != nil)
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

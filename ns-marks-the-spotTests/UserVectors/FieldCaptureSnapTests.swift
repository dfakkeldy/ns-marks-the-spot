import Foundation
import GeoCore
import Testing

@testable import ns_marks_the_spot

/// Parcel-snap stamps `nsmts:traced` at event time, and a new draft does
/// not inherit the previous shape's flag.
@Suite("Field-capture snapping")
@MainActor
struct FieldCaptureSnapTests {
    @Test("A parcel snap stamps traced and createdAt; the next draft does not inherit it")
    func aParcelSnapStampsTracedAtEventTime() async throws {
        try await withViewModel { viewModel in
            let row = try #require(await viewModel.newDrawingLayer())
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            session.startDrawing(.point)
            session.handleTap(latitude: 44.65, longitude: -63.58, parcelSnap: true)
            let traced = try #require(session.parsed?.features.last)
            #expect(
                traced.properties[CaptureSpec.tracedKey]
                    == .string(CaptureSpec.tracedParcelValue)
            )
            #expect(traced.properties[CaptureSpec.createdAtKey]?.stringValue != nil)

            session.startDrawing(.point)
            session.handleTap(latitude: 44.66, longitude: -63.57, parcelSnap: false)
            let unmarked = try #require(session.parsed?.features.last)
            #expect(unmarked.properties[CaptureSpec.tracedKey] == nil)
            #expect(unmarked.properties[CaptureSpec.createdAtKey]?.stringValue != nil)
        }
    }

    /// Parcels that came back without a readable boundary are not "no
    /// parcels here": the note keeps the three apart.
    @Test("The parcel-snap note keeps empty apart from unreadable and not supplied")
    func theParcelSnapNoteKeepsStatesApart() {
        #expect(MapContainerView.parcelSnapNote(shapes: 0, notSupplied: 0, unreadable: 0) == "0 parcels snappable in this view.")
        #expect(MapContainerView.parcelSnapNote(shapes: 3, notSupplied: 0, unreadable: 0) == nil)
        #expect(
            MapContainerView.parcelSnapNote(shapes: 0, notSupplied: 1, unreadable: 0)
                == "1 parcel returned without a boundary; nothing here to snap to."
        )
        #expect(
            MapContainerView.parcelSnapNote(shapes: 0, notSupplied: 0, unreadable: 2)
                == "2 parcel boundaries could not be read; nothing here to snap to."
        )
        #expect(
            MapContainerView.parcelSnapNote(shapes: 2, notSupplied: 1, unreadable: 1)
                == "1 parcel returned without a boundary; 1 parcel boundary could not be read."
        )
        // A result the service returned without a PID is not an empty answer.
        #expect(
            MapContainerView.parcelSnapNote(shapes: 0, notSupplied: 0, unreadable: 0, unidentified: 1)
                == "1 parcel result could not be identified; nothing here to snap to."
        )
    }

    /// A traced corner carries the Province's attribution on the card, not
    /// only the caveat: the export already says it, and the screen must not
    /// say less.
    @Test("A traced feature's card carries the NSPRD attribution")
    func aTracedFeatureCarriesItsAttribution() {
        let feature = GeoJsonFeature(
            id: "t", geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6)),
            properties: [CaptureSpec.tracedKey: .string(CaptureSpec.tracedParcelValue)]
        )
        let record = UserVectorLayerRecord(
            id: "l", name: "Lot", source: .drawn, origin: .drawn(createdAt: Date()),
            createdAt: Date(), colorHex: "#d55e00", featureCount: 1, bbox: nil
        )
        let caveat = VectorFeatureCallout(feature: feature, record: record).tracedCaveat ?? ""
        #expect(caveat.contains(CaptureSpec.Snap.parcelCaveat))
        #expect(caveat.contains("Province of Nova Scotia"))
        #expect(caveat.contains("NSPRD"))
    }

    private func withViewModel(
        _ body: (UserVectorsViewModel) async throws -> Void
    ) async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try await body(UserVectorsViewModel(store: UserVectorStore(directory: root)))
    }
}

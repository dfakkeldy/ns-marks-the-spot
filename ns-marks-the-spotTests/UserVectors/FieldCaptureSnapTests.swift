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

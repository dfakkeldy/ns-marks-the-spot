import Foundation
import GeoCore
import Testing

@testable import ns_marks_the_spot

/// The conversion plans the convert panel reads, and what makes them stale.
///
/// §5.15 asked for these to stop being recomputed twice on every body
/// evaluation — every tap, every drag end, every keystroke in the layer-name
/// field — because a plan walks every mark, measures the path and runs a
/// self-crossing test that compares every segment against every other.
///
/// Holding them costs nothing and risks one thing: staleness. A panel offering
/// to convert marks that are no longer there, or the marks of the layer that
/// was open before this one, is worse than a slow panel. The key is
/// `revision`, which counts commits, so these are the ways the geometry behind
/// a plan can change: a commit, and the two that do not make one.
@Suite("Conversion plans a session hands out")
@MainActor
struct VectorEditSessionPlanTests {
    @Test("A plan is the plan this layer's geometry asks for")
    func aPlanIsThePlanThisLayersGeometryAsksFor() async throws {
        try await withViewModel { viewModel in
            await viewModel.importFile(data: Self.marks(3, from: 44.6), filename: "a.geojson")
            let row = try #require(viewModel.rows.first)
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            let parsed = try #require(session.parsed)

            #expect(session.convertPlanLine == VectorEdit.conversionPlan(for: parsed, shape: .line))
            #expect(session.convertPlanArea == VectorEdit.conversionPlan(for: parsed, shape: .area))
            // And asking twice is asking the same question.
            #expect(session.convertPlanLine == session.convertPlanLine)
        }
    }

    @Test("A mark placed is a mark the plan counts")
    func aMarkPlacedIsAMarkThePlanCounts() async throws {
        try await withViewModel { viewModel in
            await viewModel.importFile(data: Self.marks(3, from: 44.6), filename: "a.geojson")
            let row = try #require(viewModel.rows.first)
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            let before = try #require(session.convertPlanLine).sourcePointCount

            session.startDrawing(.point)
            session.handleTap(latitude: 44.61, longitude: -63.51)

            let after = try #require(session.convertPlanLine)
            #expect(after.sourcePointCount == before + 1)
            let parsed = try #require(session.parsed)
            #expect(after == VectorEdit.conversionPlan(for: parsed, shape: .line))
        }
    }

    /// The regression the cache would otherwise have introduced. `begin` does
    /// not commit, so the revision that keyed the last layer's plans is still
    /// current when the next layer opens.
    @Test("Opening a second layer does not hand out the first one's plan")
    func openingASecondLayerDoesNotHandOutTheFirstOnesPlan() async throws {
        try await withViewModel { viewModel in
            await viewModel.importFile(data: Self.marks(6, from: 44.6), filename: "six.geojson")
            await viewModel.importFile(data: Self.marks(2, from: 45.6), filename: "two.geojson")
            let six = try #require(viewModel.rows.first { $0.record.name.hasPrefix("six") })
            let two = try #require(viewModel.rows.first { $0.record.name.hasPrefix("two") })

            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(six)
            #expect(try #require(session.convertPlanLine).sourcePointCount == 6)

            session.begin(two)
            #expect(try #require(session.convertPlanLine).sourcePointCount == 2)
            let parsed = try #require(session.parsed)
            #expect(session.convertPlanArea == VectorEdit.conversionPlan(for: parsed, shape: .area))
        }
    }

    @Test("A session that has ended offers no plan")
    func aSessionThatHasEndedOffersNoPlan() async throws {
        try await withViewModel { viewModel in
            await viewModel.importFile(data: Self.marks(4, from: 44.6), filename: "a.geojson")
            let row = try #require(viewModel.rows.first)
            let session = VectorEditSession(viewModel: viewModel, persistDelay: .zero)
            session.begin(row)
            #expect(session.convertPlanLine != nil)

            #expect(await session.end())
            #expect(session.convertPlanLine == nil)
            #expect(session.convertPlanArea == nil)
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

    /// A run of marks that does not double back, so the plan's self-crossing
    /// test runs its full comparison rather than returning on the first
    /// crossing it finds.
    private static func marks(_ count: Int, from lat: Double) -> Data {
        let features = (0..<count).map { index in
            """
            {"type":"Feature","properties":{},"geometry":{"type":"Point",\
            "coordinates":[\(-63.5 + Double(index) * 0.002),\(lat + Double(index) * 0.0005)]}}
            """
        }
        return Data(
            """
            {"type":"FeatureCollection","features":[\(features.joined(separator: ","))]}
            """.utf8
        )
    }
}

import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing

@testable import ns_marks_the_spot

/// Whether the aerial photography reaches the page, and what the page then
/// claims about it.
@Suite("Aerial imagery on a printed page")
@MainActor
struct PrintAerialInclusionTests {
    private static let framed = GeoBoundingBox(
        south: 45.6, west: -61.4, north: 45.7, east: -61.3
    )

    private func request(includesAerial: Bool) -> PrintExportRequest? {
        let viewModel = OverlayViewModel.forTesting(installing: [.nsAerial, .nsprd])
        return viewModel.printExportRequest(
            template: PdfTemplate.template(.landscape),
            fields: PdfComposer.Fields(title: "Sheet", subtitle: "", notes: ""),
            includesAerial: includesAerial,
            frame: Self.framed
        )
    }

    /// The switch on the export sheet is the only thing between the imagery and
    /// the paper, so it has to actually take the layer out of the plan.
    @Test("Leaving the aerial off takes it out of the page's layers")
    func leavingTheAerialOffTakesItOutOfThePagesLayers() throws {
        let printed = try #require(request(includesAerial: false))
        #expect(!printed.layers.contains { $0.id == LayerID.nsAerial.rawValue })
        // Only the aerial. A switch that quietly dropped the boundaries too
        // would print a page missing the evidence it was made for.
        #expect(printed.layers.contains { $0.id == LayerID.nsprd.rawValue })
    }

    @Test("Asking for the aerial puts it back")
    func askingForTheAerialPutsItBack() throws {
        let printed = try #require(request(includesAerial: true))
        #expect(printed.layers.contains { $0.id == LayerID.nsAerial.rawValue })
    }

    /// The credit follows the ink. Nothing composites a layer that is not in
    /// the plan, nothing reports an outcome for it, and `PrintExportPlan.sources`
    /// builds the strip from outcomes — so leaving the aerial off is what keeps
    /// the page from naming a source it carries no pixels from.
    @Test("A page without the aerial has nothing to credit it for")
    func aPageWithoutTheAerialHasNothingToCreditItFor() throws {
        let printed = try #require(request(includesAerial: false))
        let credits = PrintExportPlan.sources(
            baseMap: printed.baseMap,
            outcomes: printed.layers.map {
                PrintMapCompositor.LayerOutcome(id: $0.id, name: $0.name, state: .drawn)
            },
            descriptor: { LayerCatalog.descriptor(for: LayerID(rawValue: $0) ?? .nsprd) }
        )
        let aerialName = try #require(LayerCatalog.descriptor(for: .nsAerial)?.name)
        #expect(!credits.contains { $0.name == aerialName })
    }
}

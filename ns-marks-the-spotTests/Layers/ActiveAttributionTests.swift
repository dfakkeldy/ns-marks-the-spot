import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import ns_marks_the_spot

/// What the strip under the map says about what is drawn on it.
@Suite("Crediting the layers actually drawn")
struct ActiveAttributionTests {
    private func descriptor(_ id: LayerID) -> LayerDescriptor {
        LayerCatalog.descriptor(for: id)!
    }

    /// The caveat is about the base map's parcel edges as much as any overlay,
    /// so it does not wait for a layer to be turned on.
    @Test("An empty map still says boundaries are not a survey")
    func anEmptyMapStillSaysBoundariesAreNotASurvey() {
        #expect(ActiveAttribution.credits(for: []).isEmpty)
        #expect(ActiveAttribution.summary(for: []) == ActiveAttribution.boundaryCaveat)
    }

    /// Sixteen provincial layers are one credit, not sixteen copies of the
    /// same sentence.
    @Test("Layers from one source are credited once")
    func layersFromOneSourceAreCreditedOnce() {
        let provincial = LayerCatalog.all.filter { $0.licence == .provinceRestricted }
        #expect(provincial.count > 1)
        let credits = ActiveAttribution.credits(for: provincial)
        #expect(credits.count == 1)
        #expect(credits[0].provider == "Province of Nova Scotia")
        #expect(
            credits[0].disclaimer.hasPrefix(
                "Contains information obtained under license from the Province"
            )
        )
    }

    /// A layer derived from provincial geometry is not the same source as the
    /// service it was derived from, and saying so is what keeps a reader from
    /// treating a derived overlay as an official one.
    @Test("A derived layer is its own credit")
    func aDerivedLayerIsItsOwnCredit() {
        let restricted = LayerCatalog.all.filter(\.requiresProvinceClearance)
        let credits = ActiveAttribution.credits(for: restricted)
        #expect(credits.count == 2)
        #expect(credits.contains { $0.provider.hasPrefix("Derived from") })
    }

    /// Everything switched on at once runs to five sources, and the Rumsey
    /// credit alone is seventy characters. A collapsed line that long is cut
    /// off by the label, so it counts the rest instead.
    @Test("A crowded map counts what it cannot name")
    func aCrowdedMapCountsWhatItCannotName() {
        let credits = ActiveAttribution.credits(for: LayerCatalog.all)
        #expect(credits.count > ActiveAttribution.namedInSummary)
        let summary = ActiveAttribution.summary(for: credits)
        #expect(summary.contains("+\(credits.count - ActiveAttribution.namedInSummary) more"))
        #expect(summary.hasSuffix(ActiveAttribution.boundaryCaveat))
        #expect(summary.count < 120)
    }

    /// A restricted provincial layer and a Rumsey scan are two different
    /// promises about what the reader is looking at, and the strip has to make
    /// both.
    @Test("Two sources are two credits")
    func twoSourcesAreTwoCredits() {
        let provincial = LayerCatalog.all.first(where: \.requiresProvinceClearance)!
        let rumsey = LayerCatalog.all.first { $0.licence == .rumseyReference }!
        let credits = ActiveAttribution.credits(for: [provincial, rumsey])
        #expect(credits.count == 2)
        #expect(credits[1].provider.contains("David Rumsey"))
        let summary = ActiveAttribution.summary(for: credits)
        #expect(summary.contains("Province of Nova Scotia"))
        #expect(summary.contains("David Rumsey"))
        #expect(summary.hasSuffix(ActiveAttribution.boundaryCaveat))
    }

    /// A source that states no terms must not be folded into the licensed
    /// ones. "No stated licence" is a different fact from "licensed", and the
    /// strip is where a reader meets it.
    @Test("A source with no stated terms keeps its own line")
    func aSourceWithNoStatedTermsKeepsItsOwnLine() throws {
        let unstated = try #require(
            LayerCatalog.all.first { $0.licence == .municipalNoStatedLicence }
        )
        let licensed = try #require(
            LayerCatalog.all.first { $0.licence == .municipalOpen }
        )
        let credits = ActiveAttribution.credits(for: [licensed, unstated])
        #expect(credits.count == 2)
        #expect(
            credits.contains { $0.disclaimer.contains("publishes no licence terms") }
        )
    }

    /// Every layer that can be turned on has something to say for itself.
    /// A blank credit would read as a source with nothing to disclose.
    @Test("No catalogued layer is credited to nobody")
    func noCataloguedLayerIsCreditedToNobody() {
        for descriptor in LayerCatalog.all {
            let credit = ActiveAttribution.credits(for: [descriptor])
            #expect(credit.count == 1, "\(descriptor.id.rawValue) produced no credit")
            #expect(!credit[0].provider.isEmpty)
            #expect(!credit[0].disclaimer.isEmpty)
        }
    }

    /// NS Aerial is the province's layer and Service Nova Scotia's imagery.
    /// The heading in the expanded strip names the branch, which is the credit
    /// the licence asks for.
    @Test("A branch is credited over its department")
    func aBranchIsCreditedOverItsDepartment() {
        let credits = ActiveAttribution.credits(for: [descriptor(.nsAerial)])
        #expect(credits[0].copyright == "Service Nova Scotia")
        #expect(credits[0].provider == "Province of Nova Scotia")
    }
}

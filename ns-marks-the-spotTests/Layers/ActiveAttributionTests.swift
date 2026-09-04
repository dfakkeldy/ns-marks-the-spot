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
        // Two, not one: NS Aerial carries the Service Nova Scotia copyright
        // its imagery requires, and a credit's identity now includes the
        // copyright and the licence — folding it into the plain Province
        // credit dropped the line the aerial credit exists to carry.
        #expect(credits.count == 2)
        #expect(credits.allSatisfy { $0.provider == "Province of Nova Scotia" })
        #expect(credits.contains { $0.copyright == "Service Nova Scotia" })
        #expect(credits.allSatisfy {
            $0.disclaimer.hasPrefix(
                "Contains information obtained under license from the Province"
            )
        })
    }

    /// A layer derived from provincial geometry is not the same source as the
    /// service it was derived from, and saying so is what keeps a reader from
    /// treating a derived overlay as an official one.
    @Test("A derived layer is its own credit")
    func aDerivedLayerIsItsOwnCredit() {
        let restricted = LayerCatalog.all.filter(\.requiresProvinceClearance)
        let credits = ActiveAttribution.credits(for: restricted)
        // Province, the aerial credit with its own copyright line, and the
        // derived layer: three distinct credits.
        #expect(credits.count == 3)
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

    /// The Province publishes these two layers under different licences with
    /// the same name on them. A strip that named one licence over both would
    /// tell a reader the coastal projections come with permissions they do not,
    /// or hide the notices the coastal licence makes a condition of drawing
    /// them at all.
    @Test("Two provincial licences are two credits")
    func twoProvincialLicencesAreTwoCredits() {
        let coastal = LayerCatalog.all.first {
            $0.licence == .provinceOpen && $0.licenceURL == LayerCatalog.unrestrictedLicence
        }!
        let openGovernment = LayerCatalog.all.first {
            $0.licence == .provinceOpen && $0.licenceURL != LayerCatalog.unrestrictedLicence
        }!
        let credits = ActiveAttribution.credits(for: [coastal, openGovernment])

        #expect(credits.count == 2)
        #expect(credits.allSatisfy { $0.provider == "Province of Nova Scotia" })
        #expect(credits[0].licenseTitle == "Unrestricted Map Services Licence")
        #expect(
            credits[0].disclaimer
                .contains("permission of the Department of Service Nova Scotia")
        )
        #expect(credits[1].licenseTitle == "Open Government Licence — Nova Scotia")
        #expect(
            credits[1].disclaimer
                .hasPrefix("Contains information licensed under the Open Government Licence")
        )
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

    /// Fletcher is the layer this app opens showing, and it composites into
    /// the printed sheet. A researcher who puts that sheet into a paid report
    /// has to have been told the imagery is noncommercial-only somewhere they
    /// would actually read it.
    @Test("A Rumsey layer names and links its licence")
    func aRumseyLayerNamesAndLinksItsLicence() throws {
        let fletcher = try #require(LayerCatalog.all.first { $0.id == .fletcher })
        let attribution = NativeLayerTraits.attribution(for: fletcher)
        #expect(attribution.licenseTitle == "CC BY-NC-SA 3.0")
        #expect(
            attribution.resolvedLicenseURL?.absoluteString
                == "https://creativecommons.org/licenses/by-nc-sa/3.0/"
        )
        // The collection asks for this credit word for word.
        #expect(attribution.provider.contains("Stanford University Libraries"))
        #expect(attribution.disclaimer.contains("Noncommercial use only"))
        #expect(attribution.disclaimer.contains("ShareAlike"))
        #expect(attribution.disclaimer.contains("MIT software licence does not cover"))
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

    /// The OpenStreetMap tile policy requires its credit wherever the tiles
    /// show, so the strip leads with it — verbatim, with the copyright page
    /// linked — whenever the map is drawn on that ground, layers or none.
    @Test("The OpenStreetMap ground leads the strip with its required credit")
    func theOpenStreetMapGroundLeadsTheStripWithItsRequiredCredit() {
        let credits = ActiveAttribution.credits(
            for: [descriptor(.nsprd)], baseMap: .openStreetMap
        )
        #expect(credits.first?.provider == "© OpenStreetMap contributors")
        #expect(
            credits.first?.licenseURL?.absoluteString
                == "https://www.openstreetmap.org/copyright"
        )
        #expect(
            ActiveAttribution.summary(for: credits)
                .hasPrefix("© OpenStreetMap contributors")
        )

        let bare = ActiveAttribution.credits(for: [], baseMap: .openStreetMap)
        #expect(bare.count == 1)
    }

    /// The credit follows the ink here as everywhere: a map on an Apple base,
    /// or on none, owes OpenStreetMap nothing.
    @Test("Other grounds carry no OpenStreetMap credit")
    func otherGroundsCarryNoOpenStreetMapCredit() {
        for base in [MapBaseType.standard, .satellite, .hybrid, .nsAerial, .blank] {
            let credits = ActiveAttribution.credits(
                for: [descriptor(.nsprd)], baseMap: base
            )
            #expect(
                credits.allSatisfy { !$0.provider.contains("OpenStreetMap") },
                "\(base)"
            )
        }
    }
}

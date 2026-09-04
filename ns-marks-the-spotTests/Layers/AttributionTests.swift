import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import Testing
@testable import ns_marks_the_spot

struct AttributionTests {
    /// Every layer whose imagery is served under the Province's restricted
    /// licence.
    ///
    /// Keyed on `requiresProvinceClearance` rather than on the provider string.
    /// The catalog now also carries open-licensed provincial layers, which are
    /// credited to the same Province of Nova Scotia and are emphatically not
    /// under the restricted terms — a provider-string filter would demand the
    /// restricted disclaimer from them and pass only by mislabelling them.
    private var restrictedLayers: [LayerDescriptor] {
        LayerCatalog.all.filter(\.requiresProvinceClearance)
    }

    @Test func everyRestrictedLayerHasRestrictedLicenseText() {
        #expect(restrictedLayers.isEmpty == false)

        for layer in restrictedLayers {
            let attribution = NativeLayerTraits.attribution(for: layer)
            #expect(attribution.disclaimer == "Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions.")
            #expect(attribution.licenseTitle == "Province of Nova Scotia Restricted Geographic Services License")
            #expect(attribution.licenseURL != nil || attribution.bundledLicenseResourceName != nil)
        }
    }

    @Test func provinceRestrictedLicenseDocumentIsBundled() throws {
        // Every restricted layer names the bundled copy, and the copy is
        // present and complete. Checked directly rather than through
        // `resolvedLicenseURL`, which prefers a remote licence URL where the
        // service publishes one — routing through it would let the bundled
        // document go missing without a single assertion noticing.
        for layer in restrictedLayers {
            #expect(
                NativeLayerTraits.attribution(for: layer).bundledLicenseResourceName
                    == "ProvinceRestrictedGeographicServicesLicense.md",
                "\(layer.id.rawValue) is restricted with no offline licence copy"
            )
        }

        let bundled = try #require(
            Bundle(for: LayerResourceBundleToken.self)
                .url(forResource: "ProvinceRestrictedGeographicServicesLicense.md", withExtension: nil),
            "the restricted licence must be readable without a network"
        )
        let licenseText = try String(contentsOf: bundled, encoding: .utf8)
        #expect(licenseText.contains("Indemnification"))
        #expect(licenseText.contains("Termination of License for Non-Compliance"))
        #expect(licenseText.contains("This is version 1.0 of the Province of Nova Scotia Restricted Geographic Services License."))
    }

    /// The three coastal projections. They are `provinceOpen` like the layers
    /// beside them and published under a different licence, and the licence
    /// document is the only field that says so — which is how the browser tells
    /// them apart too.
    private var coastalLayers: [LayerDescriptor] {
        LayerCatalog.all.filter {
            $0.licence == .provinceOpen && $0.licenceURL == LayerCatalog.unrestrictedLicence
        }
    }

    /// Everything else under `provinceOpen`, which is the Open Government
    /// Licence and owes that licence's own statement.
    private var openGovernmentLayers: [LayerDescriptor] {
        LayerCatalog.all.filter {
            $0.licence == .provinceOpen && $0.licenceURL != LayerCatalog.unrestrictedLicence
        }
    }

    @Test func openLicensedProvincialLayersCarryTheStatementTheLicenceMandates() {
        #expect(openGovernmentLayers.isEmpty == false)
        for layer in openGovernmentLayers {
            let attribution = NativeLayerTraits.attribution(for: layer)
            #expect(attribution.licenseTitle == "Open Government Licence — Nova Scotia")
            // The restricted licence's sentence under an open licence's title is
            // a credit naming terms the data is not published under.
            #expect(
                attribution.disclaimer
                    == "Contains information licensed under the Open Government Licence – Nova Scotia.",
                "\(layer.id.rawValue) does not carry the Open Government statement"
            )
            #expect(layer.requiresProvinceClearance == false)
        }
    }

    /// The coastal licence makes the permission, the endorsement disclaimer and
    /// the no-warranty caveat conditions of reproducing the data, and a layer
    /// drawn on the map is a reproduction.
    @Test func theCoastalProjectionsCarryTheirOwnLicenceAndAllThreeNotices() {
        #expect(coastalLayers.count == 3)
        for layer in coastalLayers {
            let attribution = NativeLayerTraits.attribution(for: layer)
            #expect(attribution.licenseTitle == "Unrestricted Map Services Licence")
            #expect(attribution.disclaimer == CoastalFloodLicence.attribution)
            for notice in CoastalFloodLicence.notices {
                #expect(
                    attribution.disclaimer.contains(notice),
                    "\(layer.id.rawValue) drops one of the three coastal notices"
                )
            }
            #expect(attribution.licenseURL == LayerCatalog.unrestrictedLicence)
            #expect(layer.requiresProvinceClearance == false)
        }
    }

    @Test func aSourceWithNoStatedTermsSaysSoRatherThanImplyingPermission() {
        let unlicensed = LayerCatalog.all.filter { $0.licence == .municipalNoStatedLicence }

        #expect(unlicensed.isEmpty == false)
        for layer in unlicensed {
            let attribution = NativeLayerTraits.attribution(for: layer)
            // No licence title at all: stating no terms is different from
            // stating permissive ones, and the row must not read as either.
            #expect(attribution.licenseTitle == nil)
            #expect(attribution.disclaimer.contains("publishes no licence terms"))
        }
    }

    @Test func everyLayerHasUserVisibleAttribution() {
        for layer in LayerCatalog.all {
            let attribution = NativeLayerTraits.attribution(for: layer)
            #expect(attribution.provider.isEmpty == false)
            #expect(attribution.disclaimer.isEmpty == false)
            #expect(NativeLayerTraits.caveat(for: layer).isEmpty == false)
        }
    }
}

import Foundation
import Testing
@testable import ns_marks_the_spot

struct AttributionTests {
    @Test func everyProvinceLayerHasRestrictedLicenseText() {
        let provinceLayers = LayerCatalog.all.filter {
            $0.attribution.provider == "Province of Nova Scotia"
        }

        #expect(provinceLayers.isEmpty == false)
        for layer in provinceLayers {
            #expect(layer.attribution.disclaimer == "Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions.")
            #expect(layer.attribution.licenseTitle == "Province of Nova Scotia Restricted Geographic Services License")
        }
    }

    @Test func everyLayerHasUserVisibleAttribution() {
        for layer in LayerCatalog.all {
            #expect(layer.attribution.provider.isEmpty == false)
            #expect(layer.attribution.disclaimer.isEmpty == false)
        }
    }
}

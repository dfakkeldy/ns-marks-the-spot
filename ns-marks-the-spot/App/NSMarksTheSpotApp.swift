import SwiftUI

@main
struct NSMarksTheSpotApp: App {
    let container = AppContainer()

    var body: some Scene {
        WindowGroup {
            // One instance, handed to both: the layer panel's switches and the
            // map's features have to be the same "on".
            let features = ViewportFeatureViewModel(container: container)
            // Likewise: the notices panel and the parcels the map draws as
            // listed have to be the same set of switches.
            let taxSale = TaxSaleViewModel()
            MapContainerView(
                controller: container.mapController,
                overlayViewModel: OverlayViewModel(
                    container: container, features: features, taxSale: taxSale
                ),
                viewportFeatureViewModel: features,
                taxSaleViewModel: taxSale,
                navigationModel: container.navigationModel,
                poiViewModel: container.poiViewModel,
                offlineAreasViewModel: container.offlineAreasViewModel,
                isUITestMode: container.isUITestMode
            )
        }
    }
}

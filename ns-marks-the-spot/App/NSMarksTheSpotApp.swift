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
            // And again: the historical panel's mode and filters decide which
            // parcels the map draws, so the panel and the map read one value.
            let historical = HistoricalTaxSaleViewModel()
            MapContainerView(
                controller: container.mapController,
                overlayViewModel: OverlayViewModel(
                    container: container,
                    features: features,
                    taxSale: taxSale,
                    historical: historical
                ),
                viewportFeatureViewModel: features,
                taxSaleViewModel: taxSale,
                historicalViewModel: historical,
                navigationModel: container.navigationModel,
                poiViewModel: container.poiViewModel,
                offlineAreasViewModel: container.offlineAreasViewModel,
                isUITestMode: container.isUITestMode
            )
            // Lent down rather than passed through four views that have no use
            // for it. The georeferencer is the only screen that draws official
            // layers outside the main map, and it must draw them through the
            // app's own cache and clearance.
            .environment(\.georeferenceReferences, GeoreferenceReferenceServices(container: container))
        }
    }
}

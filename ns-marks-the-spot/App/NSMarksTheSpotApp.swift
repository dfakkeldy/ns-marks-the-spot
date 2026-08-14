import SwiftUI

@main
struct NSMarksTheSpotApp: App {
    let container = AppContainer()

    var body: some Scene {
        WindowGroup {
            // One instance, handed to both: the layer panel's switches and the
            // map's features have to be the same "on".
            let features = ViewportFeatureViewModel(container: container)
            MapContainerView(
                controller: container.mapController,
                overlayViewModel: OverlayViewModel(container: container, features: features),
                viewportFeatureViewModel: features,
                navigationModel: container.navigationModel,
                poiViewModel: container.poiViewModel,
                offlineAreasViewModel: container.offlineAreasViewModel,
                isUITestMode: container.isUITestMode
            )
        }
    }
}

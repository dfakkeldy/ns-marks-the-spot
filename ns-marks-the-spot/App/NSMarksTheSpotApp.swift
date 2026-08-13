import SwiftUI

@main
struct NSMarksTheSpotApp: App {
    let container = AppContainer()

    var body: some Scene {
        WindowGroup {
            MapContainerView(
                controller: container.mapController,
                navigationModel: container.navigationModel,
                poiViewModel: container.poiViewModel,
                offlineAreasViewModel: container.offlineAreasViewModel,
                isUITestMode: container.isUITestMode
            )
        }
    }
}

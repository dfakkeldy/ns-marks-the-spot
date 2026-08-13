import SwiftData
import SwiftUI

@main
struct NSMarksTheSpotApp: App {
    let container = AppContainer()

    var body: some Scene {
        WindowGroup {
            MapContainerView(
                controller: container.mapController,
                poiViewModel: container.poiViewModel,
                offlineAreasViewModel: container.offlineAreasViewModel,
                isUITestMode: container.isUITestMode
            )
        }
        .modelContainer(for: PointOfInterest.self)
    }
}

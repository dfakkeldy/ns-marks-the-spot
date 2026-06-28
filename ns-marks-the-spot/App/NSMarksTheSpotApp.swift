import SwiftData
import SwiftUI

@main
struct NSMarksTheSpotApp: App {
    let container = AppContainer()

    var body: some Scene {
        WindowGroup {
            MapContainerView(
                engine: container.mapEngine,
                poiViewModel: container.poiViewModel,
                offlineAreasViewModel: container.offlineAreasViewModel
            )
        }
        .modelContainer(for: PointOfInterest.self)
    }
}

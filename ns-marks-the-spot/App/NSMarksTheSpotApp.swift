import SwiftUI

@main
struct NSMarksTheSpotApp: App {
    let container = AppContainer.forLaunch()

    var body: some Scene {
        WindowGroup {
            // Everything here comes off the container, which owns one set of
            // view models for the life of the process. This closure is a
            // description SwiftUI may re-evaluate — a backgrounded scene
            // reconnects through it — and constructing view models inline
            // here re-ran session restore against the live map every time.
            MapContainerView(
                controller: container.mapController,
                overlayViewModel: container.overlayViewModel,
                viewportFeatureViewModel: container.viewportFeatureViewModel,
                taxSaleViewModel: container.taxSaleViewModel,
                historicalViewModel: container.historicalTaxSaleViewModel,
                navigationModel: container.navigationModel,
                offlineAreasViewModel: container.offlineAreasViewModel,
                // Both off the container, which read the checkpoint before any
                // view existed and owns the recorder a Lock Screen button can
                // reach without one.
                recorder: container.trackRecorder,
                restoredWalk: container.restoredWalk
            )
            // Lent down rather than passed through four views that have no use
            // for it. The georeferencer is the only screen that draws official
            // layers outside the main map, and it must draw them through the
            // app's own cache and clearance.
            .environment(\.georeferenceReferences, container.georeferenceReferences)
        }
    }
}

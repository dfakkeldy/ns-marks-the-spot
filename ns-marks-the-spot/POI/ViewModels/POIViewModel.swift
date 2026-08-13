import Foundation
import Observation

@MainActor
@Observable
final class POIViewModel {
    var points: [PointOfInterest] = []
    private(set) var waterfallFetchErrorMessage: String?
    private(set) var isFetchingWaterfalls = false

    @ObservationIgnored private let fetchWaterfalls: () async throws -> [PointOfInterest]
    @ObservationIgnored private var hasLoadedRemoteWaterfalls = false

    init(fetchWaterfalls: @escaping () async throws -> [PointOfInterest] = {
        try await POIFetcher().fetchWaterfalls()
    }) {
        self.fetchWaterfalls = fetchWaterfalls
    }

    func fetchRemoteWaterfalls(controller: MapController, force: Bool = false) async {
        guard !isFetchingWaterfalls else { return }
        if hasLoadedRemoteWaterfalls && !force {
            syncAnnotations(to: controller)
            return
        }

        isFetchingWaterfalls = true
        waterfallFetchErrorMessage = nil
        defer { isFetchingWaterfalls = false }

        do {
            let waterfalls = try await fetchWaterfalls()
            hasLoadedRemoteWaterfalls = true
            points = merged(points: points, with: waterfalls)
            syncAnnotations(to: controller)
        } catch {
            waterfallFetchErrorMessage = "Waterfalls are unavailable right now."
        }
    }

    func syncAnnotations(to controller: MapController) {
        var existingAnnotationIDs = Set(controller.annotations.map(\.id))
        for point in points {
            guard !existingAnnotationIDs.contains(point.id) else { continue }
            controller.addAnnotation(
                MapAnnotation(
                    id: point.id,
                    latitude: point.latitude,
                    longitude: point.longitude,
                    title: point.name,
                    subtitle: point.category
                )
            )
            existingAnnotationIDs.insert(point.id)
        }
    }

    private func merged(
        points existingPoints: [PointOfInterest],
        with newPoints: [PointOfInterest]
    ) -> [PointOfInterest] {
        var mergedPoints = existingPoints
        var knownIDs = Set(existingPoints.map(\.id))

        for point in newPoints where !knownIDs.contains(point.id) {
            mergedPoints.append(point)
            knownIDs.insert(point.id)
        }

        return mergedPoints
    }
}

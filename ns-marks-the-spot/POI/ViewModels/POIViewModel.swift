import Combine
import Foundation

@MainActor
final class POIViewModel: ObservableObject {
    @Published var points: [PointOfInterest] = []
    @Published private(set) var waterfallFetchErrorMessage: String?
    @Published private(set) var isFetchingWaterfalls = false

    private let fetchWaterfalls: () async throws -> [PointOfInterest]
    private var hasLoadedRemoteWaterfalls = false

    init(fetchWaterfalls: @escaping () async throws -> [PointOfInterest] = {
        try await POIFetcher().fetchWaterfalls()
    }) {
        self.fetchWaterfalls = fetchWaterfalls
    }

    func fetchRemoteWaterfalls(engine: any MapEngine, force: Bool = false) async {
        guard !isFetchingWaterfalls else { return }
        if hasLoadedRemoteWaterfalls && !force {
            syncAnnotations(to: engine)
            return
        }

        isFetchingWaterfalls = true
        waterfallFetchErrorMessage = nil
        defer { isFetchingWaterfalls = false }

        do {
            let waterfalls = try await fetchWaterfalls()
            hasLoadedRemoteWaterfalls = true
            points = merged(points: points, with: waterfalls)
            syncAnnotations(to: engine)
        } catch {
            waterfallFetchErrorMessage = "Waterfalls are unavailable right now."
        }
    }

    func syncAnnotations(to engine: any MapEngine) {
        var existingAnnotationIDs = Set(engine.annotations.map(\.id))
        for point in points {
            guard !existingAnnotationIDs.contains(point.id) else { continue }
            engine.addAnnotation(
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

import Combine
import Foundation

@MainActor
final class POIViewModel: ObservableObject {
    @Published var points: [PointOfInterest] = []

    func loadMockData() {
        points = [
            PointOfInterest(
                name: "Uisge Bàn Falls",
                latitude: 46.1984,
                longitude: -60.7746,
                category: "waterfall"
            ),
            PointOfInterest(
                name: "Peggy's Cove Lighthouse",
                latitude: 44.4929,
                longitude: -63.9176,
                category: "lighthouse"
            ),
            PointOfInterest(
                name: "Cape Split Falls",
                latitude: 45.3343,
                longitude: -64.4958,
                category: "waterfall"
            ),
            PointOfInterest(
                name: "Sambro Island Lighthouse",
                latitude: 44.4350,
                longitude: -63.5635,
                category: "lighthouse"
            ),
        ]
    }

    func syncAnnotations(to engine: any MapEngine) {
        for point in points {
            engine.addAnnotation(
                MapAnnotation(
                    id: point.id,
                    latitude: point.latitude,
                    longitude: point.longitude,
                    title: point.name,
                    subtitle: point.category
                )
            )
        }
    }
}

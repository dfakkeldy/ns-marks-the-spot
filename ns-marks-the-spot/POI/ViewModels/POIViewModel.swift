import Foundation

@MainActor
final class POIViewModel: ObservableObject {
    @Published var points: [PointOfInterest] = []

    func loadMockData() {
        points = [
            PointOfInterest(
                name: "Example Waterfall",
                latitude: 44.6488,
                longitude: -63.5752,
                category: "waterfall"
            )
        ]
    }
}

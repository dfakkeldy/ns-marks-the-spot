nonisolated struct MapAnnotation: Identifiable, Equatable, Sendable {
    let id: String
    let latitude: Double
    let longitude: Double
    let title: String
    let subtitle: String?

    var coordinate: (latitude: Double, longitude: Double) { (latitude, longitude) }

    init(id: String, latitude: Double, longitude: Double, title: String, subtitle: String? = nil) {
        self.id = id
        self.latitude = latitude
        self.longitude = longitude
        self.title = title
        self.subtitle = subtitle
    }
}

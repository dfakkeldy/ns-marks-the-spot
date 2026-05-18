struct MapAnnotation: Identifiable {
    let id: String
    let coordinate: (latitude: Double, longitude: Double)
    let title: String
    let subtitle: String?

    init(id: String, latitude: Double, longitude: Double, title: String, subtitle: String? = nil) {
        self.id = id
        self.coordinate = (latitude, longitude)
        self.title = title
        self.subtitle = subtitle
    }
}

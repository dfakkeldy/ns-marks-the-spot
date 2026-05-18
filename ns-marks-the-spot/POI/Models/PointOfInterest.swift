import Foundation
import SwiftData

@Model
final class PointOfInterest {
    var name: String
    var latitude: Double
    var longitude: Double
    var category: String

    init(name: String, latitude: Double, longitude: Double, category: String) {
        self.name = name
        self.latitude = latitude
        self.longitude = longitude
        self.category = category
    }
}

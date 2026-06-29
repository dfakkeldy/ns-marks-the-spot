import Foundation
import SwiftData

@Model
final class PointOfInterest {
    var id: String
    var name: String
    var latitude: Double
    var longitude: Double
    var category: String

    init(
        id: String = UUID().uuidString,
        name: String,
        latitude: Double,
        longitude: Double,
        category: String
    ) {
        self.id = id
        self.name = name
        self.latitude = latitude
        self.longitude = longitude
        self.category = category
    }
}

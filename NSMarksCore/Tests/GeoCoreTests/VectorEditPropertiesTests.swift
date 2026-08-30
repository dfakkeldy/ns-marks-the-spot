import Foundation
import Testing

@testable import GeoCore

@Suite("Patching feature properties")
struct VectorEditPropertiesTests {
    private func layer() -> ParsedVector {
        VectorEdit.recomputed([
            GeoJsonFeature(
                id: "f1",
                geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6)),
                properties: [
                    "name": .string("Corner"),
                    "species": .string("red spruce"),
                    "imported": .object(["nested": .number(1)]),
                ]
            ),
            GeoJsonFeature(
                id: "f2",
                geometry: .point(GeoJsonPosition(lng: -63.4, lat: 44.7)),
                properties: ["species": .string("balsam fir")]
            ),
        ])
    }

    @Test func aPatchSetsAndDeletesOnlyItsOwnKeys() throws {
        let edited = VectorEdit.updatingProperties(
            featureID: "f1",
            patch: ["species": .string("white pine"), "dbh": .string("42"), "imported": nil],
            in: layer()
        )
        let feature = try #require(edited.features.first { $0.id == "f1" })
        #expect(feature.properties["species"] == .string("white pine"))
        // Entered in the app, stored as a string — no numeric coercion.
        #expect(feature.properties["dbh"] == .string("42"))
        #expect(feature.properties["imported"] == nil)
        // Untouched keys stay exactly as they were.
        #expect(feature.properties["name"] == .string("Corner"))
        // Other features are not addressed.
        let other = try #require(edited.features.first { $0.id == "f2" })
        #expect(other.properties["species"] == .string("balsam fir"))
    }
}

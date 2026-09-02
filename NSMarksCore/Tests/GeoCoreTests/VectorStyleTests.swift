import Foundation
import Testing

@testable import GeoCore

@Suite("Drawing a user's vector layer")
struct VectorStyleTests {
    private static let record = UserVectorLayerRecord(
        id: "layer-1",
        name: "Woodlot survey",
        source: .kml,
        origin: .imported(filename: "woodlot.kml", importedAt: Date(timeIntervalSince1970: 0)),
        createdAt: Date(timeIntervalSince1970: 0),
        colorHex: "#d55e00",
        featureCount: 3,
        bbox: nil
    )

    /// A layer keeps its colour for life. Deriving it from the layer's place
    /// in the list would recolour every layer below whichever one the user
    /// deleted, and the user has by then learned which colour is which.
    @Test func theColourCycleRepeatsAndNeverRunsOff() {
        #expect(VectorStyle.nextLayerColor(existingCount: 0) == VectorStyle.layerColors[0])
        #expect(VectorStyle.nextLayerColor(existingCount: 6) == VectorStyle.layerColors[0])
        #expect(VectorStyle.nextLayerColor(existingCount: 7) == VectorStyle.layerColors[1])
        #expect(VectorStyle.layerColors.contains(VectorStyle.nextLayerColor(existingCount: -1)))
        #expect(
            VectorStyle.layerColors.contains(VectorStyle.nextLayerColor(existingCount: .max))
        )
    }

    @Test func aFeatureWithNoStylingOfItsOwnUsesTheLayerColour() {
        let style = VectorStyle.style(
            for: GeoJsonFeature(geometry: nil), layerColorHex: "#0072b2"
        )
        #expect(style.strokeHex == "#0072b2")
        #expect(style.fillHex == "#0072b2")
        #expect(style.weight == 2)
        #expect(style.strokeOpacity == 0.9)
        #expect(style.fillOpacity == 0.25)
    }

    /// The simplestyle vocabulary is what a KML conversion emits, so an
    /// imported KML has to keep the look its author gave it.
    @Test func simplestylePropertiesWinOverTheLayerDefault() {
        let feature = GeoJsonFeature(
            geometry: nil,
            properties: [
                "stroke": .string("#112233"),
                "stroke-width": .number(4),
                "stroke-opacity": .number(0.5),
                "fill": .string("#445566"),
                "fill-opacity": .number(0.75),
            ]
        )
        let style = VectorStyle.style(for: feature, layerColorHex: "#d55e00")
        #expect(style.strokeHex == "#112233")
        #expect(style.weight == 4)
        #expect(style.strokeOpacity == 0.5)
        #expect(style.fillHex == "#445566")
        #expect(style.fillOpacity == 0.75)
    }

    @Test func aMarkerColourOutranksAFill() {
        let feature = GeoJsonFeature(
            geometry: nil,
            properties: ["marker-color": .string("#ff0000"), "fill": .string("#00ff00")]
        )
        #expect(VectorStyle.style(for: feature, layerColorHex: "#000000").fillHex == "#ff0000")
    }

    /// A broken property falls back to a colour the user recognises. Falling
    /// back to nothing would make the feature vanish, which reads as data that
    /// failed to import.
    @Test func malformedPropertiesFallBackToTheLayerDefault() {
        let feature = GeoJsonFeature(
            geometry: nil,
            properties: [
                "stroke": .string(""),
                "stroke-width": .string("thick"),
                "fill-opacity": .null,
            ]
        )
        let style = VectorStyle.style(for: feature, layerColorHex: "#009e73")
        #expect(style.strokeHex == "#009e73")
        #expect(style.weight == 2)
        #expect(style.fillOpacity == 0.25)
    }

    @Test(arguments: [
        ("#fff", 1.0, 1.0, 1.0, 1.0),
        ("#000000", 0.0, 0.0, 0.0, 1.0),
        ("#ff0000", 1.0, 0.0, 0.0, 1.0),
        ("#0072b2", 0.0, 114.0 / 255, 178.0 / 255, 1.0),
        ("  #00ff0080  ", 0.0, 1.0, 0.0, 128.0 / 255),
    ])
    func hexColoursDecodeToTheirComponents(
        _ hex: String, _ red: Double, _ green: Double, _ blue: Double, _ alpha: Double
    ) throws {
        let components = try #require(VectorStyle.components(ofHex: hex))
        #expect(abs(components.red - red) < 1e-9)
        #expect(abs(components.green - green) < 1e-9)
        #expect(abs(components.blue - blue) < 1e-9)
        #expect(abs(components.alpha - alpha) < 1e-9)
    }

    /// The value came out of a user's file and may be a CSS name, an `rgb()`
    /// call, or a typo. Nil, so the caller can fall back — a lenient parse
    /// that returned black would silently restyle the layer.
    @Test(arguments: ["red", "", "#", "#12", "#12345", "#gggggg", "rgb(1,2,3)", "0072b2"])
    func anythingElseIsNotAColour(_ hex: String) {
        #expect(VectorStyle.components(ofHex: hex) == nil)
    }

    @Test func aCalloutNamesTheFeatureAndSaysWhereItCameFrom() {
        let feature = GeoJsonFeature(
            geometry: nil,
            properties: [
                "name": .string("North boundary"), "description": .string("Blazed 2019"),
            ]
        )
        let callout = VectorFeatureCallout(feature: feature, record: Self.record)
        #expect(callout.title == "North boundary")
        #expect(callout.detail == "Blazed 2019")
        #expect(callout.provenance == "From your file woodlot.kml")
    }

    /// A callout headed by a blank line reads as a feature that failed to
    /// load, so the layer's name stands in.
    @Test func afeatureWithNoNameBorrowsTheLayersName() {
        let callout = VectorFeatureCallout(
            feature: GeoJsonFeature(geometry: nil, properties: ["name": .string("   ")]),
            record: Self.record
        )
        #expect(callout.title == "Woodlot survey")
        #expect(callout.detail == nil)
    }

    /// Drawn material has to announce itself too. A sketch presented without
    /// this line carries the same authority as a registry parcel.
    @Test func aDrawnLayerSaysItWasDrawnHere() {
        var record = Self.record
        record.origin = .drawn(createdAt: Date(timeIntervalSince1970: 0))
        let callout = VectorFeatureCallout(feature: GeoJsonFeature(geometry: nil), record: record)
        #expect(callout.provenance == "Drawn on this device")
    }

    @Test func aPhotosLayerSaysItCameFromTheLibrary() throws {
        var record = Self.record
        record.source = .photos
        record.origin = .photos(createdAt: Date(timeIntervalSince1970: 0), count: 3)
        let callout = VectorFeatureCallout(feature: GeoJsonFeature(geometry: nil), record: record)
        #expect(callout.provenance == "Created from 3 of your photos")
        let data = try JSONEncoder().encode(record.origin)
        let decoded = try JSONDecoder().decode(UserVectorOrigin.self, from: data)
        #expect(decoded == record.origin)
        // The wire shape matches the web's (`web/src/userMaps/vector/types.ts`):
        // kind "photo-import" with the date under `importedAt`, so the two
        // surfaces' stored records stay mutually readable.
        let json = try #require(String(data: data, encoding: .utf8))
        #expect(json.contains("\"kind\":\"photo-import\""))
        #expect(json.contains("\"importedAt\""))
        #expect(!json.contains("\"createdAt\""))
    }

    @Test func aLibraryFromALaterVersionIsNotReadable() {
        #expect(UserVectorLibrary(layers: []).isReadable)
        // Version 3 is current since the photos origin arrived; earlier
        // documents still read.
        #expect(UserVectorLibrary(version: 1, layers: []).isReadable)
        #expect(!UserVectorLibrary(version: 4, layers: []).isReadable)
        #expect(!UserVectorLibrary(version: 0, layers: []).isReadable)
    }

    @Test func aRecordSurvivesARoundTripThroughItsOwnFormat() throws {
        let data = try JSONEncoder().encode(UserVectorLibrary(layers: [Self.record]))
        let decoded = try JSONDecoder().decode(UserVectorLibrary.self, from: data)
        #expect(decoded.layers == [Self.record])
    }
}

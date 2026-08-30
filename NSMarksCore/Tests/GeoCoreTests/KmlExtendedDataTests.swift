import Foundation
import Testing

@testable import GeoCore

@Suite("KML ExtendedData")
struct KmlExtendedDataTests {
    private func feature(properties: [String: JSONValue]) -> ParsedVector {
        VectorEdit.recomputed([
            GeoJsonFeature(
                id: "f1",
                geometry: .point(GeoJsonPosition(lng: -63.5, lat: 44.6)),
                properties: properties
            )
        ])
    }

    @Test func propertiesRideExtendedDataExceptTheExcludedKeys() {
        let kml = VectorExport.kml(
            layerName: "Layer",
            parsed: feature(properties: [
                "name": .string("Corner"),
                "description": .string("Iron pin"),
                "species": .string("red spruce"),
                "coordinateProperties": .object(["times": .array([])]),
                "nsmts:photos": .array([.object(["id": .string("p1")])]),
                "nsmts:traced": .string("nsprd-parcel"),
            ])
        )
        #expect(kml.contains("<Data name=\"species\"><value>red spruce</value></Data>"))
        // Provenance keys ARE written, so a traced feature keeps its caveat
        // through a KML round trip.
        #expect(kml.contains("<Data name=\"nsmts:traced\"><value>nsprd-parcel</value></Data>"))
        // The keys with their own KML homes, the per-vertex times, and the
        // photo descriptors stay out of ExtendedData in a plain KML.
        #expect(!kml.contains("<Data name=\"name\""))
        #expect(!kml.contains("<Data name=\"description\""))
        #expect(!kml.contains("<Data name=\"coordinateProperties\""))
        #expect(!kml.contains("nsmts:photos"))
        #expect(kml.contains("<name>Corner</name>"))
        #expect(kml.contains("<description>Iron pin</description>"))
    }

    @Test func valuesStringifyTheWayTheContractSays() {
        let kml = VectorExport.kml(
            layerName: "Layer",
            parsed: feature(properties: [
                "count": .number(42),
                "ratio": .number(1.5),
                "flag": .bool(true),
                "nested": .object(["a": .number(1)]),
                "gone": .null,
            ])
        )
        #expect(kml.contains("<Data name=\"count\"><value>42</value></Data>"))
        #expect(kml.contains("<Data name=\"ratio\"><value>1.5</value></Data>"))
        #expect(kml.contains("<Data name=\"flag\"><value>true</value></Data>"))
        // Objects ride as JSON text; KML is string-typed by nature.
        #expect(kml.contains("<Data name=\"nested\"><value>{&quot;a&quot;:1}</value></Data>"))
        // Explicit nulls are skipped, not written as empty strings.
        #expect(!kml.contains("<Data name=\"gone\""))
    }

    /// The ExtendedData a KML export writes reads back through KmlParse as
    /// string properties — the round trip the contract describes.
    @Test func extendedDataRoundTripsThroughKmlParse() throws {
        let kml = VectorExport.kml(
            layerName: "Layer",
            parsed: feature(properties: [
                "species": .string("red spruce"),
                "nsmts:recording": .object(["rawFixCount": .number(40)]),
            ])
        )
        let parsed = try KmlParse.parse(Data(kml.utf8))
        let imported = try #require(parsed.features.first)
        #expect(imported.properties["species"] == .string("red spruce"))
        // String-typed after KML, as the contract says; GeoJSON stays the
        // type-faithful format.
        #expect(
            imported.properties["nsmts:recording"] == .string("{\"rawFixCount\":40}")
        )
    }

    @Test func aTracedLayerCarriesTheProvenanceNoteOnTheDocument() {
        let traced = VectorExport.kml(
            layerName: "Layer",
            parsed: feature(properties: ["nsmts:traced": .string("nsprd-parcel")])
        )
        #expect(traced.contains("Traced boundaries are not a survey."))
        #expect(traced.contains("Nova Scotia Property"))
        let plain = VectorExport.kml(layerName: "Layer", parsed: feature(properties: [:]))
        #expect(!plain.contains("Traced boundaries"))
    }
}

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

    @Test func propertiesRideExtendedDataExceptTheExcludedKeys() throws {
        let kml = VectorExport.kmlDocument(
            layerName: "Layer",
            parsed: feature(properties: [
                "name": .string("Corner"),
                "description": .string("Iron pin"),
                "species": .string("red spruce"),
                "coordinateProperties": .object(["times": .array([])]),
                "nsmts:photos": .array([.object(["id": .string("p1")])]),
                "nsmts:traced": .string("nsprd-parcel"),
            ]), photoMode: .omit
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

    @Test func valuesStringifyTheWayTheContractSays() throws {
        let kml = try VectorExport.kml(
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
        let kml = try VectorExport.kml(
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

    @Test func tracedOutputIsLockedButLocalPersistenceKeepsTheProvenance() throws {
        let traced = feature(properties: ["nsmts:traced": .string("nsprd-parcel")])
        #expect(throws: VectorExport.ReproductionRefusal.self) { try VectorExport.kml(layerName: "Layer", parsed: traced) }
        #expect(throws: VectorExport.ReproductionRefusal.self) { try VectorExport.geoJson(traced) }
        #expect(VectorExport.kmz(layerName: "Layer", parsed: traced, photos: [:]) == nil)
        let retained = try UserVectorParse.parseGeoJson(VectorExport.storageGeoJson(traced))
        #expect(VectorExport.hasTracedFeatures(retained))
        let plain = try VectorExport.kml(layerName: "Layer", parsed: feature(properties: [:]))
        #expect(!plain.contains("Traced boundaries"))
    }

    @Test func anEditedOrUntracedSiblingCannotExportTheOriginalsTracedCoordinates() throws {
        let plain = feature(properties: ["name": .string("My own point")])
        let traced = feature(properties: ["nsmts:traced": .string("nsprd-parcel")])
        let shared = VectorEdit.recomputed(plain.features + traced.features)
        let original = try VectorExport.storageGeoJson(shared)
        // A row edited down to the plain feature remains plain; original bytes are independently locked.
        try VectorExport.requireReproduction(plain)
        #expect(throws: VectorExport.ReproductionRefusal.self) {
            try VectorExport.requireOriginalReproduction(original, filename: "shared.geojson")
        }
        try VectorExport.requireOriginalReproduction(VectorExport.storageGeoJson(plain), filename: "own.geojson")
        #expect(throws: VectorExport.OriginalProvenanceRefusal.self) {
            try VectorExport.requireOriginalReproduction(Data("unreadable".utf8), filename: "unknown")
        }
        #expect(try VectorExport.storageGeoJson(shared) == original)
    }

    @Test(arguments: ["other.kml", "other.txt", "extensionless", "other.jpg"])
    func secondaryKmzDocumentsAreCheckedIndependentlyOfTheMainDocument(_ secondaryName: String) throws {
        let plain = Data(try VectorExport.kml(layerName: "Own", parsed: feature(properties: [:])).utf8)
        let traced = Data(VectorExport.kmlDocument(layerName: "Trace", parsed: feature(properties: [
            "nsmts:traced": .string("nsprd-parcel")
        ]), photoMode: .omit).utf8)
        let archive = try #require(ZipArchive.archive([
            .init(name: "doc.kml", data: plain, compress: true),
            .init(name: secondaryName, data: traced, compress: true)
        ]))
        #expect(!VectorExport.hasTracedFeatures(try KmzParse.parse(archive)))
        #expect(throws: VectorExport.ReproductionRefusal.self) {
            try VectorExport.requireOriginalReproduction(archive, filename: "shared.kmz")
        }
        let own = try #require(ZipArchive.archive([
            .init(name: "doc.kml", data: plain, compress: true),
            .init(name: secondaryName, data: plain, compress: true)
        ]))
        try VectorExport.requireOriginalReproduction(own, filename: "own.kmz")
        let unreadable = try #require(ZipArchive.archive([
            .init(name: "doc.kml", data: plain, compress: true),
            .init(name: "other.kml", data: Data("unreadable".utf8), compress: true)
        ]))
        #expect(throws: VectorExport.OriginalProvenanceRefusal.self) {
            try VectorExport.requireOriginalReproduction(unreadable, filename: "unreadable.kmz")
        }
    }

    @Test func unverifiedArchiveAttachmentsFailClosed() throws {
        let plain = Data(try VectorExport.kml(layerName: "Own", parsed: feature(properties: [:])).utf8)
        let archive = try #require(ZipArchive.archive([
            .init(name: "doc.kml", data: plain, compress: true),
            .init(name: "unverified.txt", data: Data("unverified attachment".utf8), compress: true)
        ]))
        #expect(throws: VectorExport.OriginalProvenanceRefusal.self) {
            try VectorExport.requireOriginalReproduction(archive, filename: "unverified.kmz")
        }
    }

    @Test func contentRoutingChecksRenamedGeoJsonAndKeepsNormalPhotoAssets() throws {
        let plain = Data(try VectorExport.kml(layerName: "Own", parsed: feature(properties: [:])).utf8)
        let traced = try VectorExport.storageGeoJson(feature(properties: ["nsmts:traced": .string("nsprd-parcel")]))
        let disguised = try #require(ZipArchive.archive([
            .init(name: "doc.kml", data: plain, compress: true),
            .init(name: "photo.jpg", data: traced, compress: true)
        ]))
        #expect(throws: VectorExport.ReproductionRefusal.self) {
            try VectorExport.requireOriginalReproduction(disguised, filename: "disguised.kmz")
        }
        let png = try #require(Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTwAAAABJRU5ErkJggg=="))
        let withPhoto = try #require(ZipArchive.archive([
            .init(name: "doc.kml", data: plain, compress: true),
            .init(name: "files/photo.png", data: png, compress: false)
        ]))
        try VectorExport.requireOriginalReproduction(withPhoto, filename: "own.kmz")
    }

    @Test(arguments: ["<Data name=\"nsmts:traced\"><value>nsprd-parcel</value></Data>",
                      "<SimpleData name=\"nsmts:traced\">nsprd-parcel</SimpleData>"])
    func originalProvenanceIsCheckedBeforeMalformedPlacemarkGeometryIsDropped(_ provenance: String) throws {
        let own = try VectorExport.kml(layerName: "Own", parsed: feature(properties: [:]))
        let mixed = own.replacingOccurrences(of: "</Document>", with:
            "<Placemark><ExtendedData>\(provenance)</ExtendedData><Point><coordinates>unreadable</coordinates></Point></Placemark></Document>")
        #expect(!VectorExport.hasTracedFeatures(try KmlParse.parse(Data(mixed.utf8))))
        #expect(throws: VectorExport.ReproductionRefusal.self) {
            try VectorExport.requireOriginalReproduction(Data(mixed.utf8), filename: "mixed.kml")
        }
    }
}

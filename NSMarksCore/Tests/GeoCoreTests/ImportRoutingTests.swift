import Foundation
import Testing

@testable import GeoCore

/// One selection, both pipelines. The web routes a shared drop zone this way
/// and the panel's two Import buttons have to agree with it.
@Suite("Routing a chosen file to its pipeline")
struct ImportRoutingTests {
    @Test("Raster signatures go to the map pipeline")
    func rasterSignaturesGoToTheMapPipeline() {
        let signatures: [String: [UInt8]] = [
            "classic TIFF": [0x49, 0x49, 0x2a, 0x00],
            "big-endian TIFF": [0x4d, 0x4d, 0x00, 0x2a],
            "BigTIFF": [0x49, 0x49, 0x2b, 0x00],
            "PDF": [0x25, 0x50, 0x44, 0x46],
            "PNG": [0x89, 0x50, 0x4e, 0x47],
            "JPEG": [0xff, 0xd8, 0xff],
        ]
        for (name, magic) in signatures {
            #expect(
                ImportRouting.pipeline(for: Data(magic)) == .raster,
                "\(name) should be read as a map"
            )
        }
    }

    @Test("Vector text and archives go to the data pipeline")
    func vectorTextAndArchivesGoToTheDataPipeline() {
        let files: [String: Data] = [
            "GeoJSON": Data(#"{"type":"FeatureCollection","features":[]}"#.utf8),
            "GeoJSON behind a byte-order mark": Data([0xef, 0xbb, 0xbf]) + Data("{}".utf8),
            "KML": Data("<?xml version=\"1.0\"?><kml></kml>".utf8),
            "zipped shapefile": Data([0x50, 0x4b, 0x03, 0x04]) + Data(repeating: 0, count: 8),
        ]
        for (name, data) in files {
            #expect(ImportRouting.pipeline(for: data) == .vector, "\(name) should be read as data")
        }
    }

    /// The file is refused either way; what matters is that it is refused out
    /// loud. The raster pipeline is the one that names the file and says what
    /// to do about it, so an unreadable file goes there and is reported once.
    @Test("A file neither pipeline recognises is still reported")
    func aFileNeitherPipelineRecognisesIsStillReported() {
        #expect(ImportRouting.pipeline(for: Data("PID,owner\n123,x\n".utf8)) == .raster)
        #expect(ImportRouting.pipeline(for: Data()) == .raster)
        #expect(ImportRouting.pipeline(for: Data([0x00, 0x01, 0x02, 0x03])) == .raster)
    }

    /// A GeoTIFF renamed `.geojson`, and GeoJSON renamed `.tif`. The extension
    /// is the user's to type; the bytes are not.
    @Test("The name on the file decides nothing")
    func theNameOnTheFileDecidesNothing() {
        let tiff = Data([0x49, 0x49, 0x2a, 0x00]) + Data(repeating: 0, count: 32)
        #expect(ImportRouting.pipeline(for: tiff) == .raster)
        let geoJson = Data("\n\t  {\"type\":\"Feature\"}".utf8)
        #expect(ImportRouting.pipeline(for: geoJson) == .vector)
    }
}

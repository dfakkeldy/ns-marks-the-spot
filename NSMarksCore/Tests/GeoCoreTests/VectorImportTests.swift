import Foundation
import Testing

@testable import GeoCore

@Suite("Deciding what a user's vector file is")
struct VectorImportTests {
    /// Extensions are user-editable, so the bytes decide. A `.txt` holding
    /// GeoJSON is a file this app can draw.
    @Test func geoJsonIsRecognisedByItsFirstPrintableCharacter() throws {
        let imported = try VectorImport.read(
            Data(#"  {"type":"Point","coordinates":[-63,44]}"#.utf8),
            filename: "survey notes.txt"
        )
        #expect(imported.source == .geoJson)
        #expect(imported.layers.count == 1)
        #expect(imported.layers[0].name == "survey notes")
    }

    /// A byte-order mark is invisible to the user, and a sniffer that stopped
    /// at it would call their GeoJSON unreadable.
    @Test func aByteOrderMarkDoesNotHideAFile() {
        var bytes = Data([0xef, 0xbb, 0xbf])
        bytes.append(Data(#"{"type":"FeatureCollection","features":[]}"#.utf8))
        #expect(VectorImport.sniff(bytes) == .geoJsonCandidate)
    }

    @Test func xmlRoutesByItsRootElement() throws {
        let imported = try VectorImport.read(
            Data(#"<gpx><wpt lat="44.6" lon="-63.5"><name>Gate</name></wpt></gpx>"#.utf8),
            filename: "track.xml"
        )
        #expect(imported.source == .gpx)
    }

    @Test(arguments: [
        ("", VectorImport.Sniffed.unknown),
        ("PK\u{03}\u{04}rest", VectorImport.Sniffed.zip),
        ("\n\n<kml/>", VectorImport.Sniffed.xmlCandidate),
        ("csv,not,geo\n1,2,3", VectorImport.Sniffed.unknown),
    ])
    func theSnifferReadsBytesNotNames(_ text: String, _ expected: VectorImport.Sniffed) {
        #expect(VectorImport.sniff(Data(text.utf8)) == expected)
    }

    @Test func somethingUnrecognisableSaysWhatThisAppReads() throws {
        var refused: UserMapImportRefusal?
        do {
            _ = try VectorImport.read(Data("id,name\n1,x".utf8), filename: "table.csv")
            Issue.record("Expected a refusal.")
        } catch {
            refused = error
        }
        let refusal = try #require(refused)
        #expect(refusal.code == .unsupportedType)
        #expect(refusal.userMessage.contains("GeoJSON"))
        #expect(refusal.userMessage.contains("shapefile"))
    }

    @Test(arguments: [
        ("parcels.geojson", "parcels"),
        ("folder/sub/track.gpx", "track"),
        ("no-extension", "no-extension"),
        (".hidden", ".hidden"),
        ("two.dots.kml", "two.dots"),
    ])
    func theLayerIsNamedAfterTheFile(_ filename: String, _ expected: String) {
        #expect(VectorImport.stem(of: filename) == expected)
    }

    /// A tighter gate than the raster path's, applied before anything tries to
    /// read the file, and the same 50 MB the web refuses at.
    @Test func aFileOverTheSizeLimitIsRefusedBeforeItIsParsed() throws {
        #expect(VectorImport.hardLimitBytes < UserMapImport.hardLimitBytes)
        var refused: UserMapImportRefusal?
        do {
            _ = try VectorImport.read(
                Data(count: VectorImport.hardLimitBytes + 1), filename: "huge.geojson"
            )
            Issue.record("Expected a refusal.")
        } catch {
            refused = error
        }
        #expect(try #require(refused).code == .tooLarge)
    }
}

import Foundation
import ParityFixtures
import Testing

@testable import MapCatalog

/// The pinned identity of the rendered Atlas, checked against what the web
/// ships rather than against a second copy of the same numbers.
///
/// The web's receipt and its source strings are read straight out of the
/// repository tree: the archive name, the licence, the source dates and the
/// Fletcher sentence are the web's to declare, and this app credits a
/// snapshot only if it is the one the browser draws.
@Suite("The rendered Atlas, pinned to the web's receipt")
struct AtlasRasterTests {
    /// The repository root, found from this file rather than from the working
    /// directory, so the test reads the same tree whether `swift test` runs
    /// from the package or from the repository.
    private static var repositoryRoot: URL {
        var url = URL(fileURLWithPath: #filePath)
        // NSMarksCore/Tests/MapCatalogTests/AtlasRasterTests.swift → root
        for _ in 0..<4 { url.deleteLastPathComponent() }
        return url
    }

    private static func webFile(_ path: String) throws -> String {
        try String(contentsOf: repositoryRoot.appendingPathComponent("web/\(path)"), encoding: .utf8)
    }

    private static func receipt() throws -> [String: JSONValue] {
        let data = try Data(contentsOf: repositoryRoot.appendingPathComponent("web/public/atlas/provincial/source.json"))
        guard case .object(let object) = try JSONDecoder().decode(JSONValue.self, from: data) else {
            throw Failure.notAnObject
        }
        return object
    }

    private enum Failure: Error { case notAnObject }

    @Test("The provincial snapshot is the one the web's receipt names")
    func theProvincialSnapshotIsTheOneTheWebsReceiptNames() throws {
        let receipt = try Self.receipt()
        #expect(receipt["archive"]?.string == AtlasRaster.Provincial.archive)
        #expect(receipt["attribution"]?.string == AtlasRaster.Provincial.attribution)
        #expect(receipt["licenceUrl"]?.string == AtlasRaster.Provincial.licenceURL.absoluteString)
        // The build date, to the day: the receipt's timestamp is what the web
        // prints (`generatedAt.slice(0, 10)`).
        #expect(receipt["generatedAt"]?.string?.hasPrefix(AtlasRaster.Provincial.builtOn) == true)
    }

    /// Rendered where the archive has a tile and nowhere else, so the raster's
    /// zooms are the archive's zooms by construction.
    @Test("The rendered zooms are the archive's zooms")
    func theRenderedZoomsAreTheArchivesZooms() throws {
        let receipt = try Self.receipt()
        #expect(receipt["minzoom"]?.double == Double(AtlasRaster.zoomRange.lowerBound))
        #expect(receipt["maxzoom"]?.double == Double(AtlasRaster.zoomRange.upperBound))
    }

    /// The web's `provincialSourceDates`, rebuilt from the receipt with the
    /// web's own labels, must be the sentence this app prints.
    @Test("The source dates are the web's, source by source")
    func theSourceDatesAreTheWebsSourceBySource() throws {
        let receipt = try Self.receipt()
        guard case .array(let sources)? = receipt["sources"] else {
            Issue.record("The receipt lists no sources")
            return
        }
        let labels = [
            "484g-adjn": "NSRN", "xf3i-vxcb": "GeoNAMES", "h8jb-hzrm": "Water polygons",
            "fpca-jrmt": "Water lines", "xed8-vvg5": "Woodland", "7bqh-hssn": "Municipal boundaries",
        ]
        let rebuilt = sources.compactMap { source -> String? in
            guard case .object(let fields) = source,
                  let id = fields["id"]?.string,
                  let released = fields["released"]?.string
            else { return nil }
            let label = labels[id] ?? fields["name"]?.string ?? id
            return "\(label): \(released.prefix(10))"
        }.joined(separator: "; ")
        #expect(rebuilt == AtlasRaster.Provincial.sourceDates)
    }

    /// Sentences the web defines as string literals, read out of its source so
    /// a rewording on one surface fails here rather than shipping twice.
    @Test("The Fletcher note and the scale note are the web's words")
    func theFletcherNoteAndTheScaleNoteAreTheWebsWords() throws {
        let basemap = try Self.webFile("src/atlas/basemap.ts")
        #expect(basemap.contains("\"\(AtlasRaster.fletcherStyleNote)\""))
        let provincial = try Self.webFile("src/atlas/provincial.ts")
        #expect(provincial.contains("'\(AtlasRaster.Provincial.scaleNote)'"))
        #expect(provincial.contains("'\(AtlasRaster.Supplemental.credit)'") || basemap.contains(AtlasRaster.Supplemental.credit))
    }

    @Test("Each style is named as the web names it")
    func eachStyleIsNamedAsTheWebNamesIt() throws {
        let basemap = try Self.webFile("src/atlas/basemap.ts")
        for style in AtlasRasterStyle.allCases {
            #expect(basemap.contains("\(style.rawValue): '\(style.displayName)'"))
            #expect(AtlasRaster.name(style) == "NS Marks Atlas · \(style.displayName)")
        }
        #expect(AtlasRaster.sourceDate(.fletcher).hasSuffix(AtlasRaster.fletcherStyleNote))
        #expect(!AtlasRaster.sourceDate(.day).contains("Fletcher"))
    }

    /// The tile scheme the overlay is built on: 512 CSS pixels per tile is
    /// what makes a rendered zoom z the web's Leaflet zoom z + 1.
    @Test("The tile scheme is MapLibre's, drawn at 2×")
    func theTileSchemeIsMapLibresDrawnAtTwoX() {
        #expect(AtlasRaster.cssPixels == 512)
        #expect(AtlasRaster.imagePixels == 2 * AtlasRaster.cssPixels)
        #expect(AtlasRaster.imageFormat == "webp")
        #expect(AtlasRaster.tileRevision.hasPrefix("atlas-raster-"))
        #expect(AtlasRaster.packageDirectory == "atlas-raster")
    }

    /// The XYZ tile holding a point, as `web/scripts/atlasRaster` computes it.
    private static func tile(lon: Double, lat: Double, z: Int) -> (x: Int, y: Int) {
        let n = Double(1 << z)
        let φ = lat * .pi / 180
        return (
            Int(((lon + 180) / 360 * n).rounded(.down)),
            Int(((1 - log(tan(φ) + 1 / cos(φ)) / .pi) / 2 * n).rounded(.down))
        )
    }

    /// The province's far corners are inside the footprint at every zoom the
    /// map asks for, and App Review's Cupertino is not.
    @Test("The footprint holds the province and not the rest of the world")
    func theFootprintHoldsTheProvince() {
        let province = [
            (-61.50, 45.87), // Judique
            (-66.12, 43.84), // Yarmouth
            (-60.42, 47.03), // Cape North
            (-59.99, 43.93), // Sable Island
        ]
        let elsewhere = [
            (-122.01, 37.33), // Apple Park, Cupertino
            (-73.99, 40.73), // New York
            (-0.13, 51.51), // London
        ]
        for z in 0...23 {
            for (lon, lat) in province {
                let t = Self.tile(lon: lon, lat: lat, z: z)
                #expect(AtlasRaster.covers(z: z, x: t.x, y: t.y), "(\(lon), \(lat)) at z\(z)")
            }
        }
        // Below zoom 3 the square holding Nova Scotia also holds New York and
        // London (zoom 2's is 90° W–0°, 0°–66° N), so "elsewhere" starts there.
        // Cupertino is in another square from zoom 2 down.
        for z in 3...23 {
            for (lon, lat) in elsewhere {
                let t = Self.tile(lon: lon, lat: lat, z: z)
                #expect(!AtlasRaster.covers(z: z, x: t.x, y: t.y), "(\(lon), \(lat)) at z\(z)")
            }
        }
        #expect(AtlasRaster.covers(z: 0, x: 0, y: 0))
        #expect(!AtlasRaster.covers(z: -1, x: 0, y: 0))
    }
}

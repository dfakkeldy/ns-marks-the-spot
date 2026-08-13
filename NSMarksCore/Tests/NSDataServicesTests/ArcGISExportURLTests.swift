import Foundation
import GeoCore
import MapCatalog
import Testing

@testable import NSDataServices

/// The native `/export` query must be the same bytes the browser sends.
///
/// ArcGIS and the caches in front of it key renders by URL, so an equivalent
/// spelling is a second render, not a cache hit — and a URL copied from the
/// browser's network tab should be comparable to one from a native bug report
/// without decoding both first.
@Suite("ArcGIS export URLs")
struct ArcGISExportURLTests {
    static let service = URL(string: "https://example.test/arcgis/rest/services/X/MapServer")!

    // MARK: - Geometry

    @Test("Tile bounds match the web's webMercatorBoundsForTile")
    func tileBounds() {
        let world = WebMercator.worldExtent
        let whole = WebMercator.bounds(x: 0, y: 0, z: 0)
        #expect(whole.minX == -world)
        #expect(whole.maxY == world)
        #expect(whole.maxX == world)
        #expect(whole.minY == -world)

        // The four z1 quadrants tile the world exactly, meeting at the origin.
        let topRight = WebMercator.bounds(x: 1, y: 0, z: 1)
        #expect(topRight.minX == 0)
        #expect(topRight.minY == 0)
        #expect(topRight.maxX == world)
        #expect(topRight.maxY == world)
    }

    @Test("The world extent carries every digit the web uses")
    func worldExtentPrecision() {
        // A truncated copy shifts every bbox: at z19 the tile span is ~76 m, so
        // losing the last digits is not a rounding detail, it is a visible
        // offset between the two maps.
        #expect("\(WebMercator.worldExtent)" == "20037508.342789244")
    }

    // MARK: - Number formatting

    @Test("Whole coordinates print without a trailing .0, as JavaScript does")
    func wholeNumbersMatchJavaScript() {
        // Swift would write "0.0" here and the web writes "0" — two characters
        // that make a different URL for any tile touching the meridian or the
        // equator.
        #expect(ArcGISExportURL.jsNumber(0) == "0")
        #expect(ArcGISExportURL.jsNumber(-0) == "0")
        #expect(ArcGISExportURL.jsNumber(20_037_508) == "20037508")
        #expect(ArcGISExportURL.jsNumber(-20_037_508.342789244) == "-20037508.342789244")
    }

    @Test("A tile on the meridian writes a bare zero")
    func meridianTileBBox() throws {
        let url = try #require(
            ArcGISExportURL.tile(
                serviceURL: Self.service,
                options: ArcGISExportOptions(transparent: true),
                x: 1, y: 0, z: 1
            )
        )
        #expect(url.absoluteString.contains("bbox=0%2C0%2C20037508.342789244%2C20037508.342789244"))
    }

    // MARK: - Encoding

    @Test("Percent-encoding matches URLSearchParams, not urlQueryAllowed")
    func encodingMatchesJavaScript() {
        // URLComponents passes ':' ',' '[' ']' through literally. URLSearchParams
        // escapes them, and dynamicLayers is made of exactly those characters.
        #expect(ArcGISExportURL.formURLEncoded("{\"a\":1}") == "%7B%22a%22%3A1%7D")
        #expect(ArcGISExportURL.formURLEncoded("show:2,4") == "show%3A2%2C4")
        #expect(ArcGISExportURL.formURLEncoded("[0]") == "%5B0%5D")
        #expect(ArcGISExportURL.formURLEncoded("a b") == "a+b")
        #expect(ArcGISExportURL.formURLEncoded("aZ0*-._") == "aZ0*-._")
        // Non-ASCII goes out as UTF-8 bytes, uppercase hex.
        #expect(ArcGISExportURL.formURLEncoded("é") == "%C3%A9")
    }

    // MARK: - Query shape

    @Test("Writes the web's parameters, in the web's order")
    func parameterOrder() throws {
        let url = try #require(
            ArcGISExportURL.tile(
                serviceURL: Self.service,
                options: ArcGISExportOptions(transparent: true, layers: "show:2,4", dpi: 192),
                x: 0, y: 0, z: 0
            )
        )
        let keys = (url.query() ?? "")
            .split(separator: "&")
            .compactMap { $0.split(separator: "=").first.map(String.init) }
        #expect(keys == ["bbox", "bboxSR", "imageSR", "size", "format", "transparent", "f", "dpi", "layers"])
    }

    @Test("Omits the optional parameters the web omits")
    func omitsAbsentOptions() throws {
        let url = try #require(
            ArcGISExportURL.tile(
                serviceURL: Self.service,
                options: ArcGISExportOptions(transparent: false),
                x: 0, y: 0, z: 0
            )
        )
        let query = url.query() ?? ""
        #expect(query.contains("transparent=false"))
        #expect(!query.contains("dpi="))
        #expect(!query.contains("layers="))
        #expect(!query.contains("dynamicLayers="))
    }

    @Test("Strips a trailing slash from the service URL")
    func stripsTrailingSlash() throws {
        let url = try #require(
            ArcGISExportURL.tile(
                serviceURL: URL(string: "https://example.test/MapServer/")!,
                options: ArcGISExportOptions(transparent: true),
                x: 0, y: 0, z: 0
            )
        )
        #expect(url.absoluteString.hasPrefix("https://example.test/MapServer/export?"))
    }

    @Test("Sends dynamicLayers as the catalog's exact bytes")
    func dynamicLayersRoundTripsExactly() throws {
        let waterfalls = try #require(LayerCatalog.descriptor(for: .waterfalls))
        let options = try #require(waterfalls.exportOptions)
        let service = try #require(waterfalls.serviceURL)
        let declared = try #require(options.dynamicLayers)
        let url = try #require(
            ArcGISExportURL.tile(serviceURL: service, options: options, x: 0, y: 0, z: 0)
        )
        // Compared as the encoded bytes on the wire, not as a decoded string.
        // `URLComponents` decodes `%20` but leaves `+` alone, because in a
        // generic URI `+` is a literal plus; it only means a space under
        // form-urlencoded rules. `URLSearchParams` writes `+` for spaces, so
        // the web puts `+` in this query and so must we — and the definition
        // expression here contains spaces.
        let query = try #require(url.query(percentEncoded: true))
        #expect(query.contains("dynamicLayers=\(ArcGISExportURL.formURLEncoded(declared))"))
        #expect(query.contains("FEAT_DESC+%3D+"), "spaces are not form-encoded")

        // And decoding the way a form-urlencoded reader does recovers the
        // catalog string exactly, key order included.
        let sent = try #require(
            query
                .split(separator: "&")
                .first { $0.hasPrefix("dynamicLayers=") }?
                .dropFirst("dynamicLayers=".count)
                .replacingOccurrences(of: "+", with: " ")
                .removingPercentEncoding
        )
        #expect(sent == declared)
    }

    @Test("Every raster layer builds a URL at its own minimum zoom")
    func everyRasterBuilds() throws {
        let cleared = ProvinceLicenceClearance(allowsRestrictedLayers: true)
        for layer in LayerCatalog.all where layer.isRaster && layer.serviceURL != nil {
            let request = try? TileRequestFactory.tileRequest(
                for: layer.id, x: 0, y: 0, z: layer.minZoom, clearance: cleared
            )
            #expect(request != nil, "\(layer.id.rawValue) built no URL at z\(layer.minZoom)")
            #expect(request?.url.scheme == "https", "\(layer.id.rawValue) is not HTTPS")
        }
    }
}

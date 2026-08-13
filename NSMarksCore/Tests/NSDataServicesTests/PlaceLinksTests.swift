import GeoCore
import Testing

@testable import NSDataServices

/// The expected codes come from running the web's own `googleMaps.ts` over
/// these coordinates, not from re-deriving them here: the point of the port is
/// that both surfaces print the same code for the same civic point, and a test
/// written against my own reasoning would pass a shared mistake.
///
/// `8FVC2222+22` for 47.0000625, 8.0000625 is Google's published example, which
/// anchors the whole set to the specification rather than to the web.
@Suite("Plus Codes and directions")
struct PlaceLinksTests {
    @Test(
        "A Plus Code matches the web's, character for character",
        arguments: [
            (44.6488, -63.5752, "87PRJCXF+GW"),
            (46.059488, -61.414138, "87RW3H5P+Q8"),
            (47.0000625, 8.0000625, "8FVC2222+22"),
            (0.0, 0.0, "6FG22222+22"),
            (-90.0, -180.0, "22222222+22"),
            (89.9999999, 179.9999999, "CVXXXXXX+XX"),
            (45.0, -63.0, "87QV2222+22"),
        ]
    )
    func plusCodesMatchTheWeb(lat: Double, lng: Double, expected: String) {
        #expect(PlaceLinks.plusCode(for: GeoPoint(lat: lat, lng: lng)) == expected)
    }

    /// The southern and western hemispheres are the whole reason `floor` is
    /// spelled out in the port: truncating toward zero instead would move a
    /// negative coordinate into the next cell, and Nova Scotia is west of the
    /// prime meridian, so every code in the province would be wrong.
    @Test func negativeCoordinatesRoundDownRatherThanTowardZero() {
        let west = PlaceLinks.plusCode(for: GeoPoint(lat: 44.6488, lng: -63.5752))
        let east = PlaceLinks.plusCode(for: GeoPoint(lat: 44.6488, lng: 63.5752))
        #expect(west == "87PRJCXF+GW")
        #expect(west != east)
    }

    @Test(arguments: [Double.nan, .infinity, -.infinity])
    func aCoordinateThatIsNotANumberHasNoCode(value: Double) {
        #expect(PlaceLinks.plusCode(for: GeoPoint(lat: value, lng: -63.5)) == nil)
        #expect(PlaceLinks.plusCode(for: GeoPoint(lat: 44.6, lng: value)) == nil)
        #expect(PlaceLinks.directionsURL(for: GeoPoint(lat: value, lng: -63.5)) == nil)
    }

    @Test func directionsAddressTheCoordinateTheProvincePublished() throws {
        let url = try #require(PlaceLinks.directionsURL(for: GeoPoint(lat: 44.6488, lng: -63.5752)))
        #expect(
            url.absoluteString == "https://www.google.com/maps/dir/?api=1"
                + "&destination=44.6488%2C-63.5752&dir_action=navigate"
        )
    }

    /// A whole-number coordinate is where JavaScript and Swift disagree about
    /// how to write a `Double`, and the web writes `45`, not `45.0`.
    @Test func awholeNumberCoordinateIsWrittenAsTheWebWritesIt() throws {
        let url = try #require(PlaceLinks.directionsURL(for: GeoPoint(lat: 45, lng: -63)))
        #expect(url.absoluteString.contains("destination=45%2C-63&"))
    }
}

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
            // The corners themselves, where the latitude clamp and the
            // longitude wrap decide the answer rather than the arithmetic.
            (90.0, 0.0, "CFX2X2X2+X2"),
            (90.0, 180.0, "C2X2X2X2+X2"),
            (90.0, -180.0, "C2X2X2X2+X2"),
            (-90.0, 180.0, "22222222+22"),
            (-90.0, 0.0, "2F222222+22"),
            (0.0, 180.0, "62G22222+22"),
            // Past the antimeridian, which wraps, unlike latitude which clamps.
            (45.0, 181.0, "82Q32222+22"),
            (45.0, -181.0, "8VQX2222+22"),
            (45.0, 540.0, "82Q22222+22"),
        ]
    )
    func plusCodesMatchTheWeb(lat: Double, lng: Double, expected: String) {
        #expect(PlaceLinks.plusCode(for: GeoPoint(lat: lat, lng: lng)) == expected)
    }

    /// A finite number the encoder cannot use is not a reason to take the app
    /// down. The civic decoder checks only that a coordinate is finite, so a
    /// corrupt record can carry one of these all the way here, and scaling it
    /// by 25 million overflows anything the code would otherwise convert to an
    /// `Int`.
    @Test(arguments: [1e12, -1e12, 1e30, -1e30, .greatestFiniteMagnitude, 1e300])
    func anAbsurdButFiniteCoordinateNeitherTrapsNorLies(value: Double) {
        // No expectation about the string: the point is that the call returns.
        _ = PlaceLinks.plusCode(for: GeoPoint(lat: value, lng: value))
        _ = PlaceLinks.plusCode(for: GeoPoint(lat: 44.6, lng: value))
        _ = PlaceLinks.plusCode(for: GeoPoint(lat: value, lng: -63.5))
        _ = PlaceLinks.directionsURL(for: GeoPoint(lat: value, lng: value))
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

    /// The other place the two languages write a `Double` differently. Swift
    /// reaches for an exponent four orders of magnitude sooner than JavaScript
    /// does, and pads the exponent when it does — so near the equator and the
    /// prime meridian a coordinate would reach Google in a form the web never
    /// sends. Expectations from `String(value)` under node.
    @Test(
        arguments: [
            (0.0001, "0.0001"),
            (0.00001, "0.00001"),
            (0.000001, "0.000001"),
            (1.000001e-6, "0.000001000001"),
            (-0.00001, "-0.00001"),
            (1e-7, "1e-7"),
            (-1e-7, "-1e-7"),
            (1e-9, "1e-9"),
            (44.6488, "44.6488"),
            (0.0, "0"),
            (-63.0, "-63"),
        ]
    )
    func aCoordinateIsWrittenTheWayJavaScriptWritesIt(value: Double, expected: String) {
        #expect(PlaceLinks.coordinate(value) == expected)
    }

    /// The whole line, for the case the formatter exists to protect.
    @Test func aCoordinateNearZeroReachesGoogleInDecimal() throws {
        let url = try #require(PlaceLinks.directionsURL(for: GeoPoint(lat: 0.00001, lng: 0.00001)))
        #expect(
            url.absoluteString == "https://www.google.com/maps/dir/?api=1"
                + "&destination=0.00001%2C0.00001&dir_action=navigate"
        )
    }
}

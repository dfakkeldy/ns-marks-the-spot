import Foundation
import Testing

@testable import GeoCore

// Ported case-for-case from web/src/services/geodesy.test.ts. Each test here has
// a named counterpart there; when one surface changes a formula, the matching
// pair should fail together rather than drift silently.

/// One degree of arc on Leaflet's sphere (R = 6 371 000 m).
private let metresPerDegree = 6_371_000 * Double.pi / 180

@Suite("pathDistanceMetres")
struct PathDistanceTests {
    @Test("measures a degree of longitude along the equator")
    func degreeOfLongitudeAtEquator() {
        let metres = Geodesy.pathDistanceMetres([
            GeoPoint(lat: 0, lng: 0),
            GeoPoint(lat: 0, lng: 1),
        ])
        #expect(abs(metres - metresPerDegree) < 0.5)
    }

    @Test("measures a degree of latitude the same at any longitude")
    func degreeOfLatitude() {
        let metres = Geodesy.pathDistanceMetres([
            GeoPoint(lat: 45, lng: -61),
            GeoPoint(lat: 46, lng: -61),
        ])
        #expect(abs(metres - metresPerDegree) < 0.5)
    }

    @Test("shrinks east-west distance at Nova Scotia's latitude")
    func eastWestShrinksWithLatitude() {
        let metres = Geodesy.pathDistanceMetres([
            GeoPoint(lat: 45, lng: -61),
            GeoPoint(lat: 45, lng: -60),
        ])
        // ≈ cos(45°) of an equatorial degree; haversine value, ±5 m.
        #expect(abs(metres - 78_626) < 5)
    }

    @Test("sums the legs of a multi-point path")
    func sumsLegs() {
        let a = GeoPoint(lat: 45, lng: -61)
        let b = GeoPoint(lat: 45.01, lng: -61)
        let c = GeoPoint(lat: 45.02, lng: -61)
        let whole = Geodesy.pathDistanceMetres([a, b, c])
        let parts =
            Geodesy.pathDistanceMetres([a, b]) + Geodesy.pathDistanceMetres([b, c])
        #expect(abs(whole - parts) < 1e-6)
    }

    @Test("returns zero for fewer than two points")
    func zeroForShortPaths() {
        #expect(Geodesy.pathDistanceMetres([]) == 0)
        #expect(Geodesy.pathDistanceMetres([GeoPoint(lat: 45, lng: -61)]) == 0)
    }
}

@Suite("polygonAreaSquareMetres")
struct PolygonAreaTests {
    private func oneAcreSquareAt45North() -> [GeoPoint] {
        let side = Geodesy.squareMetresPerAcre.squareRoot()
        let dLat = side / metresPerDegree
        let dLng = side / (metresPerDegree * cos(45 * Double.pi / 180))
        return [
            GeoPoint(lat: 45, lng: -61),
            GeoPoint(lat: 45, lng: -61 + dLng),
            GeoPoint(lat: 45 + dLat, lng: -61 + dLng),
            GeoPoint(lat: 45 + dLat, lng: -61),
        ]
    }

    @Test("measures a surveyed one-acre square at 45° North")
    func oneAcre() {
        let area = Geodesy.polygonAreaSquareMetres(oneAcreSquareAt45North())
        #expect(abs(area / Geodesy.squareMetresPerAcre - 1) < 0.005)
    }

    @Test("is winding-order independent")
    func windingOrderIndependent() {
        let ring = oneAcreSquareAt45North()
        let forward = Geodesy.polygonAreaSquareMetres(ring)
        let reversed = Geodesy.polygonAreaSquareMetres(ring.reversed())
        #expect(abs(forward - reversed) < 1e-6)
    }

    @Test("measures an equator-crossing patch against the analytic band area")
    func equatorCrossingBand() {
        let area = Geodesy.polygonAreaSquareMetres([
            GeoPoint(lat: -1, lng: 10),
            GeoPoint(lat: -1, lng: 11),
            GeoPoint(lat: 1, lng: 11),
            GeoPoint(lat: 1, lng: 10),
        ])
        // Spherical band: R² · Δλ · (sin φ₂ − sin φ₁)
        let expected =
            pow(6_371_000, 2)
            * (Double.pi / 180)
            * (sin(1 * Double.pi / 180) - sin(-1 * Double.pi / 180))
        #expect(abs(area / expected - 1) < 5e-5)
    }

    @Test("returns zero for fewer than three points")
    func zeroForDegenerateRings() {
        #expect(Geodesy.polygonAreaSquareMetres([]) == 0)
        #expect(
            Geodesy.polygonAreaSquareMetres([
                GeoPoint(lat: 45, lng: -61),
                GeoPoint(lat: 45.01, lng: -61),
            ]) == 0
        )
    }
}

@Suite("formatting")
struct FormattingTests {
    @Test("formats metres below one kilometre")
    func metres() {
        #expect(Geodesy.formatDistance(0) == "0 m")
        #expect(Geodesy.formatDistance(999.4) == "999 m")
    }

    @Test("formats kilometres at and above one kilometre")
    func kilometres() {
        #expect(Geodesy.formatDistance(1_000) == "1.00 km")
        #expect(Geodesy.formatDistance(12_345) == "12.35 km")
    }

    @Test("formats areas as hectares and acres together")
    func areas() {
        #expect(
            Geodesy.formatArea(5 * Geodesy.squareMetresPerAcre) == "2.02 ha · 5.00 ac"
        )
        #expect(Geodesy.formatArea(10_000) == "1.00 ha · 2.47 ac")
    }
}

/// Which way, for a reader standing somewhere and being told where a boundary
/// is. Degrees clockwise from TRUE north, which is what the map is drawn in.
@Suite("Bearing")
struct GeodesyBearingTests {
    private let here = GeoPoint(lat: 45.0, lng: -63.0)

    @Test("The four cardinal directions come back as themselves")
    func theCardinalDirections() throws {
        let north = try #require(
            Geodesy.initialBearingDegrees(from: here, to: GeoPoint(lat: 45.01, lng: -63.0))
        )
        #expect(abs(north) < 0.001)

        let south = try #require(
            Geodesy.initialBearingDegrees(from: here, to: GeoPoint(lat: 44.99, lng: -63.0))
        )
        #expect(abs(south - 180) < 0.001)

        // East and west are exact only along the equator; a tenth of a degree
        // of longitude at 45°N is within a hundredth of a degree of due east.
        let east = try #require(
            Geodesy.initialBearingDegrees(from: here, to: GeoPoint(lat: 45.0, lng: -62.9))
        )
        #expect(abs(east - 90) < 0.05)

        let west = try #require(
            Geodesy.initialBearingDegrees(from: here, to: GeoPoint(lat: 45.0, lng: -63.1))
        )
        #expect(abs(west - 270) < 0.05)
    }

    /// Zero is a direction. A point that is where you already are has none.
    @Test("The same place has no bearing rather than a bearing of zero")
    func theSamePlaceHasNoBearing() {
        #expect(Geodesy.initialBearingDegrees(from: here, to: here) == nil)
        #expect(
            Geodesy.initialBearingDegrees(
                from: here, to: GeoPoint(lat: 45.0, lng: -63.0)
            ) == nil
        )
    }

    @Test("Every bearing is inside one turn")
    func everyBearingIsInsideOneTurn() throws {
        for lat in stride(from: 44.0, through: 46.0, by: 0.25) {
            for lng in stride(from: -64.0, through: -62.0, by: 0.25) {
                let there = GeoPoint(lat: lat, lng: lng)
                guard let bearing = Geodesy.initialBearingDegrees(from: here, to: there)
                else { continue }
                #expect(bearing >= 0 && bearing < 360)
            }
        }
    }

    @Test("The compass name rounds to the nearest of eight, and wraps")
    func theCompassNameRoundsAndWraps() {
        #expect(Geodesy.compassPoint(forBearingDegrees: 0) == "north")
        #expect(Geodesy.compassPoint(forBearingDegrees: 22) == "north")
        #expect(Geodesy.compassPoint(forBearingDegrees: 24) == "north-east")
        #expect(Geodesy.compassPoint(forBearingDegrees: 90) == "east")
        // 200° is nearer south than south-west; 210° is not.
        #expect(Geodesy.compassPoint(forBearingDegrees: 200) == "south")
        #expect(Geodesy.compassPoint(forBearingDegrees: 210) == "south-west")
        #expect(Geodesy.compassPoint(forBearingDegrees: 315) == "north-west")
        // 350° is nearer north than north-west, and the index must not run off
        // the end of the table getting there.
        #expect(Geodesy.compassPoint(forBearingDegrees: 350) == "north")
        #expect(Geodesy.compassPoint(forBearingDegrees: 359.9) == "north")
    }
}

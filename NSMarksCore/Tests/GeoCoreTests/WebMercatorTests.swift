import Foundation
import Testing

@testable import GeoCore

@Suite("Web Mercator")
struct WebMercatorTests {
    @Test func projectingAndUnprojectingRoundTrips() {
        let point = GeoPoint(lat: 46.353788, lng: -61.387588)
        let round = WebMercator.unproject(WebMercator.project(point))
        #expect(abs(round.lat - point.lat) < 1e-9)
        #expect(abs(round.lng - point.lng) < 1e-9)
    }

    /// Ground distance is not the projected magnitude. At this latitude
    /// Mercator inflates by 1/cos(lat) — about 1.44× — so the two figures
    /// differ by nearly half, and every accuracy report depends on which one it
    /// quotes.
    @Test func groundDistanceIsNotTheInflatedMercatorMagnitude() {
        let start = GeoPoint(lat: 46.0, lng: -61.5)
        let projected = WebMercator.project(start)
        let east = WebMercator.unproject(
            MercatorPoint(x: projected.x + 1000, y: projected.y)
        )
        let ground = WebMercator.groundMetres(from: start, to: east)
        #expect(abs(ground - 1000 * cos(46.0 * .pi / 180)) < 0.5)
        #expect(abs(ground - 1000) > 100)
    }

    /// A coordinate that is not a number must not come back as a confident
    /// distance.
    ///
    /// The haversine clamps its argument into `asin`'s domain against rounding
    /// just past 1, and `Swift.min(1, .nan)` returns 1 — it answers
    /// `y < x ? y : x`, and every comparison against NaN is false — where the
    /// JavaScript this was ported from returns NaN. Unguarded, a degenerate
    /// transform's prediction measured `asin(1)`: a half-circumference,
    /// 20 037 km, reported as an ordinary distance. That number would then pass
    /// any finiteness check a caller makes downstream.
    @Test func aCoordinateThatIsNotANumberIsNotADistance() {
        let real = GeoPoint(lat: 46.0, lng: -61.5)
        for broken in [
            GeoPoint(lat: .nan, lng: -61.5),
            GeoPoint(lat: 46.0, lng: .nan)
        ] {
            #expect(WebMercator.groundMetres(from: real, to: broken).isNaN)
            #expect(WebMercator.groundMetres(from: broken, to: real).isNaN)
        }
    }
}

import Foundation

@testable import GeoCore

/// Control-point sets shared by the georeferencing suites, ported from
/// `web/src/userMaps/testFixtures.ts`.
///
/// Shared rather than copied per suite for the reason the web's file gives: two
/// suites asserting the same measured number against quietly different point
/// clouds is a defect that reads as a passing test.
enum GeoreferenceFixtures {
    /// Eight points from a bent survey — the web's `BENT`, verbatim, because
    /// every measured figure asserted against it was taken on these numbers.
    static let bent = [
        control(320, 240, 46.407181, -61.530755),
        control(3610, 300, 46.39359, -61.331564),
        control(2180, 2830, 46.270564, -61.421238),
        control(1870, 410, 46.395776, -61.436675),
        control(940, 1420, 46.344717, -61.494514),
        control(2650, 1180, 46.353788, -61.387588),
        control(3820, 2050, 46.305077, -61.313447),
        control(610, 2560, 46.284573, -61.52146)
    ]

    /// Six points from the same survey with one deliberately mis-clicked, at
    /// index 4: the bend puts it at lng -61.387588 and it is recorded at
    /// -61.396699.
    ///
    /// This is the disagreement between the two rankings made reproducible —
    /// the affine fit residual names the displaced point, leave-one-out does
    /// not.
    static let outlier = [
        control(320, 240, 46.407181, -61.530755),
        control(1870, 410, 46.395776, -61.436675),
        control(3610, 300, 46.39359, -61.331564),
        control(940, 1420, 46.344717, -61.494514),
        control(2650, 1180, 46.353788, -61.396699),
        control(3820, 2050, 46.305077, -61.313447)
    ]

    static func control(
        _ x: Double, _ y: Double, _ lat: Double, _ lng: Double
    ) -> GroundControlPoint {
        GroundControlPoint(pixel: PixelPoint(x: x, y: y), map: GeoPoint(lat: lat, lng: lng))
    }

    /// A deterministic, well-conditioned irregular set of any size, for the
    /// leave-one-out cost cap.
    ///
    /// A golden-angle spiral, so no two points share a row, a column or a
    /// spacing. A lattice would be nearly affine by construction — measured on
    /// all three real A.F. Church graticule sets — which would make every
    /// leave-one-out figure meaninglessly small.
    static func irregular(count: Int) -> [GroundControlPoint] {
        (0..<count).map { index in
            let radius = ((Double(index) + 0.5) / Double(count)).squareRoot()
            let angle = Double(index) * 2.399963229728653
            let x = 2000 + 1800 * radius * cos(angle)
            let y = 1500 + 1300 * radius * sin(angle)
            return control(
                x, y,
                46.2 + y / 30000 + sin(x / 900) * 0.002,
                -61.6 + x / 20000 + cos(y / 700) * 0.002
            )
        }
    }

    /// `count` points of which `count - 1` sit on an exact 45-degree line and
    /// one sits well off it — the layout that makes a leave-one-out refit
    /// refuse while the full solve is perfectly healthy.
    ///
    /// Drop the off-line point and the rest are collinear, so exactly one
    /// subset refuses; drop any other and the off-line point is still there
    /// holding the cloud open. A user produces this by tracing a road or a
    /// neatline and adding a single anchor elsewhere, at any point count.
    static func collinearExceptOne(count: Int) -> [GroundControlPoint] {
        let onLine = count - 1
        func map(_ x: Double, _ y: Double) -> GeoPoint {
            GeoPoint(lat: 46.4 - y * 0.0001, lng: -61.5 + x * 0.00012)
        }
        var points = (0..<onLine).map { index -> GroundControlPoint in
            let along = 100 + (800 * Double(index)) / Double(onLine - 1)
            return GroundControlPoint(
                pixel: PixelPoint(x: along, y: along), map: map(along, along)
            )
        }
        points.append(
            GroundControlPoint(pixel: PixelPoint(x: 900, y: 120), map: map(900, 120))
        )
        return points
    }

    /// Moves ONE point east by a known number of *ground* metres.
    ///
    /// The index argument is the point: translating every point together moves
    /// the fit with them, and the displaced point's error would no longer be
    /// the externally known distance this was asked for.
    static func nudgingEast(
        _ points: [GroundControlPoint], at index: Int, metres: Double
    ) -> [GroundControlPoint] {
        var moved = points
        let point = moved[index]
        let degrees = metres
            / (WebMercator.earthRadiusMetres * cos(point.map.lat * .pi / 180) * (.pi / 180))
        moved[index].map = GeoPoint(lat: point.map.lat, lng: point.map.lng + degrees)
        return moved
    }

    /// Index of the largest value, or nil for an empty list. Ties go to the
    /// first index, matching the report's strict-greater-than scan, so a caller
    /// comparing the two is comparing like with like.
    static func argmax(_ values: [Double]) -> Int? {
        guard !values.isEmpty else { return nil }
        var best = 0
        for index in 1..<values.count where values[index] > values[best] {
            best = index
        }
        return best
    }
}

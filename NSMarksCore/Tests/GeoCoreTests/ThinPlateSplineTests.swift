import Foundation
import Testing

@testable import GeoCore

/// Ported from `web/src/userMaps/transform/tps.test.ts`, fixtures included, so
/// the two surfaces refuse and accept the same control-point sets.
@Suite("Thin-plate spline")
struct ThinPlateSplineTests {
    /// Eight points from a bent survey — the web's `BENT` fixture, verbatim,
    /// because the measured separations recorded in these tests were taken
    /// against exactly these numbers.
    static let bent = [
        GroundControlPoint(pixel: PixelPoint(x: 320, y: 240), map: GeoPoint(lat: 46.407181, lng: -61.530755)),
        GroundControlPoint(pixel: PixelPoint(x: 3610, y: 300), map: GeoPoint(lat: 46.39359, lng: -61.331564)),
        GroundControlPoint(pixel: PixelPoint(x: 2180, y: 2830), map: GeoPoint(lat: 46.270564, lng: -61.421238)),
        GroundControlPoint(pixel: PixelPoint(x: 1870, y: 410), map: GeoPoint(lat: 46.395776, lng: -61.436675)),
        GroundControlPoint(pixel: PixelPoint(x: 940, y: 1420), map: GeoPoint(lat: 46.344717, lng: -61.494514)),
        GroundControlPoint(pixel: PixelPoint(x: 2650, y: 1180), map: GeoPoint(lat: 46.353788, lng: -61.387588)),
        GroundControlPoint(pixel: PixelPoint(x: 3820, y: 2050), map: GeoPoint(lat: 46.305077, lng: -61.313447)),
        GroundControlPoint(pixel: PixelPoint(x: 610, y: 2560), map: GeoPoint(lat: 46.284573, lng: -61.52146))
    ]

    /// The defining property: an interpolating spline passes through every one
    /// of its control points. A surface that merely came close would be a fit,
    /// and the user placed those points precisely.
    @Test func itPassesExactlyThroughEveryControlPoint() throws {
        let spline = try ThinPlateSpline.solve(controlPoints: Self.bent)
        for control in Self.bent {
            let got = spline.apply(x: control.pixel.x, y: control.pixel.y)
            let want = WebMercator.project(control.map)
            #expect(hypot(got.x - want.x, got.y - want.y) < 1e-6)
        }
    }

    @Test func itRefusesFewerThanThreePoints() {
        #expect(throws: ThinPlateSpline.Refusal.tooFewPoints) {
            try ThinPlateSpline.solve(controlPoints: Array(Self.bent.prefix(2)))
        }
    }

    /// A duplicate makes two rows of the interpolation matrix identical. Named
    /// distinctly from an ill-conditioned layout because the user's remedy is
    /// different: move a point, not add one.
    @Test func itNamesCoincidentPointsAsTheirOwnRefusal() {
        let duplicated = Array(Self.bent.prefix(3)) + [
            GroundControlPoint(
                pixel: Self.bent[0].pixel, map: GeoPoint(lat: 45.5, lng: -62.0)
            )
        ]
        #expect(throws: ThinPlateSpline.Refusal.coincidentPoints) {
            try ThinPlateSpline.solve(controlPoints: duplicated)
        }
    }

    /// Points strung along a line, at three orientations and with a fourth
    /// nearly-straight case: all refused, none of them by luck of a pivot.
    @Test(arguments: [
        [[100.0, 100], [400, 400], [900, 900]],
        [[100.0, 100], [400, 250], [900, 500]],
        [[100.0, 300], [500, 300], [1200, 300]],
        [[100.0, 100], [400, 251], [700, 399], [1100, 602], [1500, 798]]
    ])
    func itRefusesAThinCloudAsIllConditioned(_ line: [[Double]]) {
        let controls = line.map {
            GroundControlPoint(
                pixel: PixelPoint(x: $0[0], y: $0[1]),
                map: GeoPoint(lat: 46 + $0[1] / 20000, lng: -61 + $0[0] / 20000)
            )
        }
        #expect(throws: ThinPlateSpline.Refusal.illConditioned) {
            try ThinPlateSpline.solve(controlPoints: controls)
        }
    }

    /// The case the fixtures above cannot express: they derive each destination
    /// from its pixel, so their map cloud is degenerate in the same way their
    /// scan cloud is, and either half of the gate would refuse them. Here the
    /// road is thin on the scan while the map points are a healthy spread — and
    /// it must still be refused, because the affine solver refuses the same
    /// points.
    @Test func itRefusesAThinScanCloudOnTheSourceAlone() throws {
        let road = [[100.0, 100], [400, 251], [700, 399], [1100, 602], [1500, 798]]
        let controls = road.enumerated().map { index, point in
            GroundControlPoint(
                pixel: PixelPoint(x: point[0], y: point[1]), map: Self.bent[index].map
            )
        }

        #expect(
            ControlPointConditioning.ratio(of: controls.map(\.pixel))
                < ControlPointConditioning.minimumConditionRatio
        )
        #expect(
            ControlPointConditioning.ratio(
                of: controls.map { WebMercator.project($0.map) }
                    .map { PixelPoint(x: $0.x, y: $0.y) }
            ) > 0.3
        )
        #expect(AffineFit.solve(controlPoints: controls) == nil)
        #expect(throws: ThinPlateSpline.Refusal.illConditioned) {
            try ThinPlateSpline.solve(controlPoints: controls)
        }
    }

    /// A healthy source triangle with one unusable destination otherwise solves
    /// to garbage.
    @Test func itRefusesANonFiniteDestination() {
        var poisoned = Array(Self.bent.prefix(3))
        poisoned[1].map = GeoPoint(lat: .nan, lng: poisoned[1].map.lng)
        #expect(throws: ThinPlateSpline.Refusal.nonFinite) {
            try ThinPlateSpline.solve(controlPoints: poisoned)
        }
    }

    /// Three well-spread scan points mapped down one meridian. The source cloud
    /// is fine, so a source-side gate passes it; without the delegated
    /// destination check this solves to a zero-area drape whose every residual
    /// reads zero.
    @Test func itRefusesACollapsedDestinationEvenWhenTheScanPointsAreHealthy() {
        let meridian = [
            GroundControlPoint(pixel: PixelPoint(x: 100, y: 100), map: GeoPoint(lat: 46.0, lng: -61.0)),
            GroundControlPoint(pixel: PixelPoint(x: 900, y: 150), map: GeoPoint(lat: 46.2, lng: -61.0)),
            GroundControlPoint(pixel: PixelPoint(x: 400, y: 800), map: GeoPoint(lat: 46.4, lng: -61.0))
        ]
        #expect(throws: ThinPlateSpline.Refusal.self) {
            try ThinPlateSpline.solve(controlPoints: meridian)
        }
    }

    /// Regression guard for a real defect on the web. The two destination gates
    /// once measured different quantities under unrelated thresholds, so the
    /// whole band between them diverged — in both directions. Both fixtures
    /// here sit inside that band; a layout the two already agreed on would
    /// prove nothing.
    @Test func itAgreesWithTheAffineSolveAcrossTheBandTheGatesOnceSplit() throws {
        func throughLinear(
            _ pixels: [[Double]], _ scaleX: Double, _ scaleY: Double
        ) -> [GroundControlPoint] {
            pixels.map {
                GroundControlPoint(
                    pixel: PixelPoint(x: $0[0], y: $0[1]),
                    map: WebMercator.unproject(
                        MercatorPoint(
                            x: -6_790_000 + scaleX * $0[0], y: 5_780_000 + scaleY * $0[1]
                        )
                    )
                )
            }
        }

        // A 100:1 squash — a near-zero-area drape, which is exactly what a
        // destination check exists to stop. Its destination cloud clears the
        // cloud threshold while the transform's singular-value ratio does not,
        // so before the fix the affine refused it and the spline accepted it.
        let squashed = throughLinear(
            [[0, 0], [2000, 0], [0, 2000], [2000, 2000]], 10, -0.1
        )
        #expect(AffineFit.solve(controlPoints: squashed) == nil)
        #expect(throws: ThinPlateSpline.Refusal.illConditioned) {
            try ThinPlateSpline.solve(controlPoints: squashed)
        }

        // The reverse: a thin strip that drapes perfectly well, squashed only
        // 1:0.8. Its destination cloud falls below the cloud threshold, so the
        // old check refused a georeference the affine solver accepts.
        let strip = throughLinear([[0, 0], [20000, 0], [10000, 95]], 1, -0.8)
        #expect(
            ControlPointConditioning.ratio(
                of: strip.map { WebMercator.project($0.map) }
                    .map { PixelPoint(x: $0.x, y: $0.y) }
            ) < ControlPointConditioning.minimumConditionRatio
        )
        #expect(AffineFit.solve(controlPoints: strip) != nil)
        _ = try ThinPlateSpline.solve(controlPoints: strip)
    }

    /// The asymmetry is real and must not be papered over. An interpolating
    /// spline cannot take two controls at one pixel; a least-squares affine
    /// averages the duplicate away and solves. "Everything affine refuses, this
    /// refuses" is the guarantee — the converse is false, and this pins the
    /// case that makes it false.
    @Test func itRefusesAStrictSupersetOfWhatTheAffineSolveRefuses() {
        let duplicated = Array(Self.bent.prefix(4)) + [Self.bent[0]]
        #expect(AffineFit.solve(controlPoints: duplicated) != nil)
        #expect(throws: ThinPlateSpline.Refusal.coincidentPoints) {
            try ThinPlateSpline.solve(controlPoints: duplicated)
        }
    }

    /// At exactly three points the side conditions force every bending weight
    /// to zero, so the surface *is* the affine through them. The app leans on
    /// that in two places: it hides the warp toggle, because a control whose
    /// two positions produce the same map is not a choice, and it draws the
    /// cheap two-triangle lattice instead of a 32×32 one.
    @Test func atThreePointsItIsTheAffineThroughThem() throws {
        let three = Array(Self.bent.prefix(3))
        let spline = try ThinPlateSpline.solve(controlPoints: three)
        let affine = try #require(AffineFit.solve(controlPoints: three))

        #expect(!spline.bends)
        for (x, y) in [(0.0, 0.0), (4000.0, 3000.0), (1234.0, 2345.0)] {
            let bent = spline.apply(x: x, y: y)
            let flat = affine.apply(x: x, y: y)
            // The web measures the worst separation at 1.3e-9 m, about 1.4 ULP
            // of a Mercator coordinate.
            #expect(hypot(bent.x - flat.x, bent.y - flat.y) < 1e-6)
        }
    }

    /// And at four it is free to bend, or the warp toggle would be offering
    /// nothing.
    @Test func atFourPointsItBendsAwayFromTheAffine() throws {
        let four = Array(Self.bent.prefix(4))
        let spline = try ThinPlateSpline.solve(controlPoints: four)
        let affine = try #require(AffineFit.solve(controlPoints: four))

        #expect(spline.bends)
        // The affine cannot pass through four points that are not exactly
        // affine-related; the spline must.
        let worstAffineError = four.map { control -> Double in
            let predicted = affine.apply(x: control.pixel.x, y: control.pixel.y)
            let actual = WebMercator.project(control.map)
            return hypot(predicted.x - actual.x, predicted.y - actual.y)
        }.max() ?? 0
        #expect(worstAffineError > 1)
        for control in four {
            let predicted = spline.apply(x: control.pixel.x, y: control.pixel.y)
            let actual = WebMercator.project(control.map)
            #expect(hypot(predicted.x - actual.x, predicted.y - actual.y) < 1e-6)
        }
    }
}

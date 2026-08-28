import Foundation
import Testing

@testable import GeoCore

/// Ported case for case from `web/src/userMaps/transform/affine.test.ts`.
///
/// Almost every rejection here is a layout that solves cleanly and puts the
/// scan somewhere it does not belong, so a test that only checked the happy
/// path would pass against a solver with no gates at all.
@Suite("Affine georeference fit")
struct AffineFitTests {
    /// Rotation, scale and translation, in Mercator metres.
    private static let truth = AffineTransform(
        a: 3.5, b: -1.25, c: -6_790_000, d: 0.75, e: 4.5, f: 5_780_000
    )

    private static let pixels = [
        PixelPoint(x: 0, y: 0),
        PixelPoint(x: 4096, y: 0),
        PixelPoint(x: 0, y: 3072),
        PixelPoint(x: 4096, y: 3072),
        PixelPoint(x: 1000, y: 2000)
    ]

    private static func exactPairs(
        _ points: [PixelPoint] = pixels
    ) -> [(source: PixelPoint, destination: MercatorPoint)] {
        points.map { (source: $0, destination: truth.apply(x: $0.x, y: $0.y)) }
    }

    private static func controlPoints(_ points: [PixelPoint] = pixels) -> [GroundControlPoint] {
        points.map {
            GroundControlPoint(
                pixel: $0, map: WebMercator.unproject(truth.apply(x: $0.x, y: $0.y))
            )
        }
    }

    @Test func itRecoversAnInventedTransform() throws {
        let solved = try #require(AffineFit.solve(pairs: Self.exactPairs()))
        #expect(abs(solved.a - Self.truth.a) < 1e-6)
        #expect(abs(solved.b - Self.truth.b) < 1e-6)
        #expect(abs(solved.c - Self.truth.c) < 1e-6)
        #expect(abs(solved.d - Self.truth.d) < 1e-6)
        #expect(abs(solved.e - Self.truth.e) < 1e-6)
        #expect(abs(solved.f - Self.truth.f) < 1e-6)
    }

    @Test func itFitsThreeNonCollinearPointsExactly() throws {
        let pairs = Self.exactPairs(Array(Self.pixels.prefix(3)))
        let solved = try #require(AffineFit.solve(pairs: pairs))
        for pair in pairs {
            let predicted = solved.apply(x: pair.source.x, y: pair.source.y)
            #expect(abs(predicted.x - pair.destination.x) < 1e-6)
            #expect(abs(predicted.y - pair.destination.y) < 1e-6)
        }
    }

    @Test func itRefusesFewerThanThreePoints() {
        #expect(AffineFit.solve(pairs: Self.exactPairs(Array(Self.pixels.prefix(2)))) == nil)
        #expect(AffineFit.solve(pairs: []) == nil)
    }

    /// Three points on a straight line leave the fit underdetermined: the
    /// normal matrix is singular, and dividing by its determinant would fill
    /// the mesh with NaN and blank the drape without saying so.
    @Test func itRefusesCollinearPointsRatherThanReturningNaN() {
        let collinear = [
            PixelPoint(x: 0, y: 0),
            PixelPoint(x: 2048, y: 1536),
            PixelPoint(x: 4096, y: 3072)
        ]
        #expect(AffineFit.solve(pairs: Self.exactPairs(collinear)) == nil)
    }

    /// Regression guard for a real defect on the web. The original gate reduced
    /// to the correlation of the centred pixels, which goes blind whenever the
    /// points lie near a coordinate axis: the forty-five degree case was
    /// rejected while the identical degeneracy laid flat was accepted — and
    /// points clicked along a scan's neatline are the layout users produce.
    @Test(arguments: [
        [PixelPoint(x: 0, y: 0), PixelPoint(x: 2048, y: 1536), PixelPoint(x: 4096, y: 3072.0001)],
        [PixelPoint(x: 0, y: 0), PixelPoint(x: 2048, y: 0.0001), PixelPoint(x: 4096, y: 0)],
        [PixelPoint(x: 0, y: 0), PixelPoint(x: 0.0001, y: 1536), PixelPoint(x: 0, y: 3072)]
    ])
    func itRefusesANearCollinearLayoutInEveryOrientation(_ layout: [PixelPoint]) {
        #expect(AffineFit.solve(pairs: Self.exactPairs(layout)) == nil)
    }

    @Test func itRefusesPointsThatAllShareOnePosition() {
        let degenerate = [
            PixelPoint(x: 50, y: 50), PixelPoint(x: 50, y: 50), PixelPoint(x: 50, y: 50)
        ]
        #expect(AffineFit.solve(pairs: Self.exactPairs(degenerate)) == nil)
    }

    /// Documents the boundary rather than claiming it. A 200 px triangle has a
    /// perfectly healthy condition ratio; what is wrong with it has nothing to
    /// do with rank. The fit is stretched twenty times beyond the points, so a
    /// one-pixel click error moves the far corner of a 4096 px scan about a
    /// kilometre. That belongs on the reported accuracy, not on the solve. If a
    /// clustered-points warning lands and this starts returning nil, delete
    /// this test rather than loosening the gate.
    @Test func itStillSolvesPointsHuddledInOneCorner() {
        let huddle = [
            PixelPoint(x: 100, y: 100), PixelPoint(x: 300, y: 100), PixelPoint(x: 100, y: 300)
        ]
        #expect(AffineFit.solve(pairs: Self.exactPairs(huddle)) != nil)
    }

    /// A map that is genuinely a strip — a river survey, a rail corridor —
    /// where the points span what there is to span.
    @Test func itStillSolvesAnHonestlyElongatedMap() {
        let strip = [
            PixelPoint(x: 0, y: 0), PixelPoint(x: 24000, y: 0), PixelPoint(x: 12000, y: 600)
        ]
        #expect(AffineFit.solve(pairs: Self.exactPairs(strip)) != nil)
    }

    /// Regression guard for a second real defect. The gate used to divide the
    /// cloud's narrow extent by the *image* diagonal, folding a coverage
    /// question into a rank question. These four points are a 1000x100 px
    /// rectangle on a 24000x18000 scan — full rank, ten to one — and they were
    /// refused with a message telling the user their points were too close to a
    /// straight line. They are not in a line; they are in a rectangle.
    @Test func itSolvesASmallControlCorridorOnAHugeScan() {
        let corridor = [
            PixelPoint(x: 1000, y: 1000),
            PixelPoint(x: 2000, y: 1000),
            PixelPoint(x: 1000, y: 1100),
            PixelPoint(x: 2000, y: 1100)
        ]
        #expect(AffineFit.solve(pairs: Self.exactPairs(corridor)) != nil)
    }

    /// Three clicks straight down a meridian are exactly collinear in Mercator
    /// while the source layout is textbook. The solved transform is singular,
    /// the drape collapses to zero area, and every residual reads zero — a
    /// perfect fit, which is the most dangerous thing this can report.
    @Test func itRefusesDestinationsThatAreCollinearEvenWhenTheScanPointsAreNot() {
        let pairs = [
            (source: PixelPoint(x: 0, y: 0), destination: MercatorPoint(x: -6_790_000, y: 5_780_000)),
            (source: PixelPoint(x: 4096, y: 0), destination: MercatorPoint(x: -6_790_000, y: 5_790_000)),
            (source: PixelPoint(x: 0, y: 3072), destination: MercatorPoint(x: -6_790_000, y: 5_800_000))
        ]
        #expect(AffineFit.solve(pairs: pairs) == nil)
    }

    /// Unguarded, this returns three real coefficients and three NaNs: every
    /// source-side check passes, and the NaN only surfaces in the mesh.
    @Test func itRefusesANonFiniteDestinationRatherThanHalfATransform() {
        var pairs = Self.exactPairs(Array(Self.pixels.prefix(3)))
        pairs[1].destination.y = .nan
        #expect(AffineFit.solve(pairs: pairs) == nil)
    }

    /// Regression guard for a defect where every guard failed open at once: the
    /// finiteness check summed first, and `1e200 + -1e200 + -1e200 + 1e200` is
    /// exactly zero; the anisotropy ratio came back NaN; and a NaN comparison
    /// read as "not too anisotropic". The matrix is exactly singular.
    @Test func itRefusesASingularTransformWhoseCoefficientsOverflow() {
        let pairs = [
            (source: PixelPoint(x: 0, y: 0), destination: MercatorPoint(x: 0, y: 0)),
            (source: PixelPoint(x: 1, y: 0), destination: MercatorPoint(x: 1e200, y: -1e200)),
            (source: PixelPoint(x: 0, y: 1), destination: MercatorPoint(x: -1e200, y: 1e200))
        ]
        #expect(AffineFit.solve(pairs: pairs) == nil)
    }

    /// The subtractive form of the ratio loses every significant digit exactly
    /// where the gate is load-bearing. This asserts the two squashes are
    /// actually distinguished rather than both collapsing to zero: 1:100 is
    /// refused, 1:40 is accepted, and only a resolved ratio can tell them
    /// apart.
    @Test func itMeasuresAnisotropyWithoutCancellingItAway() {
        func squash(_ ratio: Double) -> [(source: PixelPoint, destination: MercatorPoint)] {
            [
                (source: PixelPoint(x: 0, y: 0), destination: MercatorPoint(x: 0, y: 0)),
                (source: PixelPoint(x: 1, y: 0), destination: MercatorPoint(x: 1000, y: 0)),
                (source: PixelPoint(x: 0, y: 1), destination: MercatorPoint(x: 0, y: 1000 * ratio))
            ]
        }
        #expect(AffineFit.solve(pairs: squash(1.0 / 100)) == nil)
        #expect(AffineFit.solve(pairs: squash(1.0 / 40)) != nil)
    }

    /// A least-squares fit, not an interpolation: one bad click pulls the
    /// transform rather than defeating it.
    @Test func itFitsNoisyPointsRatherThanFailing() throws {
        var pairs = Self.exactPairs()
        pairs[3].destination.x += 500
        pairs[3].destination.y -= 300

        let solved = try #require(AffineFit.solve(pairs: pairs))
        #expect(abs(solved.a - Self.truth.a) < 0.5)
        #expect(solved.a != Self.truth.a)
    }

    /// A mirrored scan is a scan photographed from the back of the sheet, or a
    /// pixel axis pointing the other way. It is a legitimate orientation, not a
    /// degeneracy.
    @Test func itAcceptsAMirroredTransform() throws {
        let mirrored = AffineTransform(
            a: -3.5, b: 0, c: -6_790_000, d: 0, e: 4.5, f: 5_780_000
        )
        let pairs = Self.pixels.map {
            (source: $0, destination: mirrored.apply(x: $0.x, y: $0.y))
        }

        let solved = try #require(AffineFit.solve(pairs: pairs))
        #expect(abs(solved.a + 3.5) < 1e-6)
    }

    /// Control points are stored in degrees and solved in metres. A solve in
    /// degrees would skew east-west against north-south by about cos(latitude)
    /// — 1.44× here — and nothing downstream would look wrong.
    @Test func itProjectsStoredDegreesBeforeSolving() throws {
        let solved = try #require(AffineFit.solve(controlPoints: Self.controlPoints()))
        let predicted = solved.apply(x: 2048, y: 1536)
        let expected = Self.truth.apply(x: 2048, y: 1536)

        #expect(abs(predicted.x - expected.x) < 1e-3)
        #expect(abs(predicted.y - expected.y) < 1e-3)
        // In metres, not degrees: a degree-space answer here is under 200.
        #expect(abs(predicted.x) > 1000)
    }

    @Test func itRefusesStoredControlPointsBelowTheMinimum() {
        #expect(AffineFit.solve(controlPoints: Array(Self.controlPoints().prefix(2))) == nil)
    }
}

/// The reverse question — where on the scan is this place? — which a
/// georeferencer asks constantly and can otherwise only answer by eye.
@Suite("Inverse affine fit")
struct InverseAffineFitTests {
    private static let controls = [
        GroundControlPoint(pixel: PixelPoint(x: 100, y: 100), map: GeoPoint(lat: 45.9, lng: -61.6)),
        GroundControlPoint(pixel: PixelPoint(x: 900, y: 120), map: GeoPoint(lat: 45.9, lng: -61.4)),
        GroundControlPoint(pixel: PixelPoint(x: 120, y: 700), map: GeoPoint(lat: 45.75, lng: -61.6)),
        GroundControlPoint(pixel: PixelPoint(x: 880, y: 690), map: GeoPoint(lat: 45.75, lng: -61.4))
    ]

    @Test func itMapsAControlsOwnPositionBackToItsPixel() throws {
        let inverse = try #require(AffineFit.solveInverse(controlPoints: Self.controls))
        for control in Self.controls {
            let mercator = WebMercator.project(control.map)
            let pixel = inverse.apply(x: mercator.x, y: mercator.y)
            // Loose on purpose: four points on a slightly irregular quad have
            // no exact affine fit, and this drives a pane recentre rather than
            // a measurement.
            #expect(abs(pixel.x - control.pixel.x) < 50)
            #expect(abs(pixel.y - control.pixel.y) < 50)
        }
    }

    @Test func itRoundTripsThroughTheForwardSolve() throws {
        let forward = try #require(AffineFit.solve(controlPoints: Self.controls))
        let inverse = try #require(AffineFit.solveInverse(controlPoints: Self.controls))

        let out = forward.apply(x: 500, y: 400)
        let back = inverse.apply(x: out.x, y: out.y)

        #expect(abs(back.x - 500) < 50)
        #expect(abs(back.y - 400) < 50)
    }

    @Test func itRefusesBelowTheSameMinimumAsTheForwardSolve() {
        #expect(AffineFit.solveInverse(controlPoints: Array(Self.controls.prefix(2))) == nil)
    }
}

@Suite("Control point conditioning")
struct ControlPointConditioningTests {
    @Test func itScoresAHealthyScatteredCloudAboveTheThreshold() {
        let healthy = [
            PixelPoint(x: 100, y: 100), PixelPoint(x: 900, y: 200), PixelPoint(x: 300, y: 800)
        ]
        #expect(
            ControlPointConditioning.ratio(of: healthy)
                > ControlPointConditioning.minimumConditionRatio
        )
    }

    /// Points clicked along a road, with a couple of pixels of scatter: the
    /// layout users actually produce when they follow a linear feature.
    @Test func itScoresARoadWithTwoPixelsOfScatterBelowTheThreshold() {
        let road = [
            PixelPoint(x: 0, y: 0),
            PixelPoint(x: 1000, y: 2),
            PixelPoint(x: 2000, y: 0),
            PixelPoint(x: 3000, y: 2),
            PixelPoint(x: 4000, y: 0)
        ]
        #expect(
            ControlPointConditioning.ratio(of: road)
                < ControlPointConditioning.minimumConditionRatio
        )
    }

    /// Exactly zero at every orientation. A pivot check inside a solver
    /// catches the diagonal case by luck — its x and y deviations are
    /// bit-identical, so the pivot cancels to exactly zero — and waves the
    /// oblique one through at about 1e-16.
    @Test(arguments: [
        [PixelPoint(x: 100, y: 100), PixelPoint(x: 400, y: 400), PixelPoint(x: 900, y: 900)],
        [PixelPoint(x: 100, y: 100), PixelPoint(x: 400, y: 250), PixelPoint(x: 900, y: 500)],
        [PixelPoint(x: 100, y: 0), PixelPoint(x: 400, y: 0), PixelPoint(x: 900, y: 0)]
    ])
    func itScoresAnExactlyCollinearCloudAtZero(_ cloud: [PixelPoint]) {
        #expect(ControlPointConditioning.ratio(of: cloud) == 0)
    }

    @Test func itScoresAnEmptySetAtZeroRatherThanCrashing() {
        #expect(ControlPointConditioning.ratio(of: []) == 0)
    }
}

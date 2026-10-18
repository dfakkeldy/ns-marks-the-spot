import Foundation
import Testing

@testable import GeoCore

/// Ported from `web/src/userMaps/transform/residuals.test.ts`.
@Suite("Georeference accuracy")
struct GeoreferenceResidualsTests {
    static let truth = GeoCore.AffineTransform(
        a: 3.5, b: -1.25, c: -6_790_000, d: 0.75, e: 4.5, f: 5_780_000
    )

    static let pixels = [
        PixelPoint(x: 0, y: 0),
        PixelPoint(x: 4096, y: 0),
        PixelPoint(x: 0, y: 3072),
        PixelPoint(x: 4096, y: 3072),
        PixelPoint(x: 1000, y: 2000)
    ]

    /// Points that lie exactly on `truth`, so every fit residual is zero until
    /// something is deliberately moved.
    static func exact(_ pixels: [PixelPoint] = pixels) -> [GroundControlPoint] {
        pixels.map {
            GroundControlPoint(
                pixel: $0, map: WebMercator.unproject(truth.apply(x: $0.x, y: $0.y))
            )
        }
    }

    static func fit(_ controls: [GroundControlPoint]) throws -> GeoCore.AffineTransform {
        try #require(AffineFit.solve(controlPoints: controls))
    }

    @Test func residualsAreZeroWhenEveryPointSitsOnTheTransform() {
        for metres in GeoreferenceResiduals.metres(of: Self.truth, at: Self.exact()) {
            #expect(abs(metres) < 1e-6)
        }
    }

    /// The single most important assertion in this module. A point displaced
    /// 100 m east at ~46°N is 143.96 Mercator metres away; reporting that
    /// figure would overstate the error by 44%.
    @Test func residualsAreGroundMetresNotTheInflatedMercatorMagnitude() {
        let base = Self.exact([PixelPoint(x: 1000, y: 2000)])
        let displaced = GeoreferenceFixtures.nudgingEast(base, at: 0, metres: 100)
        let metres = GeoreferenceResiduals.metres(of: Self.truth, at: displaced)[0]
        #expect(abs(metres - 100) < 1e-3)
        #expect(abs(metres - 143.96) > 1)
    }

    @Test func theRmsIsRootMeanSquareNotMean() {
        // The mean would be 5; the RMS of 3,4,5,6,7 is sqrt(27).
        #expect(abs(GeoreferenceResiduals.rms([3, 4, 5, 6, 7]) - 27.0.squareRoot()) < 1e-9)
        #expect(GeoreferenceResiduals.rms([]) == 0)
    }

    @Test func thereIsNoReportBelowFourPointsBecauseThreeFitExactly() throws {
        let controls = Self.exact(Array(Self.pixels.prefix(3)))
        #expect(GeoreferenceResiduals.report(
            controlPoints: controls, transform: try Self.fit(controls)
        ) == nil)
    }

    @Test func atFourPointsAnRmsIsReportedButNobodyIsAccused() throws {
        var controls = Self.exact(Array(Self.pixels.prefix(4)))
        controls = GeoreferenceFixtures.nudgingEast(controls, at: 3, metres: 600)
        let report = try #require(GeoreferenceResiduals.report(
            controlPoints: controls, transform: try Self.fit(controls)
        ))
        #expect(report.rmsMetres > 1)
        #expect(report.mostInconsistentIndex == nil)
    }

    /// The reason behind the test above, and the whole argument for the
    /// five-point floor. Four points fitting three parameters leave a
    /// one-dimensional residual space, so every residual vector is a multiple
    /// of one direction fixed by the pixel layout. Displacing a different point
    /// rescales that vector; it cannot rotate it. One distinct normalised
    /// pattern across all four displacements means the pattern never depended
    /// on the displacement at all — so the largest residual carries no
    /// information about which click was wrong.
    @Test(arguments: [
        pixels.prefix(4).map { $0 },
        [
            PixelPoint(x: 0, y: 0), PixelPoint(x: 4000, y: 0),
            PixelPoint(x: 0, y: 3000), PixelPoint(x: 1000, y: 1000)
        ],
        [
            PixelPoint(x: 120, y: 90), PixelPoint(x: 3900, y: 300),
            PixelPoint(x: 700, y: 2900), PixelPoint(x: 2100, y: 1500)
        ]
    ])
    func atFourPointsTheSamePointIsAccusedWhoeverIsActuallyWrong(
        _ layout: [PixelPoint]
    ) throws {
        var shapes = Set<String>()
        for displaced in layout.indices {
            let controls = GeoreferenceFixtures.nudgingEast(
                Self.exact(layout), at: displaced, metres: 600
            )
            let report = try #require(GeoreferenceResiduals.report(
                controlPoints: controls, transform: try Self.fit(controls)
            ))
            let total = report.metresPerControlPoint.reduce(0, +)
            shapes.insert(
                report.metresPerControlPoint
                    .map { String(format: "%.4f", $0 / total) }
                    .joined(separator: ",")
            )
        }
        #expect(shapes.count == 1)
    }

    @Test func fromFivePointsTheWorstFittingPointIsNamed() throws {
        #expect(GeoreferenceResiduals.minimumControlPointsForSuspect == 5)
        let controls = GeoreferenceFixtures.nudgingEast(Self.exact(), at: 4, metres: 600)
        let report = try #require(GeoreferenceResiduals.report(
            controlPoints: controls, transform: try Self.fit(controls)
        ))
        // The point that was actually displaced, not merely the argmax of the
        // returned array — comparing the report against itself would pass even
        // if the wrong point were named.
        #expect(report.mostInconsistentIndex == 4)
        #expect(report.metresPerControlPoint[4] > 100)
    }

    @Test func theRmsMovesWithDisagreementAndStaysAtZeroWithout() throws {
        let agreeing = Self.exact()
        let agreed = try #require(GeoreferenceResiduals.report(
            controlPoints: agreeing, transform: try Self.fit(agreeing)
        ))
        #expect(agreed.rmsMetres < 1e-6)

        let disagreeing = GeoreferenceFixtures.nudgingEast(agreeing, at: 3, metres: 600)
        let disagreed = try #require(GeoreferenceResiduals.report(
            controlPoints: disagreeing, transform: try Self.fit(disagreeing)
        ))
        #expect(disagreed.rmsMetres > 1)
    }
}

@Suite("Spline accuracy")
struct SplineResidualsTests {
    @Test func everyPointGetsANonZeroErrorUnlikeTheSplinesOwnFitResidual() throws {
        let report = try GeoreferenceResiduals.splineReport(
            controlPoints: GeoreferenceFixtures.bent
        )
        // Length pinned: an empty array satisfies a bare loop, and a list
        // indexing this per row would render nothing past its end.
        #expect(report.metresPerControlPoint.count == GeoreferenceFixtures.bent.count)
        for metres in report.metresPerControlPoint {
            // A metre, not zero. `> 0` is the obvious assertion and is very
            // nearly vacuous: mutation-tested on the web, swapping the
            // leave-one-out refit for a full-set solve — the exact regression
            // this test exists to catch — left every value at 5.5e-10 to
            // 2.1e-9 m rather than at 0, because an interpolating spline hits
            // its control points to floating-point noise and not to a hard
            // zero. That mutation survived `> 0`. These real leave-one-out
            // errors are 108-592 m, so a one-metre floor has a hundredfold
            // margin over the signal and nine orders over the noise.
            #expect(metres > 1)
        }
    }

    /// The expected value comes from a displacement we choose, on the
    /// exactly-affine set rather than on the bent one, and is read at the point
    /// that was moved rather than at the maximum. All three are forced by
    /// measurement:
    ///
    /// - The bent set's own leave-one-out errors are 108-592 m before anything
    ///   is nudged, because a spline fitted to seven points genuinely cannot
    ///   predict the eighth on a bent survey. A 100 m nudge does not become the
    ///   maximum.
    /// - On a set lying exactly on an affine map, the spline through the other
    ///   points *is* that affine (its bending weights solve to zero), so the
    ///   held-out prediction lands on the truth and the displaced point's error
    ///   is the nudge itself. That is what makes 100 externally known.
    /// - Even here the maximum would be the wrong handle: displacing one point
    ///   bends every refit that still contains it, so its neighbours pick up
    ///   4.6-126.1 m of their own.
    @Test func theSplineFigureIsGroundMetresNotTheInflatedMercatorOne() throws {
        let displaced = GeoreferenceFixtures.nudgingEast(
            GeoreferenceResidualsTests.exact(), at: 4, metres: 100
        )
        let metres = try GeoreferenceResiduals
            .splineReport(controlPoints: displaced).metresPerControlPoint[4]
        #expect(abs(metres - 100) < 1e-3)
        #expect(abs(metres - 143.96) > 1)
    }

    /// The defect this function exists to remove hides in the scalar, not in
    /// the array. Mutation-tested on the web: hard-coding the RMS to zero left
    /// every other test green, and the panel would then say "RMS 0 m across 8
    /// points" for a visibly bent map — verbatim the symptom. Pinning the
    /// column thoroughly does not pin anything derived from it.
    @Test func theRmsScalarIsPinnedSeparatelyFromTheColumn() throws {
        let report = try GeoreferenceResiduals.splineReport(
            controlPoints: GeoreferenceFixtures.bent
        )

        // The measured magnitude, which kills a zeroed scalar, one left in
        // Mercator metres (317.71 × 1.4396 = 457.4), and one computed from a
        // different fit than the column it heads.
        #expect(abs(report.rmsMetres - 317.712) < 0.01)

        // The same scalar re-derived inline rather than through the helper the
        // implementation calls, which would be a tautology passing however
        // wrong both are.
        let rederived = (report.metresPerControlPoint.reduce(0) { $0 + $1 * $1 }
            / Double(report.metresPerControlPoint.count)).squareRoot()
        #expect(abs(report.rmsMetres - rederived) < 1e-9)

        // Root-mean-square, not mean — as a relation rather than a second magic
        // number, so it holds for any fixture. RMS strictly exceeds the mean
        // for any non-constant non-negative set.
        let mean = report.metresPerControlPoint.reduce(0, +)
            / Double(report.metresPerControlPoint.count)
        #expect(report.rmsMetres > mean)
    }

    /// A single assertion at three points cannot distinguish the guard from its
    /// absence: without it the loop still runs, the inner solve on two points
    /// refuses, and the function refuses anyway — but for the wrong reason,
    /// which is why the reason is asserted and not merely the refusal.
    @Test func thePointCountFloorIsBracketedFromBothSides() throws {
        #expect(throws: GeoreferenceResiduals.SplineRefusal.tooFewPoints) {
            try GeoreferenceResiduals.splineReport(
                controlPoints: Array(GeoreferenceFixtures.bent.prefix(3))
            )
        }
        let atFloor = try GeoreferenceResiduals.splineReport(
            controlPoints: Array(GeoreferenceFixtures.bent.prefix(4))
        )
        #expect(atFloor.metresPerControlPoint.count == 4)
    }

    @Test func theSuspectIsRankedByTheAffineResidualNotTheLeaveOneOutMagnitude() throws {
        let fixture = GeoreferenceFixtures.outlier
        let report = try GeoreferenceResiduals.splineReport(controlPoints: fixture)
        let affine = try #require(AffineFit.solve(controlPoints: fixture))
        let affineRanked = GeoreferenceFixtures.argmax(
            GeoreferenceResiduals.metres(of: affine, at: fixture)
        )

        #expect(report.mostInconsistentIndex == affineRanked)
        #expect(
            report.mostInconsistentIndex
                != GeoreferenceFixtures.argmax(report.metresPerControlPoint)
        )
    }

    @Test func nobodyIsAccusedBelowFivePointsOnTheIndependentlyMeasuredFloor() throws {
        #expect(GeoreferenceResiduals.minimumControlPointsForSplineSuspect == 5)
        #expect(
            try GeoreferenceResiduals.splineReport(
                controlPoints: Array(GeoreferenceFixtures.bent.prefix(4))
            ).mostInconsistentIndex == nil
        )
        #expect(
            try GeoreferenceResiduals.splineReport(
                controlPoints: Array(GeoreferenceFixtures.bent.prefix(5))
            ).mostInconsistentIndex != nil
        )
    }

    /// Above the cap the whole report goes, because there is nothing cheaper to
    /// fall back to: a spline interpolates exactly, so "RMS only" would be 0 m,
    /// and a short column would render nothing past its end.
    @Test func theCostCapIsBracketedFromBothSidesAndNeverTruncates() throws {
        let cap = GeoreferenceResiduals.maximumControlPointsForSplineResiduals
        #expect(cap == 50)
        let atCap = try GeoreferenceResiduals.splineReport(
            controlPoints: GeoreferenceFixtures.irregular(count: cap)
        )
        #expect(atCap.metresPerControlPoint.count == cap)
        #expect(throws: GeoreferenceResiduals.SplineRefusal.tooManyPoints) {
            try GeoreferenceResiduals.splineReport(
                controlPoints: GeoreferenceFixtures.irregular(count: cap + 1)
            )
        }
    }

    /// The third reason, and the only one a caller cannot re-derive from a
    /// count: the full set solves, so there *is* a spline on screen, but
    /// holding one point back leaves the rest collinear.
    ///
    /// Swept over counts because the first write-up of this path called it a
    /// four-point curiosity. It is not — the layout is (n-1) points on a line
    /// plus one off it, which a user produces at any size by tracing a road and
    /// adding a single anchor elsewhere.
    @Test(arguments: [4, 5, 6, 8, 12, 20])
    func aRefusedRefitIsDistinguishedFromARefusedCount(_ count: Int) throws {
        let controls = GeoreferenceFixtures.collinearExceptOne(count: count)
        // The premise, asserted: this is not the degenerate case. Both solvers
        // accept the full set, so a test seeing `refitRefused` is seeing the
        // refits refuse, not the fixture failing to solve at all.
        _ = try ThinPlateSpline.solve(controlPoints: controls)
        #expect(AffineFit.solve(controlPoints: controls) != nil)
        #expect(throws: GeoreferenceResiduals.SplineRefusal.refitRefused) {
            try GeoreferenceResiduals.splineReport(controlPoints: controls)
        }
    }

    /// Guards the taxonomy itself rather than any single arm: collapsing two
    /// reasons into one is precisely the defect the reason type replaced, and
    /// every per-reason test above would still pass if two of them returned the
    /// same value.
    @Test func allThreeRefusalsAreReachableAndDistinct() {
        var reasons = Set<GeoreferenceResiduals.SplineRefusal>()
        let sets = [
            Array(GeoreferenceFixtures.bent.prefix(3)),
            GeoreferenceFixtures.irregular(
                count: GeoreferenceResiduals.maximumControlPointsForSplineResiduals + 1
            ),
            GeoreferenceFixtures.collinearExceptOne(count: 8)
        ]
        for controls in sets {
            do {
                _ = try GeoreferenceResiduals.splineReport(controlPoints: controls)
            } catch {
                reasons.insert(error)
            }
        }
        #expect(reasons.count == 3)
    }
}

@Suite("Held-out checks")
struct HeldOutReportTests {
    static let check = [
        GeoreferenceFixtures.control(100, 100, 45.8, -61.5)
    ]

    @Test func itMeasuresErrorAtPointsTheFitNeverSaw() throws {
        let exact = try #require(GeoreferenceResiduals.heldOutReport(checks: Self.check) { _, _ in
            WebMercator.project(Self.check[0].map)
        })
        #expect(exact.count == 1)
        #expect(exact.rmsMetres < 1e-3)

        let off = try #require(GeoreferenceResiduals.heldOutReport(checks: Self.check) { _, _ in
            let projected = WebMercator.project(Self.check[0].map)
            return MercatorPoint(x: projected.x + 1000, y: projected.y)
        })
        // 1000 Mercator metres is ~1000·cos(lat) on the ground at this latitude.
        #expect(abs(off.rmsMetres - 1000 * cos(45.8 * .pi / 180)) < 0.5)
    }

    /// A refused solve projects to NaN. Reporting 0 m would read as a perfect
    /// score for a map that cannot be drawn at all.
    @Test func aDegenerateTransformGetsNoReportRatherThanAFlatteringZero() {
        #expect(GeoreferenceResiduals.heldOutReport(checks: Self.check) { _, _ in
            MercatorPoint(x: .nan, y: .nan)
        } == nil)
        #expect(GeoreferenceResiduals.heldOutReport(checks: []) { _, _ in
            MercatorPoint(x: 0, y: 0)
        } == nil)
    }

    /// The regression this figure exists to catch: dropping the controls with
    /// the largest leave-one-out values makes the survivors agree with each
    /// other while drifting off the ground together. Modelled here as a fit
    /// that is self-consistent but displaced.
    @Test func itCanWorsenWhileTheLeaveOneOutFigureImproves() throws {
        let drifted = try #require(
            GeoreferenceResiduals.heldOutReport(checks: Self.check) { _, _ in
                let projected = WebMercator.project(Self.check[0].map)
                return MercatorPoint(x: projected.x + 500, y: projected.y + 500)
            }
        )
        #expect(drifted.rmsMetres > 400)
        #expect(drifted.maxMetres >= drifted.rmsMetres)
    }
}

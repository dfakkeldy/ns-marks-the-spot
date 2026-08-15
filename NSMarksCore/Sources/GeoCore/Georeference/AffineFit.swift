import Foundation

/// A control point: a place on a scan, and the place on the earth it is.
///
/// Stored in WGS84 rather than in projected metres so a saved map stays
/// portable and maps one-to-one onto an Allmaps annotation. Projection happens
/// at the solver's boundary, so no caller has to remember to do it — solving in
/// degrees would skew east-west against north-south by about cos(latitude),
/// which at Nova Scotian latitudes is a 1.44× error nobody would see as one.
public struct GroundControlPoint: Hashable, Sendable {
    /// In the original raster's pixels, never a preview's.
    public var pixel: PixelPoint
    public var map: GeoPoint

    public init(pixel: PixelPoint, map: GeoPoint) {
        self.pixel = pixel
        self.map = map
    }
}

/// `X = a·x + b·y + c ; Y = d·x + e·y + f`. Pixels in, Mercator metres out.
public struct AffineTransform: Hashable, Sendable {
    public var a: Double
    public var b: Double
    public var c: Double
    public var d: Double
    public var e: Double
    public var f: Double

    public init(a: Double, b: Double, c: Double, d: Double, e: Double, f: Double) {
        self.a = a
        self.b = b
        self.c = c
        self.d = d
        self.e = e
        self.f = f
    }

    public func apply(x: Double, y: Double) -> MercatorPoint {
        MercatorPoint(x: a * x + b * y + c, y: d * x + e * y + f)
    }
}

/// The least-squares affine fit a user map is draped with.
///
/// Ported from `web/src/userMaps/transform/affine.ts`, gates and all. A refused
/// solve returns `nil` rather than a transform that happens to be finite: every
/// rejection here is a layout that solves cleanly and puts the scan in the
/// wrong place, which is the failure a georeferencer cannot see.
public enum AffineFit {
    public static let minimumControlPoints = 3

    /// The smallest ratio between the solved transform's two scale axes.
    ///
    /// Three map clicks down a meridian are exactly collinear in Mercator while
    /// the *source* points look textbook, so no amount of source-side checking
    /// catches them: the linear part comes out singular, the drape collapses to
    /// zero area, and every residual reads zero — a perfect fit. No plausible
    /// historical-map georeference squashes one axis fifty to one.
    public static let minimumAnisotropyRatio = 1.0 / 50

    /// Least-squares affine, solved on centred coordinates.
    ///
    /// Centring both sides on their centroids is not cosmetic. The inputs are
    /// image pixels (up to ~2e4) against Mercator metres (~7e6), and the
    /// uncentred normal matrix mixes terms spanning twelve orders of magnitude
    /// and loses most of its precision to cancellation. Centring decouples the
    /// translation from the linear part, leaving a well-conditioned 2x2 solve
    /// and a translation recovered exactly from the centroids.
    public static func solve(
        pairs: [(source: PixelPoint, destination: MercatorPoint)]
    ) -> AffineTransform? {
        let count = Double(pairs.count)
        guard pairs.count >= minimumControlPoints else { return nil }

        // The same gate the spline solver uses, so the two cannot disagree
        // about whether one set of clicks is usable. A NaN coordinate makes
        // this comparison false and so falls into the rejection.
        guard ControlPointConditioning.ratio(of: pairs.map(\.source))
            > ControlPointConditioning.minimumConditionRatio
        else { return nil }

        var centroidX = 0.0
        var centroidY = 0.0
        var centroidDestinationX = 0.0
        var centroidDestinationY = 0.0
        for pair in pairs {
            centroidX += pair.source.x
            centroidY += pair.source.y
            centroidDestinationX += pair.destination.x
            centroidDestinationY += pair.destination.y
        }
        centroidX /= count
        centroidY /= count
        centroidDestinationX /= count
        centroidDestinationY /= count

        var sumXX = 0.0
        var sumXY = 0.0
        var sumYY = 0.0
        var sumXdX = 0.0
        var sumYdX = 0.0
        var sumXdY = 0.0
        var sumYdY = 0.0
        for pair in pairs {
            let x = pair.source.x - centroidX
            let y = pair.source.y - centroidY
            let dx = pair.destination.x - centroidDestinationX
            let dy = pair.destination.y - centroidDestinationY
            sumXX += x * x
            sumXY += x * y
            sumYY += y * y
            sumXdX += x * dx
            sumYdX += y * dx
            sumXdY += x * dy
            sumYdY += y * dy
        }

        let determinant = sumXX * sumYY - sumXY * sumXY
        let a = (sumXdX * sumYY - sumYdX * sumXY) / determinant
        let b = (sumYdX * sumXX - sumXdX * sumXY) / determinant
        let d = (sumXdY * sumYY - sumYdY * sumXY) / determinant
        let e = (sumYdY * sumXX - sumXdY * sumXY) / determinant

        // A non-finite *destination* slips past every source-side check above
        // and yields a half-finite transform rather than an obvious failure.
        // Tested per coefficient rather than on their sum: `1e200 + -1e200 +
        // -1e200 + 1e200` is zero, so a summed guard waves through the exactly
        // singular matrix [[1e200, -1e200], [-1e200, 1e200]].
        guard a.isFinite, b.isFinite, d.isFinite, e.isFinite else { return nil }
        guard anisotropyRatio(a, b, d, e) >= minimumAnisotropyRatio else { return nil }

        return AffineTransform(
            a: a,
            b: b,
            c: centroidDestinationX - a * centroidX - b * centroidY,
            d: d,
            e: e,
            f: centroidDestinationY - d * centroidX - e * centroidY
        )
    }

    /// Pixels to Mercator, from control points as they are stored.
    public static func solve(controlPoints: [GroundControlPoint]) -> AffineTransform? {
        solve(
            pairs: controlPoints.map {
                (source: $0.pixel, destination: WebMercator.project($0.map))
            }
        )
    }

    /// The same solve with the sides swapped: Mercator metres in, scan pixels
    /// out. It answers "where on this scan is that place on the map?" — the
    /// question a georeferencer asks constantly and can otherwise only answer
    /// by eye.
    ///
    /// Deliberately affine even for a record warped by a spline. This drives a
    /// recentre, not a measurement: affine needs three points where a spline
    /// needs more, survives control sets a spline would refuse, and cannot fold
    /// space the way an inverted spline can far from its controls. An answer
    /// roughly right everywhere beats an exact one that is unavailable or wild.
    ///
    /// It re-solves rather than inverting the forward parameters because the
    /// solve centres both sides on their centroids; inverting a 2x2 built from
    /// raw pixels against ~7e6-metre coordinates throws away most of the
    /// precision that centring exists to keep.
    public static func solveInverse(
        controlPoints: [GroundControlPoint]
    ) -> AffineTransform? {
        solve(
            pairs: controlPoints.map { point in
                let mercator = WebMercator.project(point.map)
                return (
                    source: PixelPoint(x: mercator.x, y: mercator.y),
                    destination: MercatorPoint(x: point.pixel.x, y: point.pixel.y)
                )
            }
        )
    }

    /// The ratio of the smaller to the larger singular value of the 2x2 linear
    /// part — how far the transform squashes one axis against the other. Zero
    /// when it is singular, which is the case worth catching.
    ///
    /// The singular values come from `‖M‖_F² = s₁² + s₂²` and `|det M| = s₁s₂`.
    /// Two numerical details separate that identity from a function that works:
    ///
    /// - The coefficients are rescaled first. `F²` overflows for a matrix of
    ///   1e200s, the determinant goes to NaN, and the ratio then comes back NaN
    ///   — which the caller's comparison reads as "not below the threshold".
    ///   Rescaling is exact in a ratio and caps `F²` at four.
    /// - The result is `|det| / sMax²`, not `sqrt(sMin² / sMax²)`. The two are
    ///   equal in exact arithmetic, but `sMin² = (F² - root) / 2` cancels
    ///   catastrophically exactly where the gate earns its keep: as s₂/s₁ falls,
    ///   `root` approaches `F²`. Measured on the web, the subtractive form
    ///   returned a flat zero for `diag(1, 1e-9)` where this returns 1e-9.
    private static func anisotropyRatio(
        _ a: Double, _ b: Double, _ d: Double, _ e: Double
    ) -> Double {
        let scale = max(abs(a), abs(b), abs(d), abs(e))
        guard scale > 0, scale.isFinite else { return 0 }
        let sa = a / scale
        let sb = b / scale
        let sd = d / scale
        let se = e / scale

        let frobeniusSquared = sa * sa + sb * sb + sd * sd + se * se
        let absDeterminant = abs(sa * se - sb * sd)
        let discriminant = max(
            frobeniusSquared * frobeniusSquared - 4 * absDeterminant * absDeterminant, 0
        )
        let largerSquared = (frobeniusSquared + discriminant.squareRoot()) / 2
        guard largerSquared > 0 else { return 0 }
        return absDeterminant / largerSquared
    }
}

import Foundation

/// A point on a scan, in the original raster's pixels.
///
/// Named rather than reusing `MercatorPoint`, because the whole class of bug
/// this module guards against is a pixel and a metre being mistaken for one
/// another — and because a control point taken from a downscaled preview solves
/// perfectly cleanly and lands the map somewhere else entirely, with nothing in
/// the arithmetic able to tell.
public struct PixelPoint: Hashable, Sendable, Codable {
    public var x: Double
    public var y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

/// Whether a set of control points determines a transform at all.
///
/// Ported from `web/src/userMaps/transform/conditioning.ts`. Both solvers gate
/// on this same number: measured on the web, a spline with no conditioning gate
/// accepted a five-point layout the affine solver refused, and a one-pixel
/// nudge on that layout then moved a drape corner 12.2 km. Two solvers
/// disagreeing about whether the same clicks are usable is what this exists to
/// prevent.
public enum ControlPointConditioning {
    /// How thin a control-point layout may get before it is refused, as the
    /// ratio between the cloud's narrowest and widest RMS extent.
    ///
    /// The measured separation that set the value, from the web:
    ///
    ///     near-collinear 45°       8.4e-9   reject
    ///     points along a neatline  1.4e-3   reject
    ///     -------------------------------- 5e-3
    ///     elongated map, worst     2.9e-2   accept
    ///     1000x100 corridor        1.0e-1   accept
    ///     healthy triangle         5.3e-1   accept
    ///
    /// This is a question about rank — whether the points pin a transform down
    /// — and deliberately not about coverage. Three points huddled in 200 px of
    /// a 4096 px scan score 5.3e-1 and pass, because their shape is fine even
    /// though the fit is stretched twenty times beyond them. That is a real
    /// risk and a different one, and it belongs on the accuracy the record
    /// reports rather than on whether it may be solved at all. Conflating the
    /// two is what made the web refuse a legitimate 1000x100 control corridor
    /// on a 24000x18000 scan with "too close to a straight line" — a statement
    /// that was simply false about that layout.
    public static let minimumConditionRatio = 5e-3

    /// The reciprocal condition number of a point cloud, in 0...1. Zero for an
    /// exactly collinear cloud, one for a perfectly isotropic one.
    ///
    /// The obvious test — the determinant against the product of the normal
    /// matrix's diagonal — is not this and does not work: it reduces to
    /// `1 - r²` for the correlation of the centred pixels, which goes blind
    /// whenever the points lie near a coordinate axis. Measured on the web, an
    /// exactly singular horizontal layout reported a perfectly healthy 0.25,
    /// while the identical degeneracy rotated forty-five degrees was correctly
    /// rejected — and points clicked along a scan's top neatline are the layout
    /// users actually produce.
    ///
    /// Nor is a pivot check inside a solver a substitute. The exactly collinear
    /// cloud (100,100) (400,400) (900,900) has bit-identical x and y
    /// deviations, so its elimination pivot cancels to exactly zero and a
    /// pivot-only guard refuses it by luck; rotate the same degenerate line
    /// oblique to (100,100) (400,250) (900,500) and the pivot lands near 1e-16,
    /// which any `pivot != 0` test waves straight through. This returns exactly
    /// zero for both.
    public static func ratio(of points: [PixelPoint]) -> Double {
        let count = Double(points.count)
        guard count > 0 else { return 0 }

        var centroidX = 0.0
        var centroidY = 0.0
        for point in points {
            centroidX += point.x
            centroidY += point.y
        }
        centroidX /= count
        centroidY /= count

        var sumXX = 0.0
        var sumXY = 0.0
        var sumYY = 0.0
        for point in points {
            let x = point.x - centroidX
            let y = point.y - centroidY
            sumXX += x * x
            sumXY += x * y
            sumYY += y * y
        }

        // Eigenvalues of the centred 2x2 scatter matrix — the cloud's widest
        // and narrowest RMS extents. Rotation-invariant by construction, unlike
        // the diagonal terms, which is where the correlation test went wrong.
        let trace = sumXX + sumYY
        let eigenGap = hypot(sumXX - sumYY, 2 * sumXY)
        let largest = (trace + eigenGap) / 2
        let smallest = max((trace - eigenGap) / 2, 0)
        // Every point on the centroid, or a coordinate that was not a number.
        guard largest > 0 else { return 0 }
        return (smallest / largest).squareRoot()
    }
}

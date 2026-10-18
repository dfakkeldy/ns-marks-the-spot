import Foundation

/// A thin-plate spline through every control point, in Web Mercator metres.
///
/// Ported from `web/src/userMaps/transform/tps.ts`. The surface is
/// `f(x,y) = a₀ + a₁x + a₂y + Σ wᵢ·U(|p - pᵢ|)`, with the side conditions
/// `Σwᵢ = Σwᵢxᵢ = Σwᵢyᵢ = 0` that stop the bending term from duplicating the
/// affine tail — the standard `(n+3)×(n+3)` system, with x and y solved against
/// one shared factorisation because only the right-hand side differs.
public struct ThinPlateSpline: Sendable {
    /// Why a spline was not produced.
    ///
    /// Typed and distinct, because a caller shows a user a different sentence
    /// for each: "click a fourth point", "those two are the same point", "those
    /// points are nearly in a line".
    public enum Refusal: Error, Equatable, Sendable {
        case tooFewPoints
        case coincidentPoints
        case illConditioned
        case nonFinite
    }

    /// A spline needs the same three points an affine does — with three it *is*
    /// an affine, because the bending term has nothing to bend around.
    public static let minimumControlPoints = AffineFit.minimumControlPoints

    /// The fewest control points at which the surface actually bends.
    ///
    /// At exactly three the side conditions force every bending weight to zero,
    /// so the surface is the affine through those points rather than merely
    /// close to it — measured on the web's own drapes, the worst separation
    /// between the two lattices at three points is 1.3e-9 m, about 1.4 ULP of a
    /// Mercator coordinate. Offering a warp toggle below this count would be
    /// offering a choice between two identical maps.
    public static let minimumBendingControlPoints = minimumControlPoints + 1

    /// Two control points closer than this, in scan pixels, are the same point.
    ///
    /// `U(r) = r² log r` is zero at r = 0, so a duplicate makes two rows of the
    /// interpolation matrix identical and the system exactly singular. A merely
    /// near-duplicate is worse: the weights explode instead, and it still
    /// succeeds. A millionth of a pixel is far below anything a pointer can
    /// express, so this only fires on a double-tap or a programmatic duplicate.
    public static let minimumSeparation = 1e-6

    /// Normalised source coordinates — centred and scaled, not raw pixels.
    private let sourceX: [Double]
    private let sourceY: [Double]
    /// `count` kernel weights, then the three affine-tail coefficients.
    private let weightsX: [Double]
    private let weightsY: [Double]
    private let centreX: Double
    private let centreY: Double
    private let scale: Double
    private let destinationCentreX: Double
    private let destinationCentreY: Double

    public var controlPointCount: Int { sourceX.count }

    /// Whether this spline can bend, or is the affine through its points.
    public var bends: Bool { controlPointCount >= Self.minimumBendingControlPoints }

    /// `U(r) = r² log r`, given `r²`, so no square root is ever taken.
    ///
    /// `U(0) = 0` by the limit and `log 0` is -∞, so the zero case is branched
    /// rather than computed. Every diagonal entry of the matrix hits it.
    private static func kernel(squaredRadius: Double) -> Double {
        squaredRadius > 0 ? 0.5 * squaredRadius * log(squaredRadius) : 0
    }

    /// Conditioning is required in two senses here, and they are different
    /// things.
    ///
    /// *Numerically*: sources are centred on their centroid and scaled to unit
    /// RMS radius, and destinations have their centroid subtracted. The raw
    /// inputs are image pixels against Mercator metres, and `r² log r` at pixel
    /// magnitudes puts entries spanning many orders of magnitude into one
    /// matrix. Measured on the web, normalised, the interpolation residual is
    /// 5.1e-11 m; without it a 500-point system at Mercator magnitudes is not
    /// reliably solvable at all.
    ///
    /// *As a refusal*: a cloud too thin to determine a transform is rejected up
    /// front, at the same threshold the affine solver uses. The elimination
    /// pivot is not a substitute — an oblique collinear cloud gives a pivot
    /// around 1e-16, which any `pivot != 0` test admits, producing a drape a
    /// one-pixel nudge moves 12.2 km.
    ///
    /// The agreement with `AffineFit` is one-directional, and only the
    /// guaranteed direction may be relied on: **everything the affine solver
    /// refuses, this refuses**. That holds by construction, because the
    /// destination check below *is* an `AffineFit.solve` call. Matching
    /// thresholds instead does not work, and the web proved it: affine guards
    /// its destination on the solved transform's singular values while this
    /// guarded its own on the destination cloud's shape — different quantities
    /// under unrelated thresholds, and a georeference squashed 100:1 fell
    /// between them, refused there and accepted here.
    ///
    /// The converse does not hold and cannot. An interpolating spline
    /// additionally refuses coincident points and a singular interpolation
    /// matrix, neither of which troubles a least-squares fit, which simply
    /// averages duplicates away. This refuses a strict superset; nothing may
    /// claim symmetry.
    public static func solve(
        controlPoints: [GroundControlPoint]
    ) throws(Refusal) -> ThinPlateSpline {
        let count = controlPoints.count
        guard count >= minimumControlPoints else { throw .tooFewPoints }

        // Cheapest refusals first, and ordered so every reason stays reachable.
        for i in 0..<count {
            for j in (i + 1)..<count {
                let dx = controlPoints[i].pixel.x - controlPoints[j].pixel.x
                let dy = controlPoints[i].pixel.y - controlPoints[j].pixel.y
                if hypot(dx, dy) < minimumSeparation { throw .coincidentPoints }
            }
        }

        let pixels = controlPoints.map(\.pixel)
        // Changes no accept/reject verdict — the delegated affine solve applies
        // this same gate to these same points — but it rejects a hopeless
        // layout before paying for a Mercator pass and a solve, and it sets
        // reason precedence: a layout that is both road-thin and carries a
        // non-finite destination is reported ill-conditioned rather than
        // non-finite.
        guard ControlPointConditioning.ratio(of: pixels)
            > ControlPointConditioning.minimumConditionRatio
        else { throw .illConditioned }

        let destinations = controlPoints.map { WebMercator.project($0.map) }
        // Before the delegation, because the affine solver folds a non-finite
        // destination into the same refusal it uses for a degenerate one, and a
        // caller says something different to the user about each.
        for destination in destinations where !destination.x.isFinite || !destination.y.isFinite {
            throw .nonFinite
        }

        // *The* destination gate, and deliberately not a second conditioning
        // call. Asking the affine solver the question is what makes "everything
        // affine refuses, this refuses" true by construction.
        guard AffineFit.solve(
            pairs: zip(pixels, destinations).map { (source: $0, destination: $1) }
        ) != nil else { throw .illConditioned }

        let n = Double(count)
        var centreX = 0.0
        var centreY = 0.0
        for pixel in pixels {
            centreX += pixel.x
            centreY += pixel.y
        }
        centreX /= n
        centreY /= n

        var squaredSpread = 0.0
        for pixel in pixels {
            squaredSpread += pow(pixel.x - centreX, 2) + pow(pixel.y - centreY, 2)
        }
        let scale = (squaredSpread / n).squareRoot()
        guard scale > 0, scale.isFinite else { throw .illConditioned }

        let sourceX = pixels.map { ($0.x - centreX) / scale }
        let sourceY = pixels.map { ($0.y - centreY) / scale }

        var destinationCentreX = 0.0
        var destinationCentreY = 0.0
        for destination in destinations {
            destinationCentreX += destination.x
            destinationCentreY += destination.y
        }
        destinationCentreX /= n
        destinationCentreY /= n

        let size = count + 3
        var matrix = [Double](repeating: 0, count: size * size)
        var rhsX = [Double](repeating: 0, count: size)
        var rhsY = [Double](repeating: 0, count: size)
        for i in 0..<count {
            for j in 0..<count {
                matrix[i * size + j] = kernel(
                    squaredRadius: pow(sourceX[i] - sourceX[j], 2)
                        + pow(sourceY[i] - sourceY[j], 2)
                )
            }
            // The affine tail's columns, and the same block transposed below as
            // the side conditions. The bottom-right 3x3 stays zero.
            matrix[i * size + count] = 1
            matrix[i * size + count + 1] = sourceX[i]
            matrix[i * size + count + 2] = sourceY[i]
            matrix[count * size + i] = 1
            matrix[(count + 1) * size + i] = sourceX[i]
            matrix[(count + 2) * size + i] = sourceY[i]

            rhsX[i] = destinations[i].x - destinationCentreX
            rhsY[i] = destinations[i].y - destinationCentreY
        }

        // A backstop, not the gate: the conditioning check above is what
        // actually catches thin clouds, because a pivot can be a plausible
        // 1e-16 for a layout degenerate in every way that matters.
        guard solveInPlace(&matrix, size: size, rhsX: &rhsX, rhsY: &rhsY) else {
            throw .illConditioned
        }

        // Also a backstop. Every destination was checked finite and the system
        // solved, so reaching this needs a pathology none of the earlier checks
        // name. Per coefficient rather than on a sum, for the reason the affine
        // solver records: `1e200 + -1e200 + -1e200 + 1e200` is zero.
        for i in 0..<size where !rhsX[i].isFinite || !rhsY[i].isFinite {
            throw .nonFinite
        }

        return ThinPlateSpline(
            sourceX: sourceX, sourceY: sourceY,
            weightsX: rhsX, weightsY: rhsY,
            centreX: centreX, centreY: centreY, scale: scale,
            destinationCentreX: destinationCentreX,
            destinationCentreY: destinationCentreY
        )
    }

    /// The spline at one *original-image* pixel, in Mercator metres — the same
    /// contract `AffineTransform.apply` has, so a mesh builder does not care
    /// which of the two produced its transform.
    public func apply(x: Double, y: Double) -> MercatorPoint {
        let count = sourceX.count
        let normalisedX = (x - centreX) / scale
        let normalisedY = (y - centreY) / scale

        var px = weightsX[count]
            + weightsX[count + 1] * normalisedX
            + weightsX[count + 2] * normalisedY
        var py = weightsY[count]
            + weightsY[count + 1] * normalisedX
            + weightsY[count + 2] * normalisedY

        for i in 0..<count {
            let bend = Self.kernel(
                squaredRadius: pow(normalisedX - sourceX[i], 2)
                    + pow(normalisedY - sourceY[i], 2)
            )
            px += weightsX[i] * bend
            py += weightsY[i] * bend
        }

        return MercatorPoint(x: px + destinationCentreX, y: py + destinationCentreY)
    }

    /// Gaussian elimination with partial pivoting, in place, over both
    /// right-hand sides at once — the matrix is the same for x and y, and
    /// factoring it twice would double an O(n³) cost that is already the
    /// expensive half of a drag frame.
    ///
    /// Returns false rather than producing infinities when a pivot column is
    /// empty.
    private static func solveInPlace(
        _ matrix: inout [Double], size: Int, rhsX: inout [Double], rhsY: inout [Double]
    ) -> Bool {
        for column in 0..<size {
            var pivotRow = column
            for row in (column + 1)..<size
            where abs(matrix[row * size + column]) > abs(matrix[pivotRow * size + column]) {
                pivotRow = row
            }
            let pivot = matrix[pivotRow * size + column]
            guard abs(pivot) > 0, pivot.isFinite else { return false }
            if pivotRow != column {
                for k in column..<size {
                    matrix.swapAt(column * size + k, pivotRow * size + k)
                }
                rhsX.swapAt(column, pivotRow)
                rhsY.swapAt(column, pivotRow)
            }
            for row in (column + 1)..<size {
                let factor = matrix[row * size + column] / pivot
                if factor == 0 { continue }
                for k in column..<size {
                    matrix[row * size + k] -= factor * matrix[column * size + k]
                }
                rhsX[row] -= factor * rhsX[column]
                rhsY[row] -= factor * rhsY[column]
            }
        }

        for row in stride(from: size - 1, through: 0, by: -1) {
            var sumX = rhsX[row]
            var sumY = rhsY[row]
            for k in (row + 1)..<size {
                sumX -= matrix[row * size + k] * rhsX[k]
                sumY -= matrix[row * size + k] * rhsY[k]
            }
            rhsX[row] = sumX / matrix[row * size + row]
            rhsY[row] = sumY / matrix[row * size + row]
        }
        return true
    }
}

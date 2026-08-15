import Foundation

extension GeoreferenceStatus {
    /// What the panel says about the fit, in words.
    ///
    /// Ported from `web/src/userMaps/components/georeferenceStatus.ts`,
    /// sentence for sentence. The copy is the substance: each of these states
    /// exists because its *remedy* differs, and a message that blurred two of
    /// them together would tell a user to do something that cannot help.
    ///
    /// "Click" becomes "tap", and the escape-key hint is dropped — there is no
    /// escape key on a phone, and the panel offers a cancel button instead.
    public var message: String {
        switch self {
        case .awaitingMap:
            return "Now tap the same spot on the map."
        case .awaitingScan:
            return "Now tap the same spot on the scan."
        case .needMore(let remaining):
            return remaining == AffineFit.minimumControlPoints
                ? "Place \(remaining) points to see the map drape."
                : """
                    Place \(remaining) more point\(remaining == 1 ? "" : "s") \
                    to see the map drape.
                    """
        case .degenerate:
            // Names both sides deliberately. Most of what arrives here is not
            // a straight line on the scan — a non-finite result, or a solved
            // transform squashing one axis flat, which is what three map taps
            // down a meridian produce from a perfectly good scan triangle.
            return """
                These points can't pin the map down — check that neither the \
                scan points nor the map points sit on a straight line.
                """
        case .coincidentPoints:
            return "Two points are on the same spot — move or delete one."
        case .exactFit:
            // Three points fit an affine exactly by construction, so every
            // residual is zero. Printing "0 m" would read as perfect accuracy.
            return "Exact fit — add a 4th point to check accuracy."
        case .tooManyPoints:
            // Must not read as "add a 4th point", and must not read as a
            // failure: past the cap only the accuracy check is off, and the
            // drape is exactly as good as it was one point ago.
            return "Too many points to check accuracy — the map still draws."
        case .refitRefused:
            return """
                Can't check accuracy — these points sit too close to a \
                straight line. Spread them out; the map still draws.
                """
        case .solved(let metres, let count, let method):
            // The number is two different quantities, so it gets two
            // different sentences. Under an affine it is the fit residual at
            // the control points, and "RMS" is its name. A spline passes
            // through its control points exactly, so there is no fit residual
            // and the figure is leave-one-out — measured to overstate true
            // warp error by roughly 1.8× to 3.7× and never to understate it.
            // That makes it an upper bound, and "no worse than" is the only
            // honest framing: four points with about 65 m of real warp error
            // printed "RMS 240 m", which a user reads as a georeference to
            // throw away.
            let rounded = metres.isFinite ? Int(metres.rounded()) : 0
            return method == .spline
                ? "No worse than \(rounded) m across \(count) points"
                : "RMS \(rounded) m across \(count) points"
        }
    }
}

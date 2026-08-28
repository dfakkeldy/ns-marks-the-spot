import Foundation

/// How big a thing on the map is on the glass in front of you.
///
/// A port of the web's screen-scale readout. It answers a question the zoom
/// level cannot: whether what is on screen is at roughly the scale of a survey
/// plan, a topographic sheet, or a road atlas.
///
/// It is approximate on both surfaces, and for the same reason: neither can ask
/// the display how large it physically is. The browser assumes 96 CSS pixels to
/// the inch; here the assumption is a nominal points-per-inch, which is right
/// for a phone and out by about a fifth on an iPad. Either way the number is a
/// guide to the size of the thing you are looking at, not a scale you can hold
/// a ruler against — the caveat travels with the readout for that reason.
public enum DisplayScale {
    /// The reference density. iOS lays a point out at roughly 1/163 inch on a
    /// phone; iPads are nearer 132, and no public API reports the real figure,
    /// so one nominal number and a stated caveat beats a false precision.
    public static let nominalPointsPerInch = 163.0

    public static let caveat = """
        Calculated at the centre of the map using a nominal \
        \(Int(nominalPointsPerInch)) points per inch. Your device's actual \
        pixel density affects physical accuracy.
        """

    /// The scale denominator for a map drawn at this many ground metres to the
    /// point, rounded to three significant figures the way the web rounds it.
    ///
    /// Returns nothing rather than a number when the map has not settled into a
    /// measurable state: no readout at all is honest, a 1:0 is not.
    public static func denominator(groundMetresPerPoint: Double) -> Double? {
        let metresPerPoint = 0.0254 / nominalPointsPerInch
        let denominator = groundMetresPerPoint / metresPerPoint
        guard denominator.isFinite, denominator > 0 else { return nil }
        return significantFigures(denominator, 3)
    }

    /// What the readout says.
    public static func label(groundMetresPerPoint: Double) -> String? {
        guard let denominator = denominator(groundMetresPerPoint: groundMetresPerPoint) else {
            return nil
        }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        formatter.groupingSeparator = ","
        formatter.usesGroupingSeparator = true
        let text = formatter.string(from: NSNumber(value: denominator))
            ?? String(Int(denominator.rounded()))
        return "Approx. screen scale 1:\(text)"
    }

    private static func significantFigures(_ value: Double, _ digits: Int) -> Double {
        let magnitude = pow(10, Double(digits) - 1 - (log10(abs(value))).rounded(.down))
        return (value * magnitude).rounded() / magnitude
    }
}

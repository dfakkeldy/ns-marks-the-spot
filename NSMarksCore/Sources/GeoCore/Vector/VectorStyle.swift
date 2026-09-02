import Foundation

/// How one feature of a user's layer is drawn.
///
/// Named for the user rather than for features in general because
/// `NSDataServices` already has a `VectorFeatureStyle` for the catalogued
/// layers: same idea, different vocabulary (that one carries a dash pattern and
/// a marker radius the catalog specifies, this one carries the simplestyle
/// properties a user's own file may set). App files import both modules, so two
/// types of the same name would be ambiguous at every use site.
public struct UserVectorStyle: Hashable, Sendable {
    public var strokeHex: String
    public var weight: Double
    public var strokeOpacity: Double
    public var fillHex: String
    public var fillOpacity: Double

    public init(
        strokeHex: String, weight: Double, strokeOpacity: Double,
        fillHex: String, fillOpacity: Double
    ) {
        self.strokeHex = strokeHex
        self.weight = weight
        self.strokeOpacity = strokeOpacity
        self.fillHex = fillHex
        self.fillOpacity = fillOpacity
    }
}

/// The colours a user layer is drawn in, and how a feature's own styling
/// overrides them.
public enum VectorStyle {
    /// Okabe–Ito, minus the yellow: it disappears over aerial imagery.
    ///
    /// Colourblind-safe, and assigned once at import and stored on the record
    /// rather than derived from the layer's position in the list — a layer
    /// keeps its colour for life instead of changing when the user deletes a
    /// neighbour.
    public static let layerColors = [
        "#d55e00",  // vermillion
        "#0072b2",  // blue
        "#009e73",  // bluish green
        "#cc79a7",  // reddish purple
        "#e69f00",  // orange
        "#56b4e9",  // sky blue
    ]

    /// Takes a count rather than the records, so importing several files at
    /// once advances the cursor before any of them has been saved.
    public static func nextLayerColor(existingCount: Int) -> String {
        let index = ((existingCount % layerColors.count) + layerColors.count) % layerColors.count
        return layerColors[index]
    }

    /// The layer default, overridden per feature by the simplestyle-spec
    /// properties (`stroke`, `stroke-width`, `stroke-opacity`, `fill`,
    /// `fill-opacity`, `marker-color`).
    ///
    /// That vocabulary is what a KML conversion emits for authored styles, so
    /// an imported KML keeps the look its author gave it with no extra
    /// plumbing. A malformed value falls back to the layer default rather than
    /// to anything of the renderer's, so a broken property is a colour the
    /// user recognises rather than a layer that vanishes.
    public static func style(
        for feature: GeoJsonFeature, layerColorHex: String
    ) -> UserVectorStyle {
        let properties = feature.properties
        let stroke = color(properties["stroke"]) ?? layerColorHex
        let fill = color(properties["marker-color"]) ?? color(properties["fill"]) ?? layerColorHex
        return UserVectorStyle(
            strokeHex: stroke,
            weight: width(properties["stroke-width"]) ?? 2,
            strokeOpacity: opacity(properties["stroke-opacity"]) ?? 0.9,
            fillHex: fill,
            fillOpacity: opacity(properties["fill-opacity"]) ?? 0.25
        )
    }

    /// How one of a user's points is drawn.
    public struct PointStyle: Hashable, Sendable {
        public var fillHex: String
        public var fillOpacity: Double
        public var rimHex: String
        public var rimOpacity: Double
        /// The rim's width in points, clamped as `stroke-width` is.
        public var rimWidth: Double

        public init(
            fillHex: String, fillOpacity: Double, rimHex: String,
            rimOpacity: Double = 1, rimWidth: Double = 2.5
        ) {
            self.fillHex = fillHex
            self.fillOpacity = fillOpacity
            self.rimHex = rimHex
            self.rimOpacity = rimOpacity
            self.rimWidth = rimWidth
        }
    }

    /// Solid in the marker colour with a white rim, unless the feature's file
    /// said otherwise.
    ///
    /// Points do not take the polygon defaults: a quarter-opacity fill is what
    /// made a deselected point vanish over imagery. But an authored
    /// `fill-opacity`, `stroke`, `stroke-opacity` or `stroke-width` is kept, so
    /// an imported KML keeps the look its author gave its placemarks.
    public static func pointStyle(
        for feature: GeoJsonFeature, layerColorHex: String
    ) -> PointStyle {
        let properties = feature.properties
        return PointStyle(
            fillHex: color(properties["marker-color"]) ?? color(properties["fill"]) ?? layerColorHex,
            fillOpacity: opacity(properties["fill-opacity"]) ?? 1,
            rimHex: color(properties["stroke"]) ?? "#ffffff",
            rimOpacity: opacity(properties["stroke-opacity"]) ?? 1,
            rimWidth: width(properties["stroke-width"]).map { min($0, 6) } ?? 2.5
        )
    }

    /// A colour only if this file's vocabulary can actually draw it.
    ///
    /// Checked here rather than at the renderer, because the promise above is
    /// that a malformed value falls back to the layer colour. A `rebeccapurple`
    /// or an `rgb(1,2,3)` handed straight through would reach the renderer's
    /// own fallback instead, which is the diagnostic magenta — a colour that
    /// tells the user their file is broken when it is merely written in a form
    /// this reader does not parse.
    private static func color(_ value: JSONValue?) -> String? {
        guard let text = value?.stringValue, components(ofHex: text) != nil else { return nil }
        return text
    }

    /// A stroke width the renderer can use.
    ///
    /// Clamped rather than trusted: the value came out of a file, and a
    /// negative or absurd width becomes a negative image size at the point
    /// renderer. Twenty points is already a line as wide as a fingertip.
    private static func width(_ value: JSONValue?) -> Double? {
        guard let raw = value?.doubleValue, raw.isFinite, raw > 0 else { return nil }
        return min(raw, 20)
    }

    private static func opacity(_ value: JSONValue?) -> Double? {
        guard let raw = value?.doubleValue, raw.isFinite else { return nil }
        return min(max(raw, 0), 1)
    }

    /// A `#rgb`, `#rrggbb` or `#rrggbbaa` colour as components in 0...1.
    ///
    /// Nil for anything else. The value came out of a user's file and may be a
    /// CSS colour name, a `rgb()` call, or a typo; the caller falls back to the
    /// layer colour rather than drawing something invisible.
    public static func components(
        ofHex hex: String
    ) -> (red: Double, green: Double, blue: Double, alpha: Double)? {
        var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.hasPrefix("#") else { return nil }
        text.removeFirst()
        guard text.allSatisfy(\.isHexDigit) else { return nil }
        let digits = Array(text)
        func value(_ characters: [Character]) -> Double? {
            guard let raw = UInt8(String(characters), radix: 16) else { return nil }
            return Double(raw) / 255
        }
        switch digits.count {
        case 3:
            guard let red = value([digits[0], digits[0]]),
                  let green = value([digits[1], digits[1]]),
                  let blue = value([digits[2], digits[2]])
            else { return nil }
            return (red, green, blue, 1)
        case 6, 8:
            guard let red = value(Array(digits[0..<2])),
                  let green = value(Array(digits[2..<4])),
                  let blue = value(Array(digits[4..<6]))
            else { return nil }
            let alpha = digits.count == 8 ? value(Array(digits[6..<8])) : 1
            guard let alpha else { return nil }
            return (red, green, blue, alpha)
        default:
            return nil
        }
    }
}

/// What a tapped feature says about itself.
///
/// Built here rather than in the view because the provenance line is not
/// decoration: a user-loaded feature has to announce that it is one, wherever
/// it is shown, and a view that forgot the line would present the user's own
/// sketch with the same authority as a registry parcel.
public struct VectorFeatureCallout: Hashable, Sendable {
    public var title: String
    public var detail: String?
    public var provenance: String
    /// "Marked from GPS on this device (±N m)" when the feature carries both
    /// `nsmts:capturedAt` and `nsmts:accuracyM`. This labels the claim the
    /// data makes about itself — an imported file could carry the keys — so
    /// a ±40 m mark can never read as a surveyed corner. Nil when either key
    /// is missing; the line is never fabricated.
    public var gpsProvenance: String?
    /// The pinned not-a-survey caveat, only when `nsmts:traced` is present.
    public var tracedCaveat: String?

    public init(
        title: String, detail: String?, provenance: String, gpsProvenance: String? = nil,
        tracedCaveat: String? = nil
    ) {
        self.title = title
        self.detail = detail
        self.provenance = provenance
        self.gpsProvenance = gpsProvenance
        self.tracedCaveat = tracedCaveat
    }

    /// The GPS claim a feature makes about itself, as its reported accuracy,
    /// or nil: a Point whose `nsmts:capturedAt` is a moment and whose
    /// `nsmts:accuracyM` is a radius a receiver could report. One test for
    /// the callout that says "Marked from GPS" and the editor that removes
    /// the claim after a hand move, so nothing is labelled — or deleted — on
    /// the strength of a key merely being present. Stricter than the web's
    /// popup, which checks a non-blank string and a finite number: ±1e300 m,
    /// a negative radius, or a capture "time" that is not one, is no claim.
    public static func gpsAccuracy(of feature: GeoJsonFeature) -> Double? {
        guard case .point? = feature.geometry,
              let when = feature.properties[CaptureSpec.capturedAtKey]?.stringValue,
              CaptureTime.parse(when) != nil,
              let accuracy = feature.properties[CaptureSpec.accuracyKey]?.doubleValue,
              accuracy.isFinite, accuracy > 0, accuracy <= maxCredibleAccuracyM
        else { return nil }
        return accuracy
    }

    /// Past this an accuracy radius is not a measurement: CoreLocation's own
    /// worst case is a few kilometres, and a thousand-kilometre claim says
    /// nothing about where the point is.
    public static let maxCredibleAccuracyM: Double = 1_000_000

    /// The radius as a label that never understates it: rounded up to the
    /// next tenth under ten metres, so ±0.04 m is "±0.1 m" and never
    /// "±0.0 m", and to the next whole metre above.
    public static func accuracyLabel(_ accuracyM: Double) -> String {
        accuracyM < 10
            ? String(format: "%.1f", (accuracyM * 10).rounded(.up) / 10)
            : String(Int(accuracyM.rounded(.up)))
    }

    public init(feature: GeoJsonFeature, record: UserVectorLayerRecord) {
        func text(_ key: String) -> String? {
            guard let value = feature.properties[key]?.stringValue,
                  !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            else { return nil }
            return value
        }
        // The layer's name when the feature has none: a callout headed by a
        // blank line reads as a feature that failed to load.
        self.title = text("name") ?? record.name
        self.detail = text("description")
        self.provenance = record.provenanceText
        if let accuracy = Self.gpsAccuracy(of: feature) {
            self.gpsProvenance =
                "Marked from GPS on this device (±\(Self.accuracyLabel(accuracy)) m)"
        }
        if feature.properties[CaptureSpec.tracedKey]?.stringValue == CaptureSpec.tracedParcelValue {
            // The whole provenance, not only the caveat: a corner traced from
            // NSPRD carries the Province's attribution and licence line
            // wherever it is shown, as the export already gives it.
            self.tracedCaveat = VectorExport.tracedProvenanceNote
        }
    }
}

import Foundation

/// A source named in the printed page's attribution strip.
public struct PrintLayerSource: Hashable, Sendable {
    public var name: String
    public var attribution: String
    /// The licence document the publisher states, when it states one.
    public var licenceUrl: String?

    public init(name: String, attribution: String, licenceUrl: String?) {
        self.name = name
        self.attribution = attribution
        self.licenceUrl = licenceUrl
    }
}

public enum PrintAttribution {
    /// The strip's lines, grouped by the attribution they carry rather than
    /// one line per layer.
    ///
    /// Ported from `web/src/print/pdf/attributionLines.ts`. One line per layer
    /// put the identical Province attribution on the page four times over with
    /// the default layer set — about 850 characters of strip for maybe 400
    /// characters of actual obligation, which overran the space and got the
    /// tail cut. Naming every source that shares an attribution on one line
    /// keeps the obligation complete and the strip short enough to render.
    ///
    /// Sources group on the attribution text **and** the licence URL, not the
    /// text alone. The Province's open-government wording is paired with three
    /// different licence documents across layer families, so grouping on words
    /// alone would drop whichever URL lost the race and assert the survivor's
    /// licence over data it does not cover. Two sources merge only when they
    /// truly share one licence.
    ///
    /// First-seen order is kept, which leaves the strip in the same
    /// base-map-upward order the layers were captured in.
    public static func lines(for sources: [PrintLayerSource]) -> [String] {
        var order = [String]()
        var grouped = [String: (names: [String], attribution: String, licenceUrl: String?)]()
        for source in sources {
            let key = "\(source.attribution) \(source.licenceUrl ?? "")"
            if var existing = grouped[key] {
                if !existing.names.contains(source.name) {
                    existing.names.append(source.name)
                    grouped[key] = existing
                }
            } else {
                order.append(key)
                grouped[key] = (
                    [source.name], source.attribution, source.licenceUrl
                )
            }
        }
        return order.compactMap { key in
            guard let group = grouped[key] else { return nil }
            let line = "\(group.names.joined(separator: ", ")): \(group.attribution)"
            guard let url = group.licenceUrl else { return line }
            return "\(line) — \(url)"
        }
    }
}

/// How many pixels the map raster is rendered at, and at what dot pitch.
public struct ExportResolution: Hashable, Sendable {
    public var dpi: Int
    public var widthPx: Int
    public var heightPx: Int
    /// True when the export did not get the full 300 dpi, so the dialog can
    /// say so rather than letting a reader assume print quality.
    public var reduced: Bool
}

public enum PrintResolution {
    /// The largest raster either surface will render.
    ///
    /// The number comes from the browser: iOS Safari enforces per-canvas
    /// memory ceilings around this size. It is kept here so a page exported
    /// from the phone and one exported from the browser carry the same raster
    /// at the same dot pitch, rather than the native export quietly producing
    /// a different document from the same view.
    public static let maximumDimensionPx = 4096

    /// Whether to start the ladder one rung down.
    ///
    /// The web has to infer this from a user agent string. A native app can
    /// simply ask the device how much memory it has.
    public static func isConstrained(physicalMemoryBytes: UInt64) -> Bool {
        physicalMemoryBytes <= 4 * 1024 * 1024 * 1024
    }

    public static func resolve(
        mapFrame: PdfRect, constrainedDevice: Bool
    ) -> ExportResolution {
        let ladder = constrainedDevice ? [200, 150] : [300, 200, 150]
        for dpi in ladder {
            let widthPx = Int((mapFrame.width / PdfTemplate.pointsPerInch * Double(dpi)).rounded())
            let heightPx = Int(
                (mapFrame.height / PdfTemplate.pointsPerInch * Double(dpi)).rounded()
            )
            if max(widthPx, heightPx) <= maximumDimensionPx {
                return ExportResolution(
                    dpi: dpi, widthPx: widthPx, heightPx: heightPx, reduced: dpi < 300
                )
            }
        }
        // Even the lowest rung would overflow the cap, so the raster is scaled
        // to fit and reports the dot pitch that actually describes the pixels
        // returned — not the rung it fell off. That number is what the dialog
        // shows, and a page that claims 150 dpi it does not have would be a
        // claim about what the print can resolve.
        let scale = Double(maximumDimensionPx) / max(mapFrame.width, mapFrame.height)
        let widthPx = Int((mapFrame.width * scale).rounded())
        let heightPx = Int((mapFrame.height * scale).rounded())
        let dpi = Int(
            (Double(widthPx) / (mapFrame.width / PdfTemplate.pointsPerInch)).rounded()
        )
        return ExportResolution(dpi: dpi, widthPx: widthPx, heightPx: heightPx, reduced: true)
    }
}

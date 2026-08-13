import Foundation
import GeoCore
import MapCatalog

/// Municipal zoning drawn per viewport.
///
/// Ported from `web/src/services/zoning.ts`. Every one of these layers is an
/// unofficial rendering of a by-law: the polygon says where a zone was drawn,
/// and only the by-law the descriptor links says what that zone permits.
public enum ZoningOverlay {
    /// One zone, as it should be read aloud.
    public struct Description: Sendable, Hashable {
        public let code: String?
        public let name: String?
        public let planArea: String?

        public init(code: String?, name: String?, planArea: String?) {
            self.code = code
            self.name = name
            self.planArea = planArea
        }

        /// One line for a callout.
        ///
        /// "Zone not stated" is the honest fallback: the polygon is published,
        /// so a zone boundary is drawn there, but this source did not say which
        /// zone it is.
        public var label: String {
            if let code, let name {
                return "\(code) — \(name)"
            }
            return code ?? name ?? "Zone not stated"
        }
    }

    /// One drawable zone polygon.
    public struct Zone: Sendable, Hashable {
        public let geometry: GeoJSONGeometry
        public let description: Description

        public init(geometry: GeoJSONGeometry, description: Description) {
            self.geometry = geometry
            self.description = description
        }
    }

    /// Trimmed text, or `nil` for an absent, empty, or non-textual value.
    private static func text(
        _ properties: [String: MappedFeatureResponse.AttributeValue],
        _ field: String?
    ) -> String? {
        guard let field else { return nil }
        let raw: String
        switch properties[field] {
        case .string(let value): raw = value
        case .number(let value): raw = ArcGISExportURL.jsNumber(value)
        case .null, nil: return nil
        }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Strips a code the municipality already spelled into the zone name.
    ///
    /// The three encodings in use are code-prefixed ("CR Commercial
    /// Recreation", Inverness and Victoria), code-suffixed ("Agriculture (AG)",
    /// Cumberland), and bare ("Agricultural Potential", Richmond and Halifax),
    /// so a callout must not read "CR — CR Commercial Recreation".
    static func stripRedundantCode(_ name: String, code: String?) -> String {
        guard let code else { return name }

        if name.uppercased().hasPrefix("\(code.uppercased()) ") {
            return String(name.dropFirst(code.count)).trimmingCharacters(in: .whitespaces)
        }

        let suffix = " (\(code))"
        if name.uppercased().hasSuffix(suffix.uppercased()) {
            return String(name.dropLast(suffix.count)).trimmingCharacters(in: .whitespaces)
        }

        return name
    }

    public static func describe(
        _ properties: [String: MappedFeatureResponse.AttributeValue],
        detail: ZoningLayerDetail
    ) -> Description {
        let code = text(properties, detail.zoneCodeField)
        let rawName = text(properties, detail.zoneNameField)
        let name = rawName.map { stripRedundantCode($0, code: code) }

        return Description(
            code: code,
            name: name.flatMap { $0.isEmpty ? nil : $0 },
            planArea: text(properties, detail.planAreaField)
        )
    }
}

/// Fetches the zone polygons in a viewport.
public nonisolated final class ZoningFetcher: Sendable {
    private let overlay: FeatureOverlayFetcher

    public init(transport: HTTPTransport = .urlSession()) {
        overlay = FeatureOverlayFetcher(transport: transport)
    }

    /// The zones `layer` draws inside `bounds`.
    ///
    /// Zones whose geometry could not be read are dropped by the seam and
    /// reported in `unreadableFeatures`; zones whose attributes are missing are
    /// kept, because a polygon with no stated code is still a boundary the
    /// municipality drew.
    public func zones(
        for layer: LayerID,
        bounds: GeoBoundingBox,
        clearance: ProvinceLicenceClearance
    ) async throws(FeatureOverlayFailure) -> (zones: [ZoningOverlay.Zone], unreadable: Int) {
        guard let detail = LayerCatalog.zoningDetail(for: layer) else {
            throw .refused(.noServiceURL)
        }

        let plan: FeatureOverlayQuery.Plan
        do {
            plan = try FeatureOverlayQuery.plan(
                for: layer,
                bounds: bounds,
                outFields: detail.outFields,
                orderByFields: detail.orderByFields,
                idField: detail.idField,
                clearance: clearance
            )
        } catch {
            throw .refused(error)
        }

        let result = try await overlay.features(for: plan)
        return (
            result.features.map {
                ZoningOverlay.Zone(
                    geometry: $0.geometry,
                    description: ZoningOverlay.describe($0.properties, detail: detail)
                )
            },
            result.unreadableFeatures
        )
    }
}

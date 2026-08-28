import Foundation
import GeoCore
import MapCatalog

/// The two provincial point inventories — mineral occurrences and abandoned
/// mine openings — drawn per viewport.
///
/// Ported from the `ArcGISFeatureLayer` component in
/// `web/src/components/MapCanvas.tsx`. Both inventories are records of what
/// was reported, not surveys: an occurrence is not proof of a viable deposit,
/// and the mine-opening inventory is explicitly incomplete.
public enum ResourcePointOverlay {
    /// One point, with the line the map reads out for it.
    public struct Record: Sendable, Hashable {
        public let location: GeoPoint
        public let label: String
        public let properties: [String: MappedFeatureResponse.AttributeValue]

        public init(
            location: GeoPoint,
            label: String,
            properties: [String: MappedFeatureResponse.AttributeValue]
        ) {
            self.location = location
            self.label = label
            self.properties = properties
        }
    }

    private static func text(
        _ value: MappedFeatureResponse.AttributeValue?
    ) -> String {
        switch value {
        case .string(let raw): raw.trimmingCharacters(in: .whitespacesAndNewlines)
        case .number(let value): ArcGISExportURL.jsNumber(value)
        case .null, nil: ""
        }
    }

    /// The tooltip line, per layer.
    ///
    /// A record with no name still gets one — "Mineral occurrence", "Abandoned
    /// mine opening" — because the point is published either way and a blank
    /// label would read as a bug rather than as a record with no name on it.
    ///
    /// One deliberate divergence: the web falls back from `Comm_list` to
    /// `Comm_prim` only when the first is absent, so a record carrying an empty
    /// commodity list shows no commodity at all even though it names a primary
    /// one. Here an empty list falls back too. Both fields are the source's own
    /// commodity statement, so this shows what the record says rather than
    /// hiding it behind a blank column.
    public static func label(
        for layer: LayerID,
        properties: [String: MappedFeatureResponse.AttributeValue]
    ) -> String {
        let parts = parts(for: layer, properties: properties)
        return [parts.name, parts.detail]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    /// The same line, split where a card wants to break it.
    ///
    /// The web has one hover line and joins the two; a card has a title and a
    /// line under it. Split here rather than parsed back out of `label`, and
    /// joined by `label` rather than written twice, so the two surfaces cannot
    /// end up naming the same point differently.
    public static func parts(
        for layer: LayerID,
        properties: [String: MappedFeatureResponse.AttributeValue]
    ) -> (name: String, detail: String) {
        let name = text(properties["Name"])

        if layer == .mineralOccurrences {
            let commodityList = text(properties["Comm_list"])
            let commodity = commodityList.isEmpty ? text(properties["Comm_prim"]) : commodityList
            return (name.isEmpty ? "Mineral occurrence" : name, commodity)
        }

        let hazard = text(properties["Degree_Haz"])
        return (
            name.isEmpty ? "Abandoned mine opening" : name,
            hazard.isEmpty ? "" : "Hazard: \(hazard)"
        )
    }
}

/// Fetches a mineral point inventory for a viewport.
public nonisolated final class ResourcePointFetcher: Sendable {
    private let overlay: FeatureOverlayFetcher

    public init(transport: HTTPTransport = .urlSession()) {
        overlay = FeatureOverlayFetcher(transport: transport)
    }

    public func points(
        for layer: LayerID,
        in bounds: GeoBoundingBox,
        clearance: ProvinceLicenceClearance
    ) async throws(FeatureOverlayFailure) -> (
        records: [ResourcePointOverlay.Record], unreadable: Int
    ) {
        guard let detail = LayerCatalog.resourcePointDetail(for: layer) else {
            throw .refused(.noServiceURL)
        }

        let plan: FeatureOverlayQuery.Plan
        do {
            plan = try FeatureOverlayQuery.plan(
                for: layer,
                bounds: bounds,
                outFields: detail.outFields,
                clearance: clearance
            )
        } catch {
            throw .refused(error)
        }

        let found = try await overlay.features(for: plan)
        let records = found.features.compactMap { feature -> ResourcePointOverlay.Record? in
            guard case .point(let location) = feature.geometry else { return nil }
            return ResourcePointOverlay.Record(
                location: location,
                label: ResourcePointOverlay.label(for: layer, properties: feature.properties),
                properties: feature.properties
            )
        }
        // Rows that arrived without point geometry are counted, not dropped in
        // silence. A published inventory answering with nothing this app can
        // place is not the same fact as an inventory with nothing here, and an
        // empty map is exactly how the second one reads.
        return (
            records,
            found.unreadableFeatures + (found.features.count - records.count)
        )
    }
}

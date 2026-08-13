import Foundation
import GeoCore
import MapCatalog

/// Asks the geology and resource services what they have published on or near a
/// parcel.
///
/// A port of the web's `parcelResources.ts`. Three sources, five requests: the
/// mineral occurrence inventory is asked twice — once for what falls on the
/// parcel and once for what falls within a kilometre of it — mineral tenure is
/// asked on two NovaROC sublayers, and the abandoned-mine inventory once.
///
/// Addresses come from the catalog descriptors for the same three layers the
/// map draws. All three are published under the Province's open licence today;
/// the clearance is still asked for and honoured per layer, so if one is ever
/// re-classified the evidence path follows the catalog rather than a rule
/// written out again here.
public enum ResourceIntersectionQuery {
    /// The web's nearby radius for mineral occurrences.
    ///
    /// A screening distance. An occurrence within a kilometre of a boundary is
    /// worth knowing about and says nothing about what is under the parcel.
    public static let nearbyDistanceMetres = 1_000

    public enum Relationship: Sendable, Equatable {
        case onParcel
        case withinOneKilometre
    }

    /// Which reader turns a reply's attributes into a line of text.
    ///
    /// Kept as a tag rather than a closure so a request stays a value that can
    /// be compared in a test.
    public enum Summary: Sendable, Equatable {
        case mineralOccurrence
        /// NovaROC publishes exploration licences and mineral leases on
        /// separate sublayers and does not always carry a type code, so the
        /// fallback names the sublayer that answered.
        case mineralTenure(fallbackType: String)
        case abandonedMine
    }

    public struct Request: Sendable, Equatable {
        public let url: URL
        public let body: String
        public let layerID: LayerID
        public let relationship: Relationship
        public let summary: Summary
    }

    /// Why no request was produced at all.
    public enum Refusal: Error, Equatable, Sendable {
        /// The parcel has no rings. Nothing was asked, so an empty list would
        /// be this app's finding rather than the Province's.
        case noBoundary
    }

    /// What a source needs before it can be asked.
    public enum LayerRefusal: Error, Equatable, Sendable {
        case licenceNotAccepted
        case noServiceURL
        case malformedURL
    }

    /// The requests to send, and the sources that could not be asked.
    ///
    /// Kept apart because they land in different places on screen: a request
    /// produces evidence, and a refusal produces a sentence saying nothing was
    /// learned about that source.
    public struct Plan: Sendable, Equatable {
        public let requests: [Request]
        public let refusals: [(layerID: LayerID, refusal: LayerRefusal)]

        public static func == (lhs: Plan, rhs: Plan) -> Bool {
            lhs.requests == rhs.requests
                && lhs.refusals.map(\.layerID) == rhs.refusals.map(\.layerID)
                && lhs.refusals.map(\.refusal) == rhs.refusals.map(\.refusal)
        }
    }

    /// The sources asked, in the order the panel lists them.
    public static let layerIDs: [LayerID] = [.mineralOccurrences, .mineralTenure, .abandonedMines]

    /// One entry per request the web makes, in its order.
    private struct Descriptor {
        let layerID: LayerID
        /// Appended to the catalog's service URL before `/query`. NovaROC's
        /// descriptor addresses the whole map service, so the sublayer is named
        /// here; the two feature services already address their layer.
        let sublayer: Int?
        let outFields: String
        let relationship: Relationship
        let distanceMetres: Int?
        let summary: Summary
    }

    private static let mineralOccurrenceFields =
        "geo_id,Occ_num,Name,Status,Comm_prim,Comm_list"
    private static let mineralTenureFields =
        "OBJECTID,TENURE_NUMBER_ID,MTA_TENURE_TYPE_CODE,MINERAL_TENURE_STATUS_CODE"
    private static let abandonedMineFields =
        "geo_id,ShaftID,Name,Opening_ty,Degree_Haz,Protection"

    private static let descriptors: [Descriptor] = [
        Descriptor(
            layerID: .mineralOccurrences, sublayer: nil, outFields: mineralOccurrenceFields,
            relationship: .onParcel, distanceMetres: nil, summary: .mineralOccurrence
        ),
        Descriptor(
            layerID: .mineralOccurrences, sublayer: nil, outFields: mineralOccurrenceFields,
            relationship: .withinOneKilometre, distanceMetres: nearbyDistanceMetres,
            summary: .mineralOccurrence
        ),
        Descriptor(
            layerID: .mineralTenure, sublayer: 1, outFields: mineralTenureFields,
            relationship: .onParcel, distanceMetres: nil,
            summary: .mineralTenure(fallbackType: "Exploration licence")
        ),
        Descriptor(
            layerID: .mineralTenure, sublayer: 7, outFields: mineralTenureFields,
            relationship: .onParcel, distanceMetres: nil,
            summary: .mineralTenure(fallbackType: "Mineral lease")
        ),
        Descriptor(
            layerID: .abandonedMines, sublayer: nil, outFields: abandonedMineFields,
            relationship: .onParcel, distanceMetres: nil, summary: .abandonedMine
        ),
    ]

    public static func plan(
        for parts: [PolygonHitTest.PolygonPart],
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> Plan {
        let rings = MappedFeatureQuery.arcGISRings(from: parts)
        guard !rings.isEmpty else { throw .noBoundary }
        let geometry = MappedFeatureQuery.geometryJSON(rings)

        var requests: [Request] = []
        var refusals: [(layerID: LayerID, refusal: LayerRefusal)] = []
        var refused: Set<LayerID> = []

        for descriptor in descriptors {
            // One refusal per source, not per request: the panel has one line
            // for mineral tenure, and saying the same thing on it twice reads
            // as two separate failures.
            if refused.contains(descriptor.layerID) { continue }
            do {
                requests.append(try request(descriptor, geometry: geometry, clearance: clearance))
            } catch {
                refused.insert(descriptor.layerID)
                refusals.append((descriptor.layerID, error))
                requests.removeAll { $0.layerID == descriptor.layerID }
            }
        }
        return Plan(requests: requests, refusals: refusals)
    }

    private static func request(
        _ descriptor: Descriptor,
        geometry: String,
        clearance: ProvinceLicenceClearance
    ) throws(LayerRefusal) -> Request {
        guard clearance.allows(descriptor.layerID) else { throw .licenceNotAccepted }
        guard let service = LayerCatalog.descriptor(for: descriptor.layerID)?.serviceURL else {
            throw .noServiceURL
        }
        var base = service.absoluteString
        while base.hasSuffix("/") {
            base.removeLast()
        }
        if let sublayer = descriptor.sublayer {
            base += "/\(sublayer)"
        }
        guard let url = URL(string: "\(base)/query") else { throw .malformedURL }

        var parameters: [(String, String)] = [
            ("f", "json"),
            ("where", "1=1"),
            ("geometry", geometry),
            ("geometryType", "esriGeometryPolygon"),
            ("inSR", "4326"),
            ("spatialRel", "esriSpatialRelIntersects"),
            ("outFields", descriptor.outFields),
            ("returnGeometry", "false"),
        ]
        if let distance = descriptor.distanceMetres {
            parameters.append(("distance", String(distance)))
            parameters.append(("units", "esriSRUnit_Meter"))
        }

        let body = parameters
            .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
            .joined(separator: "&")
        return Request(
            url: url,
            body: body,
            layerID: descriptor.layerID,
            relationship: descriptor.relationship,
            summary: descriptor.summary
        )
    }
}

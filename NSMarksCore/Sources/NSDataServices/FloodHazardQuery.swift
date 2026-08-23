import Foundation
import GeoCore
import MapCatalog

/// Asks the flood services what they have published over a parcel.
///
/// A port of the web's `floodHazard.ts`, and two different questions wearing one
/// name. The river half is a vector query against published study-area mapping
/// and returns a yes or a no. The coastal half has no vector service to ask, so
/// it renders the province's own raster over the parcel's bounds and counts
/// pixels — an approximation, and labelled as one everywhere it surfaces.
///
/// Addresses and the licence gate come from the catalog descriptors for the four
/// flood layers the map already draws.
public enum FloodHazardQuery {
    /// Whether the study area maps the parcel's ground as flood-prone area, or
    /// only carries the boundary line of the mapped zone there.
    ///
    /// The province publishes both, and they are not the same statement: an
    /// intersection with a boundary line means the parcel touches the edge of
    /// the mapped zone, which does not say which side of it the land is on.
    public enum RiverRelationship: String, Sendable, Equatable {
        case area
        case boundary
    }

    /// One published study-area sublayer.
    public struct RiverLayer: Sendable, Equatable {
        public let sublayer: Int
        public let annualExceedanceProbabilityPercent: Int
        public let relationship: RiverRelationship
        public let place: String
        public let extent: GeoBoundingBox
    }

    /// The three sea-level scenarios, in the order the panel lists them.
    public enum CoastalScenario: String, Sendable, Equatable, CaseIterable {
        case current
        case year2050
        case year2100

        public var layerID: LayerID {
            switch self {
            case .current: .coastalFloodCurrent
            case .year2050: .coastalFlood2050
            case .year2100: .coastalFlood2100
            }
        }
    }

    /// The storm the coastal scenarios model. Fixed by the source: all three
    /// rasters are drawn for a 1% AEP surge, and only the sea level underneath
    /// it changes between them.
    public static let coastalStormAnnualExceedanceProbabilityPercent = 1

    /// The width in pixels of the raster sample. The height follows the parcel's
    /// aspect ratio, capped at the same number.
    public static let coastalSampleWidthPx = 384

    /// The published study areas, transcribed from the web's `riverLayers`.
    ///
    /// Only four places in the province have published mapping, so a parcel
    /// anywhere else gets no request at all — and that absence is
    /// "outside the published extents", which is a statement about the mapping
    /// programme rather than about the parcel.
    public static let riverLayers: [RiverLayer] = [
        RiverLayer(
            sublayer: 3, annualExceedanceProbabilityPercent: 5, relationship: .area,
            place: "Antigonish", extent: antigonish
        ),
        RiverLayer(
            sublayer: 5, annualExceedanceProbabilityPercent: 1, relationship: .area,
            place: "Antigonish", extent: antigonish
        ),
        RiverLayer(
            sublayer: 8, annualExceedanceProbabilityPercent: 5, relationship: .area,
            place: "Bedford / Sackville", extent: bedfordSackville
        ),
        RiverLayer(
            sublayer: 10, annualExceedanceProbabilityPercent: 1, relationship: .area,
            place: "Bedford / Sackville", extent: bedfordSackville
        ),
        RiverLayer(
            sublayer: 12, annualExceedanceProbabilityPercent: 5, relationship: .boundary,
            place: "Pictou", extent: pictou
        ),
        RiverLayer(
            sublayer: 14, annualExceedanceProbabilityPercent: 1, relationship: .area,
            place: "Pictou", extent: pictou
        ),
        RiverLayer(
            sublayer: 16, annualExceedanceProbabilityPercent: 5, relationship: .boundary,
            place: "Truro", extent: truro
        ),
        RiverLayer(
            sublayer: 18, annualExceedanceProbabilityPercent: 1, relationship: .area,
            place: "Truro", extent: truro
        ),
    ]

    private static let antigonish = GeoBoundingBox(
        south: 45.6114622688, west: -62.0296298689, north: 45.6401819156, east: -61.9589348555
    )
    private static let bedfordSackville = GeoBoundingBox(
        south: 44.730325235, west: -63.7670749334, north: 44.7991976903, east: -63.6536740292
    )
    private static let pictou = GeoBoundingBox(
        south: 45.5052687523, west: -62.6782668256, north: 45.5917443499, east: -62.6391172242
    )
    private static let truro = GeoBoundingBox(
        south: 45.3559706473, west: -63.355277766, north: 45.4412598116, east: -63.1671033846
    )

    /// Why nothing at all could be asked.
    public enum Refusal: Error, Equatable, Sendable {
        /// The parcel has no rings. Distinct from the parcel being outside every
        /// study area, and from the rasters showing no water on it.
        case noBoundary
    }

    /// Why one half of the lookup could not be asked.
    public enum SourceRefusal: Error, Equatable, Sendable {
        case licenceNotAccepted
        case noServiceURL
        case malformedURL
    }

    public struct RiverRequest: Sendable, Equatable {
        public let url: URL
        public let body: String
        public let layer: RiverLayer
    }

    public struct CoastalRequest: Sendable, Equatable {
        public let url: URL
        public let scenario: CoastalScenario
        public let bounds: GeoBoundingBox
        public let widthPx: Int
        public let heightPx: Int
    }

    /// Everything to send about one parcel, and every reason something is
    /// missing.
    ///
    /// The river list being empty and `river` carrying a refusal are different
    /// answers, and the fetcher reports them differently: no requests means the
    /// parcel is outside every published study area, and a refusal means the
    /// study areas were never consulted.
    public struct Plan: Sendable, Equatable {
        public let river: Result<[RiverRequest], SourceRefusal>
        public let coastal: [Result<CoastalRequest, SourceRefusal>]
    }

    /// Every flood request for `parts`.
    public static func plan(
        for parts: [PolygonHitTest.PolygonPart],
        clearance: ProvinceLicenceClearance
    ) throws(Refusal) -> Plan {
        let rings = MappedFeatureQuery.arcGISRings(from: parts)
        guard !rings.isEmpty, let bounds = boundingBox(of: parts) else { throw .noBoundary }

        let river: Result<[RiverRequest], SourceRefusal>
        do {
            river = .success(try riverRequests(rings: rings, bounds: bounds, clearance: clearance))
        } catch {
            river = .failure(error)
        }

        var coastal: [Result<CoastalRequest, SourceRefusal>] = []
        for scenario in CoastalScenario.allCases {
            do {
                coastal.append(
                    .success(try coastalRequest(scenario, bounds: bounds, clearance: clearance))
                )
            } catch {
                coastal.append(.failure(error))
            }
        }
        return Plan(river: river, coastal: coastal)
    }

    /// The study-area requests for a parcel, empty when it is outside every
    /// published extent.
    ///
    /// Filtering by extent before asking is the web's behaviour and is what
    /// makes the empty case meaningful: eight requests that all found nothing
    /// and zero requests sent are different answers.
    static func riverRequests(
        rings: [PolygonHitTest.Ring],
        bounds: GeoBoundingBox,
        clearance: ProvinceLicenceClearance
    ) throws(SourceRefusal) -> [RiverRequest] {
        // The extent test comes before the licence gate on purpose. The four
        // extents are constants in this app, not something the service is asked
        // for, so "outside every study area" is answerable without consulting
        // the restricted layer — and it is a true statement about the mapping
        // programme whether or not the user has accepted the licence. The gate
        // still stands in front of every request that would reach the service.
        let relevant = riverLayers.filter { $0.extent.intersects(bounds) }
        guard !relevant.isEmpty else { return [] }

        guard clearance.allows(.publishedRiverFloodZones) else { throw .licenceNotAccepted }
        guard let service = LayerCatalog.descriptor(for: .publishedRiverFloodZones)?.serviceURL
        else { throw .noServiceURL }
        var base = service.absoluteString
        while base.hasSuffix("/") {
            base.removeLast()
        }

        let body = [
            ("f", "json"),
            ("where", "1=1"),
            ("geometry", MappedFeatureQuery.geometryJSON(rings)),
            ("geometryType", "esriGeometryPolygon"),
            ("inSR", "4326"),
            ("spatialRel", "esriSpatialRelIntersects"),
            ("outFields", "OBJECTID"),
            ("returnGeometry", "false"),
        ]
        .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
        .joined(separator: "&")

        var requests: [RiverRequest] = []
        requests.reserveCapacity(relevant.count)
        for layer in relevant {
            guard let url = URL(string: "\(base)/\(layer.sublayer)/query") else {
                throw .malformedURL
            }
            requests.append(RiverRequest(url: url, body: body, layer: layer))
        }
        return requests
    }

    /// One raster export, sized to the parcel's own bounds.
    static func coastalRequest(
        _ scenario: CoastalScenario,
        bounds: GeoBoundingBox,
        clearance: ProvinceLicenceClearance
    ) throws(SourceRefusal) -> CoastalRequest {
        guard clearance.allows(scenario.layerID) else { throw .licenceNotAccepted }
        guard let service = LayerCatalog.descriptor(for: scenario.layerID)?.serviceURL else {
            throw .noServiceURL
        }
        var base = service.absoluteString
        while base.hasSuffix("/") {
            base.removeLast()
        }

        let sample = coastalSample(for: bounds)
        // Insertion order is the web's `URLSearchParams` order, and this render
        // is cached by URL at the service and at every CDN in front of it.
        let query = [
            ("f", "image"),
            (
                "bbox",
                [sample.bounds.west, sample.bounds.south, sample.bounds.east, sample.bounds.north]
                    .map(ArcGISExportURL.jsNumber).joined(separator: ",")
            ),
            ("bboxSR", "4326"),
            ("imageSR", "4326"),
            ("size", "\(sample.widthPx),\(sample.heightPx)"),
            ("format", "png32"),
            ("transparent", "true"),
        ]
        .map { "\(ArcGISExportURL.formURLEncoded($0.0))=\(ArcGISExportURL.formURLEncoded($0.1))" }
        .joined(separator: "&")

        guard let url = URL(string: "\(base)/export?\(query)") else { throw .malformedURL }
        return CoastalRequest(
            url: url, scenario: scenario, bounds: sample.bounds,
            widthPx: sample.widthPx, heightPx: sample.heightPx
        )
    }

    /// The box to render and the pixel grid to render it on, fitted so that the
    /// two have exactly the same shape.
    ///
    /// This is a deliberate divergence from the web, and it is a correction. The
    /// web asks for a fixed 384-wide image and caps the height at 384, so a lot
    /// taller than it is wide is requested on a grid that does not match the
    /// shape of the ground asked for. ArcGIS resolves that mismatch by widening
    /// the extent it draws, and `f=image` returns no metadata saying it did — so
    /// the caller then reads pixels covering more ground than it asked about,
    /// against the coordinates it asked about. Every percentage that comes out
    /// of a tall parcel that way is unsupported.
    ///
    /// Fitting the box to the grid instead of the grid to the box removes the
    /// mismatch: the service is asked for exactly the extent it will draw. The
    /// box grows outward from the parcel, never inward, and the extra ground is
    /// discarded by the point-in-polygon test at sample time.
    static func coastalSample(
        for bounds: GeoBoundingBox
    ) -> (bounds: GeoBoundingBox, widthPx: Int, heightPx: Int) {
        // A parcel can be a single point in a broken record. Give it a span
        // rather than dividing by zero.
        var fitted = bounds
        let minimumSpan = 0.00001
        if fitted.east - fitted.west < minimumSpan {
            let pad = (minimumSpan - (fitted.east - fitted.west)) / 2
            fitted.west -= pad
            fitted.east += pad
        }
        if fitted.north - fitted.south < minimumSpan {
            let pad = (minimumSpan - (fitted.north - fitted.south)) / 2
            fitted.south -= pad
            fitted.north += pad
        }

        let latitudeSpan = fitted.north - fitted.south
        let longitudeSpan = fitted.east - fitted.west
        let maximum = Double(coastalSampleWidthPx)

        // The long side gets the full 384 pixels, so neither dimension can run
        // away on a sliver of a lot.
        let widthPx: Int
        let heightPx: Int
        if longitudeSpan >= latitudeSpan {
            widthPx = coastalSampleWidthPx
            heightPx = Swift.max(
                1,
                Int((maximum * (latitudeSpan / longitudeSpan)).rounded(.toNearestOrAwayFromZero))
            )
        } else {
            heightPx = coastalSampleWidthPx
            widthPx = Swift.max(
                1,
                Int((maximum * (longitudeSpan / latitudeSpan)).rounded(.toNearestOrAwayFromZero))
            )
        }

        // Rounding to whole pixels leaves the grid slightly off the box's own
        // shape, so the box is grown to match the grid exactly. Growing is safe
        // in a way shrinking would not be: the parcel stays wholly inside.
        let wantedLongitudeSpan = latitudeSpan * (Double(widthPx) / Double(heightPx))
        if wantedLongitudeSpan > longitudeSpan {
            let pad = (wantedLongitudeSpan - longitudeSpan) / 2
            fitted.west -= pad
            fitted.east += pad
        } else {
            let wantedLatitudeSpan = longitudeSpan * (Double(heightPx) / Double(widthPx))
            let pad = (wantedLatitudeSpan - latitudeSpan) / 2
            fitted.south -= pad
            fitted.north += pad
        }
        return (fitted, widthPx, heightPx)
    }

    /// The smallest box holding every ring, or `nil` when there are none.
    static func boundingBox(of parts: [PolygonHitTest.PolygonPart]) -> GeoBoundingBox? {
        var box: GeoBoundingBox?
        for part in parts {
            for ring in part {
                for point in ring {
                    guard var current = box else {
                        box = GeoBoundingBox(
                            south: point.lat, west: point.lng,
                            north: point.lat, east: point.lng
                        )
                        continue
                    }
                    current.south = Swift.min(current.south, point.lat)
                    current.west = Swift.min(current.west, point.lng)
                    current.north = Swift.max(current.north, point.lat)
                    current.east = Swift.max(current.east, point.lng)
                    box = current
                }
            }
        }
        return box
    }
}

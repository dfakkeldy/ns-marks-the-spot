import GeoCore
import MapKit
import NSDataServices

/// One parcel outline on the map, and what it is doing there.
///
/// Carries the rings NSPRD sent rather than a `MKPolygon`, so the desired state
/// stays a value that can be compared and tested without a map view.
nonisolated struct ParcelShape: Identifiable, Equatable, Sendable {
    /// What the outline is saying, which is what decides how it is drawn.
    ///
    /// The web restyles the whole parcel layer when the selection moves; the
    /// colours here are its interactive styling, so the same parcel looks the
    /// same on both surfaces.
    enum Role: Equatable, Sendable {
        /// The parcel the user asked about: outline only, no fill, so the
        /// imagery underneath stays readable.
        case selected
        /// Named as advertised in a current municipal tax-sale notice.
        ///
        /// Filled, unlike the selection, because this is a set of parcels the
        /// user is scanning for rather than one they are reading a boundary
        /// against.
        case taxSale
        /// Drawn for context around the selection.
        case context
    }

    let pid: String
    let role: Role
    /// Outer ring first within each part, exactly as decoded.
    let parts: [PolygonHitTest.PolygonPart]

    var id: String { pid }

    /// The shapes for a collection, with `pid` selected.
    ///
    /// Features whose boundary was not supplied or could not be read produce no
    /// shape — there is nothing to draw and nothing this may invent. What the
    /// map must not do is let that absence read as the parcel not existing, so
    /// whatever presents the selection says so in words; see
    /// `ParcelSelection.boundaryNotice`.
    /// The selection wins over the tax-sale styling, as it does on the web: a
    /// listed parcel the user has selected is being read as a boundary, and the
    /// panel beside it already says it is listed.
    static func shapes(
        for collection: ParcelFeatureCollection,
        selecting pid: String?,
        taxSalePIDs: Set<String> = []
    ) -> [ParcelShape] {
        collection.identifiedFeatures.compactMap { feature in
            let parts = feature.boundary.parts
            guard !parts.isEmpty else { return nil }
            let role: Role = if feature.pid == pid {
                .selected
            } else if taxSalePIDs.contains(feature.pid) {
                .taxSale
            } else {
                .context
            }
            return ParcelShape(pid: feature.pid, role: role, parts: parts)
        }
    }
}

/// An `MKPolygon` that remembers which parcel it came from.
///
/// One polygon per part: a parcel split by a road is several shapes, and MapKit
/// draws each with its own renderer.
nonisolated final class ParcelPolygon: MKPolygon {
    /// Set immediately after construction — `MKPolygon`'s initialisers are the
    /// only way to build one, and they are not open to a subclass's stored
    /// property.
    var pid: String = ""
    var role: ParcelShape.Role = .context

    /// Every polygon a shape draws as, holes included.
    static func polygons(for shape: ParcelShape) -> [ParcelPolygon] {
        shape.parts.compactMap { part in
            guard let outer = part.first else { return nil }
            // Rings after the first are holes cut out of it. Handing them to
            // MapKit as interior polygons is what keeps a right-of-way through
            // a lot from being drawn as part of the lot.
            let holes = part.dropFirst().map { ring in
                MKPolygon(coordinates: coordinates(ring), count: ring.count)
            }
            let polygon = ParcelPolygon(
                coordinates: coordinates(outer),
                count: outer.count,
                interiorPolygons: holes.isEmpty ? nil : holes
            )
            polygon.pid = shape.pid
            polygon.role = shape.role
            return polygon
        }
    }

    private static func coordinates(_ ring: [GeoPoint]) -> [CLLocationCoordinate2D] {
        ring.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
    }
}

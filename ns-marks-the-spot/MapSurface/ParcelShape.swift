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
        /// The selection, while the map is reading historical records.
        ///
        /// A different outline colour from `selected`, as on the web: the two
        /// modes answer different questions — what is for sale now, and what
        /// changed hands before — and a parcel that looks identical in both
        /// invites a dated result to be read as a current offering.
        case selectedHistorical
        /// Named in a published historical tax-sale record.
        case historicalTaxSale
        /// Drawn for context around the selection.
        case context
    }

    let pid: String
    let role: Role
    /// Outer ring first within each part, exactly as decoded.
    let parts: [PolygonHitTest.PolygonPart]

    var id: String { pid }

    /// Whether any of this parcel's boundary crosses the given ground or lies
    /// inside it.
    ///
    /// Edge by edge rather than box to box. A box test says yes to a parcel
    /// that merely brackets the frame, and — the case that matters — to one so
    /// large it holds the whole frame inside a single face, which strokes its
    /// boundary somewhere off the page entirely.
    func boundaryReaches(_ bounds: GeoBoundingBox) -> Bool {
        parts.contains { part in part.contains { bounds.meets(ring: $0) } }
    }

    /// Whether the given ground lies wholly inside this parcel.
    ///
    /// Only meaningful once `boundaryReaches` has said no: a frame no edge
    /// crosses is entirely in or entirely out, so its centre decides it. The
    /// centre and the crossings it is counted by live in the projected plane
    /// the boundary is drawn in.
    func surrounds(_ bounds: GeoBoundingBox) -> Bool {
        bounds.liesWithin(parts)
    }

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
        taxSalePIDs: Set<String> = [],
        historicalPIDs: Set<String> = []
    ) -> [ParcelShape] {
        collection.identifiedFeatures.compactMap { feature in
            let parts = feature.boundary.parts
            guard !parts.isEmpty else { return nil }
            let role: Role
            if feature.pid == pid {
                // Historical only when the parcel is not also currently
                // listed: a property in both is for sale now, and that is the
                // more consequential of the two things to be looking at.
                role = historicalPIDs.contains(feature.pid)
                    && !taxSalePIDs.contains(feature.pid)
                    ? .selectedHistorical
                    : .selected
            } else if taxSalePIDs.contains(feature.pid) {
                role = .taxSale
            } else if historicalPIDs.contains(feature.pid) {
                role = .historicalTaxSale
            } else {
                role = .context
            }
            return ParcelShape(pid: feature.pid, role: role, parts: parts)
        }
    }
}

/// The dot a listed parcel is drawn as while its boundary is too small to see.
///
/// Only the listed roles get one. A context parcel needs no marker: it is drawn
/// for the boundary the user is reading against, and at an overview zoom there
/// is no boundary to read.
nonisolated struct ParcelOverviewMarker: Identifiable, Equatable, Sendable {
    let pid: String
    let role: ParcelShape.Role
    let point: GeoPoint

    var id: String { pid }

    init?(shape: ParcelShape) {
        switch shape.role {
        case .taxSale, .historicalTaxSale, .selected, .selectedHistorical:
            break
        case .context:
            return nil
        }
        guard let point = ParcelMarkers.representativePoint(parts: shape.parts) else {
            return nil
        }
        pid = shape.pid
        role = shape.role
        self.point = point
    }
}

/// One overview marker on the map.
nonisolated final class ParcelOverviewAnnotation: MKPointAnnotation,
    MapKitAnnotationIdentifying
{
    let mapAnnotationID: String
    let role: ParcelShape.Role
    let isSelected: Bool

    init(marker: ParcelOverviewMarker) {
        mapAnnotationID = MapController.parcelOverviewPrefix + marker.pid
        role = marker.role
        isSelected = marker.role == .selected || marker.role == .selectedHistorical
        super.init()
        coordinate = CLLocationCoordinate2D(
            latitude: marker.point.lat, longitude: marker.point.lng
        )
    }
}

/// The circle an overview marker is drawn as.
///
/// The web's interactive styling: a white ring around a filled dot, the current
/// listings in the tax-sale red and the historical ones in its purple, so a
/// dated record is never mistaken for something on offer now.
nonisolated enum ParcelOverviewMarkerImage {
    static func image(role: ParcelShape.Role, isSelected: Bool) -> UIImage {
        let radius: CGFloat = isSelected ? 9 : 7
        let width: CGFloat = isSelected ? 3 : 1.5
        let size = CGSize(width: (radius + width) * 2, height: (radius + width) * 2)
        let fill: UIColor
        switch role {
        case .historicalTaxSale, .selectedHistorical:
            fill = UIColor(featureHex: "#5a4385")
        case .taxSale, .selected, .context:
            fill = UIColor(featureHex: "#be4d3c")
        }
        return UIGraphicsImageRenderer(size: size).image { _ in
            let circle = UIBezierPath(
                ovalIn: CGRect(x: width, y: width, width: radius * 2, height: radius * 2)
            )
            fill.withAlphaComponent(isSelected ? 1 : 0.85).setFill()
            circle.fill()
            UIColor.white.setStroke()
            circle.lineWidth = width
            circle.stroke()
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

import GeoCore
import MapKit
import UIKit

/// One of the user's own vector layers, as the map surface draws it.
///
/// The record and the features together, because the record carries what the
/// features are drawn in — the layer colour a per-feature simplestyle property
/// may override — and what a tapped feature says about where it came from.
nonisolated struct UserVectorDrawing: Identifiable, Equatable, Sendable {
    var record: UserVectorLayerRecord
    var parsed: ParsedVector

    var id: String { record.id }

    /// Every overlay this layer draws as, in feature order.
    ///
    /// Point geometry produces none. A point is drawn as an annotation, so it
    /// can be tapped and can carry its callout — the same split the catalogued
    /// feature layers make.
    func overlays() -> [any MKOverlay & WebDrawOrdered] {
        parsed.features.flatMap { feature in
            overlays(for: feature.geometry, feature: feature)
        }
    }

    private func overlays(
        for geometry: GeoJsonGeometry?, feature: GeoJsonFeature
    ) -> [any MKOverlay & WebDrawOrdered] {
        guard let geometry else { return [] }
        let style = VectorStyle.style(for: feature, layerColorHex: record.colorHex)
        switch geometry {
        case .point, .multiPoint:
            return []
        case .lineString(let line):
            return polylines([line], feature: feature, style: style)
        case .multiLineString(let lines):
            return polylines(lines, feature: feature, style: style)
        case .polygon(let rings):
            return polygons([rings], feature: feature, style: style)
        case .multiPolygon(let parts):
            return polygons(parts, feature: feature, style: style)
        case .collection(let geometries):
            return geometries.flatMap { overlays(for: $0, feature: feature) }
        }
    }

    private func polygons(
        _ parts: [[[GeoJsonPosition]]], feature: GeoJsonFeature, style: UserVectorStyle
    ) -> [any MKOverlay & WebDrawOrdered] {
        parts.compactMap { rings in
            guard let outer = rings.first, outer.count >= 3 else { return nil }
            // Rings after the first are holes. A lot with a right-of-way cut
            // out of it must not be drawn over the strip it excludes.
            let holes = rings.dropFirst().map { ring in
                MKPolygon(coordinates: Self.coordinates(ring), count: ring.count)
            }
            let coordinates = Self.coordinates(outer)
            let polygon = UserVectorPolygon(
                coordinates: coordinates,
                count: coordinates.count,
                interiorPolygons: holes.isEmpty ? nil : holes
            )
            polygon.layerID = record.id
            polygon.featureID = feature.id
            polygon.style = style
            return polygon
        }
    }

    private func polylines(
        _ lines: [[GeoJsonPosition]], feature: GeoJsonFeature, style: UserVectorStyle
    ) -> [any MKOverlay & WebDrawOrdered] {
        lines.compactMap { line in
            guard line.count >= 2 else { return nil }
            let coordinates = Self.coordinates(line)
            let polyline = UserVectorPolyline(coordinates: coordinates, count: coordinates.count)
            polyline.layerID = record.id
            polyline.featureID = feature.id
            polyline.style = style
            return polyline
        }
    }

    /// Every point this layer draws as an annotation, in feature order.
    func annotations() -> [UserVectorAnnotation] {
        parsed.features.flatMap { feature in
            points(in: feature.geometry).map { position in
                UserVectorAnnotation(
                    position: position,
                    feature: feature,
                    record: record,
                    style: VectorStyle.style(for: feature, layerColorHex: record.colorHex)
                )
            }
        }
    }

    private func points(in geometry: GeoJsonGeometry?) -> [GeoJsonPosition] {
        switch geometry {
        case .point(let position): return [position]
        case .multiPoint(let positions): return positions
        case .collection(let geometries): return geometries.flatMap(points(in:))
        case .none, .lineString, .multiLineString, .polygon, .multiPolygon: return []
        }
    }

    private static func coordinates(_ ring: [GeoJsonPosition]) -> [CLLocationCoordinate2D] {
        ring.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
    }
}

/// Where the user's own layers sit in the web's drawing order: above every
/// catalogued vector layer, because they are what the user is working on.
///
/// A `nonisolated` holder rather than a global `let`, which this target's
/// default isolation would put on the main actor and out of reach of the
/// overlay classes below.
nonisolated enum UserVectorDrawOrder {
    static let value = OverlayZIndex.drawOrder(OverlayZIndex.userVector, in: .pane)
}

/// The shape the user is part-way through drawing.
///
/// Its own overlay, drawn dashed and above everything else, because it is not
/// data yet: a rubber band between two taps is a gesture in progress, and
/// drawing it like a saved feature would say the layer already holds it.
nonisolated struct VectorDraftPreview: Equatable, Sendable {
    var shape: VectorEditShape
    var vertices: [GeoJsonPosition]
    var colorHex: String

    /// The line through the vertices so far, closed for an area once it is a
    /// shape rather than a corner.
    func overlay() -> VectorDraftPolyline? {
        guard vertices.count >= 2 else { return nil }
        var positions = vertices
        if shape == .area, vertices.count >= 3, let first = vertices.first {
            positions.append(first)
        }
        let coordinates = positions.map {
            CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng)
        }
        let polyline = VectorDraftPolyline(coordinates: coordinates, count: coordinates.count)
        polyline.colorHex = colorHex
        return polyline
    }

    /// A handle on every vertex placed so far, so the user can see what they
    /// have put down — including the single tap of a point, which has no line.
    func handles() -> [VectorDraftVertexAnnotation] {
        vertices.enumerated().map { index, position in
            VectorDraftVertexAnnotation(index: index, position: position, colorHex: colorHex)
        }
    }
}

/// The rubber band itself.
nonisolated final class VectorDraftPolyline: MKPolyline, WebDrawOrdered {
    var colorHex: String = "#d55e00"

    // Above the finished layers: the user is looking at what they are drawing.
    var webDrawOrder: Int { UserVectorDrawOrder.value + 1 }
}

/// Where the selected feature can be picked up and carried.
///
/// A single handle at the middle of the shape rather than dragging the shape
/// itself, which is what the browser does. On a phone a drag that starts on a
/// polygon is already the pan gesture, and stealing it would leave a user
/// unable to move the map while anything is selected. One handle keeps both
/// gestures. It carries multi-part geometry the same way it carries a square,
/// because the same offset applies to every part.
nonisolated struct VectorMoveHandle: Equatable, Sendable {
    var featureID: String
    var centre: GeoJsonPosition
    var colorHex: String

    init?(feature: GeoJsonFeature, colorHex: String) {
        guard let id = feature.id, let geometry = feature.geometry else { return nil }
        let positions = geometry.positions
        guard !positions.isEmpty else { return nil }
        // The mean of the vertices, not the centroid of the area: it is cheap,
        // it is inside anything convex, and this is a grab handle rather than a
        // measurement — nothing is reported from where it sits.
        let lat = positions.reduce(0) { $0 + $1.lat } / Double(positions.count)
        let lng = positions.reduce(0) { $0 + $1.lng } / Double(positions.count)
        featureID = id
        centre = GeoJsonPosition(lng: lng, lat: lat)
        self.colorHex = colorHex
    }

    func annotation() -> VectorMoveHandleAnnotation {
        VectorMoveHandleAnnotation(featureID: featureID, position: centre, colorHex: colorHex)
    }
}

/// The handle that carries the whole feature.
nonisolated final class VectorMoveHandleAnnotation: MKPointAnnotation,
    MapKitAnnotationIdentifying
{
    let mapAnnotationID: String
    let featureID: String
    let colorHex: String
    /// Where the handle was before this drag, so the distance it travelled can
    /// be applied to the shape it belongs to.
    let origin: GeoJsonPosition

    init(featureID: String, position: GeoJsonPosition, colorHex: String) {
        mapAnnotationID = "move-\(featureID)"
        self.featureID = featureID
        self.colorHex = colorHex
        origin = position
        super.init()
        coordinate = CLLocationCoordinate2D(latitude: position.lat, longitude: position.lng)
    }
}

/// One placed vertex of the shape being drawn.
nonisolated final class VectorDraftVertexAnnotation: MKPointAnnotation,
    MapKitAnnotationIdentifying
{
    let mapAnnotationID: String
    let colorHex: String

    init(index: Int, position: GeoJsonPosition, colorHex: String) {
        mapAnnotationID = "draft-vertex-\(index)"
        self.colorHex = colorHex
        super.init()
        coordinate = CLLocationCoordinate2D(latitude: position.lat, longitude: position.lng)
    }
}

/// The vertices of the feature the user has selected, as handles they can drag.
///
/// Every part gets them, multi-part geometry included. The rings come from
/// `VectorEdit.rings(of:)`, which lays a whole feature's rings end to end, and
/// the edit that a dragged handle sends back is addressed by the same
/// flattened index — so an island in a multi-polygon is reshaped by the same
/// two numbers as a lone square, with no part index for this view to guess at.
/// That matters for imported ground: a coastline lot arriving as a
/// MultiPolygon is ordinary, and it used to be the one shape the app would not
/// let its owner correct.
nonisolated struct VectorSelectionHandles: Equatable, Sendable {
    /// Past this many corners the handles stop being offered.
    ///
    /// A traced coastline can carry tens of thousands of positions, and one
    /// map pin per position is a frozen map rather than an editable shape.
    /// Nobody hand-drags a thousand corners on a phone, so the cap costs no
    /// real editing; what it protects is the ability to look at an imported
    /// boundary at all. The shape can still be carried whole, renamed and
    /// deleted, and the panel says so rather than leaving a selection that
    /// silently grew no handles.
    static let maximumHandles = 1_000

    var featureID: String
    var rings: [[GeoJsonPosition]]
    var colorHex: String

    /// Whether this feature's corners are few enough to drag.
    static func isReshapable(_ feature: GeoJsonFeature) -> Bool {
        guard let geometry = feature.geometry else { return false }
        let rings = VectorEdit.rings(of: geometry)
        guard !rings.isEmpty else { return false }
        return handleCount(rings) <= maximumHandles
    }

    /// What `handles()` would put on the map. A closed ring's last position
    /// repeats its first and gets one handle between them, so counting stored
    /// positions instead would refuse a thousand-corner polygon for having a
    /// thousand and one.
    private static func handleCount(_ rings: [[GeoJsonPosition]]) -> Int {
        rings.reduce(0) { total, positions in
            let closed = positions.count > 1 && positions.first == positions.last
            return total + positions.count - (closed ? 1 : 0)
        }
    }

    init?(feature: GeoJsonFeature, colorHex: String) {
        guard let id = feature.id, Self.isReshapable(feature),
            let geometry = feature.geometry
        else { return nil }
        rings = VectorEdit.rings(of: geometry)
        featureID = id
        self.colorHex = colorHex
    }

    func handles() -> [VectorVertexHandleAnnotation] {
        var annotations: [VectorVertexHandleAnnotation] = []
        for (ring, positions) in rings.enumerated() {
            for (vertex, position) in positions.enumerated() {
                // A closed ring's last position is its first one. Two handles
                // on one corner would let the user drag the copy and watch the
                // shape not move.
                if positions.count > 1, vertex == positions.count - 1,
                    positions.first == positions.last
                {
                    continue
                }
                annotations.append(
                    VectorVertexHandleAnnotation(
                        featureID: featureID, ring: ring, vertex: vertex,
                        position: position, colorHex: colorHex
                    )
                )
            }
        }
        return annotations
    }
}

/// One draggable vertex of the selected feature.
nonisolated final class VectorVertexHandleAnnotation: MKPointAnnotation,
    MapKitAnnotationIdentifying
{
    let mapAnnotationID: String
    let featureID: String
    let ring: Int
    let vertex: Int
    let colorHex: String

    init(featureID: String, ring: Int, vertex: Int, position: GeoJsonPosition, colorHex: String) {
        mapAnnotationID = "vertex-\(featureID)-\(ring)-\(vertex)"
        self.featureID = featureID
        self.ring = ring
        self.vertex = vertex
        self.colorHex = colorHex
        super.init()
        coordinate = CLLocationCoordinate2D(latitude: position.lat, longitude: position.lng)
    }
}

/// The handle a draft vertex is drawn as: small, hollow and unmistakably not a
/// marker the layer holds.
nonisolated enum VectorDraftHandleImage {
    private static let cache = MarkerImageCache()

    static func image(colorHex: String) -> UIImage {
        cache.image(for: colorHex) { render(colorHex: colorHex) }
    }

    private static func render(colorHex: String) -> UIImage {
        let radius: CGFloat = 5
        let width: CGFloat = 2
        let size = CGSize(width: (radius + width) * 2, height: (radius + width) * 2)
        return UIGraphicsImageRenderer(size: size).image { _ in
            let circle = UIBezierPath(
                ovalIn: CGRect(x: width, y: width, width: radius * 2, height: radius * 2)
            )
            UIColor.white.setFill()
            circle.fill()
            UIColor(featureHex: colorHex).setStroke()
            circle.lineWidth = width
            circle.stroke()
        }
    }
}

/// The grab handle that carries a whole feature: filled, larger than a vertex
/// handle, and marked with the four-way arrow every platform uses for "move".
nonisolated enum VectorMoveHandleImage {
    private static let cache = MarkerImageCache()

    static func image(colorHex: String) -> UIImage {
        cache.image(for: colorHex) { render(colorHex: colorHex) }
    }

    private static func render(colorHex: String) -> UIImage {
        let diameter: CGFloat = 30
        let size = CGSize(width: diameter, height: diameter)
        return UIGraphicsImageRenderer(size: size).image { _ in
            let circle = UIBezierPath(
                ovalIn: CGRect(x: 1, y: 1, width: diameter - 2, height: diameter - 2)
            )
            UIColor(featureHex: colorHex).setFill()
            circle.fill()
            UIColor.white.setStroke()
            circle.lineWidth = 2
            circle.stroke()

            let glyph = UIImage(systemName: "arrow.up.and.down.and.arrow.left.and.right")?
                .withTintColor(.white, renderingMode: .alwaysOriginal)
            glyph?.draw(
                in: CGRect(x: diameter / 2 - 7, y: diameter / 2 - 7, width: 14, height: 14)
            )
        }
    }
}

/// An `MKPolygon` that remembers whose layer and which feature it came from.
nonisolated final class UserVectorPolygon: MKPolygon, WebDrawOrdered {
    var layerID: String = ""
    var featureID: String?
    var style = UserVectorStyle(
        strokeHex: "#d55e00", weight: 2, strokeOpacity: 1, fillHex: "#d55e00", fillOpacity: 0.2
    )

    var webDrawOrder: Int { UserVectorDrawOrder.value }
}

/// An `MKPolyline` that remembers whose layer and which feature it came from.
nonisolated final class UserVectorPolyline: MKPolyline, WebDrawOrdered {
    var layerID: String = ""
    var featureID: String?
    var style = UserVectorStyle(
        strokeHex: "#d55e00", weight: 2, strokeOpacity: 1, fillHex: "#d55e00", fillOpacity: 0.2
    )

    var webDrawOrder: Int { UserVectorDrawOrder.value }
}

/// A point from one of the user's layers.
///
/// It carries the callout the map shows on a tap, including the provenance
/// line: a marker the user imported has to say so, because everything else the
/// map draws a marker for is a published record.
nonisolated final class UserVectorAnnotation: MKPointAnnotation, MapKitAnnotationIdentifying {
    let mapAnnotationID: String
    let layerID: String
    let style: UserVectorStyle
    let provenance: String

    init(
        position: GeoJsonPosition,
        feature: GeoJsonFeature,
        record: UserVectorLayerRecord,
        style: UserVectorStyle
    ) {
        layerID = record.id
        // Layer-qualified: two imported layers can both hold a feature the
        // parser called `feature-1`, and an id that collided would select the
        // wrong one.
        mapAnnotationID = "\(record.id)/\(feature.id ?? "feature")"
        self.style = style
        let callout = VectorFeatureCallout(feature: feature, record: record)
        provenance = callout.provenance
        super.init()
        title = callout.title
        subtitle = callout.detail
        coordinate = CLLocationCoordinate2D(latitude: position.lat, longitude: position.lng)
    }
}

/// The dot a user's point is drawn as.
///
/// A fixed size in points rather than a circle on the ground: an imported
/// waypoint is a position, and a circle that grew with the zoom would read as a
/// measured radius around it that the file never claimed.
nonisolated enum UserVectorMarkerImage {
    private static let cache = MarkerImageCache()

    static func image(for style: UserVectorStyle) -> UIImage {
        let key = "\(style.fillHex)|\(style.fillOpacity)|\(style.strokeHex)|\(style.strokeOpacity)|\(style.weight)"
        return cache.image(for: key) { render(style) }
    }

    private static func render(_ style: UserVectorStyle) -> UIImage {
        let radius: CGFloat = 6
        let inset = CGFloat(style.weight)
        let size = CGSize(width: (radius + inset) * 2, height: (radius + inset) * 2)
        return UIGraphicsImageRenderer(size: size).image { _ in
            let circle = UIBezierPath(
                ovalIn: CGRect(x: inset, y: inset, width: radius * 2, height: radius * 2)
            )
            UIColor(featureHex: style.fillHex, alpha: style.fillOpacity).setFill()
            circle.fill()
            UIColor(featureHex: style.strokeHex, alpha: style.strokeOpacity).setStroke()
            circle.lineWidth = inset
            circle.stroke()
        }
    }
}

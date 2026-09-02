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
    /// The feature to draw with the just-committed halo, if any. Part of the
    /// drawing so the map's own diff sees it come and go.
    var highlightedFeatureID: String? = nil

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
                    style: VectorStyle.style(for: feature, layerColorHex: record.colorHex),
                    pointStyle: VectorStyle.pointStyle(for: feature, layerColorHex: record.colorHex),
                    hasPhotos: !PhotoDescriptor.read(from: feature.properties).isEmpty,
                    isHighlighted: feature.id != nil && feature.id == highlightedFeatureID
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

    /// One draggable corner, addressed the way `VectorEdit.moving` wants it.
    struct Corner: Equatable, Sendable {
        var ring: Int
        var vertex: Int
        var position: GeoJsonPosition
    }

    /// The corners a reader can move, in ring order, without the closing
    /// duplicate of a ring. The same list the handles are made from, so the
    /// panel's "corner 3 of 5" is the third handle on the map.
    static func corners(of rings: [[GeoJsonPosition]]) -> [Corner] {
        var corners: [Corner] = []
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
                corners.append(Corner(ring: ring, vertex: vertex, position: position))
            }
        }
        return corners
    }

    /// The reshapable corners of a feature; empty for one with too many, and
    /// for one with no id, which no edit could be addressed to.
    static func corners(of feature: GeoJsonFeature) -> [Corner] {
        guard feature.id != nil, isReshapable(feature), let geometry = feature.geometry else {
            return []
        }
        return corners(of: VectorEdit.rings(of: geometry))
    }

    func handles() -> [VectorVertexHandleAnnotation] {
        let corners = Self.corners(of: rings)
        return corners.enumerated().map { index, corner in
            VectorVertexHandleAnnotation(
                featureID: featureID, ring: corner.ring, vertex: corner.vertex,
                position: corner.position, colorHex: colorHex,
                ordinal: index + 1, total: corners.count
            )
        }
    }
}

/// The view a vertex or move handle is drawn in.
///
/// MapKit's contract for a draggable annotation view: the map view moves it
/// to `.starting`, `.canceling` and `.ending` on its own, and the implementer
/// moves it on to `.dragging` and back to `.none`. A plain `MKAnnotationView`
/// never does, so a handle was left in `.ending` after its first drag, handed
/// back by the reuse queue in that state, and could not be dragged again.
/// `super` is told the state MapKit set first, so the delegate still sees
/// `.starting` and `.ending`; the follow-on state is set straight after.
nonisolated final class VectorHandleAnnotationView: MKAnnotationView {
    override func setDragState(_ newState: MKAnnotationView.DragState, animated: Bool) {
        super.setDragState(newState, animated: animated)
        switch newState {
        case .starting:
            dragState = .dragging
        case .ending, .canceling:
            dragState = .none
        case .none, .dragging:
            break
        @unknown default:
            break
        }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        dragState = .none
    }
}

/// The handle a selected feature's corner is drawn as: a white disc with a
/// coloured rim and centre, on a 44-point canvas.
///
/// Unlike the small hollow draft dot on purpose: those cannot be dragged and
/// these can, and two handles that looked alike made the drag feel absent.
/// The canvas is the touch target; the disc is what is seen.
nonisolated enum VectorVertexHandleImage {
    private static let cache = MarkerImageCache()

    static let canvasSize: CGFloat = 44
    static let discDiameter: CGFloat = 22

    static func image(colorHex: String) -> UIImage {
        cache.image(for: colorHex) { render(colorHex: colorHex) }
    }

    private static func render(colorHex: String) -> UIImage {
        let canvas = canvasSize
        let colour = UIColor(featureHex: colorHex)
        let disc = CGRect(
            x: (canvas - discDiameter) / 2, y: (canvas - discDiameter) / 2,
            width: discDiameter, height: discDiameter
        )
        return UIGraphicsImageRenderer(size: CGSize(width: canvas, height: canvas)).image { _ in
            UIColor.white.setFill()
            UIBezierPath(ovalIn: disc).fill()
            let rim = UIBezierPath(ovalIn: disc.insetBy(dx: 1.5, dy: 1.5))
            rim.lineWidth = 3
            colour.setStroke()
            rim.stroke()
            colour.setFill()
            UIBezierPath(ovalIn: disc.insetBy(dx: 8, dy: 8)).fill()
        }
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
    /// Which corner this is of how many, as the panel counts them, so
    /// VoiceOver can tell four identical handles apart; a total of one is a
    /// point, not a corner.
    let ordinal: Int
    let total: Int

    init(
        featureID: String, ring: Int, vertex: Int, position: GeoJsonPosition, colorHex: String,
        ordinal: Int = 1, total: Int = 1
    ) {
        mapAnnotationID = "vertex-\(featureID)-\(ring)-\(vertex)"
        self.featureID = featureID
        self.ring = ring
        self.vertex = vertex
        self.colorHex = colorHex
        self.ordinal = ordinal
        self.total = total
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

    static let canvasSize: CGFloat = 44
    static let discDiameter: CGFloat = 36

    private static func render(colorHex: String) -> UIImage {
        // A 44-point canvas, the touch target the guidelines ask for; the
        // disc inside it is what is seen.
        let canvas = canvasSize
        let disc = CGRect(
            x: (canvas - discDiameter) / 2, y: (canvas - discDiameter) / 2,
            width: discDiameter, height: discDiameter
        )
        return UIGraphicsImageRenderer(size: CGSize(width: canvas, height: canvas)).image { _ in
            let circle = UIBezierPath(ovalIn: disc.insetBy(dx: 1, dy: 1))
            UIColor(featureHex: colorHex).setFill()
            circle.fill()
            UIColor.white.setStroke()
            circle.lineWidth = 2
            circle.stroke()

            let glyph = UIImage(systemName: "arrow.up.and.down.and.arrow.left.and.right")?
                .withTintColor(.white, renderingMode: .alwaysOriginal)
            glyph?.draw(
                in: CGRect(x: canvas / 2 - 9, y: canvas / 2 - 9, width: 18, height: 18)
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
    /// How the marker is drawn: solid by default, the file's own look when
    /// it gave one.
    let pointStyle: VectorStyle.PointStyle
    let provenance: String
    /// Set for photo-map / bulk-photo points so MapKit clusters them.
    let clusteringIdentifier: String?
    /// The point carries photos, and its marker says so.
    let hasPhotos: Bool
    /// Just committed: drawn with a halo for a moment.
    let isHighlighted: Bool

    init(
        position: GeoJsonPosition,
        feature: GeoJsonFeature,
        record: UserVectorLayerRecord,
        style: UserVectorStyle,
        pointStyle: VectorStyle.PointStyle? = nil,
        hasPhotos: Bool = false,
        isHighlighted: Bool = false
    ) {
        layerID = record.id
        self.pointStyle = pointStyle
            ?? VectorStyle.PointStyle(fillHex: style.fillHex, fillOpacity: 1, rimHex: "#ffffff")
        self.hasPhotos = hasPhotos
        self.isHighlighted = isHighlighted
        // Layer-qualified: two imported layers can both hold a feature the
        // parser called `feature-1`, and an id that collided would select the
        // wrong one.
        mapAnnotationID = "\(record.id)/\(feature.id ?? "feature")"
        self.style = style
        let callout = VectorFeatureCallout(feature: feature, record: record)
        provenance = callout.provenance
        // Layer-qualified: a cluster is opened as one card, and a card can
        // load photos from one layer's store. Two photo layers at one spot
        // stay two clusters. Only points that carry photos cluster: a plain
        // point drawn into a photo layer is not a photo, and a cluster that
        // counted it as one would be wrong.
        clusteringIdentifier = record.source == .photos && hasPhotos ? "nsmts-photos-\(record.id)" : nil
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
///
/// Twenty points of solid colour in a white casing, on a 44-point canvas.
/// The twelve-point ring at a quarter opacity this used to be took the
/// polygon fill default, and over dark imagery a point vanished the instant
/// it was deselected. The disc sits centred on the larger canvas so the halo
/// and the photo badge never move it off its coordinate; the canvas is the
/// touch target, at the guidelines' minimum.
nonisolated enum UserVectorMarkerImage {
    private static let cache = MarkerImageCache()

    static let discDiameter: CGFloat = 20
    static let canvasSize: CGFloat = 44
    static let haloDiameter: CGFloat = 34

    static func image(
        for style: VectorStyle.PointStyle, hasPhotos: Bool = false, isHighlighted: Bool = false
    ) -> UIImage {
        let key = "\(style.fillHex)|\(style.fillOpacity)|\(style.rimHex)|\(style.rimOpacity)|\(style.rimWidth)|\(hasPhotos)|\(isHighlighted)"
        return cache.image(for: key) {
            render(style, hasPhotos: hasPhotos, isHighlighted: isHighlighted)
        }
    }

    private static func render(
        _ style: VectorStyle.PointStyle, hasPhotos: Bool, isHighlighted: Bool
    ) -> UIImage {
        let canvas = canvasSize
        let colour = UIColor(featureHex: style.fillHex, alpha: style.fillOpacity)
        let discRect = CGRect(
            x: (canvas - discDiameter) / 2, y: (canvas - discDiameter) / 2,
            width: discDiameter, height: discDiameter
        )
        return UIGraphicsImageRenderer(size: CGSize(width: canvas, height: canvas)).image { _ in
            if isHighlighted {
                // The just-committed halo: the layer's colour, translucent.
                UIColor(featureHex: style.fillHex, alpha: 0.35).setFill()
                UIBezierPath(
                    ovalIn: CGRect(
                        x: (canvas - haloDiameter) / 2, y: (canvas - haloDiameter) / 2,
                        width: haloDiameter, height: haloDiameter
                    )
                ).fill()
            }
            // The whole disc is the fill; the rim is a ring stroked over its
            // edge, its width and opacity the file's when the file gave them.
            // Over, not instead: a transparent or translucent rim shows the
            // fill beneath it rather than a hole down to the map.
            let rim = CGFloat(style.rimWidth)
            colour.setFill()
            UIBezierPath(ovalIn: discRect).fill()
            if rim > 0 {
                let ring = UIBezierPath(ovalIn: discRect.insetBy(dx: rim / 2, dy: rim / 2))
                ring.lineWidth = rim
                UIColor(featureHex: style.rimHex, alpha: style.rimOpacity).setStroke()
                ring.stroke()
            }
            if hasPhotos {
                // A camera on a white badge at the disc's top right: a point
                // that carries photos says so before it is tapped.
                let badge = CGRect(x: discRect.maxX - 8, y: discRect.minY - 4, width: 12, height: 12)
                UIColor.white.setFill()
                UIBezierPath(ovalIn: badge).fill()
                UIImage(systemName: "camera.fill")?
                    .withTintColor(UIColor(featureHex: style.fillHex), renderingMode: .alwaysOriginal)
                    .draw(in: badge.insetBy(dx: 2.5, dy: 3))
            }
        }
    }
}

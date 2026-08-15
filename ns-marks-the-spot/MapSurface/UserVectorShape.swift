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
    static func image(for style: UserVectorStyle) -> UIImage {
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

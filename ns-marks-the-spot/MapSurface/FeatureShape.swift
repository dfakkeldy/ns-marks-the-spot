import GeoCore
import MapKit
import NSDataServices
import UIKit

/// One drawn feature from a viewport layer: what it is, where it is, and how it
/// looks.
///
/// Areal and linear geometry only — a point feature is a `FeatureMarker`,
/// because a well or an occurrence is drawn as a fixed-size dot on screen
/// rather than as a shape on the ground, and MapKit draws those through
/// annotations rather than overlays.
nonisolated struct FeatureShape: Identifiable, Equatable, Sendable {
    let id: String
    let layer: LayerID
    /// As decoded. Point and multi-point geometry produce no shape.
    let geometry: GeoJSONGeometry
    let style: VectorFeatureStyle
    let title: String
    let subtitle: String?
    /// What this feature says when it is tapped. Optional because a layer this
    /// app can draw but has no sourced account of must stay untappable rather
    /// than open a card that says less than the web's.
    let callout: FeatureCallout?

    /// Defaulted so a feature with nothing sourced to say is written that way
    /// deliberately, rather than every construction site having to repeat nil.
    init(
        id: String,
        layer: LayerID,
        geometry: GeoJSONGeometry,
        style: VectorFeatureStyle,
        title: String,
        subtitle: String?,
        callout: FeatureCallout? = nil
    ) {
        self.id = id
        self.layer = layer
        self.geometry = geometry
        self.style = style
        self.title = title
        self.subtitle = subtitle
        self.callout = callout
    }

    /// Where this layer sits in the web's drawing order, across both of
    /// Leaflet's stacking spaces.
    var zIndex: Int {
        OverlayZIndex.vectorDrawOrder(for: layer)
            ?? OverlayZIndex.drawOrder(OverlayZIndex.leafletOverlayPane, in: .pane)
    }
}

/// One drawn point from a viewport layer.
nonisolated struct FeatureMarker: Identifiable, Equatable, Sendable {
    let id: String
    let layer: LayerID
    let latitude: Double
    let longitude: Double
    let style: VectorFeatureStyle
    let title: String
    let subtitle: String?
    let callout: FeatureCallout?

    init(
        id: String,
        layer: LayerID,
        latitude: Double,
        longitude: Double,
        style: VectorFeatureStyle,
        title: String,
        subtitle: String?,
        callout: FeatureCallout? = nil
    ) {
        self.id = id
        self.layer = layer
        self.latitude = latitude
        self.longitude = longitude
        self.style = style
        self.title = title
        self.subtitle = subtitle
        self.callout = callout
    }
}

/// A hex colour as the catalog and the web write it.
///
/// Parsing here rather than in the package because the result is a `UIColor`;
/// the strings themselves stay hex all the way from the catalog to this point,
/// so the two surfaces compare as the same text. An unparseable string is
/// magenta rather than a silent clear: a colour this app could not read is a
/// mistake to see, not one to hide.
nonisolated extension UIColor {
    convenience init(featureHex hex: String, alpha: Double = 1) {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6 || digits.count == 3,
              let value = UInt32(
                  digits.count == 3
                      ? digits.flatMap { [$0, $0] }.map(String.init).joined()
                      : digits,
                  radix: 16
              )
        else {
            self.init(red: 1, green: 0, blue: 1, alpha: alpha)
            return
        }
        self.init(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: alpha
        )
    }
}

/// An `MKPolygon` that remembers which feature it came from.
nonisolated final class FeaturePolygon: MKPolygon {
    var featureID: String = ""
    var style = VectorFeatureStyle(strokeHex: "#000000", lineWidth: 1)
    var drawOrder = OverlayZIndex.drawOrder(OverlayZIndex.leafletOverlayPane, in: .pane)
}

/// An `MKPolyline` that remembers which feature it came from.
nonisolated final class FeaturePolyline: MKPolyline {
    var featureID: String = ""
    var style = VectorFeatureStyle(strokeHex: "#000000", lineWidth: 1)
    var drawOrder = OverlayZIndex.drawOrder(OverlayZIndex.leafletOverlayPane, in: .pane)
}

extension FeatureShape {
    /// Every MapKit overlay this shape draws as, holes included.
    ///
    /// A feature with no areal or linear geometry produces none, which is how a
    /// point that arrived on a polygon layer stops rather than becomes a dot
    /// the layer never promised to draw.
    func overlays() -> [any MKOverlay & WebDrawOrdered] {
        switch geometry {
        case .polygon(let part):
            return polygons(for: [part])
        case .multiPolygon(let parts):
            return polygons(for: parts)
        case .lineString(let points):
            return polylines(for: [points])
        case .multiLineString(let lines):
            return polylines(for: lines)
        case .point, .multiPoint:
            return []
        }
    }

    private func polygons(for parts: [PolygonHitTest.PolygonPart]) -> [any MKOverlay & WebDrawOrdered] {
        parts.compactMap { part in
            guard let outer = part.first else { return nil }
            // Rings after the first are holes: a policy area with a lake cut
            // out of it must not be drawn over the lake.
            let holes = part.dropFirst().map { ring in
                MKPolygon(coordinates: Self.coordinates(ring), count: ring.count)
            }
            let polygon = FeaturePolygon(
                coordinates: Self.coordinates(outer),
                count: outer.count,
                interiorPolygons: holes.isEmpty ? nil : holes
            )
            polygon.featureID = id
            polygon.style = style
            polygon.drawOrder = zIndex
            return polygon
        }
    }

    private func polylines(for lines: [[GeoPoint]]) -> [any MKOverlay & WebDrawOrdered] {
        lines.compactMap { line in
            guard line.count >= 2 else { return nil }
            let coordinates = Self.coordinates(line)
            let polyline = FeaturePolyline(coordinates: coordinates, count: coordinates.count)
            polyline.featureID = id
            polyline.style = style
            polyline.drawOrder = zIndex
            return polyline
        }
    }

    private static func coordinates(_ ring: [GeoPoint]) -> [CLLocationCoordinate2D] {
        ring.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
    }
}

/// The annotation a `FeatureMarker` is drawn as.
nonisolated final class FeatureMarkerAnnotation: MKPointAnnotation, MapKitAnnotationIdentifying {
    let mapAnnotationID: String
    let style: VectorFeatureStyle

    init(marker: FeatureMarker) {
        mapAnnotationID = marker.id
        style = marker.style
        super.init()
        title = marker.title
        subtitle = marker.subtitle
        coordinate = CLLocationCoordinate2D(
            latitude: marker.latitude, longitude: marker.longitude
        )
    }
}

/// The dot itself.
///
/// Drawn at a fixed size in points rather than as a circle on the ground,
/// because that is what the marker means: the record is *at* this coordinate to
/// whatever precision its accuracy band allows, and a circle scaled by zoom
/// would read as a measured radius around it.
nonisolated enum FeatureMarkerImage {
    static func image(for style: VectorFeatureStyle) -> UIImage {
        let radius = style.markerRadius ?? 5
        let inset = style.lineWidth
        let size = CGSize(
            width: (radius + inset) * 2, height: (radius + inset) * 2
        )
        return UIGraphicsImageRenderer(size: size).image { context in
            let rect = CGRect(
                x: inset, y: inset, width: radius * 2, height: radius * 2
            )
            let circle = UIBezierPath(ovalIn: rect)
            if let fillHex = style.fillHex {
                UIColor(featureHex: fillHex, alpha: style.fillOpacity).setFill()
                circle.fill()
            }
            UIColor(featureHex: style.strokeHex, alpha: style.strokeOpacity).setStroke()
            circle.lineWidth = style.lineWidth
            if let dashPattern = style.dashPattern {
                context.cgContext.saveGState()
                circle.setLineDash(
                    dashPattern.map { CGFloat($0) }, count: dashPattern.count, phase: 0
                )
            }
            circle.stroke()
            if style.dashPattern != nil {
                context.cgContext.restoreGState()
            }
        }
    }
}

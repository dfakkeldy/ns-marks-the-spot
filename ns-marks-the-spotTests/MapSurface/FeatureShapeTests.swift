import Foundation
import GeoCore
import MapKit
import NSDataServices
import Testing
@testable import ns_marks_the_spot

struct FeatureShapeTests {
    @Test func polygonRingsAfterTheFirstBecomeHoles() throws {
        let shape = makeShape(geometry: .polygon([outer, hole]))

        let overlays = shape.overlays()
        #expect(overlays.count == 1)
        let polygon = try #require(overlays.first as? FeaturePolygon)
        #expect(polygon.featureID == "og-1")
        #expect(polygon.interiorPolygons?.count == 1)
    }

    @Test func multiPolygonDrawsEveryPart() {
        let shape = makeShape(geometry: .multiPolygon([[outer], [outer]]))

        #expect(shape.overlays().count == 2)
    }

    @Test func lineGeometryDrawsAsPolylines() throws {
        let line = [GeoPoint(lat: 45, lng: -63), GeoPoint(lat: 45.1, lng: -63.1)]
        let shape = makeShape(geometry: .multiLineString([line, line]))

        let overlays = shape.overlays()
        #expect(overlays.count == 2)
        let polyline = try #require(overlays.first as? FeaturePolyline)
        #expect(polyline.pointCount == 2)
    }

    @Test func aSingleVertexLineDrawsNothing() {
        // Not a line on the ground; MapKit would take one point and draw an
        // invisible zero-length stroke, which reads as a feature that was drawn.
        let shape = makeShape(geometry: .lineString([GeoPoint(lat: 45, lng: -63)]))

        #expect(shape.overlays().isEmpty)
    }

    @Test func pointGeometryOnAShapeLayerDrawsNothing() {
        // A dot here would be a shape this layer never promised, invented from
        // geometry it cannot draw.
        let shape = makeShape(geometry: .point(GeoPoint(lat: 45, lng: -63)))

        #expect(shape.overlays().isEmpty)
        #expect(makeShape(geometry: .multiPoint([GeoPoint(lat: 45, lng: -63)])).overlays().isEmpty)
    }

    @Test func oldGrowthDrawsBeneathTheOtherVectorLayers() {
        // Its 190 is a tile-space number inside a pane the web parents to the
        // tile pane, so on the browser it sits under zoning and the well points
        // rather than between them.
        let policy = makeShape(geometry: .polygon([outer]))
        let zoning = FeatureShape(
            id: "z-1",
            layer: .zoningHalifax,
            geometry: .polygon([outer]),
            style: style,
            title: "z-1",
            subtitle: nil,
            callout: nil
        )

        #expect(policy.zIndex < zoning.zIndex)
    }

    @Test func anUnreadableColourDrawsMagentaRatherThanNothing() {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        UIColor(featureHex: "not-a-colour").getRed(&red, green: &green, blue: &blue, alpha: &alpha)

        #expect(red == 1 && green == 0 && blue == 1)
    }

    @Test func hexParsingAcceptsBothLengthsWithOrWithoutTheHash() {
        let long = UIColor(featureHex: "#166534")
        #expect(UIColor(featureHex: "166534") == long)
        #expect(UIColor(featureHex: "#fff") == UIColor(featureHex: "ffffff"))
    }

    private var outer: [GeoPoint] {
        [
            GeoPoint(lat: 45, lng: -63),
            GeoPoint(lat: 45, lng: -62),
            GeoPoint(lat: 46, lng: -62),
            GeoPoint(lat: 45, lng: -63)
        ]
    }

    private var hole: [GeoPoint] {
        [
            GeoPoint(lat: 45.2, lng: -62.8),
            GeoPoint(lat: 45.2, lng: -62.7),
            GeoPoint(lat: 45.3, lng: -62.7),
            GeoPoint(lat: 45.2, lng: -62.8)
        ]
    }

    private var style: VectorFeatureStyle {
        VectorFeatureStyle(strokeHex: "#166534", fillHex: "#166534", fillOpacity: 0.28, lineWidth: 1.7)
    }

    private func makeShape(geometry: GeoJSONGeometry) -> FeatureShape {
        FeatureShape(
            id: "og-1",
            layer: .oldGrowthPolicy,
            geometry: geometry,
            style: style,
            title: "og-1",
            subtitle: nil,
            callout: nil
        )
    }

    @Test func aStrokeNobodyCanSeeDoesNotMarkThePage() {
        let frame = PdfTemplate.template(.landscape).mapFrame
        let page = GeoBoundingBox(south: 45.6, west: -61.4, north: 45.7, east: -61.3)
        let crossing = GeoJSONGeometry.lineString([
            GeoPoint(lat: 45.65, lng: -61.5), GeoPoint(lat: 45.65, lng: -61.2)
        ])
        // The compositor draws nothing for a fully transparent or zero-width
        // stroke, so neither may count as ink for the legend to key.
        let transparent = FeatureShape(
            id: "f-1", layer: .oldGrowthPolicy, geometry: crossing,
            style: style,
            printStyle: VectorFeatureStyle(
                strokeHex: "#333333", strokeOpacity: 0, lineWidth: 1
            ),
            title: "f-1", subtitle: nil
        )
        #expect(!transparent.marks(page, mapFrame: frame))
        let hairline = FeatureShape(
            id: "f-2", layer: .oldGrowthPolicy, geometry: crossing,
            style: style,
            printStyle: VectorFeatureStyle(strokeHex: "#333333", lineWidth: 0),
            title: "f-2", subtitle: nil
        )
        #expect(!hairline.marks(page, mapFrame: frame))
        // But an invisible outline around a visible fill still tints the page.
        let tinted = FeatureShape(
            id: "f-3", layer: .oldGrowthPolicy,
            geometry: .polygon([
                [
                    GeoPoint(lat: 45.62, lng: -61.38), GeoPoint(lat: 45.62, lng: -61.32),
                    GeoPoint(lat: 45.68, lng: -61.32), GeoPoint(lat: 45.68, lng: -61.38),
                    GeoPoint(lat: 45.62, lng: -61.38)
                ]
            ]),
            style: style,
            printStyle: VectorFeatureStyle(
                strokeHex: "#333333", strokeOpacity: 0,
                fillHex: "#ededed", fillOpacity: 0.35, lineWidth: 0
            ),
            title: "f-3", subtitle: nil
        )
        #expect(tinted.marks(page, mapFrame: frame))
    }
}

import GeoCore
import MapKit
import Testing

@testable import ns_marks_the_spot

@Suite("Measurement endpoint labels")
@MainActor
struct MeasurementEndpointTests {
    private let points = [
        GeoPoint(lat: 45, lng: -61),
        GeoPoint(lat: 45, lng: -60.99),
        GeoPoint(lat: 45.01, lng: -60.99),
    ]

    @Test(arguments: [MeasureSession.Mode.distance, .area])
    func onlyTheLastCornerOfAMeasurableShapeHasATotal(_ mode: MeasureSession.Mode) throws {
        var session = MeasureSession(mode: mode)
        for point in points.prefix(session.requiredPoints - 1) { session.add(point) }
        #expect(VectorDraftPreview(measuring: session).handles().allSatisfy { $0.endpointLabel == nil })

        session.add(points[session.requiredPoints - 1])
        let handles = VectorDraftPreview(measuring: session).handles()
        #expect(handles.dropLast().allSatisfy { $0.endpointLabel == nil })
        let last = try #require(handles.last)
        let title = mode == .distance ? "Total distance" : "Area"
        #expect(last.endpointLabel == "\(title)\n\(session.readout)")
        #expect(last.coordinate.latitude == session.points.last?.lat)
        #expect(last.coordinate.longitude == session.points.last?.lng)

        session.finish()
        #expect(VectorDraftPreview(measuring: session).handles().last?.endpointLabel == last.endpointLabel)
        session.undoLastPoint()
        #expect(VectorDraftPreview(measuring: session).handles().allSatisfy { $0.endpointLabel == nil })
        session.clear()
        #expect(VectorDraftPreview(measuring: session).handles().isEmpty)
    }

    @Test func anOrdinaryDrawingDoesNotClaimAMeasurement() {
        let draft = VectorDraftPreview(
            shape: .line,
            vertices: points.map { GeoJsonPosition(lng: $0.lng, lat: $0.lat) },
            colorHex: "#d55e00"
        )
        #expect(draft.handles().allSatisfy { $0.endpointLabel == nil })
    }

    @Test func theRenderedLabelKeepsTheDotAnchoredAndDoesNotCatchMapTaps() throws {
        var session = MeasureSession(mode: .distance)
        points.forEach { session.add($0) }
        let endpoint = try #require(VectorDraftPreview(measuring: session).handles().last)
        let map = MKMapView()
        let controller = MapController()
        let view = try #require(
            controller.mapView(map, viewFor: endpoint) as? MeasurementEndpointAnnotationView
        )
        let marker = try #require(view.subviews.compactMap { $0 as? UIImageView }.first)
        let label = try #require(view.subviews.flatMap(\.subviews).compactMap { $0 as? UILabel }.first)
        #expect(label.text == endpoint.endpointLabel)
        #expect(view.bounds.height > marker.bounds.height)
        #expect(view.centerOffset.y + marker.frame.midY - view.bounds.midY == 0)
        #expect(view.accessibilityIdentifier == "measure-endpoint-label")
        #expect(view.accessibilityHint == "Measured on the map, not surveyed.")
        #expect(view.hitTest(CGPoint(x: view.bounds.midX, y: view.bounds.midY), with: nil) == nil)

        view.prepareForReuse()
        view.configure(with: VectorDraftVertexAnnotation(
            index: 0, position: GeoJsonPosition(lng: -61, lat: 45), colorHex: "#d55e00"
        ))
        #expect(label.text == nil)
        #expect(view.bounds.size == marker.bounds.size)
        #expect(view.centerOffset == .zero)
        #expect(view.accessibilityIdentifier == nil)
        #expect(view.accessibilityLabel == "Placed corner 1")
        #expect(view.isUserInteractionEnabled)
    }
}

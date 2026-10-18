import GeoCore
import MapKit
import Testing

@testable import ns_marks_the_spot

/// The handles a selected shape grows, and MapKit's contract for dragging
/// them.
@Suite("Vertex and move handles")
@MainActor
struct VectorHandleViewTests {
    /// MapKit sets `.starting`; the view must move itself on to `.dragging`,
    /// or the drag never properly begins.
    @Test func startingBecomesDragging() {
        let view = VectorHandleAnnotationView(annotation: nil, reuseIdentifier: "handle")
        view.setDragState(.starting, animated: false)
        #expect(view.dragState == .dragging)
    }

    /// MapKit sets `.ending` or `.canceling`; the view must return to `.none`,
    /// or the next drag of the same handle never starts. This is the contract
    /// the plain annotation view left unmet.
    @Test func endingAndCancelingReturnToNone() {
        let view = VectorHandleAnnotationView(annotation: nil, reuseIdentifier: "handle")
        view.setDragState(.starting, animated: false)
        view.setDragState(.ending, animated: false)
        #expect(view.dragState == .none)

        view.setDragState(.starting, animated: false)
        view.setDragState(.canceling, animated: false)
        #expect(view.dragState == .none)
    }

    /// A view that comes back from the reuse queue starts clean.
    @Test func reuseResetsTheDragState() {
        let view = VectorHandleAnnotationView(annotation: nil, reuseIdentifier: "handle")
        view.setDragState(.starting, animated: false)
        #expect(view.dragState == .dragging)
        view.prepareForReuse()
        #expect(view.dragState == .none)
    }

    /// Forty-four points, the smallest target the guidelines allow, for both
    /// kinds of handle; the draft dot, which is not dragged, stays small.
    @Test func handlesAreFortyFourPointTargets() {
        #expect(VectorVertexHandleImage.image(colorHex: "#d55e00").size == CGSize(width: 44, height: 44))
        #expect(VectorMoveHandleImage.image(colorHex: "#d55e00").size == CGSize(width: 44, height: 44))
        #expect(VectorDraftHandleImage.image(colorHex: "#d55e00").size.width < 20)
    }

    /// The corners the panel steps through are the handles on the map: a
    /// closed ring's closing position is not offered twice.
    @Test func cornersSkipTheClosingDuplicate() {
        let square = GeoJsonFeature(
            id: "f1",
            geometry: .polygon([[
                GeoJsonPosition(lng: -63, lat: 44), GeoJsonPosition(lng: -62, lat: 44),
                GeoJsonPosition(lng: -62, lat: 45), GeoJsonPosition(lng: -63, lat: 44),
            ]])
        )
        let corners = VectorSelectionHandles.corners(of: square)
        #expect(corners.count == 3)
        #expect(corners.map(\.vertex) == [0, 1, 2])
        #expect(corners.allSatisfy { $0.ring == 0 })

        let point = GeoJsonFeature(id: "p", geometry: .point(GeoJsonPosition(lng: -63, lat: 44)))
        #expect(VectorSelectionHandles.corners(of: point).count == 1)

        // Without an id nothing can be addressed, so nothing is offered.
        let anonymous = GeoJsonFeature(id: nil, geometry: .point(GeoJsonPosition(lng: -63, lat: 44)))
        #expect(VectorSelectionHandles.corners(of: anonymous).isEmpty)
    }
}

/// What VoiceOver hears on a handle.
@Suite("Handle accessibility")
@MainActor
struct VectorHandleAccessibilityTests {
    /// Four corners are four different handles; a point is a point.
    @Test func cornersAreNumberedAndAPointIsAPoint() {
        let square = GeoJsonFeature(
            id: "f1",
            geometry: .polygon([[
                GeoJsonPosition(lng: -63, lat: 44), GeoJsonPosition(lng: -62, lat: 44),
                GeoJsonPosition(lng: -62, lat: 45), GeoJsonPosition(lng: -63, lat: 44),
            ]])
        )
        let handles = VectorSelectionHandles(feature: square, colorHex: "#d55e00")?.handles() ?? []
        #expect(handles.map(\.ordinal) == [1, 2, 3])
        #expect(handles.allSatisfy { $0.total == 3 })

        let point = GeoJsonFeature(id: "p", geometry: .point(GeoJsonPosition(lng: -63, lat: 44)))
        let single = VectorSelectionHandles(feature: point, colorHex: "#d55e00")?.handles() ?? []
        #expect(single.count == 1)
        #expect(single.first?.total == 1)
    }
}

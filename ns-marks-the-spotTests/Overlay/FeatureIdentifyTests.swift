import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
@testable import ns_marks_the_spot

/// Tapping a feature of a catalogued layer.
///
/// The bundled micro-hydro pilot, because it is the one such layer that reaches
/// no service: what is under test is which feature a tap answers with, and that
/// is decided either side of the request rather than by it.
@MainActor
struct FeatureIdentifyTests {
    private func loaded() async -> ViewportFeatureViewModel {
        let controller = MapController()
        // The layers query the view they can see, so the test gives them one.
        let mapView = MKMapView(frame: CGRect(x: 0, y: 0, width: 390, height: 700))
        mapView.setRegion(
            MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 46.15, longitude: -61.3),
                span: MKCoordinateSpan(latitudeDelta: 0.6, longitudeDelta: 0.6)
            ),
            animated: false
        )
        controller.mapView = mapView
        controller.recordZoomLevel(13)

        let viewModel = ViewportFeatureViewModel(controller: controller)
        viewModel.setVisible(.invernessHydroPotential, to: true)
        viewModel.refreshAll()
        try? await Task.sleep(for: .milliseconds(600))
        return viewModel
    }

    private func firstQualifyingReach() throws -> (HydroPotentialPilot.Reach, GeoPoint) {
        let collection = try HydroPotentialPilot.bundledCollection()
        let reach = try #require(collection.reaches.first { $0.indicativePowerKw != nil })
        let vertex: GeoPoint
        switch reach.geometry {
        case .lineString(let points): vertex = points[points.count / 2]
        case .multiLineString(let lines): vertex = lines[0][lines[0].count / 2]
        default: throw HydroPotentialPilot.LoadFailure.unreadable
        }
        return (reach, vertex)
    }

    @Test func aTapOnAReachSaysWhichWatershedAndOnWhatAssumptions() async throws {
        let viewModel = await loaded()
        let (reach, vertex) = try firstQualifyingReach()

        let found = try #require(viewModel.callout(at: vertex, toleranceDegrees: 0.0002))

        #expect(found.callout.title == reach.watershedName)
        #expect(found.callout.rows.last?.label == "Opportunity band")
        // The scenario constants travel with the figures. A kW number read
        // without them is a prediction the pilot does not make.
        #expect(found.callout.caveat.contains("nominal"))
    }

    @Test func aTapOnOpenGroundAnswersWithNothing() async throws {
        let viewModel = await loaded()
        let (_, vertex) = try firstQualifyingReach()

        let far = GeoPoint(lat: vertex.lat + 0.5, lng: vertex.lng + 0.5)
        #expect(viewModel.callout(at: far, toleranceDegrees: 0.0002) == nil)
    }

    /// A layer the user switched off must not answer for the ground it used to
    /// cover: a card from an invisible layer is the map speaking for something
    /// the user cannot see it drawing.
    @Test func aHiddenLayerAnswersNothing() async throws {
        let viewModel = await loaded()
        let (_, vertex) = try firstQualifyingReach()
        #expect(viewModel.callout(at: vertex, toleranceDegrees: 0.0002) != nil)

        viewModel.setVisible(.invernessHydroPotential, to: false)

        #expect(viewModel.callout(at: vertex, toleranceDegrees: 0.0002) == nil)
    }
}

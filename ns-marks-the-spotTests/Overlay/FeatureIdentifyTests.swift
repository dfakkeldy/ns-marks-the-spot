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
    /// The view the layers query.
    ///
    /// Held by the test case rather than made inside `loaded()`, because
    /// `MapController` refers to its map view weakly: in the app the view owns
    /// the controller, and the other direction would be a cycle. A map view
    /// made and dropped inside a helper leaves the controller with nothing to
    /// read, so every refresh after the first stops at `loading` with no
    /// request sent and nothing published — and a card that should have been
    /// dropped stays up. That is what made these tests pass or fail by how
    /// soon the object happened to be freed. Swift Testing builds a fresh
    /// instance per test, so each gets its own.
    private let mapView = MKMapView(frame: CGRect(x: 0, y: 0, width: 390, height: 700))

    private func loaded() async -> ViewportFeatureViewModel {
        let controller = MapController()
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
        await settles { viewModel.status(.invernessHydroPotential) != .loading }
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

    /// The card is a claim about a feature on the map. When the map stops
    /// drawing the feature, the claim has to go with it — otherwise a user who
    /// switches a layer off is left holding a card off a layer they turned off.
    @Test func switchingTheLayerOffTakesItsCardWithIt() async throws {
        let viewModel = await loaded()
        let (_, vertex) = try firstQualifyingReach()
        let found = try #require(viewModel.callout(at: vertex, toleranceDegrees: 0.0002))
        viewModel.select(found)
        #expect(viewModel.selection != nil)

        viewModel.setVisible(.invernessHydroPotential, to: false)

        #expect(viewModel.selection == nil)
    }

    /// The bundled pilot redraws the same reaches under the same ids, so a
    /// reload that changes nothing must not close a card the user is reading.
    @Test func aReloadThatChangesNothingLeavesTheCardOpen() async throws {
        let viewModel = await loaded()
        let (_, vertex) = try firstQualifyingReach()
        let found = try #require(viewModel.callout(at: vertex, toleranceDegrees: 0.0002))
        viewModel.select(found)

        viewModel.refreshAll()
        // The refresh publishes its features and re-checks the card in the
        // same step it leaves `loading`, so a settled status is the whole of
        // what this assertion is waiting for.
        await settles { viewModel.status(.invernessHydroPotential) != .loading }

        #expect(viewModel.selection?.callout.title == found.callout.title)
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

    /// Two features can carry the same id and say the same words: a
    /// service-backed layer numbers features by their place in the answer, and
    /// zoning cards repeat across a plan area. What separates them is the
    /// ground, so the card is kept only while the same ground is still drawn.
    @Test func aCardWhoseGroundMovedIsNotKept() async throws {
        let viewModel = await loaded()
        let (_, vertex) = try firstQualifyingReach()
        let found = try #require(viewModel.callout(at: vertex, toleranceDegrees: 0.0002))
        viewModel.select(
            .init(
                id: found.id, layer: found.layer, callout: found.callout,
                anchor: .marker(latitude: vertex.lat + 0.4, longitude: vertex.lng + 0.4)
            )
        )

        viewModel.refreshAll()
        // The refresh publishes its features and re-checks the card in the
        // same step it leaves `loading`, so a settled status is the whole of
        // what this assertion is waiting for.
        await settles { viewModel.status(.invernessHydroPotential) != .loading }

        #expect(viewModel.selection == nil)
    }
}

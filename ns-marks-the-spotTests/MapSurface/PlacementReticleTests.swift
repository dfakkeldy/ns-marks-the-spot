import GeoCore
import MapKit
import Testing

@testable import ns_marks_the_spot

/// Where the crosshair sits, and when a press-and-hold may place.
@Suite("Placement reticle")
@MainActor
struct PlacementReticleTests {
    /// The middle of the uncovered map: with a card reporting 300 points into
    /// the bottom margin, the reticle sits at the middle of the top 400.
    @Test func theReticleSitsInTheMiddleOfTheUncoveredMap() {
        let bounds = CGRect(x: 0, y: 0, width: 390, height: 700)
        #expect(MapController.reticlePoint(in: bounds, bottomMargin: 0) == CGPoint(x: 195, y: 350))
        #expect(MapController.reticlePoint(in: bounds, bottomMargin: 300) == CGPoint(x: 195, y: 200))
        // A margin taller than the map is clamped rather than sending the
        // reticle above the screen.
        #expect(MapController.reticlePoint(in: bounds, bottomMargin: 900).y == 0)
    }

    /// The controller's reticle follows the card inset the container reports,
    /// and disarms to nothing.
    @Test func theReticleFollowsTheCardInset() {
        let controller = MapController()
        let mapView = MKMapView(frame: CGRect(x: 0, y: 0, width: 390, height: 700))
        controller.mapView = mapView
        controller.setReticleArmed(true)
        #expect(controller.reticlePoint?.y == 350)
        #expect(controller.reticleCoordinate != nil)

        controller.setBottomCardHeight(300, for: .editPanel)
        #expect(controller.reticlePoint?.y == 200)

        controller.setReticleArmed(false)
        #expect(controller.reticlePoint == nil)
        #expect(controller.reticleCoordinate == nil)
    }

    /// A press-and-hold on a handle is MapKit's drag, never a placement; over
    /// any other annotation — a draft corner, a photo pin — it may place.
    @Test func aLongPressYieldsOnlyToDraggableHandles() {
        let handle = VectorHandleAnnotationView(annotation: nil, reuseIdentifier: "h")
        let inner = UIView()
        handle.addSubview(inner)
        #expect(!MapController.longPressMayBegin(over: handle))
        #expect(!MapController.longPressMayBegin(over: inner))
        #expect(MapController.longPressMayBegin(over: MKAnnotationView(annotation: nil, reuseIdentifier: "pin")))
        #expect(MapController.longPressMayBegin(over: UIView()))
        #expect(MapController.longPressMayBegin(over: nil))
    }

    /// The press-and-hold is recognized only while the reticle is armed:
    /// recognized at any other time it would take the pan from MapKit and do
    /// nothing with it.
    @Test func placementBeginsOnlyWhileArmed() {
        #expect(MapController.placementMayBegin(armed: true, selectingBounds: false, over: nil))
        #expect(!MapController.placementMayBegin(armed: false, selectingBounds: false, over: nil))
        #expect(!MapController.placementMayBegin(armed: true, selectingBounds: true, over: nil))
        let handle = VectorHandleAnnotationView(annotation: nil, reuseIdentifier: "h")
        #expect(!MapController.placementMayBegin(armed: true, selectingBounds: false, over: handle))
    }

    /// The reticle sits in the middle of the map inside all four layout
    /// margins, as MapKit centres a followed user: a 59-point safe area on
    /// top and a 300-point panel below put it at 305.5, not 276.
    @Test func theReticleHonoursEveryMargin() {
        let bounds = CGRect(x: 0, y: 0, width: 390, height: 852)
        let insets = UIEdgeInsets(top: 59, left: 0, bottom: 300, right: 0)
        #expect(MapController.reticlePoint(in: bounds, insets: insets) == CGPoint(x: 195, y: 305.5))
        let wide = UIEdgeInsets(top: 0, left: 100, bottom: 0, right: 20)
        #expect(MapController.reticlePoint(in: bounds, insets: wide).x == 235)
        // Insets past the map leave an empty rectangle, never an inverted one.
        let room = MapController.uncoveredRect(in: bounds, insets: UIEdgeInsets(top: 900, left: 0, bottom: 900, right: 0))
        #expect(room.height == 0)
        #expect(room.minY == 852)
    }

    /// The button says "Finish area here" only when the placement would
    /// close the area: three corners down and the crosshair on the first.
    @Test func theButtonSaysWhenItClosesTheArea() {
        var draft = VectorDraft(shape: .area)
        draft.append(GeoJsonPosition(lng: -61.47, lat: 45.80))
        draft.append(GeoJsonPosition(lng: -61.46, lat: 45.80))
        let first = GeoPoint(lat: 45.80, lng: -61.47)
        #expect(!MapContainerView.reticleFinishesArea(shape: .area, draft: draft, candidate: first))
        draft.append(GeoJsonPosition(lng: -61.46, lat: 45.81))
        #expect(MapContainerView.reticleFinishesArea(shape: .area, draft: draft, candidate: first))
        #expect(!MapContainerView.reticleFinishesArea(shape: .area, draft: draft, candidate: GeoPoint(lat: 45.81, lng: -61.46)))
        #expect(!MapContainerView.reticleFinishesArea(shape: .line, draft: draft, candidate: first))
        #expect(!MapContainerView.reticleFinishesArea(shape: .area, draft: nil, candidate: first))
    }

    /// The panel's placement button names the shape and the closing corner
    /// as the crosshair's does.
    @Test func thePanelPlacementLabelNamesTheShape() {
        #expect(VectorEditPanel.placeLabel(.point, finishesArea: false) == "Place point at crosshair")
        #expect(VectorEditPanel.placeLabel(.line, finishesArea: false) == "Add line point at crosshair")
        #expect(VectorEditPanel.placeLabel(.area, finishesArea: false) == "Add area corner at crosshair")
        #expect(VectorEditPanel.placeLabel(.area, finishesArea: true) == "Finish area at crosshair")
    }

    /// Placement is armed only for a drawing tool in a session that is not
    /// on its way out.
    @Test func placementArmsOnlyWhileDrawingAndNotEnding() {
        #expect(MapContainerView.reticleShouldArm(isEditing: true, isEnding: false, tool: .drawing(.point)))
        #expect(!MapContainerView.reticleShouldArm(isEditing: true, isEnding: true, tool: .drawing(.point)))
        #expect(!MapContainerView.reticleShouldArm(isEditing: true, isEnding: false, tool: .selecting))
        #expect(!MapContainerView.reticleShouldArm(isEditing: false, isEnding: false, tool: .drawing(.line)))
        #expect(!MapContainerView.reticleShouldArm(isEditing: true, isEnding: false, tool: nil))
        // A save-area selection has the map; the crosshair stands down.
        #expect(
            !MapContainerView.reticleShouldArm(
                isEditing: true, isEnding: false, tool: .drawing(.point), selectingBounds: true
            )
        )
    }

    /// Measuring, editing and choosing a save area each give a tap on the map
    /// its own meaning, so a card that opened underneath one of them is read
    /// as an answer to something the reader never asked. The tax-sale overview
    /// marker refused during none of them, and it does more than open a card:
    /// it claims the camera and rewrites the search field.
    @Test func anAnnotationTapStandsDownWhileSomethingElseOwnsTheMap() {
        #expect(
            MapContainerView.annotationTapOpensCard(
                measuring: false, editing: false, selectingBounds: false
            )
        )
        #expect(
            !MapContainerView.annotationTapOpensCard(
                measuring: true, editing: false, selectingBounds: false
            )
        )
        #expect(
            !MapContainerView.annotationTapOpensCard(
                measuring: false, editing: true, selectingBounds: false
            )
        )
        #expect(
            !MapContainerView.annotationTapOpensCard(
                measuring: false, editing: false, selectingBounds: true
            )
        )
    }

    /// A floor that outranks the screen is not a floor: a phone held sideways
    /// gives this stack about 372 points, and the panel used to open 380 tall
    /// with its last sections below the edge of the screen.
    @Test func theLayersPanelNeverOpensTallerThanTheScreen() {
        // Landscape phone.
        // `CGFloat(...)` on both sides on purpose: `#expect` compares a CGFloat
        // against an inferred Double by identity, and reports two numbers that
        // print the same as unequal.
        let sideways = MapContainerView.layersPanelHeight(mapHeight: 372)
        #expect(sideways <= 372 - MapContainerView.layersPanelTopInset)
        #expect(sideways == CGFloat(372 - 60 - 72))

        // Portrait phone: the room is the answer and it is roomy.
        #expect(
            MapContainerView.layersPanelHeight(mapHeight: 800) == CGFloat(800 - 60 - 72)
        )

        // Still room, even if not much of it: the room is the answer, because
        // a floor that can outrank it spends the clearance that keeps the
        // panel off the source strip and the cards.
        #expect(
            MapContainerView.layersPanelHeight(mapHeight: 300) == CGFloat(300 - 60 - 72)
        )

        // No room at all. The fallback applies and is itself capped by what is
        // above the panel, so it still cannot run off the bottom.
        let cramped = MapContainerView.layersPanelHeight(mapHeight: 120)
        #expect(cramped <= 120 - MapContainerView.layersPanelTopInset)
        #expect(cramped > 0)

        // Nothing measured yet.
        #expect(
            MapContainerView.layersPanelHeight(mapHeight: 0)
                == MapContainerView.layersPanelUnmeasuredHeight
        )
    }

    /// The panel is drawn over the search column rather than laid out beside
    /// it, so on a narrow map VoiceOver went on offering the addresses and the
    /// lookup message from behind a panel that had replaced them on screen.
    @Test func theLayersPanelKnowsWhenItIsStandingOnTheSearchCard() {
        // A phone: 393 - 24 - 60 - 300 is well left of 12 + 260.
        #expect(MapContainerView.layersPanelCoversSearch(mapWidth: 393, railWidth: 60))
        // An iPad: the two stand side by side and both are usable.
        #expect(!MapContainerView.layersPanelCoversSearch(mapWidth: 1024, railWidth: 60))
        // Nothing measured is not something covered.
        #expect(!MapContainerView.layersPanelCoversSearch(mapWidth: 0, railWidth: 60))
    }

    /// Step to a corner, then move a corner to the map centre without
    /// panning: nothing moves, because `pan(to:)` and `visibleCentre()` mean
    /// the same spot inside the layout margins.
    @Test func panningToAPointPutsItAtTheVisibleCentre() {
        let controller = MapController()
        let mapView = MKMapView(frame: CGRect(x: 0, y: 0, width: 390, height: 700))
        controller.mapView = mapView
        mapView.region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 45.80, longitude: -61.47),
            latitudinalMeters: 1_000, longitudinalMeters: 1_000
        )
        mapView.layoutMargins = UIEdgeInsets(top: 59, left: 0, bottom: 300, right: 0)
        let corner = GeoPoint(lat: 45.8031, lng: -61.4712)

        controller.pan(to: corner, animated: false)

        let centre = controller.visibleCentre()
        #expect(centre != nil)
        if let centre {
            #expect(abs(centre.lat - corner.lat) < 0.00005)
            #expect(abs(centre.lng - corner.lng) < 0.00005)
        }
    }
}

import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
@testable import ns_marks_the_spot

/// MapKit has no z-index, so installation order is the drawing order. These
/// assert the order the web produces, whatever sequence the user switches
/// layers on in.
@MainActor
struct OverlayDrawOrderTests {
    @Test func aLateTileLayerGoesUnderTheVectorLayersAndTheParcel() throws {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView

        var state = MapViewState()
        state.featureShapes = [zoningShape]
        state.parcelShapes = [parcel]
        controller.apply(state)

        // Switched on last, and still drawn first: a raster arriving after a
        // parcel was selected must not cover the boundary being inspected.
        state.layers = [try #require(nsprdLayer)]
        controller.apply(state)

        #expect(orders(of: mapView) == orders(of: mapView).sorted())
        #expect(mapView.overlays.first is OpacityTileOverlay)
        #expect(mapView.overlays.last is ParcelPolygon)
    }

    @Test func oldGrowthDrawsUnderTheRastersItsPaneSitsInside() throws {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView

        var state = MapViewState()
        state.layers = [try #require(nsprdLayer), try #require(contoursLayer)]
        state.featureShapes = [oldGrowthShape, zoningShape]
        controller.apply(state)

        // Contours 180, old growth 190, NSPRD 200, zoning in pane space above
        // all three — the web's order exactly.
        let installed = mapView.overlays.map { overlay -> String in
            if let tile = overlay as? OpacityTileOverlay { return tile.configuration.id }
            if let polygon = overlay as? FeaturePolygon { return polygon.featureID }
            return "?"
        }
        #expect(installed == ["contours", "og-1", "nsprd", "zone-1"])
    }

    @Test func refreshingTheFeatureLayersLeavesNothingBehind() throws {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView

        var state = MapViewState()
        state.featureShapes = [zoningShape, oldGrowthShape]
        controller.apply(state)
        #expect(mapView.overlays.count == 2)

        // A pan reissues the query; the previous viewport's features must not
        // survive it, or the map would accumulate ground it no longer covers.
        state.featureShapes = [zoningShape]
        controller.apply(state)
        #expect(mapView.overlays.count == 1)
        #expect((mapView.overlays.first as? FeaturePolygon)?.featureID == "zone-1")
    }

    private func orders(of mapView: MKMapView) -> [Int] {
        mapView.overlays.compactMap { ($0 as? WebDrawOrdered)?.webDrawOrder }
    }

    private var nsprdLayer: MapLayerState? { shownLayer(.nsprd) }

    private var contoursLayer: MapLayerState? { shownLayer(.contours) }

    /// Switched on, which the catalogue's native default is not: the app opens
    /// with every Province layer off, and a hidden layer draws at alpha 0, so
    /// `MapStateDiff` never installs an overlay for it at all. Built from the
    /// descriptor alone these tests were asserting the order of an empty map.
    private func shownLayer(_ id: LayerID) -> MapLayerState? {
        LayerCatalog.descriptor(for: id).map {
            var layer = MapLayerState(descriptor: $0, source: .catalogExport(id))
            layer.isVisible = true
            return layer
        }
    }

    private var square: [GeoPoint] {
        [
            GeoPoint(lat: 45, lng: -63),
            GeoPoint(lat: 45, lng: -62),
            GeoPoint(lat: 46, lng: -62),
            GeoPoint(lat: 45, lng: -63)
        ]
    }

    private var zoningShape: FeatureShape {
        FeatureShape(
            id: "zone-1",
            layer: .zoningHalifax,
            geometry: .polygon([square]),
            style: VectorFeatureStyle(strokeHex: "#000000", lineWidth: 1),
            title: "zone-1",
            subtitle: nil
        )
    }

    private var oldGrowthShape: FeatureShape {
        FeatureShape(
            id: "og-1",
            layer: .oldGrowthPolicy,
            geometry: .polygon([square]),
            style: VectorFeatureStyle(strokeHex: "#166534", lineWidth: 1.7),
            title: "og-1",
            subtitle: nil
        )
    }

    private var parcel: ParcelShape {
        ParcelShape(pid: "12345678", role: .selected, parts: [[square]])
    }
}

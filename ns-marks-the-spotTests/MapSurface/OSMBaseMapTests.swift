import CoreGraphics
import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
import UIKit

@testable import ns_marks_the_spot

/// The OpenStreetMap ground: the browser's base map, drawn natively.
@Suite("The OpenStreetMap base map")
@MainActor
struct OSMBaseMapTests {
    /// The map the reader has not touched is the map the browser shows.
    @Test("OpenStreetMap is the default ground")
    func openStreetMapIsTheDefaultGround() {
        #expect(MapViewState().baseMapType == .openStreetMap)
        #expect(MapController().baseMapType == .openStreetMap)
    }

    @Test("Choosing OpenStreetMap replaces Apple's map and choosing back removes it")
    func choosingOpenStreetMapReplacesApplesMapAndChoosingBackRemovesIt() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.baseMapType = .standard
        controller.mapView = mapView
        #expect(mapView.overlays.compactMap { $0 as? OSMBaseOverlay }.isEmpty)

        controller.baseMapType = .openStreetMap
        let installed = mapView.overlays.compactMap { $0 as? OSMBaseOverlay }
        #expect(installed.count == 1)
        // Without this MapKit keeps drawing its own map underneath, and the
        // reader is looking at two surveys at once.
        #expect(installed.first?.canReplaceMapContent == true)

        controller.baseMapType = .standard
        #expect(mapView.overlays.compactMap { $0 as? OSMBaseOverlay }.isEmpty)
    }

    /// Flipping through every base must leave exactly one base-replacing
    /// overlay for the chosen ground — never two stacked, never a leftover.
    @Test("Switching grounds never stacks base overlays")
    func switchingGroundsNeverStacksBaseOverlays() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        for type in [
            MapBaseType.openStreetMap, .blank, .openStreetMap, .satellite,
            .openStreetMap, .openStreetMap,
        ] {
            controller.baseMapType = type
        }
        #expect(mapView.overlays.compactMap { $0 as? OSMBaseOverlay }.count == 1)
        #expect(mapView.overlays.compactMap { $0 as? BlankBaseOverlay }.isEmpty)

        controller.baseMapType = .blank
        #expect(mapView.overlays.compactMap { $0 as? OSMBaseOverlay }.isEmpty)
        #expect(mapView.overlays.compactMap { $0 as? BlankBaseOverlay }.count == 1)
    }

    /// A map view attached after launch — a rotation, or a rebuilt view — has
    /// to arrive on the OpenStreetMap ground the state says it is on, even
    /// though a fresh `MKMapView` and `MapViewState()` now disagree about what
    /// "untouched" means.
    @Test("A map view attached later gets the OpenStreetMap ground too")
    func aMapViewAttachedLaterGetsTheOpenStreetMapGroundToo() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        #expect(mapView.overlays.compactMap { $0 as? OSMBaseOverlay }.count == 1)
    }

    /// It replaces the base map, so everything else has to be over it —
    /// including layers that were switched on before the ground changed.
    @Test("The OpenStreetMap ground goes under the layers already on the map")
    func theOpenStreetMapGroundGoesUnderTheLayersAlreadyOnTheMap() throws {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView

        var state = MapViewState()
        state.baseMapType = .standard
        state.layers = [try #require(nsprdLayer)]
        controller.apply(state)
        state.baseMapType = .openStreetMap
        controller.apply(state)

        let installed = mapView.overlays.map { overlay -> String in
            if overlay is OSMBaseOverlay { return "osm" }
            if let tile = overlay as? OpacityTileOverlay { return tile.configuration.id }
            return "?"
        }
        #expect(installed == ["osm", "nsprd"])
    }

    // MARK: - The tiles

    /// The plain host, no `{s}` subdomain — the aliases are deprecated — and
    /// the zoom range OpenStreetMap actually serves.
    @Test("Tiles are addressed to the plain host at the served zooms")
    func tilesAreAddressedToThePlainHostAtTheServedZooms() {
        #expect(
            OpenStreetMapBase.tileURL(z: 14, x: 5231, y: 5342).absoluteString
                == "https://tile.openstreetmap.org/14/5231/5342.png"
        )
        let overlay = OSMBaseOverlay()
        #expect(overlay.minimumZ == 0)
        #expect(overlay.maximumZ == 19)
        #expect(overlay.canReplaceMapContent)
    }

    /// The OSM tile policy requires a User-Agent that identifies the
    /// application, on every request. A generic one is grounds for a block.
    @Test("Every tile request identifies this app")
    func everyTileRequestIdentifiesThisApp() throws {
        let request = OpenStreetMapBase.tileRequest(z: 3, x: 2, y: 1)
        #expect(request.url == OpenStreetMapBase.tileURL(z: 3, x: 2, y: 1))
        let agent = try #require(request.value(forHTTPHeaderField: "User-Agent"))
        #expect(agent.contains("NSMarksTheSpot"))
        #expect(agent.contains("kinnokilabs.com"))
        // The policy asks clients to honour HTTP caching; the protocol cache
        // policy is what hands these requests to the default `URLCache`.
        #expect(request.cachePolicy == .useProtocolCachePolicy)
    }

    /// What the print compositor fetches the ground through: the shared id
    /// "modern", the web's own name for the layer, and the native zoom cap so
    /// a 300 dpi frame cannot ask for levels that do not exist.
    @Test("The print layer carries the shared id and the native zoom cap")
    func thePrintLayerCarriesTheSharedIdAndTheNativeZoomCap() {
        let layer = OpenStreetMapBase.printLayer
        #expect(layer.id == MapShareState.modernBaseLayerID)
        #expect(layer.name == "OpenStreetMap base map")
        #expect(layer.configuration.maxZoom == 19)
        #expect(layer.effectiveAlpha == 1)
    }

    /// The print layer's source is a real template, not a decoration: a
    /// provider that honours `configuration.source` the way every other
    /// `.tile` layer is honoured must reach the same square the screen does,
    /// not a whole-world tile for every square of the frame.
    @Test("The print layer's source expands to the screen's own tile address")
    func thePrintLayersSourceExpandsToTheScreensOwnTileAddress() throws {
        guard case .tile(let template) = OpenStreetMapBase.printLayer.configuration.source
        else {
            Issue.record("Expected a .tile source")
            return
        }
        #expect(
            TileFetcher().tileURL(z: 14, x: 5231, y: 5342, from: template)
                == OpenStreetMapBase.tileURL(z: 14, x: 5231, y: 5342)
        )
    }

    /// Switched on: the catalogue's native default is off, and a hidden layer
    /// is never installed as an overlay, so the order under test would be the
    /// order of an empty map.
    private var nsprdLayer: MapLayerState? {
        LayerCatalog.descriptor(for: .nsprd).map {
            var layer = MapLayerState(descriptor: $0, source: .catalogExport(.nsprd))
            layer.isVisible = true
            return layer
        }
    }
}

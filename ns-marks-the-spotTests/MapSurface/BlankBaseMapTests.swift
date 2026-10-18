import CoreGraphics
import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
import UIKit

@testable import ns_marks_the_spot

/// Reading with no base map, the way the browser reads with its modern map
/// switched off.
@Suite("No base map")
@MainActor
struct BlankBaseMapTests {
    @Test("Choosing None puts a blank world on the map and taking it back removes it")
    func choosingNonePutsABlankWorldOnTheMapAndTakingItBackRemovesIt() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        #expect(mapView.overlays.compactMap { $0 as? BlankBaseOverlay }.isEmpty)

        controller.baseMapType = .blank
        let installed = mapView.overlays.compactMap { $0 as? BlankBaseOverlay }
        #expect(installed.count == 1)
        // Without this MapKit keeps drawing its own map underneath, and the
        // sheet is read over the roads it was meant to be read without.
        #expect(installed.first?.canReplaceMapContent == true)

        controller.baseMapType = .standard
        #expect(mapView.overlays.compactMap { $0 as? BlankBaseOverlay }.isEmpty)
    }

    /// It replaces the base map, so everything else has to be over it —
    /// including layers that were switched on before the reader emptied the
    /// ground beneath them.
    @Test("The blank world goes under the layers already on the map")
    func theBlankWorldGoesUnderTheLayersAlreadyOnTheMap() throws {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView

        var state = MapViewState()
        state.layers = [try #require(nsprdLayer)]
        controller.apply(state)
        state.baseMapType = .blank
        controller.apply(state)

        let installed = mapView.overlays.map { overlay -> String in
            if overlay is BlankBaseOverlay { return "blank" }
            if let tile = overlay as? OpacityTileOverlay { return tile.configuration.id }
            return "?"
        }
        #expect(installed == ["blank", "nsprd"])
    }

    /// Switching between the two aerial-free bases must not leave two blank
    /// worlds stacked, or none at all.
    @Test("Switching base maps leaves exactly one blank world or none")
    func switchingBaseMapsLeavesExactlyOneBlankWorldOrNone() {
        let controller = MapController()
        let mapView = MKMapView()
        controller.mapView = mapView
        for type in [MapBaseType.blank, .blank, .satellite, .blank, .hybrid, .blank] {
            controller.baseMapType = type
        }
        #expect(mapView.overlays.compactMap { $0 as? BlankBaseOverlay }.count == 1)
        controller.baseMapType = .standard
        #expect(mapView.overlays.compactMap { $0 as? BlankBaseOverlay }.isEmpty)
    }

    /// A map view attached after the choice was made — a rotation, or a
    /// rebuilt view — has to arrive already empty.
    @Test("A map view attached later gets the blank world too")
    func aMapViewAttachedLaterGetsTheBlankWorldToo() {
        let controller = MapController()
        controller.baseMapType = .blank
        let mapView = MKMapView()
        controller.mapView = mapView
        #expect(mapView.overlays.compactMap { $0 as? BlankBaseOverlay }.count == 1)
    }

    /// Every tile, at every zoom the map can reach. A level the overlay
    /// declined would show Apple's map through the gap.
    @Test("The blank world answers every zoom with an opaque square")
    func theBlankWorldAnswersEveryZoomWithAnOpaqueSquare() async throws {
        let overlay = BlankBaseOverlay()
        #expect(overlay.minimumZ == 0)
        #expect(overlay.maximumZ >= 24)
        for z in [0, 12, 24] {
            let data = try await overlay.loadTile(
                at: MKTileOverlayPath(x: 0, y: 0, z: z, contentScaleFactor: 1)
            )
            let image = try #require(UIImage(data: data))
            #expect(image.size == CGSize(width: 256, height: 256))
        }
    }

    /// The choice has to survive into the export, or the page hands back the
    /// roads and labels the reader turned off.
    @Test("A page with no base map is blank paper, not a snapshot")
    func aPageWithNoBaseMapIsBlankPaperNotASnapshot() throws {
        let image = PrintMapCompositor.blankBaseMap(widthPx: 8, heightPx: 4)
        #expect(image.size == CGSize(width: 8, height: 4))
        let cgImage = try #require(image.cgImage)
        #expect(cgImage.width == 8)
        #expect(cgImage.height == 4)
    }

    /// The page carries no Apple pixels, so it owes Apple no credit. A strip
    /// that named a source the page does not show is the same defect as one
    /// that omits a source it does.
    @Test("A page with no base map does not credit Apple")
    func aPageWithNoBaseMapDoesNotCreditApple() {
        let credited = PrintExportPlan.sources(
            baseMap: .blank, outcomes: [], descriptor: { LayerID(rawValue: $0).flatMap(LayerCatalog.descriptor(for:)) }
        )
        #expect(credited.isEmpty)

        // And with a layer on the page, that layer alone.
        let name = LayerCatalog.descriptor(for: .nsprd)?.name ?? ""
        let outcome = PrintMapCompositor.LayerOutcome(
            id: LayerID.nsprd.rawValue, name: name, state: .drawn
        )
        let withLayer = PrintExportPlan.sources(
            baseMap: .blank, outcomes: [outcome], descriptor: { LayerID(rawValue: $0).flatMap(LayerCatalog.descriptor(for:)) }
        )
        #expect(withLayer.map(\.name) == [name])
        #expect(!withLayer.contains { $0.attribution.contains("Apple") })

        // Unchanged for a page that does show Apple's map.
        let standard = PrintExportPlan.sources(
            baseMap: .standard, outcomes: [], descriptor: { LayerID(rawValue: $0).flatMap(LayerCatalog.descriptor(for:)) }
        )
        #expect(standard.map(\.name) == ["Apple Maps"])
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

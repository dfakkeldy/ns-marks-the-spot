import CoreGraphics
import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
import UIKit

@testable import ns_marks_the_spot

/// Which side of Apple's own lettering the map is drawn on.
///
/// MapKit draws its place names, route shields and points of interest as a
/// pass of its own, over every overlay at `aboveRoads`, and
/// `canReplaceMapContent` does nothing to it. A ground that names its own
/// places was therefore being read under Apple's names for the same places —
/// "Judique" twice, in two faces, one over the other — and None, chosen to
/// read a sheet without modern names, had them anyway. The ground decides the
/// level, and every overlay on the map shares it.
@Suite("Apple's lettering and the ground")
@MainActor
struct AppleLabelsTests {
    private static let host = URL(string: "https://tiles.kinnokilabs.com")!

    /// Apple's grounds keep Apple's names; a ground with names of its own, or
    /// chosen to have none, covers them. Listed in full, so that a new ground
    /// has to say which it is.
    @Test("Apple's grounds keep the lettering and the others cover it")
    func applesGroundsKeepTheLetteringAndTheOthersCoverIt() {
        let keeps: [MapBaseType] = [.standard, .satellite, .hybrid, .nsAerial]
        let covers: [MapBaseType] = [.atlas, .atlasDay, .atlasNight, .atlasFletcher, .openStreetMap, .blank]
        #expect(Set(keeps + covers) == Set(MapBaseType.allCases))
        for ground in keeps {
            #expect(ground.showsAppleLabels, "\(ground)")
            #expect(MapController.overlayLevel(for: ground) == .aboveRoads, "\(ground)")
        }
        for ground in covers {
            #expect(!ground.showsAppleLabels, "\(ground)")
            #expect(MapController.overlayLevel(for: ground) == .aboveLabels, "\(ground)")
        }
        // The georeferencing pane is always on OpenStreetMap, so always over.
        #expect(GeoreferenceMapPane.overlayLevel == .aboveLabels)
    }

    /// The layers switched on over Apple's map go with the map when the Atlas
    /// replaces it, in the order they held, with nothing left behind where
    /// Apple's lettering would now be drawn over it.
    @Test("Choosing the Atlas carries the layers above the lettering in their order")
    func choosingTheAtlasCarriesTheLayersAboveTheLetteringInTheirOrder() throws {
        let controller = MapController(atlasRasterBaseURL: Self.host)
        let mapView = MKMapView()
        controller.mapView = mapView

        var state = MapViewState()
        state.baseMapType = .standard
        state.layers = [try #require(shownLayer(.nsprd))]
        state.featureShapes = [zoningShape]
        state.parcelShapes = [parcel]
        controller.apply(state)
        let under = Self.names(of: mapView.overlays(in: .aboveRoads))
        #expect(under == ["nsprd", "zone-1", "parcel"])
        #expect(mapView.overlays(in: .aboveLabels).isEmpty)

        state.baseMapType = .atlasDay
        controller.apply(state)
        #expect(mapView.overlays(in: .aboveRoads).isEmpty)
        #expect(Self.names(of: mapView.overlays(in: .aboveLabels)) == ["atlas"] + under)
        // `overlays` reads the same, so nothing asserting on it elsewhere is
        // reading an order other than the one drawn.
        #expect(Self.names(of: mapView.overlays) == ["atlas"] + under)
    }

    /// And back: Apple's map is chosen, the Atlas goes, and the layers come
    /// down to where Apple's lettering draws over them again.
    @Test("Choosing Apple's map back brings the layers down under the lettering")
    func choosingApplesMapBackBringsTheLayersDownUnderTheLettering() throws {
        let controller = MapController(atlasRasterBaseURL: Self.host)
        let mapView = MKMapView()
        controller.mapView = mapView

        var state = MapViewState()
        state.baseMapType = .atlasFletcher
        state.layers = [try #require(shownLayer(.nsprd))]
        state.featureShapes = [zoningShape]
        state.parcelShapes = [parcel]
        controller.apply(state)
        #expect(Self.names(of: mapView.overlays(in: .aboveLabels)) == ["atlas", "nsprd", "zone-1", "parcel"])

        state.baseMapType = .hybrid
        controller.apply(state)
        #expect(mapView.overlays(in: .aboveLabels).isEmpty)
        #expect(Self.names(of: mapView.overlays(in: .aboveRoads)) == ["nsprd", "zone-1", "parcel"])
    }

    /// A layer switched on after the ground was chosen goes where the ground
    /// is: over it in the draw order, and in the same stack.
    @Test("A layer switched on over the Atlas joins it above the lettering")
    func aLayerSwitchedOnOverTheAtlasJoinsItAboveTheLettering() throws {
        let controller = MapController(atlasRasterBaseURL: Self.host)
        let mapView = MKMapView()
        controller.mapView = mapView
        controller.baseMapType = .atlasNight

        var state = controller.state
        state.layers = [try #require(shownLayer(.nsprd))]
        state.parcelShapes = [parcel]
        controller.apply(state)
        #expect(mapView.overlays(in: .aboveRoads).isEmpty)
        #expect(Self.names(of: mapView.overlays(in: .aboveLabels)) == ["atlas", "nsprd", "parcel"])
    }

    /// Every ground, chosen with a layer already on: the whole map is in the
    /// one stack the ground calls for and the other is empty. NS Aerial is
    /// Apple's ground with imagery over it, so its lettering stays; None and
    /// OpenStreetMap replace the ground and go over.
    ///
    /// From an Apple ground other than the one under test, so that every
    /// case is a real change of ground rather than the same one applied
    /// twice.
    @Test("Every ground puts the whole map in its one stack", arguments: MapBaseType.allCases)
    func everyGroundPutsTheWholeMapInItsOneStack(ground: MapBaseType) throws {
        let controller = MapController(atlasRasterBaseURL: Self.host)
        let mapView = MKMapView()
        controller.mapView = mapView
        var state = MapViewState()
        state.baseMapType = ground == .hybrid ? .standard : .hybrid
        state.layers = [try #require(shownLayer(.nsprd))]
        controller.apply(state)
        state.baseMapType = ground
        controller.apply(state)

        let wanted = MapController.overlayLevel(for: ground)
        let other: MKOverlayLevel = wanted == .aboveRoads ? .aboveLabels : .aboveRoads
        #expect(mapView.overlays(in: other).isEmpty, "\(ground)")
        #expect(mapView.overlays(in: wanted).count == mapView.overlays.count, "\(ground)")
        #expect(Self.names(of: mapView.overlays).last == "nsprd", "\(ground)")
    }

    /// A map view attached after the choice — a rotation, a rebuilt view —
    /// arrives with everything on the ground's side of the lettering.
    @Test("A map view attached later arrives on the ground's side of the lettering")
    func aMapViewAttachedLaterArrivesOnTheGroundsSideOfTheLettering() throws {
        let controller = MapController(atlasRasterBaseURL: Self.host)
        var state = MapViewState()
        state.baseMapType = .openStreetMap
        state.layers = [try #require(shownLayer(.nsprd))]
        state.parcelShapes = [parcel]
        controller.apply(state)

        let mapView = MKMapView()
        controller.mapView = mapView
        #expect(mapView.overlays(in: .aboveRoads).isEmpty)
        #expect(Self.names(of: mapView.overlays(in: .aboveLabels)) == ["osm", "nsprd", "parcel"])

        // And a replacement view on Apple's ground, the other way.
        controller.baseMapType = .nsAerial
        let replacement = MKMapView()
        controller.mapView = replacement
        #expect(replacement.overlays(in: .aboveLabels).isEmpty)
        #expect(Self.names(of: replacement.overlays(in: .aboveRoads)) == ["nsprd", "parcel"])
    }

    /// What the move throws away comes back from what survives it. MapKit
    /// asks the delegate for every renderer again on the far side, and the
    /// delegate reads a tile's opacity from the applied layers and a scan's
    /// from its overlay — so a layer at 0.4 and a scan at 0.5 draw at 0.4 and
    /// 0.5 there too, and the slider's next poke reaches the renderer the
    /// delegate just made rather than the one the move discarded.
    @Test("Opacity survives the move across the lettering")
    func opacitySurvivesTheMoveAcrossTheLettering() throws {
        let controller = MapController(atlasRasterBaseURL: Self.host)
        let mapView = MKMapView()
        controller.mapView = mapView

        var layer = try #require(shownLayer(.nsprd))
        layer.opacity = 0.4
        var state = MapViewState()
        state.baseMapType = .standard
        state.layers = [layer]
        state.userMaps = [try #require(Self.drape(alpha: 0.5))]
        controller.apply(state)

        state.baseMapType = .atlasDay
        controller.apply(state)
        #expect(mapView.overlays(in: .aboveRoads).isEmpty)
        let tile = try #require(mapView.overlays(in: .aboveLabels).compactMap { $0 as? OpacityTileOverlay }.first)
        let scan = try #require(mapView.overlays(in: .aboveLabels).compactMap { $0 as? UserMapOverlay }.first)
        // Held, as MapKit holds them: the overlays keep their renderer weakly.
        let tileRenderer = controller.mapView(mapView, rendererFor: tile)
        let scanRenderer = controller.mapView(mapView, rendererFor: scan)
        #expect(Double(tileRenderer.alpha) == 0.4)
        #expect(Double(scanRenderer.alpha) == 0.5)

        state.layers[0].opacity = 0.7
        state.userMaps[0].alpha = 0.25
        controller.apply(state)
        #expect(Double(tileRenderer.alpha) == 0.7)
        #expect(Double(scanRenderer.alpha) == 0.25)
        #expect(Double(scan.alpha) == 0.25)
    }

    /// A user's own layers cross with everything else, and the incremental
    /// path that spares the untouched ones on every later change still finds
    /// what it installed: one polygon per layer, in the one stack, before and
    /// after the ground changed and after a layer is added and taken away.
    @Test("A user's vector layers cross with the map and keep updating")
    func aUsersVectorLayersCrossWithTheMapAndKeepUpdating() throws {
        let controller = MapController(atlasRasterBaseURL: Self.host)
        let mapView = MKMapView()
        controller.mapView = mapView

        let first = try Self.drawing(id: "layer-1")
        let second = try Self.drawing(id: "layer-2")
        var state = MapViewState()
        state.baseMapType = .standard
        state.userVectors = [first]
        controller.apply(state)
        #expect(Self.vectorLayers(in: mapView, at: .aboveRoads) == ["layer-1"])

        state.baseMapType = .atlasFletcher
        controller.apply(state)
        #expect(Self.vectorLayers(in: mapView, at: .aboveRoads) == [])
        #expect(Self.vectorLayers(in: mapView, at: .aboveLabels) == ["layer-1"])

        state.userVectors = [first, second]
        controller.apply(state)
        #expect(Self.vectorLayers(in: mapView, at: .aboveRoads) == [])
        #expect(Self.vectorLayers(in: mapView, at: .aboveLabels) == ["layer-1", "layer-2"])

        state.userVectors = [second]
        controller.apply(state)
        #expect(Self.vectorLayers(in: mapView, at: .aboveRoads) == [])
        #expect(Self.vectorLayers(in: mapView, at: .aboveLabels) == ["layer-2"])
        #expect(Self.names(of: mapView.overlays).first == "atlas")
    }

    // MARK: - Fixtures

    private static func names(of overlays: [any MKOverlay]) -> [String] {
        overlays.map { overlay in
            if overlay is AtlasBaseOverlay { return "atlas" }
            if overlay is OSMBaseOverlay { return "osm" }
            if overlay is BlankBaseOverlay { return "blank" }
            if let tile = overlay as? OpacityTileOverlay { return tile.configuration.id }
            if let feature = overlay as? FeaturePolygon { return feature.featureID }
            if overlay is ParcelPolygon { return "parcel" }
            return "?"
        }
    }

    /// Switched on: the catalogue's native default is off, and a hidden layer
    /// is never installed as an overlay.
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

    private var parcel: ParcelShape {
        ParcelShape(pid: "12345678", role: .selected, parts: [[square]])
    }

    private static func vectorLayers(in mapView: MKMapView, at level: MKOverlayLevel) -> [String] {
        mapView.overlays(in: level).compactMap { ($0 as? UserVectorPolygon)?.layerID }
    }

    /// One triangle, in a layer of the given id.
    private static func drawing(id: String) throws -> UserVectorDrawing {
        let parsed = try UserVectorParse.parseGeoJson(Data(
            """
            {"type":"Polygon","coordinates":[[[-63,44],[-62,44],[-62,45],[-63,44]]]}
            """.utf8
        ))
        return UserVectorDrawing(
            record: UserVectorLayerRecord(
                id: id,
                name: id,
                source: .geoJson,
                origin: .imported(filename: "\(id).geojson", importedAt: Date(timeIntervalSince1970: 0)),
                createdAt: Date(timeIntervalSince1970: 0),
                colorHex: "#0072b2",
                featureCount: parsed.featureCount,
                bbox: parsed.bbox
            ),
            parsed: parsed
        )
    }

    /// A one-pixel scan placed by three control points, as the
    /// georeferencer's own tests place theirs.
    private static func drape(alpha: CGFloat) -> UserMapDrape? {
        let context = CGContext(
            data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
        guard let image = context?.makeImage() else { return nil }
        let record = UserMapRecord(
            id: "scan", name: "Scan", pixelSize: PixelSize(width: 1, height: 1),
            placement: .controlPoints(
                [
                    SessionControlPoint(
                        id: "nw", pixel: PixelPoint(x: 0, y: 0), map: GeoPoint(lat: 44.7, lng: -63.7)
                    ),
                    SessionControlPoint(
                        id: "ne", pixel: PixelPoint(x: 1, y: 0), map: GeoPoint(lat: 44.7, lng: -63.5)
                    ),
                    SessionControlPoint(
                        id: "sw", pixel: PixelPoint(x: 0, y: 1), map: GeoPoint(lat: 44.6, lng: -63.7)
                    ),
                ],
                method: .affine
            )
        )
        return UserMapDrape(record: record, image: image, alpha: alpha)
    }
}

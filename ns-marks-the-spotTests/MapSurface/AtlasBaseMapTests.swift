import CoreGraphics
import Foundation
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import Testing
import UIKit

@testable import ns_marks_the_spot

/// The NS Marks Atlas ground: the browser's default map, drawn natively from
/// the rendered tiles.
@Suite("The Atlas base map")
@MainActor
struct AtlasBaseMapTests {
    private static let host = URL(string: "https://tiles.kinnokilabs.com")!

    private static func controller() -> MapController {
        MapController(atlasRasterBaseURL: host)
    }

    /// The map the reader has not touched is the map the browser opens on:
    /// the Atlas in the system's appearance.
    @Test("The Atlas is the default ground")
    func theAtlasIsTheDefaultGround() {
        #expect(MapViewState().baseMapType == .atlas)
        #expect(Self.controller().baseMapType == .atlas)
        #expect(MapBaseType.defaultGround == .atlas)
        #expect(MapBaseType.allCases.first == .atlas)
    }

    /// The web's `modern` layer is the Atlas in any style or the OpenStreetMap
    /// raster; Apple's maps and none at all are not it.
    @Test("The modern map is the Atlas or OpenStreetMap")
    func theModernMapIsTheAtlasOrOpenStreetMap() {
        #expect(MapBaseType.atlas.isModernMap)
        #expect(MapBaseType.atlasFletcher.isModernMap)
        #expect(MapBaseType.openStreetMap.isModernMap)
        #expect(!MapBaseType.standard.isModernMap)
        #expect(!MapBaseType.nsAerial.isModernMap)
        #expect(!MapBaseType.blank.isModernMap)
        #expect(MapBaseType.atlasNight.isAtlas)
        #expect(!MapBaseType.openStreetMap.isAtlas)
    }

    /// A system-appearance choice resolves the way the browser's does, and an
    /// explicit style is what it says whatever the appearance is.
    @Test("System appearance resolves to Day or Night; explicit styles stand")
    func systemAppearanceResolvesToDayOrNightAndExplicitStylesStand() {
        #expect(MapBaseType.atlas.atlasStyle(systemPrefersDark: false) == .day)
        #expect(MapBaseType.atlas.atlasStyle(systemPrefersDark: true) == .night)
        #expect(MapBaseType.atlasDay.atlasStyle(systemPrefersDark: true) == .day)
        #expect(MapBaseType.atlasNight.atlasStyle(systemPrefersDark: false) == .night)
        #expect(MapBaseType.atlasFletcher.atlasStyle(systemPrefersDark: true) == .fletcher)
        #expect(MapBaseType.openStreetMap.atlasStyle(systemPrefersDark: true) == nil)
    }

    /// The link carries the resolved style, as the browser writes it, and a
    /// style read from a link names its ground outright.
    @Test("A link carries the resolved style and restores it explicitly")
    func aLinkCarriesTheResolvedStyleAndRestoresItExplicitly() {
        #expect(MapBaseType.atlas.shareStyle(systemPrefersDark: true) == .night)
        #expect(MapBaseType.atlas.shareStyle(systemPrefersDark: false) == .day)
        #expect(MapBaseType.atlasFletcher.shareStyle(systemPrefersDark: false) == .fletcher)
        #expect(MapBaseType.openStreetMap.shareStyle(systemPrefersDark: false) == .osm)
        #expect(MapBaseType.satellite.shareStyle(systemPrefersDark: false) == nil)
        #expect(MapBaseType.blank.shareStyle(systemPrefersDark: true) == nil)

        for style in MapShareState.BasemapStyle.allCases {
            let ground = MapBaseType(shareStyle: style)
            #expect(ground.shareStyle(systemPrefersDark: false) == style)
            #expect(ground.shareStyle(systemPrefersDark: true) == style)
        }
    }

    /// A build with no host offers no Atlas entry and opens on the raster the
    /// browser itself falls back to; nothing is swapped in under the name.
    @Test("Without a host the Atlas leaves the picker and the default is OpenStreetMap")
    func withoutAHostTheAtlasLeavesThePickerAndTheDefaultIsOpenStreetMap() {
        #expect(MapBaseType.available(atlasHosted: true) == MapBaseType.allCases)
        #expect(!MapBaseType.available(atlasHosted: false).contains { $0.isAtlas })
        #expect(MapBaseType.available(atlasHosted: false).contains(.openStreetMap))
        #expect(MapBaseType.defaultGround(atlasHosted: false) == .openStreetMap)
        #expect(MapBaseType.defaultGround(atlasHosted: true) == .atlas)

        let unhosted = MapController(atlasRasterBaseURL: nil)
        let mapView = MKMapView()
        unhosted.mapView = mapView
        unhosted.baseMapType = .atlasDay
        #expect(mapView.overlays.compactMap { $0 as? AtlasBaseOverlay }.isEmpty)
        #expect(mapView.overlays.compactMap { $0 as? OSMBaseOverlay }.isEmpty)
    }

    @Test("Choosing the Atlas replaces Apple's map and choosing back removes it")
    func choosingTheAtlasReplacesApplesMapAndChoosingBackRemovesIt() {
        let controller = Self.controller()
        let mapView = MKMapView()
        controller.baseMapType = .standard
        controller.mapView = mapView
        #expect(mapView.overlays.compactMap { $0 as? AtlasBaseOverlay }.isEmpty)

        controller.baseMapType = .atlasFletcher
        let installed = mapView.overlays.compactMap { $0 as? AtlasBaseOverlay }
        #expect(installed.count == 1)
        #expect(installed.first?.style == .fletcher)
        // Without this MapKit keeps drawing its own map underneath, and the
        // reader is looking at two surveys at once.
        #expect(installed.first?.canReplaceMapContent == true)
        // MapKit's default square, because `tileSize` is the resolution it
        // expects and not a change to which square a zoom names: the zoom
        // arithmetic is `AtlasRasterBase.mapKitTile`'s. Every zoom the map
        // reaches is answered, since MapKit asks for nothing on a map that
        // opens beyond `maximumZ`.
        #expect(installed.first?.tileSize == CGSize(width: 256, height: 256))
        #expect(installed.first?.maximumZ == AtlasBaseOverlay.deepestZoom)
        #expect(installed.first?.maximumZ == 23)
        #expect(installed.first?.minimumZ == 0)

        controller.baseMapType = .standard
        #expect(mapView.overlays.compactMap { $0 as? AtlasBaseOverlay }.isEmpty)
    }

    /// A different style is a different ground: one Atlas overlay at a time,
    /// in the style asked for, and never one stacked on another.
    @Test("Switching styles swaps the one Atlas overlay")
    func switchingStylesSwapsTheOneAtlasOverlay() {
        let controller = Self.controller()
        let mapView = MKMapView()
        controller.mapView = mapView
        for type in [MapBaseType.atlasDay, .atlasNight, .openStreetMap, .atlasFletcher, .atlasFletcher] {
            controller.baseMapType = type
        }
        let atlas = mapView.overlays.compactMap { $0 as? AtlasBaseOverlay }
        #expect(atlas.map(\.style) == [.fletcher])
        #expect(mapView.overlays.compactMap { $0 as? OSMBaseOverlay }.isEmpty)
        #expect(mapView.overlays.compactMap { $0 as? BlankBaseOverlay }.isEmpty)
    }

    /// A map view attached after launch has to arrive on the Atlas the state
    /// says it is on, in the style the map's own appearance calls for.
    ///
    /// Asserted against the appearance the view actually reports rather than
    /// the one asked for: a dark override on a detached view reached the
    /// trait collection on one simulator and not on the hosted runner's, and
    /// which of Day or Night UIKit hands back is UIKit's to decide. What is
    /// this app's to get right is that the overlay, `systemPrefersDark` and
    /// the resolved ground all agree with it.
    @Test("A map view attached later gets the Atlas in its own appearance")
    func aMapViewAttachedLaterGetsTheAtlasInItsOwnAppearance() {
        let controller = Self.controller()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        window.overrideUserInterfaceStyle = .dark
        let mapView = MKMapView(frame: window.bounds)
        window.addSubview(mapView)
        window.isHidden = false
        window.layoutIfNeeded()
        controller.mapView = mapView
        let dark = mapView.traitCollection.userInterfaceStyle == .dark
        let atlas = mapView.overlays.compactMap { $0 as? AtlasBaseOverlay }
        #expect(atlas.map(\.style) == [dark ? .night : .day])
        #expect(controller.systemPrefersDark == dark)
        #expect(controller.resolvedBaseMapType == (dark ? .atlasNight : .atlasDay))

        // An explicit style does not follow the appearance.
        controller.baseMapType = .atlasDay
        #expect(mapView.overlays.compactMap { $0 as? AtlasBaseOverlay }.map(\.style) == [.day])
        #expect(controller.resolvedBaseMapType == .atlasDay)
        controller.baseMapType = .atlasNight
        #expect(mapView.overlays.compactMap { $0 as? AtlasBaseOverlay }.map(\.style) == [.night])
        #expect(controller.resolvedBaseMapType == .atlasNight)
        window.isHidden = true
    }

    /// It replaces the base map, so everything else has to be over it —
    /// including layers that were switched on before the ground changed.
    @Test("The Atlas goes under the layers already on the map")
    func theAtlasGoesUnderTheLayersAlreadyOnTheMap() throws {
        let controller = Self.controller()
        let mapView = MKMapView()
        controller.mapView = mapView

        var state = MapViewState()
        state.baseMapType = .standard
        state.layers = [try #require(nsprdLayer)]
        controller.apply(state)
        state.baseMapType = .atlasDay
        controller.apply(state)

        let installed = mapView.overlays.map { overlay -> String in
            if overlay is AtlasBaseOverlay { return "atlas" }
            if let tile = overlay as? OpacityTileOverlay { return tile.configuration.id }
            return "?"
        }
        #expect(installed == ["atlas", "nsprd"])
    }

    // MARK: - The tiles and the page

    /// The print layer: the shared id "modern", the page's own name for the
    /// style, a source the provider can tell from OpenStreetMap's, and one
    /// zoom past the package because the page's squares are quadrants.
    @Test("The print layer carries the shared id and reads quadrants")
    func thePrintLayerCarriesTheSharedIdAndReadsQuadrants() {
        let layer = AtlasRasterBase.printLayer(style: .night, baseURL: Self.host)
        #expect(layer.id == MapShareState.modernBaseLayerID)
        #expect(layer.name == "Atlas night base map")
        #expect(layer.configuration.maxZoom == AtlasRaster.zoomRange.upperBound + 1)
        guard case .atlasRaster(let style, let baseURL) = layer.configuration.source else {
            Issue.record("Expected an .atlasRaster source")
            return
        }
        #expect(style == .night)
        #expect(baseURL == Self.host)
        // Two styles are two caches, and a new revision is a new cache.
        let day = AtlasRasterBase.printLayer(style: .day, baseURL: Self.host)
        #expect(day.configuration.cacheIdentifier != layer.configuration.cacheIdentifier)
        #expect(day.configuration.cacheIdentifier.hasPrefix("modern_"))
    }

    @Test("The page names the modern map's ground for the base it printed on")
    func thePageNamesTheModernMapsGroundForTheBaseItPrintedOn() {
        #expect(
            PrintMapCompositor.modernPrintLayer(for: .openStreetMap, atlasBaseURL: Self.host)?.name
                == OpenStreetMapBase.pageName
        )
        #expect(
            PrintMapCompositor.modernPrintLayer(for: .atlasFletcher, atlasBaseURL: Self.host)?.name
                == "Atlas fletcher base map"
        )
        // A system-appearance Atlas the caller failed to resolve prints as Day
        // rather than as nothing; an Atlas on an unhosted build prints as
        // paper, never as another map under an Atlas credit.
        #expect(PrintMapCompositor.modernPrintLayer(for: .atlas, atlasBaseURL: Self.host)?.name == "Atlas day base map")
        #expect(PrintMapCompositor.modernPrintLayer(for: .atlasDay, atlasBaseURL: nil) == nil)
        #expect(PrintMapCompositor.modernPrintLayer(for: .standard, atlasBaseURL: Self.host) == nil)
    }

    /// The credit the framing toolbar shows while the strip is hidden names
    /// both of the ground's sources, and the page's sources carry both with
    /// their licences.
    @Test("The Atlas is credited to the Province and to OpenStreetMap")
    func theAtlasIsCreditedToTheProvinceAndToOpenStreetMap() {
        #expect(AtlasRasterBase.frameCredit.hasPrefix("NS Marks Atlas"))
        #expect(AtlasRasterBase.frameCredit.contains("© OpenStreetMap contributors"))
        let sources = AtlasRasterBase.printSources(fletcher: true)
        #expect(sources.map(\.name) == ["NS Marks Atlas", "Supplemental geography"])
        #expect(sources[0].attribution.contains(AtlasRaster.Provincial.attribution))
        #expect(sources[0].attribution.hasSuffix(AtlasRaster.fletcherStyleNote))
        #expect(sources[0].licenceUrl == AtlasRaster.Provincial.licenceURL.absoluteString)
        #expect(sources[1].attribution == AtlasRaster.Supplemental.credit)
        #expect(!AtlasRasterBase.printSources(fletcher: false)[0].attribution.contains("Fletcher"))
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

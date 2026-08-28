import CoreGraphics
import GeoCore
import MapCatalog
import MapKit
import NSDataServices
import SwiftUI

/// The official layers a scan may be lined up against.
///
/// Two, matching the browser's panel. A placement judged against Apple's
/// cartography and one judged against provincial imagery are not the same
/// placement: a shoreline generalised for a road map can sit tens of metres
/// from where the photograph puts it, and every control point placed on the
/// wrong one carries that error into the fit.
enum GeoreferenceReference: String, CaseIterable, Identifiable, Sendable {
    case aerial
    case parcels

    var id: String { rawValue }

    var layerID: LayerID {
        switch self {
        case .aerial: .nsAerial
        case .parcels: .nsprd
        }
    }

    /// The browser's wording, so a reader who has used both looks for the same
    /// checkbox.
    var title: String {
        switch self {
        case .aerial: "Aerial imagery"
        case .parcels: "Property boundaries"
        }
    }
}

/// A reference layer as installed: the overlay, and the opacity the catalog
/// says it draws at.
///
/// The alpha travels with the overlay because MapKit asks for a renderer long
/// after the overlay was made, and the georeferencer has no layer list to look
/// the figure up in the way the main map does.
struct GeoreferenceReferenceOverlay {
    let overlay: OpacityTileOverlay
    let alpha: CGFloat
}

/// What the georeferencer needs to draw an official layer under a scan.
///
/// The app's own cache, fetcher and clearance box, never fresh ones. A second
/// set would be a second route to the same restricted services with its own
/// idea of what the user has agreed to, and the whole point of the box is that
/// there is exactly one answer to that question.
@MainActor
struct GeoreferenceReferenceServices {
    let tileCache: TileCache
    let tileFetcher: TileFetcher
    let clearanceBox: LicenceClearanceBox
    /// The acceptance itself, not just the copy the tile queues read.
    ///
    /// The store is observable and the box is not, so reading the answer here
    /// is what makes a revocation on the main map reach a georeferencer that is
    /// already open: the panel re-evaluates, the switches lock, and the pane is
    /// handed an empty set, which takes the overlays out. The box alone would
    /// stop the next fetch and leave the tiles already drawn on screen.
    let licenceStore: ProvinceLicenceStore
    /// The main map's layers, read to open this pane showing what the reader
    /// was already looking at.
    let controller: MapController

    init(
        tileCache: TileCache,
        tileFetcher: TileFetcher,
        clearanceBox: LicenceClearanceBox,
        licenceStore: ProvinceLicenceStore,
        controller: MapController
    ) {
        self.tileCache = tileCache
        self.tileFetcher = tileFetcher
        self.clearanceBox = clearanceBox
        self.licenceStore = licenceStore
        self.controller = controller
    }

    init(container: AppContainer) {
        self.init(
            tileCache: container.tileCache,
            tileFetcher: container.tileFetcher,
            clearanceBox: container.clearanceBox,
            licenceStore: container.licenceStore,
            controller: container.mapController
        )
    }

    /// Whether the restricted layers may be drawn at all.
    ///
    /// Read at the moment of asking rather than stored: acceptance and
    /// revocation both happen on the main map, and a georeferencer opened
    /// before either must not go on believing the old answer.
    var allowsRestrictedLayers: Bool {
        licenceStore.clearance.allowsRestrictedLayers
    }

    /// The reference layers the main map is already showing.
    ///
    /// The browser's panel reads the same switches the map does, so an editor
    /// opened over aerial imagery opens over aerial imagery. This pane has a
    /// map of its own and cannot share the switch, so it copies its state once
    /// and then keeps its own: turning a layer off to see a shoreline while
    /// placing a scan is about this scan, and should not change the map waiting
    /// underneath.
    var activeOnTheMainMap: Set<GeoreferenceReference> {
        guard allowsRestrictedLayers else { return [] }
        let visible = Set(controller.layers.filter(\.isVisible).map(\.id))
        return Set(
            GeoreferenceReference.allCases.filter { visible.contains($0.layerID.rawValue) }
        )
    }

    /// Where the main map is looking, so this pane opens on the same ground.
    ///
    /// On the browser there is nothing to copy: the georeferencer places points
    /// on the live map, at whatever view the reader already had. This pane has
    /// its own map, and opening it on a fixed province-wide box put 400 km of
    /// coastline between the reader and the ground they were working on before
    /// the first control point could be placed.
    ///
    /// Nil before the map view exists, and the province-wide opening stands.
    var mainMapRegion: MKCoordinateRegion? {
        guard let bounds = controller.currentVisibleBounds() else { return nil }
        let latitudeDelta = bounds.maxLatitude - bounds.minLatitude
        let longitudeDelta = bounds.maxLongitude - bounds.minLongitude
        // A map mid-layout can report a degenerate rect, and MapKit reads a
        // zero span as "keep whatever you have", which would silently be the
        // province again with no way to tell the two apart.
        guard latitudeDelta > 0, longitudeDelta > 0 else { return nil }
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(
                latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
                longitude: (bounds.minLongitude + bounds.maxLongitude) / 2
            ),
            span: MKCoordinateSpan(
                latitudeDelta: latitudeDelta, longitudeDelta: longitudeDelta
            )
        )
    }

    /// What the drawn ground and layers oblige the page to say. Never empty:
    /// the pane's ground is OpenStreetMap whether or not a reference layer is
    /// on, and its credit is owed wherever the tiles show.
    func credits(for references: Set<GeoreferenceReference>) -> [ActiveAttribution.Credit] {
        ActiveAttribution.credits(
            for: GeoreferenceReference.allCases
                .filter { references.contains($0) }
                .compactMap { LayerCatalog.descriptor(for: $0.layerID) },
            baseMap: .openStreetMap
        )
    }

    /// The zoom this layer starts drawing at, from the catalogue.
    ///
    /// Property boundaries begin at 14. Below it MapKit asks for nothing and
    /// the layer is blank — which looks exactly like a stretch of ground the
    /// register has no parcels for, and is the one reading this pane must not
    /// leave a user with.
    func minimumZoom(for reference: GeoreferenceReference) -> Int? {
        LayerCatalog.descriptor(for: reference.layerID)?.minZoom
    }

    /// A tile overlay for one reference layer, or nil where the catalogue has
    /// nothing renderable for it.
    ///
    /// Built through `AppContainer.makeLayer` so this pane draws the same
    /// source, at the same zoom limits and opacity, as the layer of that name
    /// on the main map. A second definition here would be a second answer to
    /// "what is NS Aerial", and the two would drift.
    func overlay(for reference: GeoreferenceReference) -> GeoreferenceReferenceOverlay? {
        guard let descriptor = LayerCatalog.descriptor(for: reference.layerID),
              let layer = AppContainer.makeLayer(from: descriptor, fletcherBaseURL: nil)
        else { return nil }
        let overlay = OpacityTileOverlay(
            configuration: layer.configuration,
            tileCache: tileCache,
            tileFetcher: tileFetcher,
            clearanceBox: clearanceBox
        )
        overlay.canReplaceMapContent = false
        overlay.minimumZ = layer.configuration.minZoom
        overlay.maximumZ = layer.configuration.maxZoom
        return GeoreferenceReferenceOverlay(overlay: overlay, alpha: layer.opacity)
    }
}

extension EnvironmentValues {
    /// Absent in a preview or a test that never built an app container, which
    /// is why the georeferencer treats "no services" as "no reference layers"
    /// rather than as a failure.
    @Entry var georeferenceReferences: GeoreferenceReferenceServices?
}

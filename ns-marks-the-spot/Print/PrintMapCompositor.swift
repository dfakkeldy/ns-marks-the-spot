import GeoCore
import MapKit
import NSDataServices
import UIKit

/// Renders the print frame into the raster the exported page carries.
///
/// Ported from `web/src/print/pdf/mapCompositor.ts`. What the browser does
/// with a canvas and `drawImage`, this does with a `UIGraphicsImageRenderer`
/// and the same output space, so the two surfaces put the same layer in the
/// same place.
///
/// Every layer reports what happened to it. That is the point of the return
/// type: a tile source that failed and a tile source that had nothing at this
/// square look identical once they are drawn — both are blank — and a legend
/// that named the layer either way would tell the reader the map had been
/// asked and answered when it had not.
nonisolated struct PrintMapCompositor {
    enum LayerState: Equatable, Sendable {
        case drawn
        /// Some squares never arrived. The count is kept because a map missing
        /// two tiles of two hundred and one missing half its tiles are
        /// different documents.
        case partial(missing: Int, of: Int)
        case failed(String)
    }

    struct LayerOutcome: Equatable, Sendable {
        var id: String
        var name: String
        var state: LayerState
    }

    struct Output: Sendable {
        var jpeg: Data
        var widthPx: Int
        var heightPx: Int
        var outcomes: [LayerOutcome]
    }

    enum Failure: Error, Equatable {
        case baseMapUnavailable(String)
        case rasterNotEncodable
    }

    /// Fetches one square of one layer. Injected so the compositor can be
    /// exercised without a network, and so the app can hand it the same tile
    /// path the map itself uses — cache, licence gate and all.
    typealias TileProvider = @Sendable (TileLayerConfiguration, MKTileOverlayPath) async throws
        -> Data

    /// Renders one catalogued Province layer over the whole frame at once.
    ///
    /// Injected rather than defaulted: this path needs the licence clearance
    /// the app is holding, and a compositor that could build its own would be a
    /// way around the gate.
    typealias RenderProvider = @Sendable (LayerID, WebMercatorBox, Int, Int) async throws -> Data

    /// Renders the base map under everything else.
    typealias BaseMapProvider = @Sendable (GeoBoundingBox, Int, Int, MapBaseType) async throws
        -> UIImage

    /// How many tile requests are in flight at once.
    ///
    /// The same six the web uses. A print frame at 300 dpi is a few hundred
    /// squares, and letting them all go at once is how a export gets itself
    /// rate-limited by the very service it is quoting.
    static let tileConcurrency = 6

    static func compose(
        bounds: GeoBoundingBox,
        widthPx: Int,
        heightPx: Int,
        baseMap: MapBaseType,
        layers: [MapLayerState],
        parcels: [ParcelShape],
        /// Raster pixels per PDF point, so a line drawn at the weight it has
        /// on screen prints at that weight rather than as a hairline.
        lineScale: Double,
        tileProvider: @escaping TileProvider,
        renderProvider: @escaping RenderProvider,
        baseMapProvider: @escaping BaseMapProvider = Self.snapshotBaseMap
    ) async throws -> Output {
        let space = PrintOutputSpace(bounds: bounds, widthPx: widthPx, heightPx: heightPx)
        let base = try await baseMapProvider(bounds, widthPx, heightPx, baseMap)

        var drawnLayers = [(layer: MapLayerState, tiles: [(PrintTile, UIImage)], whole: UIImage?)]()
        var outcomes = [LayerOutcome]()
        for layer in layers where layer.effectiveAlpha > 0 {
            // A catalogued Province layer is a dynamic map service: nothing is
            // cached at the far end, so every tile is a render somebody pays
            // for. A 300 dpi frame is around 200 tiles, and the default four
            // layers would put some 800 renders on the service in one burst
            // every time a page was exported. One render of the whole frame is
            // the same picture for one two-hundredth of the work.
            if case .catalogExport(let layerID) = layer.configuration.source {
                do {
                    let data = try await renderProvider(
                        layerID, box(for: bounds), widthPx, heightPx
                    )
                    guard let image = UIImage(data: data) else {
                        throw Failure.rasterNotEncodable
                    }
                    drawnLayers.append((layer, [], image))
                    outcomes.append(
                        LayerOutcome(id: layer.id, name: layer.name, state: .drawn)
                    )
                } catch {
                    outcomes.append(
                        LayerOutcome(
                            id: layer.id, name: layer.name,
                            state: .failed(error.localizedDescription)
                        )
                    )
                }
                continue
            }
            let (tiles, state) = await self.tiles(
                for: layer, bounds: bounds, widthPx: widthPx, provider: tileProvider
            )
            drawnLayers.append((layer, tiles, nil))
            outcomes.append(LayerOutcome(id: layer.id, name: layer.name, state: state))
        }

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: widthPx, height: heightPx), format: format
        )
        let raster = renderer.image { context in
            base.draw(in: CGRect(x: 0, y: 0, width: widthPx, height: heightPx))
            for entry in drawnLayers {
                context.cgContext.saveGState()
                context.cgContext.setAlpha(entry.layer.effectiveAlpha)
                entry.whole?.draw(in: CGRect(x: 0, y: 0, width: widthPx, height: heightPx))
                for (tile, image) in entry.tiles {
                    let rect = space.rect(for: tile)
                    image.draw(
                        in: CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)
                    )
                }
                context.cgContext.restoreGState()
            }
            draw(parcels: parcels, into: context.cgContext, space: space, lineScale: lineScale)
        }

        // 0.92 rather than 1.0: at print dot pitch the difference is invisible
        // and the file is several times smaller, which is what decides whether
        // the page can be mailed.
        guard let jpeg = raster.jpegData(compressionQuality: 0.92) else {
            throw Failure.rasterNotEncodable
        }
        return Output(jpeg: jpeg, widthPx: widthPx, heightPx: heightPx, outcomes: outcomes)
    }

    /// The frame in the projection the services are asked in.
    static func box(for bounds: GeoBoundingBox) -> WebMercatorBox {
        let northWest = WebMercator.project(GeoPoint(lat: bounds.north, lng: bounds.west))
        let southEast = WebMercator.project(GeoPoint(lat: bounds.south, lng: bounds.east))
        return WebMercatorBox(
            minX: northWest.x, minY: southEast.y, maxX: southEast.x, maxY: northWest.y
        )
    }

    /// One square, and whether it arrived.
    private static func fetch(
        _ tile: PrintTile,
        _ configuration: TileLayerConfiguration,
        _ provider: @escaping TileProvider
    ) async -> (tile: PrintTile, image: UIImage?, error: String?) {
        do {
            let data = try await provider(
                configuration,
                MKTileOverlayPath(x: tile.x, y: tile.y, z: tile.z, contentScaleFactor: 1)
            )
            return (tile, UIImage(data: data), nil)
        } catch {
            return (tile, nil, error.localizedDescription)
        }
    }

    /// Fetches one layer's squares, and says how the layer fared.
    private static func tiles(
        for layer: MapLayerState,
        bounds: GeoBoundingBox,
        widthPx: Int,
        provider: @escaping TileProvider
    ) async -> ([(PrintTile, UIImage)], LayerState) {
        let zoom = PrintTilePlan.zoom(
            for: bounds, widthPx: widthPx, maxNativeZoom: layer.configuration.maxZoom
        )
        let planned = PrintTilePlan.tiles(covering: bounds, zoom: zoom)
        guard !planned.isEmpty else { return ([], .drawn) }

        var images = [(PrintTile, UIImage)]()
        var firstError: String?
        // The error travels as its message rather than as an `any Error`,
        // which is not `Sendable` and so cannot leave a task group.
        await withTaskGroup(of: (tile: PrintTile, image: UIImage?, error: String?).self) { group in
            let configuration = layer.configuration
            var next = 0
            while next < min(tileConcurrency, planned.count) {
                let tile = planned[next]
                group.addTask { await fetch(tile, configuration, provider) }
                next += 1
            }
            while let result = await group.next() {
                if let image = result.image {
                    images.append((result.tile, image))
                } else if firstError == nil {
                    // Nil bytes that were not an error are an answer that was
                    // not an image, which is still a square that did not draw.
                    firstError = result.error
                        ?? "The source returned something that was not an image."
                }
                if next < planned.count {
                    let tile = planned[next]
                    group.addTask { await fetch(tile, configuration, provider) }
                    next += 1
                }
            }
        }

        // Tiles are drawn in plan order, not arrival order, so a slow square
        // cannot end up on top of the one beside it.
        images.sort { left, right in
            (left.0.y, left.0.x) < (right.0.y, right.0.x)
        }

        let missing = planned.count - images.count
        if missing == 0 { return (images, .drawn) }
        if images.isEmpty {
            return (images, .failed(firstError ?? "No tiles were returned."))
        }
        return (images, .partial(missing: missing, of: planned.count))
    }

    /// Parcel outlines, in the same colours and weights the map draws them
    /// with, so a boundary read on screen is the boundary on the page.
    private static func draw(
        parcels: [ParcelShape],
        into context: CGContext,
        space: PrintOutputSpace,
        lineScale: Double
    ) {
        for parcel in parcels {
            let style = self.style(for: parcel.role)
            for part in parcel.parts {
                for ring in part where ring.count > 1 {
                    let path = CGMutablePath()
                    for (index, point) in ring.enumerated() {
                        let placed = space.point(for: point)
                        let target = CGPoint(x: placed.x, y: placed.y)
                        if index == 0 {
                            path.move(to: target)
                        } else {
                            path.addLine(to: target)
                        }
                    }
                    path.closeSubpath()
                    if let fill = style.fill {
                        context.addPath(path)
                        context.setFillColor(fill.cgColor)
                        context.fillPath()
                    }
                    context.addPath(path)
                    context.setStrokeColor(style.stroke.cgColor)
                    context.setLineWidth(style.width * lineScale)
                    if let dash = style.dash {
                        context.setLineDash(phase: 0, lengths: dash.map { $0 * lineScale })
                    } else {
                        context.setLineDash(phase: 0, lengths: [])
                    }
                    context.strokePath()
                }
            }
        }
        context.setLineDash(phase: 0, lengths: [])
    }

    /// The map's own parcel styling, kept beside it in `MapController`.
    private static func style(
        for role: ParcelShape.Role
    ) -> (stroke: UIColor, fill: UIColor?, width: Double, dash: [Double]?) {
        switch role {
        case .selected:
            return (UIColor(red: 0.624, green: 0.184, blue: 0.141, alpha: 1), nil, 4, nil)
        case .selectedHistorical:
            return (UIColor(red: 0.286, green: 0.200, blue: 0.435, alpha: 1), nil, 4, nil)
        case .taxSale:
            return (
                UIColor(red: 0.745, green: 0.302, blue: 0.235, alpha: 1),
                UIColor(red: 0.906, green: 0.659, blue: 0.420, alpha: 0.3),
                2, nil
            )
        case .historicalTaxSale:
            return (
                UIColor(red: 0.353, green: 0.263, blue: 0.522, alpha: 1),
                UIColor(red: 0.643, green: 0.580, blue: 0.800, alpha: 0.34),
                2.25, [5, 3]
            )
        case .context:
            return (
                UIColor(red: 0.039, green: 0.443, blue: 0.502, alpha: 1),
                UIColor(red: 0.933, green: 0.969, blue: 0.961, alpha: 0.08),
                1.25, nil
            )
        }
    }

    // MARK: - Defaults

    /// The base map, rendered by MapKit at the exact extent the frame covers.
    ///
    /// `mapRect` rather than a region: a region is fitted to the image's aspect
    /// and may cover more ground than it was given, which would put the base
    /// map out of register with every layer drawn on top of it.
    static func snapshotBaseMap(
        bounds: GeoBoundingBox, widthPx: Int, heightPx: Int, baseMap: MapBaseType
    ) async throws -> UIImage {
        let options = MKMapSnapshotter.Options()
        let northWest = MKMapPoint(
            CLLocationCoordinate2D(latitude: bounds.north, longitude: bounds.west)
        )
        let southEast = MKMapPoint(
            CLLocationCoordinate2D(latitude: bounds.south, longitude: bounds.east)
        )
        options.mapRect = MKMapRect(
            x: northWest.x, y: northWest.y,
            width: southEast.x - northWest.x, height: southEast.y - northWest.y
        )
        options.size = CGSize(width: widthPx, height: heightPx)
        options.scale = 1
        options.showsBuildings = false
        switch baseMap {
        // NS Aerial is a tile layer drawn over the standard base map, and it
        // arrives here as one of `layers`. Asking MapKit for imagery
        // underneath it would only be paying for pixels the aerial covers.
        case .standard, .nsAerial: options.mapType = .standard
        case .satellite: options.mapType = .satellite
        case .hybrid: options.mapType = .hybrid
        }

        do {
            return try await MKMapSnapshotter(options: options).start().image
        } catch {
            throw Failure.baseMapUnavailable(error.localizedDescription)
        }
    }

    enum TileProviderFailure: Error, Equatable {
        case noOverlayForLayer(String)
        case noRenderForLayer(String)
    }

    /// Renders a catalogued layer over the whole frame, through the same
    /// licence check the map's tiles go through.
    ///
    /// Both of the layer's passes, where it has two: the web draws the roads
    /// casing over the base pass, and a printed page missing it would show a
    /// different road network from the screen it was exported from.
    static func renderer(
        clearance: LicenceClearanceBox, fetcher: TileFetcher = TileFetcher()
    ) -> RenderProvider {
        { layerID, box, widthPx, heightPx in
            let held = clearance.clearance
            guard let request = try TileRequestFactory.exportRequest(
                for: layerID, box: box, widthPx: widthPx, heightPx: heightPx, clearance: held
            ) else {
                throw TileProviderFailure.noRenderForLayer(layerID.rawValue)
            }
            let base = try await fetcher.imageData(from: request.url)
            guard let second = try TileRequestFactory.exportRequest(
                for: layerID, box: box, widthPx: widthPx, heightPx: heightPx,
                overlay: true, clearance: held
            ) else {
                return base
            }
            let casing = try await fetcher.imageData(from: second.url)
            return flattened(base: base, over: casing, widthPx: widthPx, heightPx: heightPx)
                ?? base
        }
    }

    /// Two passes of one layer as one image, transparency intact — it is drawn
    /// over the base map, so flattening it onto white would black out the map.
    static func flattened(
        base: Data, over casing: Data, widthPx: Int, heightPx: Int
    ) -> Data? {
        guard let under = UIImage(data: base), let over = UIImage(data: casing) else {
            return nil
        }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let rect = CGRect(x: 0, y: 0, width: widthPx, height: heightPx)
        return UIGraphicsImageRenderer(size: rect.size, format: format).image { _ in
            under.draw(in: rect)
            over.draw(in: rect)
        }.pngData()
    }

    /// Fetches through the map's own overlays, so the export honours the cache
    /// and the licence clearance the screen is already holding.
    ///
    /// A layer with no overlay fails rather than being fetched some other way.
    /// Building a fresh overlay here would give it a fresh, empty clearance box
    /// — an export that quietly re-asked a source the user has not cleared, and
    /// printed the answer.
    static func provider(overlays: [String: OpacityTileOverlay]) -> TileProvider {
        { configuration, path in
            guard let overlay = overlays[configuration.id] else {
                throw TileProviderFailure.noOverlayForLayer(configuration.id)
            }
            return try await overlay.loadTile(at: path)
        }
    }
}

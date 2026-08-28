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
        /// Every square was answered and none of them carried any of this
        /// layer's ink, because nothing of it reaches this ground — outside the
        /// Fletcher sheets, say.
        ///
        /// Distinct from `.drawn` because the page makes claims in words: a
        /// legend row would tell the reader this ground was surveyed and found
        /// empty, and the attribution would credit a licence for pixels nobody
        /// drew. Distinct from `.failed` because nothing went wrong.
        case outsideCoverage
        /// Switched on, and not fetched because its licence has not been
        /// accepted. The screen shows the same blank; the page has to say why.
        case licenceBlocked
        /// On the screen, and outside what this export can draw.
        ///
        /// The compositor never produces this — it draws rasters and parcel
        /// outlines, and nothing else reaches it. It is set by whoever assembles
        /// the export, because a layer the page cannot carry has to be named
        /// somewhere or it leaves the screen without leaving a trace, and blank
        /// paper where a layer was would read as ground the layer has nothing
        /// on.
        case unsupported
        /// Switched on, drew nothing, and the reason is neither a licence nor a
        /// limit of this exporter: the frame is below the layer's minimum zoom,
        /// the query had not answered yet, or the service was down.
        ///
        /// The reason travels with it because those are three different things
        /// to a reader deciding whether to go back and print the sheet again.
        case notDrawn(reason: String)
        /// On the page, and showing an earlier view.
        ///
        /// The map keeps the previous view's features when a refresh fails or
        /// has not landed, deliberately: blanking the layer would state the
        /// ground went empty. On paper that leftover is indistinguishable from
        /// a fresh answer unless the page says so, and the reader would take
        /// ink drawn for other ground as this frame's finding.
        case drawnFromEarlierView(reason: String)
        /// On the page, and short of what the source sent: this many of the
        /// features could not be read.
        ///
        /// Separate from `.partial`, which counts tiles that never arrived.
        /// These arrived and were unusable, which is a statement about the data
        /// rather than about the fetch.
        case drawnPartlyUnread(count: Int)
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
    ///
    /// It returns the disposition beside the bytes because the bytes cannot
    /// carry it. A tile source that failed answers with a transparent square,
    /// the same square a source with nothing here answers with, and this
    /// compositor's whole purpose is to keep those two apart in the legend.
    typealias TileProvider = @Sendable (TileLayerConfiguration, MKTileOverlayPath) async throws
        -> (Data, TileLoadOutcome, TileSubstance)

    /// Renders one catalogued Province layer over the whole frame at once.
    ///
    /// Injected rather than defaulted: this path needs the licence clearance
    /// the app is holding, and a compositor that could build its own would be a
    /// way around the gate.
    /// A whole-frame render, decoded. `CGImage` rather than raw bytes at this
    /// seam: the two-pass path used to PNG-encode its composited page only for
    /// `compose` to decode the identical bytes one call later — a second of
    /// CPU and a multi-MB transient for nothing. `CGImage` is `Sendable` and
    /// crosses the same boundary.
    typealias RenderProvider = @Sendable (LayerID, WebMercatorBox, Int, Int) async throws -> CGImage

    /// Renders the base map under everything else.
    typealias BaseMapProvider = @Sendable (GeoBoundingBox, Int, Int, MapBaseType) async throws
        -> UIImage

    /// How many tile requests are in flight at once.
    ///
    /// The same six the web uses. A print frame at 300 dpi is a few hundred
    /// squares, and letting them all go at once is how a export gets itself
    /// rate-limited by the very service it is quoting.
    static let tileConcurrency = 6

    /// - Parameter layers: in the order they are to be drawn, bottom first.
    ///   This is not sorted here, because the order that matters is the one the
    ///   screen is actually showing: `MapController` installs its overlays in
    ///   `NativeLayerTraits.installOrder` and MapKit draws them in installation
    ///   order, so `controller.layers` already *is* the z-order the user is
    ///   looking at. Re-deriving it here would let the page and the screen
    ///   disagree about which layer is on top the first time the two orderings
    ///   drifted apart.
    /// `@concurrent`, not merely nonisolated: under approachable concurrency a
    /// nonisolated async function runs on its caller's actor, and the caller
    /// is the export sheet on the main actor. The composite, the decodes and
    /// the final JPEG encode are seconds of synchronous work that froze the
    /// sheet's own progress spinner.
    @concurrent
    static func compose(
        bounds: GeoBoundingBox,
        widthPx: Int,
        heightPx: Int,
        baseMap: MapBaseType,
        layers: [MapLayerState],
        parcels: [ParcelShape],
        /// The client-side layers, in the order the map draws them. Their
        /// outcomes are appended to the tile layers' so a page that shows a
        /// zone has a legend row and an attribution for it.
        features: [FeatureShape] = [],
        markers: [FeatureMarker] = [],
        /// Raster pixels per PDF point, so a line drawn at the weight it has
        /// on screen prints at that weight rather than as a hairline.
        lineScale: Double,
        tileProvider: @escaping TileProvider,
        renderProvider: @escaping RenderProvider,
        baseMapProvider: @escaping BaseMapProvider = Self.snapshotBaseMap
    ) async throws -> Output {
        let space = PrintOutputSpace(bounds: bounds, widthPx: widthPx, heightPx: heightPx)
        var outcomes = [LayerOutcome]()

        // One page-sized context, drawn into as each layer's answer arrives.
        // Accumulating every layer's decoded tiles and whole-frame renders and
        // drawing them all at the end held several hundred MB at once on a
        // multi-layer 300 dpi export; here each layer's images are released
        // before the next layer is fetched. The context is oriented the UIKit
        // way — origin top-left — which is the space every draw below was
        // written in when this ran under UIGraphicsImageRenderer.
        guard let cgContext = CGContext(
            data: nil, width: widthPx, height: heightPx, bitsPerComponent: 8,
            bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { throw Failure.rasterNotEncodable }
        cgContext.translateBy(x: 0, y: CGFloat(heightPx))
        cgContext.scaleBy(x: 1, y: -1)

        let pageRect = CGRect(x: 0, y: 0, width: widthPx, height: heightPx)

        // UIKit's current-context stack is per thread and this function hops
        // threads at every await, so the context is pushed only around each
        // synchronous batch of drawing and never held across a suspension.
        func drawSynchronously(_ body: () -> Void) {
            UIGraphicsPushContext(cgContext)
            defer { UIGraphicsPopContext() }
            body()
        }

        // The alpha is passed to each draw rather than set on the context:
        // `UIImage.draw(in:)` supplies an alpha of 1 of its own, which
        // overrides `setAlpha` and prints every layer fully opaque however
        // faint it looked on screen.
        func drawLayer(tiles: [(PrintTile, UIImage)], whole: UIImage?, alpha: CGFloat) {
            drawSynchronously {
                whole?.draw(in: pageRect, blendMode: .normal, alpha: alpha)
                for (tile, image) in tiles {
                    let rect = space.rect(for: tile)
                    image.draw(
                        in: CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height),
                        blendMode: .normal, alpha: alpha
                    )
                }
            }
        }

        if baseMap == .openStreetMap {
            // The page's ground is the screen's ground: the same OpenStreetMap
            // tiles, fetched through the same provider, rather than an
            // MKMapSnapshotter picture of a different survey. Paper-white goes
            // underneath, so a square that never arrives prints as paper — and
            // is *said*, because the base reports an outcome like any layer:
            // a lost square is a partial or failed row on the page, never
            // silently blank ground.
            let blank = blankBaseMap(widthPx: widthPx, heightPx: heightPx)
            drawSynchronously { blank.draw(in: pageRect) }
            let osm = OpenStreetMapBase.printLayer
            let (tiles, state) = await self.tiles(
                for: osm, bounds: bounds, widthPx: widthPx, provider: tileProvider
            )
            // First drawn, which is the bottom of the stack: the web's export
            // builds its layer list the same way, modern base first.
            autoreleasepool {
                drawLayer(tiles: tiles, whole: nil, alpha: osm.effectiveAlpha)
            }
            outcomes.append(
                LayerOutcome(
                    id: OpenStreetMapBase.layerID,
                    name: OpenStreetMapBase.pageName,
                    state: state
                )
            )
        } else {
            let base = try await baseMapProvider(bounds, widthPx, heightPx, baseMap)
            autoreleasepool {
                drawSynchronously { base.draw(in: pageRect) }
            }
        }

        for layer in layers where layer.effectiveAlpha > 0 {
            // Checked between layers as well as inside them: the tile path
            // reports an abandoned request as a layer that failed rather than
            // throwing, so without this the compositor works through every
            // remaining layer after the user has cancelled.
            try Task.checkCancellation()
            // A catalogued Province layer is a dynamic map service: nothing is
            // cached at the far end, so every tile is a render somebody pays
            // for. A 300 dpi frame is around 200 tiles, and the default four
            // layers would put some 800 renders on the service in one burst
            // every time a page was exported. One render of the whole frame is
            // the same picture for one two-hundredth of the work.
            if case .catalogExport(let layerID) = layer.configuration.source {
                do {
                    let rendered = try await renderProvider(
                        layerID, box(for: bounds), widthPx, heightPx
                    )
                    autoreleasepool {
                        drawLayer(
                            tiles: [], whole: UIImage(cgImage: rendered),
                            alpha: layer.effectiveAlpha
                        )
                    }
                    outcomes.append(
                        LayerOutcome(id: layer.id, name: layer.name, state: .drawn)
                    )
                } catch is CancellationError {
                    // Not a layer that failed: the user cancelled the export.
                    // Swallowed, it became a "could not be reached" note and
                    // the compositor carried on fetching the rest.
                    throw CancellationError()
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
            autoreleasepool {
                drawLayer(tiles: tiles, whole: nil, alpha: layer.effectiveAlpha)
            }
            outcomes.append(LayerOutcome(id: layer.id, name: layer.name, state: state))
        }

        // The tile path reports an abandoned request as an outcome rather than
        // throwing, so a cancel during the only layer's tiles reached here with
        // nothing to stop it — and the compositor went on to encode a full
        // 300 dpi raster for a page nobody was waiting for.
        try Task.checkCancellation()

        drawSynchronously {
            // Under the parcels, as on screen: a boundary the reader is
            // checking must not be buried by a zone drawn over it.
            draw(
                features: features, markers: markers, into: cgContext,
                space: space, lineScale: lineScale
            )
            draw(parcels: parcels, into: cgContext, space: space, lineScale: lineScale)
        }

        // 0.92 rather than 1.0: at print dot pitch the difference is invisible
        // and the file is several times smaller, which is what decides whether
        // the page can be mailed.
        guard let cgImage = cgContext.makeImage(),
              let jpeg = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.92)
        else {
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
    ///
    /// A square the source answered for is kept even when it is blank: blank is
    /// a real answer, and the page is entitled to draw it. A square the source
    /// failed or abandoned is dropped even though bytes came back with it,
    /// because those bytes are a placeholder standing in for an answer nobody
    /// got.
    private static func fetch(
        _ tile: PrintTile,
        _ configuration: TileLayerConfiguration,
        _ provider: @escaping TileProvider
    ) async -> (tile: PrintTile, image: UIImage?, substance: TileSubstance, error: String?) {
        do {
            let (data, outcome, substance) = try await provider(
                configuration,
                MKTileOverlayPath(x: tile.x, y: tile.y, z: tile.z, contentScaleFactor: 1)
            )
            switch outcome {
            case .served:
                return (tile, UIImage(data: data), substance, nil)
            case .failed:
                return (tile, nil, .placeholder, "The source could not be reached.")
            case .cancelled:
                return (
                    tile, nil, .placeholder,
                    "The request was abandoned before it finished."
                )
            }
        } catch {
            return (tile, nil, .placeholder, error.localizedDescription)
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
        // What the answered squares actually contained, which decides whether
        // this layer may be named on the page at all.
        var inked = 0
        var uncovered = 0
        var refused = 0
        // The error travels as its message rather than as an `any Error`,
        // which is not `Sendable` and so cannot leave a task group.
        await withTaskGroup(
            of: (
                tile: PrintTile, image: UIImage?, substance: TileSubstance, error: String?
            ).self
        ) { group in
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
                    switch result.substance {
                    case .source: inked += 1
                    case .outsideCoverage: uncovered += 1
                    case .licenceRefused: refused += 1
                    case .placeholder: break
                    }
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
        if images.isEmpty {
            return (images, .failed(firstError ?? "No tiles were returned."))
        }
        // Before the missing-square arithmetic, because a layer that put no ink
        // anywhere is not a partly drawn layer. One real square is enough to
        // make it drawn — a Fletcher sheet's edge crossing the frame is ink on
        // the page, and the squares beyond it are ground the survey never
        // reached rather than squares that failed.
        if inked == 0 {
            if refused > 0 { return (images, .licenceBlocked) }
            if uncovered > 0 { return (images, .outsideCoverage) }
            // Answered squares that carried neither ink nor a reason: nothing
            // was actually fetched. Reported as a failure rather than as a
            // drawn layer, because the page would otherwise name a source it
            // never contacted.
            return (images, .failed(firstError ?? "Nothing was fetched for this layer."))
        }
        if missing == 0 { return (images, .drawn) }
        return (images, .partial(missing: missing, of: planned.count))
    }

    /// The client-side feature layers, in their print styling.
    ///
    /// Ordered by the same z-index the screen uses, so a page and a screenshot
    /// of the same ground stack their layers the same way.
    private static func draw(
        features: [FeatureShape],
        markers: [FeatureMarker],
        into context: CGContext,
        space: PrintOutputSpace,
        lineScale: Double
    ) {
        for shape in features.enumerated()
            .sorted(by: { ($0.element.zIndex, $0.offset) < ($1.element.zIndex, $1.offset) })
            .map(\.element)
        {
            let style = shape.printStyle
            switch shape.geometry {
            case .polygon(let part):
                stroke(parts: [part], style: style, filled: true,
                       into: context, space: space, lineScale: lineScale)
            case .multiPolygon(let parts):
                stroke(parts: parts, style: style, filled: true,
                       into: context, space: space, lineScale: lineScale)
            case .lineString(let line):
                stroke(parts: [[line]], style: style, filled: false,
                       into: context, space: space, lineScale: lineScale)
            case .multiLineString(let lines):
                stroke(parts: [lines], style: style, filled: false,
                       into: context, space: space, lineScale: lineScale)
            case .point, .multiPoint:
                // A shape layer that answered with a point draws nothing, the
                // same as on screen: a dot this layer never promised would be a
                // record the page invented.
                continue
            }
        }

        for marker in markers {
            // Fixed size in points, as on screen and for the same reason: the
            // record is at this coordinate to whatever precision its accuracy
            // band allows, and a circle scaled to the page would read as a
            // measured radius around it.
            let style = marker.printStyle
            let placed = space.point(for: GeoPoint(lat: marker.latitude, lng: marker.longitude))
            let radius = (style.markerRadius ?? 5) * lineScale
            let rect = CGRect(
                x: placed.x - radius, y: placed.y - radius, width: radius * 2, height: radius * 2
            )
            let circle = CGPath(ellipseIn: rect, transform: nil)
            if let fillHex = style.fillHex, style.fillOpacity > 0 {
                context.addPath(circle)
                context.setFillColor(
                    UIColor(featureHex: fillHex, alpha: style.fillOpacity).cgColor
                )
                context.fillPath()
            }
            // The same visibility gate the ink predicates use: a width of
            // zero is outside `setLineWidth`'s contract, and stroking with it
            // could inherit whatever width the previous shape left behind.
            if style.strokeOpacity > 0, style.lineWidth > 0 {
                context.addPath(circle)
                context.setStrokeColor(
                    UIColor(featureHex: style.strokeHex, alpha: style.strokeOpacity).cgColor
                )
                context.setLineWidth(style.lineWidth * lineScale)
                // Set, not inherited: a rounded feature drawn just before this
                // marker would otherwise lend its round caps to the marker's
                // dashes, and the same marker would print differently
                // depending on an unrelated neighbour.
                context.setLineCap(.butt)
                context.setLineDash(
                    phase: 0, lengths: (style.dashPattern ?? []).map { $0 * lineScale }
                )
                context.strokePath()
            }
        }
        context.setLineDash(phase: 0, lengths: [])
        context.setLineCap(.butt)
        context.setLineJoin(.miter)
    }

    private static func stroke(
        parts: [[[GeoPoint]]],
        style: VectorFeatureStyle,
        filled: Bool,
        into context: CGContext,
        space: PrintOutputSpace,
        lineScale: Double
    ) {
        for part in parts {
            // One path per part so a ring after the first subtracts as a hole,
            // exactly as the parcel outlines do.
            let path = CGMutablePath()
            for ring in part where ring.count > 1 {
                for (index, point) in ring.enumerated() {
                    let placed = space.point(for: point)
                    let target = CGPoint(x: placed.x, y: placed.y)
                    if index == 0 { path.move(to: target) } else { path.addLine(to: target) }
                }
                if filled { path.closeSubpath() }
            }
            guard !path.isEmpty else { continue }
            if filled, let fillHex = style.fillHex, style.fillOpacity > 0 {
                context.addPath(path)
                context.setFillColor(UIColor(featureHex: fillHex, alpha: style.fillOpacity).cgColor)
                context.fillPath(using: .evenOdd)
            }
            // Bevel rather than miter where the ends are square: a miter tip
            // at an acute corner can spike several line widths past the
            // vertex, which is ink the half-width reach the ink predicates
            // pad by could never account for. Bevel and round both keep the
            // whole stroke within half a width of the centre line, so the
            // page's ink and the page's list agree at every corner. The same
            // gate as the predicates, because a zero width is outside
            // `setLineWidth`'s contract.
            if style.strokeOpacity > 0, style.lineWidth > 0 {
                context.addPath(path)
                context.setStrokeColor(
                    UIColor(featureHex: style.strokeHex, alpha: style.strokeOpacity).cgColor
                )
                context.setLineWidth(style.lineWidth * lineScale)
                context.setLineCap(style.hasRoundedEnds ? .round : .butt)
                context.setLineJoin(style.hasRoundedEnds ? .round : .bevel)
                context.setLineDash(
                    phase: 0, lengths: (style.dashPattern ?? []).map { $0 * lineScale }
                )
                context.strokePath()
            }
        }
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
                // One path for the whole part, not one per ring. A part's first
                // ring is its outline and any that follow are holes in it —
                // `MKPolygon(interiorPolygons:)` on screen — so filling each
                // ring on its own would paint the holes back in. Even-odd is
                // what makes the second ring subtract from the first.
                let path = CGMutablePath()
                for ring in part where ring.count > 1 {
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
                }
                guard !path.isEmpty else { continue }
                if let fill = style.fill {
                    context.addPath(path)
                    context.setFillColor(fill.cgColor)
                    context.fillPath(using: .evenOdd)
                }
                // The hole's edge is drawn too: it is a boundary of the parcel,
                // and the map strokes it.
                context.addPath(path)
                context.setStrokeColor(style.stroke.cgColor)
                context.setLineWidth(style.width * lineScale)
                // Bevel for the same reason the features use it: a miter tip
                // at an acute lot corner would carry ink past the half-width
                // reach the legend and the credit are padded by.
                context.setLineJoin(.bevel)
                if let dash = style.dash {
                    context.setLineDash(phase: 0, lengths: dash.map { $0 * lineScale })
                } else {
                    context.setLineDash(phase: 0, lengths: [])
                }
                context.strokePath()
            }
        }
        context.setLineDash(phase: 0, lengths: [])
    }

    /// The map's own parcel styling — one table with the screen renderer and
    /// the legend, see `ParcelRoleStyle`.
    private static func style(for role: ParcelShape.Role) -> ParcelRoleStyle {
        ParcelRoleStyle.style(for: role)
    }

    /// What the parcel marks are called on the page, and the colours they were
    /// drawn in.
    ///
    /// Parcels reach the raster from their own list rather than from the layer
    /// list, so no layer row accounts for them and, without this, the reader
    /// gets up to five colours of boundary and no key. The browser puts its one
    /// parcel mark in the layer list for exactly this reason.
    ///
    /// The swatch is read back out of the colour the compositor strokes with,
    /// so the key cannot drift from the ink. Roles appear in a fixed order, and
    /// only the roles whose parcels reach this frame: the frame is drawn by
    /// hand and can be nowhere near the selection, and a key to a colour that
    /// is not on the page is the page describing ink it does not carry.
    static func parcelLegend(
        for parcels: [ParcelShape], within bounds: GeoBoundingBox, mapFrame: PdfRect
    ) -> [PdfComposer.LegendEntry] {
        let drawn = Set(
            parcels.filter { marks($0, within: bounds, mapFrame: mapFrame) }.map(\.role)
        )
        let ordered: [ParcelShape.Role] = [
            .selected, .selectedHistorical, .taxSale, .historicalTaxSale, .context
        ]
        return ordered.filter(drawn.contains).map { role in
            PdfComposer.LegendEntry(
                name: legendName(for: role), swatchColour: hex(of: style(for: role).stroke)
            )
        }
    }

    /// The mark's name, said the way the panel that produced it says it. A
    /// current notice and a published past record are different documents, and
    /// the page has to keep a reader from reading one as the other.
    /// Whether this parcel put ink inside the frame.
    ///
    /// An outline-only mark is its boundary and nothing else, so a parcel large
    /// enough to hold the whole frame strokes off the page and would key a
    /// colour the reader cannot find anywhere on it. A filled mark tints the
    /// frame from the inside, so being surrounded by one is exactly when it is
    /// most visible. The fill comes from the same style table the swatch does,
    /// so the key cannot disagree with the ink about either.
    /// Whether any of these parcels put ink inside the frame.
    ///
    /// Asked for the attribution, which follows the ink: a frame drawn well
    /// away from the selection carries no Province boundary, and crediting
    /// NSPRD on it names a source the page took nothing from.
    static func drawsParcels(
        _ parcels: [ParcelShape], within bounds: GeoBoundingBox, mapFrame: PdfRect
    ) -> Bool {
        parcels.contains { marks($0, within: bounds, mapFrame: mapFrame) }
    }

    /// The boundary is asked about the frame grown by half this role's stroke
    /// width: the stroke is centred on the boundary, so a line passing just
    /// outside the page still lays a coloured sliver along its edge, and a
    /// sliver with no key is the very thing the legend exists to prevent.
    private static func marks(
        _ parcel: ParcelShape, within bounds: GeoBoundingBox, mapFrame: PdfRect
    ) -> Bool {
        if marksBoundary(parcel, within: bounds, mapFrame: mapFrame) { return true }
        return style(for: parcel.role).fill != nil && parcel.surrounds(bounds)
    }

    /// The padded half of `marks` on its own, shared with the title's
    /// question, so the page cannot key and credit a grazing boundary the
    /// title then refuses to name.
    static func marksBoundary(
        _ parcel: ParcelShape, within bounds: GeoBoundingBox, mapFrame: PdfRect
    ) -> Bool {
        let reach = style(for: parcel.role).width / 2
        let reached = bounds.expanded(
            byFractionX: reach / mapFrame.width, fractionY: reach / mapFrame.height
        )
        return parcel.boundaryReaches(reached)
    }

    private static func legendName(for role: ParcelShape.Role) -> String {
        switch role {
        case .selected: "Selected parcel"
        case .selectedHistorical: "Selected parcel (historical record)"
        case .taxSale: "In a current tax-sale notice"
        case .historicalTaxSale: "In a published past tax-sale record"
        case .context: "Nearby parcel boundary"
        }
    }

    private static func hex(of colour: UIColor) -> String {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        guard colour.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return "#000000" }
        // Clamped, not merely rounded: an extended-range colour reports
        // components outside 0...1 and the conversion would trap, which is a
        // crash in the middle of making a page.
        let channel = { (value: CGFloat) in UInt32(min(255, max(0, (value * 255).rounded()))) }
        return String(format: "#%02X%02X%02X", channel(red), channel(green), channel(blue))
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
        // Reading with no base map is a choice about what the page shows, and
        // the page has to keep it. Asking MapKit for a snapshot and drawing it
        // anyway would put back exactly the roads and labels the reader turned
        // off to see an historical sheet clean. The OpenStreetMap ground is
        // paper here too: `compose` draws it from tiles and never asks this
        // snapshotter for it, and answering with Apple's map instead would put
        // Apple pixels under an OpenStreetMap credit.
        case .blank, .openStreetMap:
            return blankBaseMap(widthPx: widthPx, heightPx: heightPx)
        }

        do {
            return try await MKMapSnapshotter(options: options).start().image
        } catch {
            throw Failure.baseMapUnavailable(error.localizedDescription)
        }
    }

    /// White, the colour of the paper the rest of the page is printed on.
    static func blankBaseMap(widthPx: Int, heightPx: Int) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let size = CGSize(width: widthPx, height: heightPx)
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
    }

    enum TileProviderFailure: Error, Equatable {
        case noOverlayForLayer(String)
        case noRenderForLayer(String)
        /// A layer with two passes returned both, and they could not be stacked.
        case passesNotCombinable(String)
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
                guard let image = UIImage(data: base)?.cgImage else {
                    throw Failure.rasterNotEncodable
                }
                return image
            }
            let casing = try await fetcher.imageData(from: second.url)
            // Fails the layer rather than returning the base pass alone. The
            // casing is what keeps a road legible where it crosses water, so a
            // page missing it shows a different road network from the screen it
            // was exported from — and would say "Printed" underneath it.
            guard let both = flattened(
                base: base, over: casing, widthPx: widthPx, heightPx: heightPx
            ) else {
                throw TileProviderFailure.passesNotCombinable(layerID.rawValue)
            }
            return both
        }
    }

    /// Two passes of one layer as one image, transparency intact — it is drawn
    /// over the base map, so flattening it onto white would black out the map.
    /// Returned decoded rather than PNG-encoded: `compose` draws it straight
    /// into the page, and the encode/decode pair this used to pay was exactly
    /// undone one call later.
    static func flattened(
        base: Data, over casing: Data, widthPx: Int, heightPx: Int
    ) -> CGImage? {
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
        }.cgImage
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
            // The OpenStreetMap ground is not one of the panel's overlays — it
            // is the base — but it fetches through the same request the screen
            // uses, User-Agent and shared URL cache included, so the page and
            // the screen are the same map from the same session.
            if configuration.id == OpenStreetMapBase.layerID {
                return await OpenStreetMapBase.exportTile(
                    z: path.z, x: path.x, y: path.y
                )
            }
            guard let overlay = overlays[configuration.id] else {
                throw TileProviderFailure.noOverlayForLayer(configuration.id)
            }
            // `exportTile`, not `loadTile`: the second answer is the one the
            // legend is built from.
            return try await overlay.exportTile(at: path)
        }
    }
}

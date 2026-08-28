import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import UIKit

/// Everything the export needs to know about the map, gathered before the work
/// starts.
///
/// A value rather than a reference to the live map: compositing takes seconds,
/// and a page assembled from a map that moved underneath it would carry a
/// registration for ground it does not show.
nonisolated struct PrintExportRequest: Sendable {
    var visibleBounds: GeoBoundingBox
    var baseMap: MapBaseType
    var layers: [MapLayerState]
    var parcels: [ParcelShape]
    /// The client-side layers' features, as they were on the screen this page
    /// was made from — zones, policy areas, screened reaches and the rest.
    ///
    /// Snapshotted with everything else so the page cannot be assembled from a
    /// half-reloaded viewport.
    var features: [FeatureShape] = []
    var markers: [FeatureMarker] = []
    /// What the layer panel said each viewport layer was doing when this page
    /// was made, in the panel's own words, so the page and the screen give the
    /// reader one account.
    ///
    /// The page reads this two ways. A layer that put no ink here has to be
    /// named, or the blank reads as ground the layer was asked about and found
    /// empty. A layer whose ink is the previous view's has to say so, or a
    /// leftover reads as this frame's answer. The browser names the same layers
    /// on its own printed sheet.
    var featureLayerStatuses: [LayerID: ViewportLayerStatus] = [:]
    var template: PdfTemplate
    var fields: PdfComposer.Fields
    /// Whether the page carries its legend box.
    ///
    /// Only the swatches. The attribution strip and the disclosures are
    /// obligations — who is owed a credit, and what the reader must not
    /// conclude — and neither is ever the user's to switch off.
    var includesLegend: Bool = true
    /// What the page's QR code should point at, or nil for no code at all.
    ///
    /// The map state rather than a finished link. The code is labelled an exact
    /// receipt, so it has to describe the paper: the ground this page was framed
    /// on, and the layers that put ink on it. Neither is known until the raster
    /// is composited, so the link itself is written there.
    var share: PrintShareLink?
    /// The evidence appendix's pages, or empty for a map on its own.
    var appendix: [PdfAppendix.Block] = []
    /// What this page must not be read as, and what state the map was in when
    /// it was captured. Set by the document being made, and never empty: the
    /// default is the stricter of the two caveats.
    ///
    /// These print ahead of the account of what did and did not draw, and ahead
    /// of the credits, because what a reader must not conclude comes before
    /// either.
    var disclosures: [String] = [PrintExport.screeningCaveat]
    var generatedAt: Date
}

/// The map state a printed receipt links back to, before the export fills in
/// what the page turned out to be.
nonisolated struct PrintShareLink: Sendable {
    var base: URL
    /// The selection, the record mode and the layers the reader asked for.
    /// The position and the layer list are both replaced by the export with
    /// what the page came to hold.
    var state: MapShareState

    init(base: URL, state: MapShareState) {
        self.base = base
        self.state = state
    }
}

nonisolated enum PrintExport {
    enum Failure: Error, Equatable {
        case couldNotWriteFile
    }

    /// What a filed page says about itself, word for word as the web's research
    /// document says it.
    static let screeningCaveat =
        "Screening evidence only. Not a survey, title opinion, access conclusion, "
        + "appraisal, or proof of absence."

    /// The field sheet's, which is a different warning rather than a shorter
    /// one. A page taken onto the ground is read against what the reader can
    /// see there, so it asks them to confirm rather than listing what it is not.
    static let fieldCaveat =
        "Field screening/reference material only. Not a survey or an access conclusion. "
        + "Confirm conditions, boundaries, and permissions on site and from "
        + "authoritative sources."

    /// The finished page, and the account of what did and did not draw.
    struct Result: Sendable {
        var pdf: Data
        var resolution: ExportResolution
        var outcomes: [PrintMapCompositor.LayerOutcome]
    }

    /// How the page reports a layer that was on and drew nothing here.
    ///
    /// The licence keeps its own sentence, and it is the stronger one: nothing
    /// was ever fetched, so there is no missing draw to explain. Everything else
    /// carries the panel's own reason, because zoom, wait and outage are three
    /// different things to a reader deciding whether to print again.
    static func pageState(for status: ViewportLayerStatus) -> PrintMapCompositor.LayerState {
        status == .licenceBlocked
            ? .licenceBlocked
            : .notDrawn(reason: status.printReason)
    }

    /// How the page reports a layer that does have ink on it.
    ///
    /// The map holds the previous view's features when a refresh fails or has
    /// not landed yet, on purpose — blanking the layer would state the ground
    /// went empty — so ink on the page is not proof this frame was answered.
    /// Features the source sent and this app could not read are the other way a
    /// drawn layer is short of its own answer.
    static func pageState(
        forDrawn status: ViewportLayerStatus?
    ) -> PrintMapCompositor.LayerState {
        switch status {
        case .loading, .failed:
            .drawnFromEarlierView(reason: status?.printReason ?? "")
        case .ready(_, let unreadable) where unreadable > 0:
            .drawnPartlyUnread(count: unreadable)
        // A settled answer, or ink from somewhere this status map does not
        // describe, which is not this function's to guess about.
        default: .drawn
        }
    }

    /// A layer that was on the screen and contributed nothing to the paper.
    struct UndrawnFeatureLayer: Sendable, Equatable {
        var id: LayerID
        var status: ViewportLayerStatus
    }

    /// The switched-on layers that put nothing inside the frame, and why.
    ///
    /// A layer with ink on the page is never here, whatever its status says: it
    /// drew, and the page shows what it drew. `.off` is the reader's own
    /// decision. `.ready` is an answer — this ground was queried and holds none
    /// of that thing, which is a finding, not a gap, and saying "not printed"
    /// over it would turn evidence of absence into an absence of evidence.
    static func undrawnFeatureLayers(
        _ statuses: [LayerID: ViewportLayerStatus], drawn: Set<LayerID>
    ) -> [UndrawnFeatureLayer] {
        statuses
            .filter { !drawn.contains($0.key) }
            .compactMap { id, status -> UndrawnFeatureLayer? in
                switch status {
                case .off, .ready: nil
                case .zoomGated, .loading, .failed, .licenceBlocked:
                    UndrawnFeatureLayer(id: id, status: status)
                }
            }
            // Dictionaries have no order and a printed page must not change
            // between two exports of the same view.
            .sorted { $0.id.rawValue < $1.id.rawValue }
    }

    /// The link the printed receipt carries: the ground on this paper, and the
    /// layers that put ink on it.
    ///
    /// The code is labelled exact, so it may not describe the map the reader
    /// left behind. The frame is drawn by hand and the view moves on after it,
    /// so the centre and the zoom are read off the printed bounds rather than
    /// off the screen. A layer that was switched on and reached the paper with
    /// nothing is dropped, because scanning the code would otherwise turn that
    /// layer back on and show the reader ground the page never carried.
    ///
    /// A layer that answered and had nothing to put here stays on the link.
    /// That is a finding about this ground, and dropping it would turn "asked,
    /// and there is none here" into "never asked".
    static func receipt(
        for link: PrintShareLink,
        printed bounds: GeoBoundingBox,
        mapFrame: PdfRect,
        outcomes: [PrintMapCompositor.LayerOutcome]
    ) -> URL? {
        let inkless = Set(
            outcomes.compactMap { outcome -> String? in
                switch outcome.state {
                case .drawn, .partial, .outsideCoverage, .drawnFromEarlierView,
                    .drawnPartlyUnread:
                    return nil
                case .failed, .licenceBlocked, .unsupported, .notDrawn:
                    return outcome.id
                }
            }
        )
        var state = link.state
        state.layerIDs.removeAll { inkless.contains($0) }
        if let position = position(of: bounds, mapFrame: mapFrame) {
            state.position = position
        }
        return state.url(base: link.base)
    }

    /// Where a browser has to stand to see the ground this page prints.
    ///
    /// The zoom comes off the map frame the way the app reads it off the
    /// screen, because the frame is this page's viewport. Nil when the frame
    /// or the span is degenerate, which leaves the caller's own position in
    /// place rather than writing a coordinate nothing measured.
    static func position(of bounds: GeoBoundingBox, mapFrame: PdfRect) -> MapPosition? {
        let span = bounds.east - bounds.west
        guard span > 0, mapFrame.width > 0 else { return nil }
        let zoom = log2(360 * (mapFrame.width / 256) / span)
        guard zoom.isFinite else { return nil }
        return MapPosition(
            latitude: (bounds.south + bounds.north) / 2,
            longitude: (bounds.west + bounds.east) / 2,
            zoom: Int(zoom.rounded())
        )
    }

    /// `@concurrent` for the same reason `PrintMapCompositor.compose` is: the
    /// PDF assembly and encodes in here are synchronous stretches that must
    /// not run on the export sheet's actor.
    @concurrent
    static func build(
        _ request: PrintExportRequest,
        physicalMemoryBytes: UInt64,
        tileProvider: @escaping PrintMapCompositor.TileProvider,
        renderProvider: @escaping PrintMapCompositor.RenderProvider,
        baseMapProvider: @escaping PrintMapCompositor.BaseMapProvider
            = PrintMapCompositor.snapshotBaseMap,
        descriptor: @Sendable (String) -> LayerDescriptor? = { id in
            LayerID(rawValue: id).flatMap(LayerCatalog.descriptor(for:))
        }
    ) async throws -> Result {
        let template = request.template
        let bounds = PrintExportPlan.bounds(
            covering: request.visibleBounds, mapFrame: template.mapFrame
        )
        let resolution = PrintResolution.resolve(
            mapFrame: template.mapFrame,
            constrainedDevice: PrintResolution.isConstrained(
                physicalMemoryBytes: physicalMemoryBytes
            )
        )

        let raster = try await PrintMapCompositor.compose(
            bounds: bounds,
            widthPx: resolution.widthPx,
            heightPx: resolution.heightPx,
            baseMap: request.baseMap,
            layers: request.layers,
            parcels: request.parcels,
            features: request.features,
            markers: request.markers,
            // A line drawn at the weight it has on screen, so a boundary reads
            // the same on paper as it did in the hand.
            lineScale: Double(resolution.widthPx) / template.mapFrame.width,
            tileProvider: tileProvider,
            renderProvider: renderProvider,
            baseMapProvider: baseMapProvider
        )

        // Appended after the tile layers, so the "what printed" list reads in
        // the order the page was assembled. Their features were already in hand
        // when the page was made, so nothing here could fail mid-export; what
        // the panel says about them is about the request that produced them.
        var featureLayers = [LayerID]()
        var seen = Set<LayerID>()
        for layer in request.features.map(\.layer) + request.markers.map(\.layer)
        where seen.insert(layer).inserted {
            featureLayers.append(layer)
        }
        let outcomes = raster.outcomes + featureLayers.map { id in
            PrintMapCompositor.LayerOutcome(
                id: id.rawValue,
                name: descriptor(id.rawValue)?.name ?? id.rawValue,
                state: pageState(forDrawn: request.featureLayerStatuses[id])
            )
        } + undrawnFeatureLayers(request.featureLayerStatuses, drawn: seen).map { layer in
            PrintMapCompositor.LayerOutcome(
                id: layer.id.rawValue,
                name: descriptor(layer.id.rawValue)?.name ?? layer.id.rawValue,
                state: pageState(for: layer.status)
            )
        }
        // Written here rather than handed in, because what the code claims to
        // be a receipt for is only settled once the raster is composited: the
        // bounds are the frame grown to the paper, and the outcomes are which
        // layers reached it.
        let receiptURL = request.share.flatMap {
            receipt(for: $0, printed: bounds, mapFrame: template.mapFrame, outcomes: outcomes)
        }
        let account = PrintExportPlan.account(
            for: outcomes,
            swatch: { _ in nil }
        )
        // The account's notes go to the strip, not into the user's own notes.
        // A layer that was on the screen and is not on the paper has to be said
        // in a place the layout cannot drop; the title block can be eaten
        // whole by a long title, and this sentence going missing is the page
        // silently claiming the map is complete.
        var notes = [String]()
        if resolution.reduced {
            // The dot pitch is a property of the page, and a reader comparing
            // two printouts of the same view deserves to know which one holds
            // less detail.
            notes.append("Map raster printed at \(resolution.dpi) dpi.")
        }
        let legend = PrintMapCompositor.parcelLegend(
            for: request.parcels, within: bounds, mapFrame: template.mapFrame
        )
            + account.legend
        var fields = request.fields
        fields.notes = ([request.fields.notes] + notes)
            .filter { !$0.isEmpty }
            .joined(separator: " ")

        let pdf = PdfComposer.compose(
            PdfComposer.Input(
                template: template,
                bounds: bounds,
                mapImage: PdfComposer.MapImage(
                    jpegBytes: raster.jpeg,
                    widthPx: raster.widthPx,
                    heightPx: raster.heightPx
                ),
                fields: fields,
                // The parcel marks lead the legend. They are the ink the page
                // was made for, they are the only ink no layer row accounts
                // for, and the legend truncates from the bottom — a layer that
                // falls off is still named in the attribution strip, while a
                // parcel mark that falls off is named nowhere.
                legend: request.includesLegend && !legend.isEmpty ? legend : nil,
                // The general caveat first, and unconditionally. Everything
                // else in this list is about something that went wrong, so a
                // page where nothing did carried no caveat at all — and a
                // printed map with no warning on it is exactly the artefact
                // somebody puts in front of a lawyer. It rides with the
                // disclosures because that is the region that shrinks to fit
                // rather than dropping what it cannot hold.
                disclosures: request.disclosures + account.notes,
                attributionLines: PrintAttribution.lines(
                    for: PrintExportPlan.sources(
                        baseMap: request.baseMap,
                        outcomes: outcomes,
                        // Held parcels are not printed parcels. A frame dragged
                        // away from the selection carries none of them, and the
                        // credit follows the ink, exactly as the legend beside
                        // it does.
                        drewParcels: PrintMapCompositor.drawsParcels(
                            request.parcels, within: bounds, mapFrame: template.mapFrame
                        ),
                        descriptor: descriptor
                    )
                ),
                scaleBar: PrintScaleBar.build(
                    bounds: bounds,
                    mapFrame: template.mapFrame,
                    maxWidthPoints: template.scaleBar.maxWidth
                ),
                // A link nobody can encode leaves the square empty rather than
                // failing the export: the code is a shortcut back to the map,
                // not part of what the page says.
                shareURLText: receiptURL?.absoluteString,
                qrModules: receiptURL.flatMap {
                    QRCodeModules.modules(for: $0.absoluteString)
                },
                appendix: request.appendix,
                // The document's own caveat, which is the first disclosure. The
                // rest are about this page's layers and mean nothing on a page
                // of sentences.
                appendixCaveat: request.disclosures.first ?? Self.screeningCaveat,
                generatedAt: request.generatedAt
            )
        )
        return Result(pdf: pdf, resolution: resolution, outcomes: outcomes)
    }

    /// Writes the page where the share sheet can hand it on.
    ///
    /// A named file rather than raw bytes: what leaves the app is a document
    /// somebody files, and "NS Marks map.pdf" is what it should be called in
    /// the place they file it.
    static func write(_ pdf: Data, named name: String, on generatedAt: Date) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(filename(for: name, on: generatedAt))
            .appendingPathExtension("pdf")
        do {
            try pdf.write(to: url, options: .atomic)
        } catch {
            throw Failure.couldNotWriteFile
        }
        return url
    }

    /// A title made safe to be one path component.
    ///
    /// The default title now carries a PID exactly as the parcel service
    /// returned it, and a title the user typed carries whatever they typed. A
    /// "/" in either asks for a directory that is not there, and the export
    /// fails with "could not write file" over something the reader never chose.
    /// A leading dot hides the file from the place they filed it. And a name
    /// long enough to pass 255 bytes is refused outright.
    ///
    /// The characters go to spaces rather than being dropped, so a mangled PID
    /// still reads as two pieces rather than silently running together into a
    /// different number.
    static func filename(for title: String) -> String {
        let forbidden = CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters)
        var cleaned = String(
            title.unicodeScalars.map { forbidden.contains($0) ? " " : Character($0) }
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)
        while cleaned.hasPrefix(".") { cleaned.removeFirst() }
        cleaned = String(cleaned.prefix(120))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? "NS Marks map" : cleaned
    }

    /// The same name, dated, which is what the browser writes.
    ///
    /// Two exports of one parcel a fortnight apart are two documents about two
    /// different days' evidence, and on the phone both arrived called
    /// "Parcel research summary — PID 12345678.pdf". Whoever was sent them had
    /// no way to tell which was which, and a file manager offered to replace
    /// one with the other.
    ///
    /// The page's own stamp and in UTC, exactly as
    /// `web/src/print/pdf/ExportDialog.tsx` slices its ISO string, so the file
    /// and the page inside it cannot name two different days.
    static func filename(for title: String, on generatedAt: Date) -> String {
        // Built per call rather than held, as everywhere else in this project:
        // `ISO8601DateFormatter` is a class with mutable state and is not
        // `Sendable`, and one file name per export is not worth a lock.
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return "\(filename(for: title)) \(formatter.string(from: generatedAt))"
    }
}

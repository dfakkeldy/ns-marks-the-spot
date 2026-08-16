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
    var template: PdfTemplate
    var fields: PdfComposer.Fields
    /// Whether the page carries its legend box.
    ///
    /// Only the swatches. The attribution strip and the disclosures are
    /// obligations — who is owed a credit, and what the reader must not
    /// conclude — and neither is ever the user's to switch off.
    var includesLegend: Bool = true
    /// Where the page's QR code should point, or nil for no code at all.
    var shareURL: URL?
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
        // the order the page was assembled. Each of these is `.drawn` because
        // its features were already in hand when the page was made: there was
        // no request to fail and nothing to arrive late.
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
                state: .drawn
            )
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
                legend: request.includesLegend && !account.legend.isEmpty
                    ? account.legend : nil,
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
                        drewParcels: !request.parcels.isEmpty,
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
                shareURLText: request.shareURL?.absoluteString,
                qrModules: request.shareURL.flatMap {
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
    static func write(_ pdf: Data, named name: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(filename(for: name))
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
}

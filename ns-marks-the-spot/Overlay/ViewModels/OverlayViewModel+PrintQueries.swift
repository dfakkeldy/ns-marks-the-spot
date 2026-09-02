import Foundation
import GeoCore
import MapCatalog
import NSDataServices

/// The print- and evidence-export query surface: where the map is looking,
/// what the frame will carry, what the note can say, and the providers the
/// compositor draws through.
///
/// Its own file, split out of the coordinator, because it is a read-only view
/// over state the class already exposes — nothing here mutates, so the split
/// costs no encapsulation and takes a self-contained concern with it.
extension OverlayViewModel {
    /// Where the map is now, as a latitude, a longitude, and a tile zoom.
    ///
    /// The readout on the map reads this — it describes what is on screen,
    /// including a followed position. What leaves the device reads
    /// `mapPosition` instead.
    ///
    /// Before the map has been laid out there is no view to measure, and the
    /// answer is whatever it has been told to open on: a link's position, or
    /// the one the last session left. Only a launch with neither falls back to
    /// the opening view, and there it is the truth. Reading `.default` in every
    /// case is what let a scene going inactive between launch and the map
    /// attaching write the province over the map the reader left.
    var currentPosition: MapPosition {
        guard controller.hasReportedItsPosition,
              let bounds = controller.currentVisibleBounds()
        else {
            return controller.heldPosition ?? .default
        }
        return MapPosition(
            latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
            longitude: (bounds.minLongitude + bounds.maxLongitude) / 2,
            zoom: controller.zoomLevel
        )
    }

    /// The position a share link, an evidence note, a printed receipt and the
    /// saved session carry: the last view the reader chose.
    ///
    /// A view the reader's own location put on screen is not one of those.
    /// The field-capture contract keeps location-driven viewports out of
    /// everything that leaves the device or outlives the session, so while
    /// the map is following, the last chosen view stands. Before any view
    /// has been chosen there is the link or session the app opened on, and
    /// failing that the province.
    var mapPosition: MapPosition {
        guard controller.viewportIsLocationDriven else { return currentPosition }
        return readerPosition ?? controller.heldPosition ?? .default
    }

    /// Remembers the settled view when it is the reader's own. Called from
    /// the map's settle, before anything is written down.
    func notePositionSettled() {
        guard !controller.viewportIsLocationDriven else { return }
        readerPosition = currentPosition
    }

    /// Whether the open parcel has heard back from every source the note
    /// reports on.
    var canExportEvidenceNote: Bool {
        inspection.map(ParcelEvidenceExport.isReady) ?? false
    }

    /// The note for the open parcel, or `nil` when no parcel is open or a
    /// source has not answered yet.
    ///
    /// `generatedAt` is a parameter rather than `Date()` read in here: the note
    /// is stamped with it, and a stamp the caller cannot control is a stamp
    /// nothing can check.
    ///
    /// `includingSourcesStillOut` is the way out of a source that has hung
    /// rather than merely taken its time. The browser gives the sources fifteen
    /// seconds and then writes the report anyway, and a reader whose fourth
    /// source will never answer is otherwise told, for as long as they keep
    /// looking, that no dated receipt can be made at all. Nothing is invented
    /// by writing early: a source that has not answered has no value to report,
    /// and the note already says in its own words that this one had not
    /// answered when it was written.
    func evidenceNote(
        generatedAt: Date = Date(),
        includingSourcesStillOut: Bool = false
    ) -> EvidenceNote? {
        guard let inspection,
              includingSourcesStillOut || ParcelEvidenceExport.isReady(inspection),
              let shareURL else { return nil }
        return EvidenceNote.build(
            ParcelEvidenceExport.input(
                generatedAt: generatedAt,
                inspection: inspection,
                taxSaleEnabled: showsTaxSale,
                mode: mapRecordMode == .historical ? .historical : .current,
                shareURL: shareURL,
                position: mapPosition,
                activeLayers: rows.filter(\.isVisible).map(\.descriptor),
                baseMap: baseMapType,
                fletcherBaseURL: FletcherHost.configuredBaseURL
            )
        )
    }

    /// Everything the printed page needs about the map, read at the tap.
    ///
    /// A snapshot rather than a live reference: compositing takes seconds, and
    /// a page assembled from a map that moved underneath it would carry a
    /// registration for ground it does not show.
    func printExportRequest(
        template: PdfTemplate,
        fields: PdfComposer.Fields,
        includesLegend: Bool = true,
        includesAppendix: Bool = false,
        /// Whether this page was meant to carry an evidence appendix and is
        /// going out without one.
        ///
        /// The appendix is the whole of what a research summary carries beyond
        /// a field sheet. Dropped silently, the reader is holding a page named
        /// for evidence that has none on it, and no way to tell that from a
        /// parcel nothing was found for.
        appendixWithheld: Bool = false,
        /// Whether the appendix may be written while a source is still out.
        ///
        /// Set once the sources have had the time the browser gives them. The
        /// appendix then names each one that had not answered, which is what
        /// the note says about them anyway, and the page carries a line saying
        /// which ones those were.
        appendixNamesSourcesStillOut: Bool = false,
        /// Whether the aerial photography is drawn onto the page.
        ///
        /// Separate from whether it is on the screen. At 300 dpi the imagery is
        /// the heaviest thing on the sheet and, on paper, a dark wash that
        /// buries the parcel lines and labels the page exists to show — which
        /// is why the browser leaves it off until it is asked for.
        includesAerial: Bool = true,
        /// What the document being made says it must not be read as.
        caveat: String = PrintExport.screeningCaveat,
        /// The ground the user framed. Nil falls back to the whole visible map,
        /// which the export then grows to the paper's proportions — the older
        /// behaviour, kept for callers that never showed a frame.
        frame: GeoBoundingBox? = nil,
        /// What each feature-query layer was doing when the page was made, as
        /// the layer panel has it. Empty by default: callers that show no such
        /// panel print the same page they always did.
        featureStatuses: [LayerID: ViewportLayerStatus] = [:],
        generatedAt: Date = Date()
    ) -> PrintExportRequest? {
        var framed = frame
        if framed == nil, let bounds = controller.currentVisibleBounds() {
            framed = GeoBoundingBox(
                south: bounds.minLatitude,
                west: bounds.minLongitude,
                north: bounds.maxLatitude,
                east: bounds.maxLongitude
            )
        }
        guard let box = framed else { return nil }
        // The ground that will actually print, which is the frame grown to the
        // paper. Read here as well as in the export because the sentences below
        // are about what the reader will be holding, and the frame on its own
        // is smaller than that.
        let printed = PrintExportPlan.bounds(covering: box, mapFrame: template.mapFrame)
        var disclosures = [caveat] + printCaptureContext
        // The appendix is about a parcel and the map is about ground, and the
        // two can be in different places. Said on the page rather than left for
        // a reader to notice, because the pages are stapled together and read
        // as one document.
        if includesAppendix, let pid = inspection?.pid,
           inspectedPID(shownWithin: printed, mapFrame: template.mapFrame) == nil {
            disclosures.append(
                "The evidence appendix is for PID \(pid), whose boundary is not on "
                    + "this map. The map shows other ground."
            )
        }
        // The page is titled for the parcel it frames, and a title is a claim
        // about the whole of it. A frame drawn by hand cuts wherever the user
        // dragged it, so a page can promise PID 15234636 and show its northern
        // third.
        if let pid = inspectedPID(shownWithin: printed, mapFrame: template.mapFrame),
           !parcelFits(pid, within: printed) {
            disclosures.append(
                "PID \(pid) runs past the edge of this map. The page shows part "
                    + "of the parcel."
            )
        }
        if appendixWithheld {
            disclosures.append(
                "The evidence appendix was left off this page. What each source "
                    + "answered, what it returned nothing for, and what was never "
                    + "asked are not on this document."
            )
        }
        // Said on the front of the document rather than left to the appendix's
        // own per-source lines. A reader who acts on a research summary is
        // entitled to know before they read it that it was written while a
        // source was still out, because the answer that never arrived may be
        // the one they were looking for.
        if includesAppendix, appendixNamesSourcesStillOut, let inspection,
           let stillOut = ParcelEvidenceExport.stillOutDisclosure(
               ParcelEvidenceExport.pending(inspection)
           ) {
            disclosures.append(stillOut)
        }
        return PrintExportRequest(
            visibleBounds: box,
            baseMap: controller.baseMapType,
            // Dropped from the list rather than drawn transparent: the legend
            // and the credits are built from these, and a page that names a
            // source it carries no ink from tells the reader the imagery was
            // consulted for what they are looking at.
            layers: includesAerial
                ? controller.layers
                : controller.layers.filter { $0.id != LayerID.nsAerial.rawValue },
            parcels: controller.parcelShapes,
            // The client-side layers as the screen has them, so a page shows
            // the zones and reaches the reader was looking at rather than blank
            // ground where they were.
            features: printedFeatures(within: printed, mapFrame: template.mapFrame),
            markers: printedMarkers(within: printed, mapFrame: template.mapFrame),
            featureLayerStatuses: featureStatuses,
            template: template,
            fields: fields,
            includesLegend: includesLegend,
            // Where the page's receipt leads. Read here with the rest of the
            // snapshot, because a state read a moment later would describe a
            // map the reader had already moved. What the page was framed on and
            // which of these layers reached the paper are filled in by the
            // export, which is the only place either is known.
            share: PrintShareLink(
                base: Self.webMapURL, state: printedShareState(includesAerial: includesAerial)
            ),
            // The appendix is the evidence note, laid out as pages rather than
            // written as a file. Built from the note itself so the document the
            // user prints and the one they email cannot come to say different
            // things about the same parcel. Stamped with the page's own time,
            // for the same reason the page is.
            appendix: includesAppendix
                ? PdfAppendix.blocks(
                    fromMarkdown: evidenceNote(
                        generatedAt: generatedAt,
                        includingSourcesStillOut: appendixNamesSourcesStillOut
                    )?.markdown ?? ""
                )
                : [],
            disclosures: disclosures,
            generatedAt: generatedAt
        )
    }

    /// The open parcel's PID, when its boundary is inside the ground about to
    /// be printed.
    ///
    /// The frame is drawn by hand and the selection is not cleared by panning,
    /// so a user can select a parcel, travel kilometres, and frame somewhere
    /// else entirely. A page named after a PID whose parcel is nowhere on it
    /// tells the reader they are looking at that parcel — the single wrong
    /// conclusion this export could hand somebody. Nil in that case, and the
    /// page carries the generic name instead.
    ///
    /// Ask this about the ground that will print, not the frame that was
    /// dragged: the export grows one into the other, and a parcel that only
    /// enters the page in the grown margin is on it.
    func inspectedPID(shownWithin bounds: GeoBoundingBox, mapFrame: PdfRect) -> String? {
        guard let pid = inspection?.pid,
              let shape = controller.parcelShapes.first(where: { $0.pid == pid })
        else { return nil }
        // The same two questions the compositor asks before it draws this
        // parcel, so the title cannot name a parcel the page has no ink from —
        // the boundary asked with its stroke's reach, or a grazing boundary
        // would be keyed and credited under a title that refuses to name it.
        // Rings rather than the box around them: a long diagonal lot's box
        // covers ground the lot never touches, and the title is the one
        // sentence on the page a reader has no way to check. Surrounds counts
        // here though the selection has no fill, because a page wholly inside
        // the selected parcel is that parcel's ground.
        guard Self.titleNamesParcel(shape, within: bounds, mapFrame: mapFrame) else {
            return nil
        }
        return pid
    }

    /// The title's ink question on its own, held out where a test can put it
    /// beside the legend's so the two cannot drift apart again. The boundary
    /// is padded exactly as the compositor pads it; surrounds stays unpadded
    /// and fill-blind, because a page wholly inside the selected parcel is
    /// that parcel's ground even though the selection paints no fill there.
    nonisolated static func titleNamesParcel(
        _ shape: ParcelShape, within bounds: GeoBoundingBox, mapFrame: PdfRect
    ) -> Bool {
        PrintMapCompositor.marksBoundary(shape, within: bounds, mapFrame: mapFrame)
            || shape.surrounds(bounds)
    }

    /// Whether the named parcel's whole outline is inside the ground that will
    /// print.
    ///
    /// Boxes rather than rings, and that is the safe direction: a bounding box
    /// that fits guarantees the outline inside it fits, so this never claims a
    /// parcel is cut when it is not. It can miss a parcel whose box pokes out
    /// where the outline does not, which costs a sentence the page did not
    /// need rather than a promise it cannot keep.
    ///
    /// True when there is no geometry to check. A parcel with no outline is
    /// already the subject of its own notice on the card, and the page has the
    /// "boundary is not on this map" sentence for the case where it is absent.
    private func parcelFits(_ pid: String, within bounds: GeoBoundingBox) -> Bool {
        guard let shape = controller.parcelShapes.first(where: { $0.pid == pid }),
              let box = Self.boundingBox(of: shape)
        else { return true }
        return box.south >= bounds.south && box.north <= bounds.north
            && box.west >= bounds.west && box.east <= bounds.east
    }

    private static func boundingBox(of shape: ParcelShape) -> GeoBoundingBox? {
        var box: GeoBoundingBox?
        for ring in shape.parts.joined() {
            for point in ring {
                guard var current = box else {
                    box = GeoBoundingBox(
                        south: point.lat, west: point.lng,
                        north: point.lat, east: point.lng
                    )
                    continue
                }
                current.south = min(current.south, point.lat)
                current.west = min(current.west, point.lng)
                current.north = max(current.north, point.lat)
                current.east = max(current.east, point.lng)
                box = current
            }
        }
        return box
    }

    /// What state the map was in when the page was captured, in the words the
    /// map itself uses under its record switch.
    ///
    /// Printed on every page that has two record sets to choose between, as the
    /// web prints it. A dated outcome on paper with nothing saying it is
    /// historical is a dated outcome that reads as a current offering.
    var printCaptureContext: [String] {
        guard offersRecordModes else { return [] }
        return [recordModeCaption]
    }

    /// The features the page carries, in the order the map draws them.
    ///
    /// Read from what is on the map rather than from which rows are switched
    /// on: a layer that is on but has nothing in this viewport contributes
    /// nothing to the page, and listing it would claim ink that was never laid.
    private func printedFeatures(
        within bounds: GeoBoundingBox, mapFrame: PdfRect
    ) -> [FeatureShape] {
        // Restricted to the frame being printed, not merely to what the view
        // model is holding. The viewport layers keep the previous view's
        // features while their replacement loads, and keep them indefinitely
        // when the reload fails — so a page made after a long pan would
        // otherwise be composited from wells a hundred kilometres away.
        //
        // The shape itself rather than the box around it. A box is never
        // smaller than its shape, so it says yes for ground the shape never
        // reaches — and this list is what the legend and the "nothing to print"
        // note are built from, so an over-count keys a colour over blank paper
        // and drops the layer from the note that would have explained it.
        controller.featureShapes.filter { $0.marks(bounds, mapFrame: mapFrame) }
    }

    private func printedMarkers(
        within bounds: GeoBoundingBox, mapFrame: PdfRect
    ) -> [FeatureMarker] {
        // A marker is a circle of fixed page size, not a coordinate: one whose
        // centre stands just off the page still lays part of its circle on it,
        // so each is asked about the frame grown by its own printed reach.
        controller.featureMarkers.filter { marker in
            let style = marker.printStyle
            let strokes = style.strokeOpacity > 0 && style.lineWidth > 0
            let fills = style.fillHex != nil && style.fillOpacity > 0
            guard strokes || fills else { return false }
            let reach = (style.markerRadius ?? 5) + (strokes ? style.lineWidth / 2 : 0)
            let reached = bounds.expanded(
                byFractionX: reach / mapFrame.width, fractionY: reach / mapFrame.height
            )
            return reached.contains(
                GeoPoint(lat: marker.latitude, lng: marker.longitude)
            )
        }
    }

    /// The layers with ink inside this frame, whatever their panel says.
    private func drawnFeatureLayers(
        within bounds: GeoBoundingBox, mapFrame: PdfRect
    ) -> Set<LayerID> {
        var drawn = Set(printedFeatures(within: bounds, mapFrame: mapFrame).map(\.layer))
        drawn.formUnion(printedMarkers(within: bounds, mapFrame: mapFrame).map(\.layer))
        return drawn
    }

    /// The undrawn layers named the way the page will name them, so the sheet
    /// can admit them before the export runs rather than after.
    func undrawnFeatureLayerNotes(
        within bounds: GeoBoundingBox,
        mapFrame: PdfRect,
        statuses: [LayerID: ViewportLayerStatus]
    ) -> [String] {
        PrintExport.undrawnFeatureLayers(
            statuses, drawn: drawnFeatureLayers(within: bounds, mapFrame: mapFrame)
        ).map { layer in
            let name = LayerCatalog.descriptor(for: layer.id)?.name ?? layer.id.rawValue
            return "\(name) (\(layer.status.printReason))"
        }
    }

    /// The map's own tile path, so the export honours the cache and the licence
    /// clearance the screen is already holding rather than asking again.
    var printTileProvider: PrintMapCompositor.TileProvider {
        PrintMapCompositor.provider(overlays: controller.installedTileOverlays())
    }

    var printRenderProvider: PrintMapCompositor.RenderProvider {
        PrintMapCompositor.renderer(clearance: clearanceBox)
    }
}

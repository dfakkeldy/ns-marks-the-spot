import Foundation
import GeoCore
import MapCatalog
import NSDataServices
import PDFKit
import SwiftUI

/// The page the user is about to make, and what it will and will not show.
struct PrintExportSheet: View {
    let overlayVM: OverlayViewModel
    /// The ground the user framed on the map, and the paper it was framed for.
    /// The orientation is not offered again here: it decided the shape of the
    /// frame, and changing it now would print ground the frame never covered.
    let framing: PrintExportFraming
    /// What is on the map and will not be on the page, named before the export
    /// runs rather than after it. A user's own scan or drawing is on screen and
    /// the compositor does not carry it; finding that out from a finished page
    /// is finding out too late.
    let omitted: [String]
    /// What each feature-query layer was doing when this sheet came up. Read
    /// here rather than at export time so the reader is told before they make
    /// the page, and so the same statuses reach the page's own notes.
    let featureStatuses: [LayerID: ViewportLayerStatus]
    /// Whether the parcel's sources have had the time the browser gives them.
    ///
    /// Held by the map behind this sheet rather than started when the sheet
    /// opens, because the clock is about the parcel and the sources have been
    /// answering since it was tapped. A reader who spent a minute framing the
    /// page has already given them their minute.
    let sourcesHaveHadTheirTime: Bool
    /// Called with the finished file, for the system share sheet.
    let onExported: (URL) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    /// The browser fills this in and the reader edits it, so a page made on
    /// the phone carried a blank line where the same page made in a browser
    /// says what it is. Verbatim from `web/src/print/pdf/ExportDialog.tsx`,
    /// because the two surfaces are making the same document.
    static let defaultSubtitle = "NS Marks The Spot — historical map export"
    @State private var subtitle = PrintExportSheet.defaultSubtitle
    @State private var notes = ""
    @State private var includesLegend = true
    /// Whether the evidence appendix follows the map.
    ///
    /// The web offers this apart from the document choice, and so does this: a
    /// reader who wants the research summary's caveat and its map does not
    /// always want the eight pages of source-by-source account behind it. The
    /// switch cannot add an appendix to a field sheet, only leave one out.
    @State private var includesAppendix = true
    /// Whether the aerial photography prints. Off to start, like the browser.
    @State private var includesAerial = false
    @State private var kind: PrintDocumentKind
    @State private var isWorking = false
    /// The running export, held so Cancel and dismissal can stop it.
    @State private var work: Task<Void, Never>?
    @State private var failure: String?
    /// What each layer did, after an export. Kept on screen because it is the
    /// only place a reader is told a layer they had switched on is not on the
    /// page they just made.
    @State private var outcomes: [PrintMapCompositor.LayerOutcome] = []
    /// The finished page, held so it can be looked at before it is sent
    /// anywhere. What the compositor made is the only place the reader can
    /// check that the frame they drew is the ground that printed.
    @State private var preview: PreviewedPage?

    init(
        overlayVM: OverlayViewModel,
        framing: PrintExportFraming,
        omitted: [String],
        featureStatuses: [LayerID: ViewportLayerStatus] = [:],
        sourcesHaveHadTheirTime: Bool = false,
        onExported: @escaping (URL) -> Void
    ) {
        self.overlayVM = overlayVM
        self.framing = framing
        self.omitted = omitted
        self.featureStatuses = featureStatuses
        self.sourcesHaveHadTheirTime = sourcesHaveHadTheirTime
        self.onExported = onExported
        // The research summary where there is a parcel to write one about,
        // which is the browser's default and the only case the browser can
        // reach. Framing ground with no parcel open is a native-only case, and
        // there the research summary has nothing to append: opening on it would
        // show a reader an Export button that does not work and no reason why.
        _kind = State(
            initialValue: overlayVM.inspectedPID(shownWithin: framing.printedBounds) != nil
                ? .researchSummary : .fieldSheet
        )
    }

    /// The finished file, made presentable. A bare `URL` cannot identify a
    /// sheet, and two exports in a row would otherwise reuse the first one's
    /// presentation.
    struct PreviewedPage: Identifiable {
        var url: URL
        /// Layers the reader switched on that are not on this page, carried to
        /// the preview so the warning travels with the file rather than staying
        /// behind on the sheet the preview covers.
        var incomplete: [String]
        var id: String { url.path }
    }

    private var template: PdfTemplate { PdfTemplate.template(framing.orientation) }

    /// The switched-on feature layers that will put nothing inside this frame.
    private var undrawnNotes: [String] {
        overlayVM.undrawnFeatureLayerNotes(
            within: framing.printedBounds, statuses: featureStatuses
        )
    }

    /// The open parcel, but only when its boundary is on the ground being
    /// printed. A page named after a parcel it does not show would tell the
    /// reader they are looking at that parcel.
    private var framedPID: String? {
        overlayVM.inspectedPID(shownWithin: framing.printedBounds)
    }

    /// Whether there is any aerial photography on the map to print.
    ///
    /// The switch is shown either way rather than hidden, because "there is no
    /// imagery on this map" and "imagery is available and left off" are two
    /// different things to tell a reader about the page they are making.
    private var aerialAvailable: Bool {
        overlayVM.rows.contains { $0.descriptor.id == .nsAerial && $0.isVisible }
    }

    /// Whether the appendix may be written with a source still out.
    ///
    /// Only once the sources have had their time, and only where there is a
    /// parcel to write about. A page with no parcel open has no appendix to
    /// write early.
    private var writesAppendixEarly: Bool {
        sourcesHaveHadTheirTime && !overlayVM.canExportEvidenceNote
            && overlayVM.inspection != nil
    }

    private var canExport: Bool {
        kind != .researchSummary || overlayVM.canExportEvidenceNote || writesAppendixEarly
    }

    /// The dot pitch this device will actually render at, resolved before the
    /// export rather than reported after it: a page at 150 dpi is a different
    /// document from one at 300, and a user is entitled to know which one they
    /// are about to wait for.
    private var resolution: ExportResolution {
        PrintResolution.resolve(
            mapFrame: template.mapFrame,
            constrainedDevice: PrintResolution.isConstrained(
                physicalMemoryBytes: ProcessInfo.processInfo.physicalMemory
            )
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                // The web makes two documents from one map, and so does this.
                // Chosen before the page is described, because the choice
                // decides what the page warns the reader about and what it is
                // called.
                Section("Document") {
                    Picker("Document", selection: $kind) {
                        ForEach(PrintDocumentKind.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("print-document-kind")
                    // Locked while a page is being drawn: the request took its
                    // copy of the kind before the first await, so a switch mid
                    // export would leave the sheet describing one document and
                    // present the other.
                    .disabled(isWorking)
                    Text(Self.explanation(of: kind))
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    // The browser's checkbox, disabled the same way. It can
                    // only take the appendix away: a field sheet with one
                    // stapled to it would carry "confirm this on site" over
                    // pages that say what was and was not asked, which are two
                    // different instructions to the same reader.
                    Toggle("Include evidence appendix", isOn: $includesAppendix)
                        .disabled(isWorking || kind != .researchSummary)
                        .accessibilityIdentifier("print-include-appendix")
                    if kind != .researchSummary {
                        Text("Available for the Research summary only.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Page") {
                    TextField(kind.defaultTitle(pid: framedPID), text: $title)
                        .accessibilityIdentifier("print-title")
                    TextField("Subtitle", text: $subtitle)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(1...4)
                    LabeledContent("Paper") {
                        Text(
                            "Letter \(framing.orientation.rawValue) · "
                                + "\(resolution.dpi) dpi"
                                + (resolution.reduced
                                    ? " (reduced to fit this device's memory)" : "")
                        )
                        .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Scale") {
                        Text(
                            PrintScaleBar.build(
                                bounds: framing.bounds,
                                mapFrame: template.mapFrame,
                                maxWidthPoints: template.scaleBar.maxWidth
                            ).denominatorLabel
                        )
                    }
                    // The web's "Include legend". Off does not make the page
                    // say less about its sources: the attribution strip and the
                    // disclosures are obligations and always print. What goes is
                    // the box of swatches, which is what a reader wants back
                    // when the map itself needs the room.
                    Toggle("Include legend", isOn: $includesLegend)
                        .accessibilityIdentifier("print-include-legend")

                    // Off unless asked for, as in the browser. At this dot
                    // pitch the photography is the slowest thing on the page
                    // and, printed, a dark wash over the boundaries and labels
                    // the sheet is being made to show.
                    Toggle("Include aerial imagery", isOn: $includesAerial)
                        .disabled(isWorking || !aerialAvailable)
                        .accessibilityIdentifier("print-include-aerial")
                    if !aerialAvailable {
                        Text("Aerial imagery is not switched on for this map.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                if !undrawnNotes.isEmpty {
                    Section("Switched on, with nothing to print") {
                        ForEach(undrawnNotes, id: \.self) { note in
                            Text(note)
                        }
                        Text(
                            """
                            The page will name these too. Two of the reasons \
                            clear on their own: zoom in past the layer's \
                            minimum and export again, or wait for a query that \
                            is still running.
                            """
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }
                }

                if !omitted.isEmpty {
                    Section("Will not be on the page") {
                        ForEach(omitted, id: \.self) { name in
                            Text(name)
                        }
                        Text(
                            """
                            These are on the map and this app cannot yet draw \
                            them onto a page. Exporting is still allowed — the \
                            page simply will not show them, and their absence \
                            from it is not evidence they have nothing here.
                            """
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }
                }

                // The research summary is the field sheet plus the evidence
                // appendix, so it is only a document at all once the appendix
                // has something to carry. With no parcel open, or with a source
                // still out, its pages would be a heading and nothing under it
                // — and a page of blanks reads as a parcel with no evidence
                // rather than as a report made too early.
                if kind == .researchSummary {
                    Section("Evidence appendix") {
                        if overlayVM.canExportEvidenceNote {
                            Text(
                                """
                                The same statements as the evidence note, printed \
                                after the map. What a source returned, what it \
                                returned nothing for, and what was never asked are \
                                three different lines.
                                """
                            )
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        } else if writesAppendixEarly {
                            Label(
                                Self.appendixWritesEarly(for: overlayVM.inspection),
                                systemImage: "clock.badge.exclamationmark"
                            )
                            .font(.footnote)
                            .foregroundStyle(.orange)
                        } else {
                            Label(
                                Self.appendixHold(for: overlayVM.inspection),
                                systemImage: "exclamationmark.triangle"
                            )
                            .font(.footnote)
                            .foregroundStyle(.orange)
                        }
                    }
                }

                if !outcomes.isEmpty {
                    Section("What printed") {
                        ForEach(outcomes, id: \.id) { outcome in
                            LabeledContent(outcome.name) {
                                Text(Self.description(of: outcome.state))
                                    // Both arms named as `Color`: `.secondary`
                                    // is a hierarchical style and `.red` a
                                    // colour, and a ternary between the two has
                                    // no common type to infer.
                                    .foregroundStyle(
                                        Self.isComplete(outcome.state)
                                            ? Color.secondary : Color.red
                                    )
                            }
                        }
                        Text(
                            """
                            A layer that could not be reached, or that this app \
                            cannot yet draw onto a page, is left off the page and \
                            out of its legend. Its absence is not evidence that the \
                            source has nothing here. The page says so in words too.
                            """
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }
                }

                if let failure {
                    Section {
                        Text(failure).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Export map")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        // Cancel has to reach the work, not just the sheet. A
                        // page in progress is minutes of tile fetching and a
                        // full-resolution raster in memory; left running it
                        // finishes into a dismissed view and hands a share
                        // sheet to a user who said no.
                        work?.cancel()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Export") { work = Task { await export() } }
                        // A research summary with no evidence to append is not
                        // a research summary. Exporting one would hand over a
                        // page carrying that name and that caveat with nothing
                        // behind it — the field sheet under a title that claims
                        // sources were consulted.
                        .disabled(isWorking || !canExport)
                        .accessibilityIdentifier("print-export")
                }
            }
            .sheet(item: $preview) { page in
                PrintExportPreview(url: page.url, incomplete: page.incomplete) {
                    onExported(page.url)
                }
            }
            .onDisappear { work?.cancel() }
            .overlay {
                if isWorking {
                    ProgressView("Drawing the map…")
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private func export() async {
        failure = nil
        isWorking = true
        defer { isWorking = false }

        let name = title.isEmpty ? kind.defaultTitle(pid: framedPID) : title
        // Asked for and available are two different things: a parcel closed
        // between picking the research summary and tapping Export would
        // otherwise print an empty appendix.
        let carriesAppendix = kind.includesAppendix && includesAppendix
            && (overlayVM.canExportEvidenceNote || writesAppendixEarly)
        guard let request = overlayVM.printExportRequest(
            template: template,
            fields: PdfComposer.Fields(title: name, subtitle: subtitle, notes: notes),
            includesLegend: includesLegend,
            includesAppendix: carriesAppendix,
            // A research summary is its evidence pages. Going out without them
            // it is a field sheet under another name, and the page has to say
            // so rather than let the title stand for evidence it is not
            // carrying.
            appendixWithheld: kind.includesAppendix && !carriesAppendix,
            appendixNamesSourcesStillOut: writesAppendixEarly,
            includesAerial: includesAerial,
            caveat: kind.caveat,
            frame: framing.bounds,
            featureStatuses: featureStatuses
        ) else {
            failure = "The map has not been laid out yet."
            return
        }

        do {
            let result = try await PrintExport.build(
                request,
                physicalMemoryBytes: ProcessInfo.processInfo.physicalMemory,
                tileProvider: overlayVM.printTileProvider,
                renderProvider: overlayVM.printRenderProvider
            )
            // The compositor's own awaits may not have noticed the cancellation
            // — a file written and a share sheet presented after Cancel is the
            // app overruling the user.
            guard !Task.isCancelled else { return }
            outcomes = result.outcomes
            let url = try PrintExport.write(result.pdf, named: name)
            // Shown, not sent. The share sheet comes from the preview's own
            // button, so nothing leaves the device before the user has seen
            // what it says.
            preview = PreviewedPage(
                url: url,
                incomplete: result.outcomes
                    .filter { !Self.isComplete($0.state) }
                    .map { "\($0.name) — \(Self.description(of: $0.state))" }
            )
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            failure = "The page could not be made: \(error.localizedDescription)"
        }
    }

    /// Why the appendix cannot be built yet.
    ///
    /// One sentence used to cover both a map with no parcel open and a parcel
    /// whose last source was still arriving. It was wrong about the second:
    /// most of the evidence was in hand, and the reader was told none of it
    /// was, with nothing to say what the wait was for.
    private static func appendixHold(for inspection: ParcelInspection?) -> String {
        guard let inspection else {
            return """
                No parcel is open, so this page would carry an empty appendix. \
                Tap a parcel, or export the field sheet instead.
                """
        }
        let waiting = ParcelEvidenceExport.pending(inspection)
        guard !waiting.isEmpty else {
            return """
                The appendix for PID \(inspection.pid) is not ready yet. Try \
                again in a moment, or export the field sheet instead.
                """
        }
        return """
            PID \(inspection.pid) is still waiting on \
            \(waiting.formatted(.list(type: .and))). Exporting now would stamp \
            "unavailable" on a source that is about to answer.
            """
    }

    /// What the appendix will say about a source that has stopped answering.
    ///
    /// The wait is not open-ended. A source that has had its time and sent
    /// nothing is a source this page can report on, and holding the export any
    /// longer tells a reader whose fourth source will never answer that no
    /// dated receipt can be made at all. What it cannot do is pass the silence
    /// off as an answer, so the sources are named here before the page is made
    /// and again on the page itself.
    private static func appendixWritesEarly(for inspection: ParcelInspection?) -> String {
        guard let inspection else { return "" }
        let waiting = ParcelEvidenceExport.pending(inspection)
        guard !waiting.isEmpty else { return "" }
        return """
            PID \(inspection.pid) did not hear back from \
            \(waiting.formatted(.list(type: .and))) in the time the sources are \
            given. The appendix will name each one as still unanswered, which is \
            not the same as a source that answered with nothing.
            """
    }

    /// What the reader is choosing between, said before they choose.
    private static func explanation(of kind: PrintDocumentKind) -> String {
        switch kind {
        case .fieldSheet:
            """
            The map on its own, to carry onto the ground. It says to confirm \
            conditions, boundaries and permissions on site.
            """
        case .researchSummary:
            """
            The same map, followed by the evidence appendix: what each source \
            answered, what it returned nothing for, and what was never asked.
            """
        }
    }

    /// Whether the row reads as ordinary or as a warning.
    ///
    /// A layer that reaches none of this ground is ordinary: nothing went
    /// wrong, and the page says so in the same words this row does. Everything
    /// else here is something the reader has to weigh.
    private static func isComplete(_ state: PrintMapCompositor.LayerState) -> Bool {
        switch state {
        case .drawn, .outsideCoverage: true
        default: false
        }
    }

    private static func description(of state: PrintMapCompositor.LayerState) -> String {
        switch state {
        case .drawn: "Printed"
        case .partial(let missing, let total): "Partly printed — \(missing) of \(total) missing"
        case .failed: "Not printed"
        case .unsupported: "Not printed — cannot be drawn on a page yet"
        case .outsideCoverage: "Nothing here — this source reaches none of this ground"
        case .licenceBlocked: "Not printed — the licence has not been accepted"
        case .notDrawn(let reason): "Not printed — \(reason)"
        case .drawnFromEarlierView(let reason): "Printed from an earlier view — \(reason)"
        case .drawnPartlyUnread(let count): "Printed — \(count) could not be read"
        }
    }
}

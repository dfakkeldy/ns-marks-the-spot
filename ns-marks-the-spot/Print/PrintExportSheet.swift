import Foundation
import GeoCore
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
    /// Called with the finished file, for the system share sheet.
    let onExported: (URL) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var subtitle = ""
    @State private var notes = ""
    @State private var includesLegend = true
    @State private var includesAppendix = false
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
                Section("Page") {
                    TextField("Title", text: $title)
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

                // The web's research document, which is its field sheet plus
                // the evidence appendix. Offered only when the appendix has
                // something to carry: with no parcel open, or with a source
                // still out, the pages would be a heading and nothing under it,
                // and a page of blanks reads as a parcel with no evidence
                // rather than as a report made too early.
                Section("Evidence") {
                    if overlayVM.canExportEvidenceNote {
                        Toggle("Include evidence appendix", isOn: $includesAppendix)
                            .accessibilityIdentifier("print-include-appendix")
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
                    } else {
                        Text(
                            """
                            Open a parcel and let its sources answer to print \
                            the evidence appendix with the map.
                            """
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
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
                        .disabled(isWorking)
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

        guard let request = overlayVM.printExportRequest(
            template: template,
            fields: PdfComposer.Fields(
                title: title.isEmpty ? "NS Marks The Spot" : title,
                subtitle: subtitle,
                notes: notes
            ),
            includesLegend: includesLegend,
            // Asked for and available are two different things: a parcel closed
            // between switching this on and tapping Export would otherwise
            // print an empty appendix.
            includesAppendix: includesAppendix && overlayVM.canExportEvidenceNote,
            frame: framing.bounds
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
            let url = try PrintExport.write(
                result.pdf, named: title.isEmpty ? "NS Marks map" : title
            )
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
        }
    }
}

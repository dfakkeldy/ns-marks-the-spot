import Foundation
import NSDataServices
import SwiftUI

/// The page the user is about to make, and what it will and will not show.
struct PrintExportSheet: View {
    let overlayVM: OverlayViewModel
    /// Called with the finished file, for the system share sheet.
    let onExported: (URL) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var subtitle = ""
    @State private var notes = ""
    @State private var orientation = PdfTemplate.ID.portrait
    @State private var isWorking = false
    @State private var failure: String?
    /// What each layer did, after an export. Kept on screen because it is the
    /// only place a reader is told a layer they had switched on is not on the
    /// page they just made.
    @State private var outcomes: [PrintMapCompositor.LayerOutcome] = []

    var body: some View {
        NavigationStack {
            Form {
                Section("Page") {
                    TextField("Title", text: $title)
                        .accessibilityIdentifier("print-title")
                    TextField("Subtitle", text: $subtitle)
                    TextField("Notes", text: $notes, axis: .vertical)
                        .lineLimit(1...4)
                    Picker("Orientation", selection: $orientation) {
                        Text("Portrait").tag(PdfTemplate.ID.portrait)
                        Text("Landscape").tag(PdfTemplate.ID.landscape)
                    }
                    .pickerStyle(.segmented)
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
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Export") { Task { await export() } }
                        .disabled(isWorking)
                        .accessibilityIdentifier("print-export")
                }
            }
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

        let template = PdfTemplate.template(orientation)
        guard let request = overlayVM.printExportRequest(
            template: template,
            fields: PdfComposer.Fields(
                title: title.isEmpty ? "NS Marks The Spot" : title,
                subtitle: subtitle,
                notes: notes
            )
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
            outcomes = result.outcomes
            let url = try PrintExport.write(
                result.pdf, named: title.isEmpty ? "NS Marks map" : title
            )
            onExported(url)
        } catch {
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

import GeoCore
import NSDataServices
import PDFKit
import SwiftUI

/// What ground the page covers and which paper it was framed for.
///
/// One value rather than two arguments because the two are decided together, on
/// the map, and a page made from one of them and the other's paper would claim
/// a scale it does not have.
struct PrintExportFraming: Equatable {
    var bounds: GeoBoundingBox
    var orientation: PdfTemplate.ID

    /// The ground the page will actually carry.
    ///
    /// The export grows the frame to the paper's proportions rather than
    /// cropping it, and this is the same growth, so anything asked before the
    /// export about what will be on the page is asked about the rectangle the
    /// export composites.
    ///
    /// Today the two coincide: `PrintExportFrameView` locks the frame to
    /// `mapFrameAspect` and refuses a rotated or pitched map, so the box the
    /// user drags is already paper-shaped and the growth changes nothing. That
    /// is a property of how the frame is drawn, not of the export, and the
    /// export does not depend on it — a request built from the visible map
    /// instead of a drawn frame grows on two sides, and then a well or a zone
    /// standing in the added strip is on the page. Asked about `bounds`, it
    /// would be reported absent and print anyway.
    var printedBounds: GeoBoundingBox {
        PrintExportPlan.bounds(
            covering: bounds, mapFrame: PdfTemplate.template(orientation).mapFrame
        )
    }
}

/// The finished page, before it goes anywhere.
///
/// Between making the file and handing it to the share sheet, because a printed
/// map is a document somebody else will read: the frame that was drawn, the
/// scale, the attribution strip and the notes about what did not print are all
/// on it, and this is the only chance to see them together before it is sent.
struct PrintExportPreview: View {
    let url: URL
    /// Layers that were switched on and are not on the page. Named here, in
    /// front of the file, because this page is going somewhere else: whoever
    /// reads it next cannot tell a source that had nothing to say from one that
    /// could not be reached, and the person sending it is the last one who can.
    var incomplete: [String] = []
    let onShare: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isConfirmingShare = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !incomplete.isEmpty {
                    incompleteBanner
                }
                PdfPageView(url: url)
            }
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("The page")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button {
                            if incomplete.isEmpty {
                                share()
                            } else {
                                isConfirmingShare = true
                            }
                        } label: {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                        .accessibilityIdentifier("print-preview-share")
                    }
                }
                .confirmationDialog(
                    "This page is missing layers",
                    isPresented: $isConfirmingShare,
                    titleVisibility: .visible
                ) {
                    Button("Share anyway") { share() }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text(incomplete.joined(separator: "\n"))
                }
        }
    }

    private func share() {
        onShare()
        dismiss()
    }

    private var incompleteBanner: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label("Not everything you switched on is on this page", systemImage:
                "exclamationmark.triangle.fill")
                .font(.footnote.bold())
            ForEach(incomplete, id: \.self) { line in
                Text(line).font(.caption)
            }
            Text(
                """
                A layer that is missing here is missing from the page's legend \
                too. Its absence is not evidence that the source has nothing on \
                this ground.
                """
            )
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.yellow.opacity(0.18))
        .accessibilityElement(children: .combine)
    }
}

/// PDFKit's own reader, so the preview shows the file that was written rather
/// than a second rendering of it that could differ from what the reader gets.
private struct PdfPageView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.backgroundColor = .secondarySystemBackground
        view.document = PDFDocument(url: url)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        if view.document?.documentURL != url {
            view.document = PDFDocument(url: url)
        }
    }
}

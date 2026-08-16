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
}

/// The finished page, before it goes anywhere.
///
/// Between making the file and handing it to the share sheet, because a printed
/// map is a document somebody else will read: the frame that was drawn, the
/// scale, the attribution strip and the notes about what did not print are all
/// on it, and this is the only chance to see them together before it is sent.
struct PrintExportPreview: View {
    let url: URL
    let onShare: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            PdfPageView(url: url)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("The page")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button {
                            onShare()
                            dismiss()
                        } label: {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }
                        .accessibilityIdentifier("print-preview-share")
                    }
                }
        }
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

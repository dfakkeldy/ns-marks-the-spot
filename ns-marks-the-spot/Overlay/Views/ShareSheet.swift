import SwiftUI
import UIKit

/// The system share sheet, presented for something prepared at the moment of
/// the tap.
///
/// `ShareLink` would be less code, but it needs its item to exist while the
/// button is merely on screen. An evidence note carries the time it was
/// generated, and a note stamped when a panel happened to redraw is a dated
/// record with the wrong date on it.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// Something to hand to the share sheet, identified so a `.sheet(item:)` can
/// present it.
struct SharePayload: Identifiable {
    let id: String
    let items: [Any]

    /// A link, shared as a link.
    init(url: URL) {
        id = url.absoluteString
        items = [url]
    }

    /// A file written to the app's temporary directory, so what leaves the app
    /// keeps the name that carries its PID and timestamp.
    ///
    /// `nil` if it cannot be written: an evidence note that silently became a
    /// blob of text with a system-chosen name is a record nobody can file.
    init?(text: String, filename: String) {
        let url = FileManager.default.temporaryDirectory.appending(path: filename)
        do {
            try text.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            return nil
        }
        id = filename
        items = [url]
    }
}

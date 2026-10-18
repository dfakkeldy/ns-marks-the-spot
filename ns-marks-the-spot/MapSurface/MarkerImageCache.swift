import Foundation
import UIKit

/// A small locked memo for marker bitmaps.
///
/// `viewFor` assigns marker images per annotation per pan, and every image it
/// asks for is drawn from a tiny finite domain — a role and a selection state,
/// a layer colour, a style value. Rasterizing the same few bitmaps hundreds of
/// times on the main thread was pure churn; keyed rendering makes each
/// distinct image exist once for the app's lifetime.
///
/// The render runs outside the lock, so two threads racing on a cold key may
/// both draw it — benign, the second write wins with an identical bitmap —
/// and a slow render never blocks an unrelated key's lookup.
nonisolated final class MarkerImageCache: @unchecked Sendable {
    private let lock = NSLock()
    private var images: [String: UIImage] = [:]

    func image(for key: String, render: () -> UIImage) -> UIImage {
        lock.lock()
        if let cached = images[key] {
            lock.unlock()
            return cached
        }
        lock.unlock()
        let rendered = render()
        lock.lock()
        images[key] = rendered
        lock.unlock()
        return rendered
    }
}

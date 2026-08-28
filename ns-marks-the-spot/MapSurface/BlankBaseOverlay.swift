import GeoCore
import MapKit
import UIKit

/// An empty world, drawn instead of a base map.
///
/// The browser's modern map is a layer with a switch, and turning it off leaves
/// the historical sheets on a blank background. That is how a Fletcher sheet or
/// a georeferenced scan gets read on its own terms: modern roads and labels
/// showing through an 1884 survey are exactly what the reader is trying to tell
/// apart from it.
///
/// MapKit has no blank map type, so the only way to have one is an overlay that
/// covers the world and declares that it replaces the map content. MapKit then
/// draws no base of its own beneath it. Apple's logo and the Legal link stay on
/// screen, as they do in any app that supplies its own tiles.
///
/// White rather than the system background: the page the sheet will print on is
/// white, and a reader comparing screen to print should not be looking at two
/// different grounds. It is the same white in dark mode for the same reason.
///
/// `nonisolated` for the reason `OpacityTileOverlay` is — MapKit asks for tiles
/// on its own queues — and it holds no mutable state at all.
nonisolated final class BlankBaseOverlay: MKTileOverlay, @unchecked Sendable {
    override init(urlTemplate: String?) {
        super.init(urlTemplate: nil)
        // What makes MapKit stop drawing its own map.
        canReplaceMapContent = true
        // Every zoom the map can reach: a level with no tile would show Apple's
        // map through the gap.
        minimumZ = 0
        maximumZ = 24
    }

    convenience init() {
        self.init(urlTemplate: nil)
    }

    override func loadTile(at path: MKTileOverlayPath) async throws -> Data {
        guard let data = Self.white else { throw CocoaError(.fileReadUnknown) }
        return data
    }

    /// One opaque square, drawn once and handed out for every tile.
    private static let white: Data? = {
        let size = CGSize(width: 256, height: 256)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).pngData { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
    }()
}

extension BlankBaseOverlay: WebDrawOrdered {
    /// Where the modern basemap sits on the web, because this stands in its
    /// place: below every layer the app installs.
    var webDrawOrder: Int {
        OverlayZIndex.drawOrder(OverlayZIndex.modernBasemap, in: .tile)
    }
}

import UIKit

/// Flattens several tiles covering the same coordinate into one image.
///
/// The Fletcher survey is 24 separately georeferenced sheets whose margins
/// overlap, so one XYZ coordinate can be answered by two or three of them, each
/// holding a different part of the picture. The web draws all of them stacked —
/// Leaflet mounts the sheets as separate layers — and both the live map and the
/// offline downloader have to produce the same pixels, or a saved area stops
/// matching what the user saw when they saved it.
///
/// `nonisolated` because tiles are assembled on MapKit's background queues and
/// on the download task, never the main actor.
nonisolated enum TileComposite {
    /// Draws `tiles` over one another, first at the bottom.
    ///
    /// Sheet order is the stacking order, which is what decides who wins where
    /// two sheets both have ink there — the same resolution Leaflet reaches by
    /// mounting sheets 1 through 24 in order.
    ///
    /// Returns the bytes unchanged for a single tile, so the common case pays
    /// nothing, and `nil` for none.
    static func stack(_ tiles: [Data]) -> Data? {
        guard let first = tiles.first else { return nil }
        guard tiles.count > 1 else { return first }

        let images = tiles.compactMap(UIImage.init(data:))
        guard let largest = images.max(by: {
            $0.size.width * $0.size.height < $1.size.width * $1.size.height
        }) else { return first }

        // Sized from the source rather than a hard-coded 256, so a future
        // higher-resolution tile build is not silently downsampled here.
        let size = largest.size
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false

        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let data = renderer.pngData { _ in
            for image in images {
                image.draw(in: CGRect(origin: .zero, size: size))
            }
        }
        // Bytes we already hold beat a blank square if the render came back
        // empty.
        return data.isEmpty ? first : data
    }

    /// A fully transparent 256×256 tile.
    ///
    /// What the downloader saves where every covering sheet reports no raster.
    /// That is a real place — the corners of a rotated scan sit inside the
    /// sheet's bounding box with nothing drawn in them — and it is exactly what
    /// the online map renders there. Saving it makes the coordinate done rather
    /// than failed, so the area stops reading as partial over ground that has
    /// nothing to download and Retry stops asking for it. A hundred-odd bytes.
    static let transparent: Data? = {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(
            size: CGSize(width: 256, height: 256), format: format
        ).pngData { _ in }
    }()
}

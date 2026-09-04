import CoreGraphics
import GeoCore
import MapKit
import Testing
import UIKit

@testable import ns_marks_the_spot

/// A raster black only in its top-left quarter, which for a north-up placement
/// is the north-west of the map.
private func quarterMarked(_ size: Int) throws -> CGImage {
    let context = try #require(
        CGContext(
            data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
    )
    context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: size, height: size))
    context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    // A bitmap context's first row of memory is the top of the image while its
    // own y counts up from the bottom, so the top-left quarter is drawn here.
    context.fill(CGRect(x: 0, y: size / 2, width: size / 2, height: size / 2))
    return try #require(context.makeImage())
}

@Suite("A user's map, draped on the map")
struct UserMapOverlayTests {
    @Test("The sheet is drawn the way up its placement says")
    func theDrapeIsNotMirrored() throws {
        // Extents cannot answer this. A sheet drawn mirrored through its
        // horizontal axis covers exactly the same ground, corner for corner, so
        // a bounding-rect assertion passes on a map that is upside down. Only
        // where the ink lands tells them apart, which is what this measures.
        let side = 400.0
        let record = UserMapRecord(
            id: "drape", name: "Drape", pixelSize: PixelSize(width: side, height: side),
            placement: .controlPoints(
                [
                    SessionControlPoint(
                        id: "nw", pixel: PixelPoint(x: 0, y: 0),
                        map: GeoPoint(lat: 44.7, lng: -63.7)
                    ),
                    SessionControlPoint(
                        id: "ne", pixel: PixelPoint(x: side, y: 0),
                        map: GeoPoint(lat: 44.7, lng: -63.5)
                    ),
                    SessionControlPoint(
                        id: "sw", pixel: PixelPoint(x: 0, y: side),
                        map: GeoPoint(lat: 44.6, lng: -63.7)
                    ),
                ],
                method: .affine
            )
        )
        let overlay = try #require(
            UserMapOverlay(record: record, image: try quarterMarked(Int(side)), alpha: 1)
        )
        let renderer = UserMapOverlayRenderer(userMap: overlay)

        // The whole sheet squeezed into one small bitmap, so the ink can be
        // found in it. UIKit's renderer rather than a bare bitmap context,
        // because a view's y counts downwards and that is the convention MapKit
        // hands the overlay; measuring in a y-up context would measure the
        // assumption rather than the code.
        let box = renderer.rect(for: overlay.boundingMapRect)
        let pixels = 200.0
        let scale = pixels / max(box.width, box.height)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let output = UIGraphicsImageRenderer(
            size: CGSize(width: pixels, height: pixels), format: format
        ).image { context in
            let cg = context.cgContext
            cg.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
            cg.fill(CGRect(x: 0, y: 0, width: pixels, height: pixels))
            cg.scaleBy(x: scale, y: scale)
            cg.translateBy(x: -box.minX, y: -box.minY)
            renderer.draw(overlay.boundingMapRect, zoomScale: MKZoomScale(scale), in: cg)
        }

        let image = try #require(output.cgImage)
        let data = try #require(image.dataProvider?.data)
        let bytes = try #require(CFDataGetBytePtr(data))
        let stride = image.bytesPerRow
        let pixel = image.bitsPerPixel / 8
        var sumX = 0.0, sumY = 0.0, count = 0.0
        for y in 0..<image.height {
            for x in 0..<image.width where bytes[y * stride + x * pixel] < 128 {
                sumX += Double(x)
                sumY += Double(y)
                count += 1
            }
        }
        try #require(count > 0)

        // MKMapPoint's y grows southward and the context counts y downwards
        // too, so the north-west quarter of the sheet is the top-left of this
        // bitmap.
        #expect(sumX / count / Double(image.width) < 0.5)
        #expect(sumY / count / Double(image.height) < 0.5)
    }

    /// The one that decides whether a placed scan arrives with the tiles under
    /// it or seconds after them.
    ///
    /// CoreGraphics' `.high` does a genuine area average, so its cost tracks
    /// the minification ratio. The repo's own spike measured a 4096-px source
    /// at `.high` as **509.6 ms per tile** against **2.8 ms** at `.low` — so
    /// the rule is: average when the draw is not shrinking anything, and stop
    /// paying for an average the zoom is about to throw away.
    @Test func theDrapeStopsAreaAveragingOnceItIsShrinkingTheSheet() {
        // Zoomed out: a 4096-px preview onto a 512-px stretch of screen.
        #expect(
            UserMapOverlayRenderer.interpolationQuality(
                destinationLongEdgePixels: 512, sourceLongEdgePixels: 4096
            ) == .low
        )

        // Zoomed in past 1:1, where `.high` costs nothing extra and is the
        // difference between a legible scan and a blocky one.
        #expect(
            UserMapOverlayRenderer.interpolationQuality(
                destinationLongEdgePixels: 8192, sourceLongEdgePixels: 4096
            ) == .high
        )

        // Exactly 1:1 is not minifying.
        #expect(
            UserMapOverlayRenderer.interpolationQuality(
                destinationLongEdgePixels: 4096, sourceLongEdgePixels: 4096
            ) == .high
        )
    }

    /// A retina tile is drawn at two or three device pixels per point, and the
    /// ratio has to be taken in the pixels actually being drawn. Reading it in
    /// points would judge a 3x phone to be minifying three times harder than
    /// it is, and it would never reach the passthrough case at all — a scan
    /// blurred on every device that has a retina screen, which is all of them.
    @Test func aRetinaTileIsJudgedInThePixelsItIsDrawnIn() {
        let pointsLongEdge = 2_048.0
        let source = 4_096.0

        // In points it looks like minification at 3x…
        #expect(
            UserMapOverlayRenderer.interpolationQuality(
                destinationLongEdgePixels: pointsLongEdge, sourceLongEdgePixels: source
            ) == .low
        )
        // …but the tile is 3x, so it is not.
        #expect(
            UserMapOverlayRenderer.interpolationQuality(
                destinationLongEdgePixels: pointsLongEdge * 3, sourceLongEdgePixels: source
            ) == .high
        )
    }

    /// A placement with nothing to sample. The overlay's own rule is that an
    /// overlay which exists and draws nothing is worse than none, so this
    /// answers cheaply rather than refusing.
    @Test func aSourceWithNoPixelsDoesNotAskForAnAverageOfThem() {
        #expect(
            UserMapOverlayRenderer.interpolationQuality(
                destinationLongEdgePixels: 1_024, sourceLongEdgePixels: 0
            ) == .low
        )
        #expect(
            UserMapOverlayRenderer.interpolationQuality(
                destinationLongEdgePixels: .infinity, sourceLongEdgePixels: 4_096
            ) == .low
        )
    }
}

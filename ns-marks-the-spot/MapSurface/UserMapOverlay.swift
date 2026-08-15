import GeoCore
import MapKit
import UIKit

/// A user's own scan, draped over the map through its georeferencing mesh.
///
/// The mesh is fixed at construction rather than read from the record on every
/// draw: a draw pass that re-solved would show the user a different placement
/// mid-gesture from the one the panel agreed on, and MapKit calls this on a
/// background queue.
nonisolated final class UserMapOverlay: NSObject, MKOverlay {
    /// The record this was built from, so the controller can match an overlay
    /// to a row without holding a second index.
    let id: String
    /// Ground positions, row is pixel Y and column is pixel X.
    let mesh: [[GeoPoint]]
    /// Pixel positions, paired vertex for vertex with `mesh`.
    let sourceMesh: [[PixelPoint]]
    /// The decoded preview. Its own dimensions are not the ones that matter —
    /// see `pixelSize`.
    let image: CGImage
    /// The size of the raster the preview was made from, which is the space
    /// `sourceMesh` is expressed in.
    ///
    /// A preview is capped at a few thousand pixels on its longest edge, and a
    /// provincial sheet can be ten times that. Drawing the preview at its own
    /// size under a transform solved in the original's pixels would shrink the
    /// sheet to a corner of where it belongs — a sheet in the right county,
    /// wrong by a factor nobody would guess from looking at it.
    let pixelSize: PixelSize
    /// What the user set on the layer's slider.
    let alpha: CGFloat

    let coordinate: CLLocationCoordinate2D
    let boundingMapRect: MKMapRect

    /// Nil when the record cannot be placed, or when its mesh and the raster
    /// disagree about the crop. Both mean there is nothing to draw, and an
    /// overlay that exists but draws nothing is worse than none: it takes a
    /// slot in the draw order and a row in the panel.
    init?(record: UserMapRecord, image: CGImage, alpha: CGFloat) {
        guard let mesh = record.mesh,
              // The record states the grid size the solver that built its mesh
              // used, so the pixel lattice cannot be paired against a ground
              // mesh of a different shape.
              let sourceMesh = try? WarpMesh.sourceMesh(
                  pixelSize: record.pixelSize, gridSize: record.meshGridSize,
                  sourceRect: record.sourceRect
              ),
              mesh.count == sourceMesh.count,
              zip(mesh, sourceMesh).allSatisfy({ $0.count == $1.count }),
              let rect = Self.boundingMapRect(of: mesh)
        else { return nil }

        self.id = record.id
        self.mesh = mesh
        self.sourceMesh = sourceMesh
        self.image = image
        self.pixelSize = record.pixelSize
        self.alpha = alpha
        self.boundingMapRect = rect
        self.coordinate = MKMapPoint(x: rect.midX, y: rect.midY).coordinate
    }

    /// The map rectangle MapKit culls the sheet against.
    ///
    /// The box itself is `GeoBoundingBox.covering`, in GeoCore, where the rule
    /// that one bad vertex refuses the whole box is tested without a device.
    /// What is left here is the projection, which is MapKit's.
    ///
    /// This does not handle a sheet spanning the antimeridian. Nothing in Nova
    /// Scotia does, and an import of one would produce a rectangle the width of
    /// the world rather than a wrong placement.
    static func boundingMapRect(of mesh: [[GeoPoint]]) -> MKMapRect? {
        guard let box = GeoBoundingBox.covering(mesh.lazy.flatMap({ $0 })) else { return nil }
        // Map Y runs south as it grows, so the north edge is the smaller
        // coordinate and the rectangle is anchored there.
        let northWest = MKMapPoint(
            CLLocationCoordinate2D(latitude: box.north, longitude: box.west)
        )
        let southEast = MKMapPoint(
            CLLocationCoordinate2D(latitude: box.south, longitude: box.east)
        )
        return MKMapRect(
            x: northWest.x, y: northWest.y,
            width: southEast.x - northWest.x, height: southEast.y - northWest.y
        )
    }
}

nonisolated extension UserMapOverlay: WebDrawOrdered {
    var webDrawOrder: Int {
        OverlayZIndex.drawOrder(OverlayZIndex.userMaps, in: .tile)
    }
}

/// Draws the scan a triangle at a time, each under an exact affine.
///
/// The same construction as the web's canvas renderer, and for the same reason:
/// a single affine cannot represent the warp, so the sheet is cut into mesh
/// cells small enough that one can, and each is drawn clipped to its own
/// triangle. Every number deciding where a triangle lands comes from
/// `WarpMesh`, which is tested without a device; what is here is the Core
/// Graphics that puts ink down.
nonisolated final class UserMapOverlayRenderer: MKOverlayRenderer {
    private let userMap: UserMapOverlay

    init(userMap: UserMapOverlay) {
        self.userMap = userMap
        super.init(overlay: userMap)
        alpha = userMap.alpha
    }

    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        let clip = rect(for: mapRect)
        // The overdraw is two device pixels on the web's canvas. Here the
        // context is in renderer units, which the zoom scale converts: passing
        // the constant unscaled would open a two-unit seam at the far end of a
        // zoomed-out sheet and an invisible sliver up close.
        let overdraw = zoomScale > 0
            ? WarpMesh.clipOverdrawDevicePixels / Double(zoomScale)
            : WarpMesh.clipOverdrawDevicePixels

        let destination = userMap.mesh.map { row in
            row.map { ground -> CanvasPoint in
                let screen = point(
                    for: MKMapPoint(
                        CLLocationCoordinate2D(latitude: ground.lat, longitude: ground.lng)
                    )
                )
                return CanvasPoint(x: Double(screen.x), y: Double(screen.y))
            }
        }
        let visible = CanvasRect(
            x: Double(clip.minX), y: Double(clip.minY),
            width: Double(clip.width), height: Double(clip.height)
        )

        // The original raster's size, not the preview's: the transform was
        // solved in those pixels, so the preview is stretched back up to them.
        let width = CGFloat(userMap.pixelSize.width)
        let height = CGFloat(userMap.pixelSize.height)
        context.interpolationQuality = .high

        for triangle in WarpMesh.allTriangles(
            source: userMap.sourceMesh, destination: destination
        ) {
            guard WarpMesh.intersects(triangle, rect: visible, overdraw: overdraw),
                  let transform = WarpMesh.transform(
                      source: triangle.source, destination: triangle.destination
                  )
            else { continue }
            let path = WarpMesh.clipPath(for: triangle, overdraw: overdraw)

            context.saveGState()
            context.beginPath()
            context.move(to: CGPoint(x: path.0.x, y: path.0.y))
            context.addLine(to: CGPoint(x: path.1.x, y: path.1.y))
            context.addLine(to: CGPoint(x: path.2.x, y: path.2.y))
            context.closePath()
            context.clip()
            context.concatenate(
                CGAffineTransform(
                    a: CGFloat(transform.a), b: CGFloat(transform.b),
                    c: CGFloat(transform.c), d: CGFloat(transform.d),
                    tx: CGFloat(transform.e), ty: CGFloat(transform.f)
                )
            )
            // The transform is stated in image pixels, whose Y runs downward,
            // and Core Graphics draws an image bottom-up. Without this the
            // sheet appears mirrored through its horizontal axis — which on a
            // scanned map reads as a plausible-looking sheet in a wrong place
            // rather than as an obvious defect.
            context.translateBy(x: 0, y: height)
            context.scaleBy(x: 1, y: -1)
            context.draw(userMap.image, in: CGRect(x: 0, y: 0, width: width, height: height))
            context.restoreGState()
        }
    }
}
